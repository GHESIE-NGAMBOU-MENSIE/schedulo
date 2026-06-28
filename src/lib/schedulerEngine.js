/**
 * Schedulo Scheduling Engine v5
 *
 * Architecture:
 *  Phase 0 – Build busy map (expand recurring events)
 *  Phase 1 – Build study days
 *  Phase 2 – Build calendar weeks
 *  Phase 3 – Build course-event anchors by week
 *  Phase 4 – Assign each task a preferred_schedule_week and latest_allowed_date
 *             (distinct from deadline_week — prep work goes BEFORE the deadline week)
 *  Phase 5 – Build explicit weekly allocation table with balance rules:
 *             a) Project/thesis: evenly spread across full period (≥1 task/week)
 *             b) Lecture courses: one primary task/week per course (chapter rhythm)
 *             c) Per-week course cap (max 40% of slots per course, ≥2 courses/week)
 *             d) Repair: pull flexible tasks forward to fill missing courses
 *  Phase 6 – Place tasks into actual time slots respecting latest_allowed_date
 *  Phase 7 – Post-placement repair: move flexible tasks to fix overloaded weeks
 *  Phase 8 – Build detailed weekly stats + debug output
 */

const JS_DAY_TO_NAME = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// ─── Lead times by task type: preferred prep days before deadline ─────────────
// These set the PREFERRED preparation date, NOT the hard latest allowed date.
// latestAllowedDate is always deadline - 1 (one day before the real deadline).
const LEAD_DAYS = {
  test: 5,
  revision: 5,
  assignment: 6,
  project_work: 7,
  reading: 3,
  exercise: 3,
};

// ─── Utility helpers ──────────────────────────────────────────────────────────

function toMinutes(timeStr) {
  if (!timeStr) return 0;
  const [h, m] = timeStr.substring(0, 5).split(':').map(Number);
  return h * 60 + m;
}

function fromMinutes(totalMinutes) {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function toDateStr(d) {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${day}`;
}

export function getLocalDateStr(d) {
  return toDateStr(d);
}

function addDays(d, n) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function subtractDays(dateStr, n) {
  const d = parseDate(dateStr);
  if (!d) return null;
  return toDateStr(addDays(d, -n));
}

function parseDate(str) {
  if (!str) return null;
  const s = str.includes('T') ? str : str + 'T00:00:00';
  const d = new Date(s);
  return isNaN(d) ? null : d;
}

function getWeekIndex(dateStr, weeks) {
  for (let i = 0; i < weeks.length; i++) {
    if (dateStr >= weeks[i].startStr && dateStr <= weeks[i].endStr) return i;
  }
  return -1;
}

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

// ─── Event classification ─────────────────────────────────────────────────────

function classifyEvent(ev) {
  const name = (ev.name || '').toLowerCase();
  if (/\b(exam|klausur|pr[üu]fung)\b/.test(name)) return 'exam';
  if (/\b(quiz|test)\b/.test(name)) return 'quiz';
  if (/\b(exercise|tutorial|tutorium|[üu]bung|praktikum|lab)\b/.test(name)) return 'exercise';
  if (/\b(lecture|vorlesung|seminar|class|kurs)\b/.test(name)) return 'lecture';
  return 'commitment';
}

function matchEventToCourse(ev, courses) {
  const evName = (ev.name || '').toLowerCase();
  for (const c of courses) {
    const cName = (c.name || '').toLowerCase();
    const words = cName.split(/\s+/).filter(w => w.length > 3);
    if (words.some(w => evName.includes(w))) return c.id;
    if (evName.includes(cName) || cName.includes(evName.split(' ')[0])) return c.id;
  }
  return null;
}

// ─── Busy map ─────────────────────────────────────────────────────────────────

function buildBusyMap(calEvents, courses, startDate, endDate) {
  const busy = {};

  const addBusy = (dateKey, startMin, endMin, ev, type, courseId) => {
    if (!busy[dateKey]) busy[dateKey] = [];
    busy[dateKey].push({
      start: startMin,
      end: endMin,
      start_time: fromMinutes(startMin),
      end_time: fromMinutes(endMin),
      name: ev.name || 'Event',
      type,
      courseId,
    });
  };

  const start = parseDate(startDate);
  const end = parseDate(endDate);

  for (const ev of calEvents) {
    const evType = ev.type || classifyEvent(ev);
    const courseId = ev.course_id || matchEventToCourse(ev, courses);

    const rec = (ev.recurrence || ev.recurrence_rule || ev.rrule || '').toString().toUpperCase();
    const hasFixedDay = ev.day_of_week && ev.day_of_week !== 'Flexible';
    const hasMultipleOccurrences = ev.end_occurrence && ev.end_occurrence !== (ev.start_date || ev.date);
    const isRecurring =
      ev.is_recurring === true || ev.is_recurring === 'true' ||
      rec === 'WEEKLY' || rec.includes('FREQ=WEEKLY') ||
      hasFixedDay || hasMultipleOccurrences;

    const evDateStr = ev.start_date || ev.date ||
      (ev.start ? ev.start.substring(0, 10) : null) ||
      (ev.startDate ? ev.startDate.substring(0, 10) : null) ||
      (ev.start_datetime ? ev.start_datetime.substring(0, 10) : null);

    const evStartTime = (ev.start_time && ev.start_time.trim()) ||
      (ev.start && ev.start.includes('T') ? ev.start.substring(11, 16) : null) ||
      (ev.start_datetime && ev.start_datetime.includes('T') ? ev.start_datetime.substring(11, 16) : null) || null;
    const evEndTime = (ev.end_time && ev.end_time.trim()) ||
      (ev.end && ev.end.includes('T') ? ev.end.substring(11, 16) : null) ||
      (ev.end_datetime && ev.end_datetime.includes('T') ? ev.end_datetime.substring(11, 16) : null) ||
      (ev.endDate && ev.endDate.includes('T') ? ev.endDate.substring(11, 16) : null) || null;

    // Events with no time info are all-day markers (e.g. thesis supervisor meetings) — skip blocking
    if (!evStartTime) continue;

    const startMin = toMinutes(evStartTime);
    const endMin = evEndTime ? toMinutes(evEndTime) : startMin + 60;

    if (isRecurring) {
      if (!start || !end) continue;
      const DAY_NAME_TO_DOW = { Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6 };
      let targetDow = null;
      const anchorDate = parseDate(evDateStr);
      if (anchorDate) {
        targetDow = anchorDate.getDay();
      } else if (ev.day_of_week && DAY_NAME_TO_DOW[ev.day_of_week] !== undefined) {
        targetDow = DAY_NAME_TO_DOW[ev.day_of_week];
      }
      if (targetDow === null) continue;
      const evStartDate = evDateStr ? parseDate(evDateStr) : null;
      const recurStart = (evStartDate && evStartDate > start) ? evStartDate : start;
      let recurEnd = end;
      const untilMatch = rec.match(/UNTIL=(\d{8}T\d{6}Z?|\d{8})/);
      if (untilMatch) {
        const untilStr = untilMatch[1].replace(/^(\d{4})(\d{2})(\d{2}).*/, '$1-$2-$3');
        const untilDate = parseDate(untilStr);
        if (untilDate && untilDate < end) recurEnd = untilDate;
      } else if (ev.end_occurrence && ev.end_occurrence !== evDateStr) {
        const endOcc = parseDate(ev.end_occurrence);
        if (endOcc && endOcc > (parseDate(evDateStr) || start) && endOcc < end) recurEnd = endOcc;
      }
      let cur = new Date(recurStart);
      while (cur.getDay() !== targetDow) cur = addDays(cur, 1);
      while (cur <= recurEnd) {
        addBusy(toDateStr(cur), startMin, endMin, ev, evType, courseId);
        cur = addDays(cur, 7);
      }
    } else {
      const d = parseDate(evDateStr);
      if (!d) continue;
      addBusy(toDateStr(d), startMin, endMin, ev, evType, courseId);
    }
  }

  return busy;
}

export function buildBusyMapPublic(calEvents, courses, startDate, endDate) {
  const busy = buildBusyMap(calEvents, courses, startDate, endDate);
  const expandedCount = Object.values(busy).reduce((sum, arr) => sum + arr.length, 0);
  return { busy, rawCount: (calEvents || []).length, expandedCount };
}

// ─── Free slot computation ────────────────────────────────────────────────────

function computeFreeBlocks(windowStart, windowEnd, busyBlocks, studyBlocks, breakDuration) {
  const occupied = [];
  for (const b of busyBlocks) occupied.push({ start: b.start, end: b.end + breakDuration });
  for (const b of studyBlocks) occupied.push({ start: b.start, end: b.end + breakDuration });

  occupied.sort((a, b) => a.start - b.start);
  const merged = [];
  for (const iv of occupied) {
    if (merged.length && iv.start <= merged[merged.length - 1].end) {
      merged[merged.length - 1].end = Math.max(merged[merged.length - 1].end, iv.end);
    } else {
      merged.push({ ...iv });
    }
  }

  const free = [];
  let cursor = windowStart;
  for (const iv of merged) {
    if (iv.start > cursor) free.push({ start: cursor, end: Math.min(iv.start, windowEnd) });
    cursor = Math.max(cursor, iv.end);
  }
  if (cursor < windowEnd) free.push({ start: cursor, end: windowEnd });

  return free.filter(b => b.end - b.start >= 30);
}

function tryPlace(dateKey, windowStart, windowEnd, maxMinutes, busyBlocks, studyBlocks, breakDuration, durationMinutes, preferStartMinutes) {
  const usedMinutes = studyBlocks.reduce((sum, b) => sum + (b.end - b.start), 0);
  if (usedMinutes >= maxMinutes) return null;

  const actualDuration = Math.min(durationMinutes, maxMinutes - usedMinutes, 180);
  if (actualDuration < 30) return null;

  const freeBlocks = computeFreeBlocks(windowStart, windowEnd, busyBlocks, studyBlocks, breakDuration);

  if (preferStartMinutes != null) {
    for (const fb of freeBlocks) {
      if (preferStartMinutes >= fb.start && preferStartMinutes + actualDuration <= fb.end) {
        return { dateStr: dateKey, start: preferStartMinutes, end: preferStartMinutes + actualDuration };
      }
    }
  }

  for (const fb of freeBlocks) {
    if (fb.start + actualDuration <= fb.end) {
      return { dateStr: dateKey, start: fb.start, end: fb.start + actualDuration };
    }
  }
  return null;
}

// ─── Conflict detection ───────────────────────────────────────────────────────

export function findConflict(task, busyMap) {
  if (!task.scheduled_date || !task.scheduled_start || !task.scheduled_end) return null;
  const dayBusy = busyMap[task.scheduled_date] || [];
  const taskStart = toMinutes(task.scheduled_start);
  const taskEnd = toMinutes(task.scheduled_end);
  for (const b of dayBusy) {
    if (taskStart < b.end && taskEnd > b.start) return b.name;
  }
  return null;
}

// ─── Week generation ──────────────────────────────────────────────────────────

function buildWeeks(startDate, endDate) {
  const start = parseDate(startDate);
  const end = parseDate(endDate);
  if (!start || !end) return [];

  const dow = start.getDay();
  const monday = new Date(start);
  monday.setDate(start.getDate() - ((dow + 6) % 7));

  const weeks = [];
  let cur = new Date(monday);
  let weekNum = 1;
  while (cur <= end) {
    const weekStart = new Date(cur);
    const weekEnd = addDays(cur, 6);
    const startStr = toDateStr(weekStart);
    const endStr = toDateStr(weekEnd);
    if (endStr >= startDate && startStr <= endDate) {
      weeks.push({
        index: weekNum - 1,
        label: `Week ${weekNum}`,
        startStr: startStr < startDate ? startDate : startStr,
        endStr: endStr > endDate ? endDate : endStr,
        rawStartStr: startStr,
        rawEndStr: endStr,
      });
      weekNum++;
    }
    cur = addDays(cur, 7);
  }
  return weeks;
}

// ─── Course type detection ────────────────────────────────────────────────────

function isProjectLikeCourse(course) {
  const types = (course.course_type || []).map(t => t.toLowerCase());
  const name = (course.name || '').toLowerCase();
  return types.some(t => /project|thesis|seminar|slr|dsr|capstone|bachelor|master/.test(t))
    || /thesis|projekt|bachelor|master|seminar|slr|dsr/.test(name);
}

// ─── Task ordering within a course ───────────────────────────────────────────

function taskInternalOrder(task) {
  const type = task.task_type || 'reading';
  const title = (task.title || '').toLowerCase();
  const numMatch = title.match(/\b(\d+)\b/);
  const num = numMatch ? parseInt(numMatch[1]) : 999;
  const typeOrder = { reading: 0, exercise: 1, assignment: 2, project_work: 3, revision: 4, test: 5 }[type] || 0;
  return num * 10 + typeOrder;
}

function isFlexibleTask(task) {
  const FLEXIBLE_TYPES = new Set(['revision', 'project_work']);
  const FLEXIBLE_TITLE_RE = /\b(recap|revision|review|practice|writing|implementation|evaluation|literature|thesis|project)\b/i;
  if (FLEXIBLE_TYPES.has(task.task_type)) return true;
  if (FLEXIBLE_TITLE_RE.test(task.title || '')) return true;
  return false;
}

// ─── Phase 4: Assign preferred_schedule_week and latest_allowed_date ─────────
//
// Key distinction:
//   deadline_week     = the week the deadline falls in
//   preferred_week    = where we actually WANT to schedule the task (before deadline)
//   latest_allowed    = latest date we may place any slot (deadline - lead_days)
//
// For project courses: spread evenly across full period, not by chapter rhythm.

function computeTaskSchedulingMeta(task, courseTasks, weeks, courses, startDate) {
  if (!weeks.length) return { preferredWeekIdx: 0, latestAllowedDate: null, preferredScheduleDate: null, deadlineWeekIdx: -1, reason: 'No weeks' };

  const course = courses.find(c => c.id === task.course_id || c.name === task.course_name);
  const isProject = course ? isProjectLikeCourse(course) : false;
  const taskType = task.task_type || 'reading';
  const leadDays = LEAD_DAYS[taskType] || 3;

  // ── Deadline & exam constraints ───────────────────────────────────────────
  const rawDeadline = task.deadline || task.exam_date;
  const courseExam = task.exam_date || course?.exam_date;

  let deadlineWeekIdx = -1;
  let latestAllowedDate = null; // hard cap: one day before real deadline
  let preferredScheduleDate = null; // recommended prep date: deadline - leadDays

  if (rawDeadline) {
    deadlineWeekIdx = getWeekIndex(rawDeadline, weeks);
    // preferredScheduleDate = deadline - leadDays (where we WANT to schedule)
    const prefDate = subtractDays(rawDeadline, leadDays);
    preferredScheduleDate = prefDate && prefDate >= startDate ? prefDate : rawDeadline;
    // latestAllowedDate = one day before deadline (hard cap — NOT the preferred date)
    const latestDate = subtractDays(rawDeadline, 1);
    if (latestDate && latestDate >= startDate) {
      latestAllowedDate = latestDate;
    } else {
      // Deadline is at or before study start — allow up to deadline itself
      latestAllowedDate = rawDeadline;
    }
  }

  // Course exam: schedule all tasks at least 1 week before exam
  let examCap = weeks.length - 1;
  if (courseExam) {
    const ew = getWeekIndex(courseExam, weeks);
    if (ew >= 0) examCap = Math.max(0, ew - 1);
    // If no deadline was set but exam exists, treat exam as implicit deadline
    if (!rawDeadline) {
      const examLatest = subtractDays(courseExam, 7);
      latestAllowedDate = examLatest && examLatest >= startDate ? examLatest : courseExam;
      preferredScheduleDate = latestAllowedDate;
      deadlineWeekIdx = ew;
    }
  }

  // ── Compute preferred_week ────────────────────────────────────────────────
  let preferredWeekIdx = 0;
  let reason = '';

  if (isProject) {
    // Evenly spread project tasks across the full available period
    const sortedCourseTasks = [...courseTasks].sort((a, b) => taskInternalOrder(a) - taskInternalOrder(b));
    const posInCourse = sortedCourseTasks.findIndex(t => (t.id && t.id === task.id) || t.title === task.title);
    const totalCourseTasks = sortedCourseTasks.length;
    // Reserve last week as buffer — don't schedule in final week if possible
    const bufferWeeks = 1;
    const availableWeeks = Math.max(1, examCap - bufferWeeks);
    const fraction = totalCourseTasks <= 1 ? 0 : posInCourse / (totalCourseTasks - 1);
    preferredWeekIdx = clamp(Math.round(fraction * availableWeeks), 0, examCap);
    reason = `Project/thesis: evenly spread (pos ${posInCourse + 1}/${totalCourseTasks})`;

  } else if (task.deadline) {
    // Schedule before deadline — preferred = deadline week - 1, unless it's a short lead
    const di = getWeekIndex(task.deadline, weeks);
    if (di >= 0) {
      preferredWeekIdx = clamp(di - 1, 0, examCap);
      reason = `Before deadline ${task.deadline} (lead ${leadDays}d)`;
    }

  } else if (task.not_before_date) {
    const ni = getWeekIndex(task.not_before_date, weeks);
    if (ni >= 0) {
      preferredWeekIdx = clamp(ni, 0, examCap);
      reason = `After not-before ${task.not_before_date}`;
    }

  } else if (task.target_date) {
    const ti = getWeekIndex(task.target_date, weeks);
    if (ti >= 0) {
      preferredWeekIdx = clamp(ti, 0, examCap);
      reason = `Target date ${task.target_date}`;
    }

  } else if (task.target_week != null) {
    const tw = Math.max(0, task.target_week - 1);
    preferredWeekIdx = clamp(tw, 0, examCap);
    reason = `Target week ${task.target_week} from syllabus`;

  } else if (task.related_course_event_date) {
    const ri = getWeekIndex(task.related_course_event_date, weeks);
    if (ri >= 0) {
      preferredWeekIdx = clamp(ri, 0, examCap);
      reason = `After course event on ${task.related_course_event_date}`;
    }

  } else {
    // Chapter/topic/exercise number → spread across available weeks
    const seqNum = task.chapter_number ?? task.topic_number ?? task.exercise_number ?? task.assignment_number ?? null;
    if (seqNum != null) {
      preferredWeekIdx = clamp(seqNum - 1, 0, examCap);
      reason = `Chapter/topic/exercise number ${seqNum}`;
    } else {
      // Fallback: position in sorted course task list
      const sortedCourseTasks = [...courseTasks].sort((a, b) => taskInternalOrder(a) - taskInternalOrder(b));
      const pos = sortedCourseTasks.findIndex(t => (t.id && t.id === task.id) || t.title === task.title);
      const total = sortedCourseTasks.length;
      const fraction = total <= 1 ? 0 : pos / (total - 1);
      preferredWeekIdx = clamp(Math.round(fraction * examCap), 0, examCap);
      reason = `Position ${pos + 1}/${total} in course task list`;
    }
  }

  return {
    preferredWeekIdx,
    deadlineWeekIdx,
    latestAllowedDate,
    preferredScheduleDate,
    reason,
    isProject,
  };
}

// ─── Phase 5: Build weekly allocation table ───────────────────────────────────

function buildWeeklyAllocationTable(tasksWithMeta, weeks, courses) {
  const numWeeks = weeks.length;
  const weekAssignments = Array.from({ length: numWeeks }, () => []);

  // Initial placement from preferred weeks
  for (const entry of tasksWithMeta) {
    const wi = clamp(entry.preferredWeekIdx, 0, numWeeks - 1);
    entry.assignedWeekIdx = wi;
    entry.allocationReason = entry.targetWeekReason;
    weekAssignments[wi].push(entry);
  }

  // ── Rule A: For lecture courses, enforce chapter rhythm ───────────────────
  // One primary task per course per week — push extras forward
  for (let wi = 0; wi < numWeeks; wi++) {
    const seenPrimaryPerCourse = {};
    for (const entry of [...weekAssignments[wi]]) {
      if (entry.isProject) continue; // project tasks skip this rule
      const task = entry.task;
      const isPrimary = ['reading', 'assignment'].includes(task.task_type || 'reading');
      if (!isPrimary) continue;
      const courseKey = task.course_id || task.course_name || '__none';
      if (!seenPrimaryPerCourse[courseKey]) {
        seenPrimaryPerCourse[courseKey] = true;
      } else {
        const nextWi = wi + 1;
        if (nextWi < numWeeks) {
          weekAssignments[wi] = weekAssignments[wi].filter(e => e !== entry);
          entry.assignedWeekIdx = nextWi;
          entry.allocationReason += ' → pushed forward (chapter rhythm)';
          weekAssignments[nextWi].push(entry);
        }
      }
    }
  }

  // ── Rule B: 40% per-course cap per week ───────────────────────────────────
  for (let wi = 0; wi < numWeeks; wi++) {
    const weekEntries = weekAssignments[wi];
    if (weekEntries.length === 0) continue;

    const totalCourses = new Set(weekEntries.map(e => e.task.course_id || e.task.course_name || '__none')).size;
    if (totalCourses <= 1) continue;

    const total = weekEntries.length;
    const maxAllowed = Math.max(2, Math.ceil(total * 0.4));

    const courseCounts = {};
    for (const e of weekEntries) {
      const key = e.task.course_id || e.task.course_name || '__none';
      courseCounts[key] = (courseCounts[key] || 0) + 1;
    }

    for (const [courseKey, count] of Object.entries(courseCounts)) {
      if (count <= maxAllowed) continue;
      const excess = count - maxAllowed;
      const movable = weekEntries.filter(e =>
        (e.task.course_id || e.task.course_name || '__none') === courseKey &&
        e.task.priority !== 'high' &&
        !e.task.deadline &&
        isFlexibleTask(e.task)
      );
      const toMove = movable.slice(-excess);
      for (const entry of toMove) {
        const nextWi = Math.min(wi + 1, numWeeks - 1);
        if (nextWi !== wi) {
          weekAssignments[wi] = weekAssignments[wi].filter(e => e !== entry);
          entry.assignedWeekIdx = nextWi;
          entry.allocationReason += ' → moved (40% cap)';
          weekAssignments[nextWi].push(entry);
        }
      }
    }
  }

  // ── Rule C: Fill missing courses — pull flexible tasks forward ────────────
  // For each week that is missing a course that has remaining tasks,
  // pull the earliest flexible task for that course from a later week.
  for (let wi = 0; wi < numWeeks; wi++) {
    const coursesInWeek = new Set(
      weekAssignments[wi].map(e => e.task.course_id || e.task.course_name || '__none')
    );

    for (let owi = wi + 1; owi < numWeeks; owi++) {
      for (const entry of [...weekAssignments[owi]]) {
        const courseKey = entry.task.course_id || entry.task.course_name || '__none';
        if (coursesInWeek.has(courseKey)) continue;

        // Only pull flexible tasks — never sequential chapter tasks
        if (!isFlexibleTask(entry.task)) continue;

        // Respect temporal constraints
        if (entry.task.not_before_date && entry.task.not_before_date > weeks[wi].endStr) continue;
        if (entry.task.target_date && entry.task.target_date > weeks[wi].endStr) continue;
        if (entry.task.target_week != null && entry.task.target_week - 1 > wi) continue;
        // Respect latest_allowed: ensure task can still be placed in this week
        if (entry.latestAllowedDate && entry.latestAllowedDate < weeks[wi].startStr) continue;

        weekAssignments[owi] = weekAssignments[owi].filter(e => e !== entry);
        entry.assignedWeekIdx = wi;
        entry.allocationReason += ` → pulled to Week ${wi + 1} for balance`;
        weekAssignments[wi].push(entry);
        coursesInWeek.add(courseKey);
        break;
      }
    }
  }

  return weekAssignments;
}

// ─── Main scheduling engine ───────────────────────────────────────────────────

export function scheduleTasksEngine(tasks, calEvents, courses, prefs, startDate, endDate) {
  if (!tasks || !Array.isArray(tasks)) throw new Error('tasks must be an array');
  if (!startDate || !endDate) throw new Error(`Missing study period dates: startDate=${startDate}, endDate=${endDate}`);
  const busyMap = buildBusyMap(calEvents || [], courses || [], startDate, endDate);
  const breakDuration = prefs.break_duration != null ? prefs.break_duration : 15;
  const maxHoursPerDay = (prefs.max_hours || 6) * 60;
  const schedule = prefs.schedule || {};

  const start = parseDate(startDate);
  const end = parseDate(endDate);
  if (!start || !end) {
    return { scheduled: [], unscheduled: tasks.map(t => ({ task: t, reason: 'No valid study period dates' })), totalSlots: 0, totalFreeMinutes: 0, weeklyStats: [], allocationTable: [], debugLog: [] };
  }

  // ── Phase 1: Build study days ─────────────────────────────────────────────
  const studyDays = [];
  let cur = new Date(start);
  while (cur <= end) {
    const dayName = JS_DAY_TO_NAME[cur.getDay()];
    const dayPrefs = schedule[dayName] || {};
    if (!dayPrefs.noStudy) {
      const winStart = toMinutes(dayPrefs.start || prefs.preferred_start || '09:00');
      const winEnd = toMinutes(dayPrefs.end || prefs.preferred_end || '18:00');
      studyDays.push({
        dateKey: toDateStr(cur),
        dayName,
        dow: cur.getDay(),
        winStart,
        winEnd,
        maxMinutes: maxHoursPerDay,
        busyBlocks: (busyMap[toDateStr(cur)] || []).sort((a, b) => a.start - b.start),
      });
    }
    cur = addDays(cur, 1);
  }

  const studyBlocksPerDay = {};
  const getStudyBlocks = (dk) => studyBlocksPerDay[dk] || [];

  // ── Phase 2: Build weeks ──────────────────────────────────────────────────
  const weeks = buildWeeks(startDate, endDate);
  if (!weeks.length) {
    return { scheduled: [], unscheduled: tasks.map(t => ({ task: t, reason: 'Study period too short' })), totalSlots: studyDays.length, totalFreeMinutes: 0, weeklyStats: [], allocationTable: [], debugLog: [] };
  }

  // ── Phase 3: Build course-event anchors by week ───────────────────────────
  const courseEventsByWeek = {};
  for (const [ds, blocks] of Object.entries(busyMap)) {
    const wIdx = getWeekIndex(ds, weeks);
    if (wIdx < 0) continue;
    for (const b of blocks) {
      if (!b.courseId) continue;
      if (!courseEventsByWeek[b.courseId]) courseEventsByWeek[b.courseId] = {};
      if (!courseEventsByWeek[b.courseId][wIdx]) courseEventsByWeek[b.courseId][wIdx] = [];
      courseEventsByWeek[b.courseId][wIdx].push({ dateStr: ds, type: b.type, endMin: b.end, name: b.name });
    }
  }

  // ── Phase 4: Compute scheduling meta per task ─────────────────────────────
  const tasksByCourse = {};
  for (const task of tasks) {
    const key = task.course_id || task.course_name || '__none';
    if (!tasksByCourse[key]) tasksByCourse[key] = [];
    tasksByCourse[key].push(task);
  }

  const tasksWithMeta = [];
  for (const [, courseTasks] of Object.entries(tasksByCourse)) {
    for (const task of courseTasks) {
      const meta = computeTaskSchedulingMeta(task, courseTasks, weeks, courses, startDate);
      tasksWithMeta.push({
        task,
        preferredWeekIdx: meta.preferredWeekIdx,
        assignedWeekIdx: meta.preferredWeekIdx,
        deadlineWeekIdx: meta.deadlineWeekIdx,
        latestAllowedDate: meta.latestAllowedDate,
        preferredScheduleDate: meta.preferredScheduleDate,
        targetWeekReason: meta.reason,
        allocationReason: meta.reason,
        isProject: meta.isProject,
      });
    }
  }

  // ── Phase 5: Build weekly allocation table ────────────────────────────────
  const weekAssignments = buildWeeklyAllocationTable(tasksWithMeta, weeks, courses);

  // Build the human-readable allocation table for debug/display
  const allocationTable = weeks.map((week, wi) => ({
    weekLabel: week.label,
    startStr: week.startStr,
    endStr: week.endStr,
    entries: weekAssignments[wi].map(e => ({
      course: e.task.course_name || e.task.course_id || 'Unknown',
      title: e.task.title,
      taskType: e.task.task_type,
      deadline: e.task.deadline || null,
      latestAllowedDate: e.latestAllowedDate || null,
      notBefore: e.task.not_before_date || null,
      targetDate: e.task.target_date || null,
      preferredWeek: e.preferredWeekIdx + 1,
      reason: e.allocationReason,
    })),
  }));

  // ── Phase 6: Place tasks into actual time slots ───────────────────────────
  const scheduled = [];
  const unscheduled = [];

  const courseRoutine = {};

  function getPreferredEventType(task) {
    if (task.task_type === 'reading') return 'lecture';
    if (task.task_type === 'exercise') return 'exercise';
    if (task.task_type === 'revision' || task.task_type === 'test') return ['quiz', 'exam', 'lecture'];
    return null;
  }

  for (let wi = 0; wi < weeks.length; wi++) {
    const week = weeks[wi];
    const weekEntries = weekAssignments[wi];
    if (!weekEntries.length) continue;

    const weekStudyDays = studyDays.filter(d => d.dateKey >= week.startStr && d.dateKey <= week.endStr);
    if (!weekStudyDays.length) {
      for (const e of weekEntries) {
        unscheduled.push({ task: e.task, reason: `No study days available in ${week.label}` });
      }
      continue;
    }

    // Sort: urgent/deadline tasks first, then by priority, then internal order
    weekEntries.sort((a, b) => {
      const aHasDeadline = !!a.task.deadline;
      const bHasDeadline = !!b.task.deadline;
      if (aHasDeadline !== bHasDeadline) return aHasDeadline ? -1 : 1;
      if (aHasDeadline && bHasDeadline) {
        // Earlier deadline first
        const da = a.latestAllowedDate || a.task.deadline;
        const db = b.latestAllowedDate || b.task.deadline;
        if (da !== db) return da < db ? -1 : 1;
      }
      const aPrio = a.task.priority === 'high' ? 0 : a.task.priority === 'medium' ? 1 : 2;
      const bPrio = b.task.priority === 'high' ? 0 : b.task.priority === 'medium' ? 1 : 2;
      if (aPrio !== bPrio) return aPrio - bPrio;
      return taskInternalOrder(a.task) - taskInternalOrder(b.task);
    });

    for (const entry of weekEntries) {
      const task = entry.task;
      const courseKey = task.course_id || task.course_name || '__none';
      const durationMinutes = Math.round((task.estimated_hours || 2) * 60);
      const notBeforeDate = task.not_before_date ? parseDate(task.not_before_date) : null;
      const preferredEventType = getPreferredEventType(task);

      // latestAllowedDate: hard cap (one day before deadline). preferredScheduleDate: soft target.
      const latestAllowed = entry.latestAllowedDate || task.deadline || null;
      const latestAllowedDate = latestAllowed ? parseDate(latestAllowed) : null;
      const preferredSchedDate = entry.preferredScheduleDate ? parseDate(entry.preferredScheduleDate) : null;

      // Split tasks > 3h into 3h blocks (cap at 4 blocks max to avoid infinite scheduling)
      const blockDurations = [];
      let rem = Math.min(durationMinutes, 720); // cap at 12h total
      while (rem > 0) { blockDurations.push(Math.min(rem, 180)); rem -= 180; }

      let lastPlacedDate = null;

      for (let bi = 0; bi < blockDurations.length; bi++) {
        const blockDur = blockDurations[bi];
        let placed = null;
        let explanation = '';

        // Helper: day is within the hard constraint (real deadline - 1)
        const dayAllowed = (dateKey) => {
          if (latestAllowedDate && parseDate(dateKey) > latestAllowedDate) return false;
          if (notBeforeDate && parseDate(dateKey) < notBeforeDate) return false;
          return true;
        };
        // Helper: day is within the preferred preparation window (deadline - leadDays)
        const dayPreferred = (dateKey) => {
          if (!dayAllowed(dateKey)) return false;
          if (preferredSchedDate && parseDate(dateKey) > preferredSchedDate) return false;
          return true;
        };

        // ── Step A: After course event anchor in this week (preferred window) ─
        if (task.course_id && preferredEventType) {
          const weekCourseEvents = (courseEventsByWeek[task.course_id]?.[wi] || [])
            .filter(e => Array.isArray(preferredEventType) ? preferredEventType.includes(e.type) : e.type === preferredEventType)
            .sort((a, b) => a.dateStr.localeCompare(b.dateStr));

          for (const relEv of weekCourseEvents) {
            if (!dayAllowed(relEv.dateStr)) continue;
            const day = weekStudyDays.find(d => d.dateKey === relEv.dateStr);
            if (!day) continue;
            const preferAfter = relEv.endMin + breakDuration;
            const result = tryPlace(day.dateKey, day.winStart, day.winEnd, day.maxMinutes, day.busyBlocks, getStudyBlocks(day.dateKey), breakDuration, blockDur, preferAfter);
            if (result) {
              placed = result;
              explanation = `After ${relEv.type} "${relEv.name}"`;
              courseRoutine[courseKey] = { dow: day.dow, startMinutes: result.start };
              break;
            }
          }
        }

        // ── Step B: Routine slot ─────────────────────────────────────────────
        if (!placed && courseRoutine[courseKey]) {
          const routine = courseRoutine[courseKey];
          const routineDay = weekStudyDays.find(d => d.dow === routine.dow && dayAllowed(d.dateKey));
          if (routineDay) {
            const result = tryPlace(routineDay.dateKey, routineDay.winStart, routineDay.winEnd, routineDay.maxMinutes, routineDay.busyBlocks, getStudyBlocks(routineDay.dateKey), breakDuration, blockDur, routine.startMinutes);
            if (result) {
              placed = result;
              explanation = 'Routine slot';
            }
          }
        }

        // ── Step C: Any day in preferred window (≤ preferredScheduleDate) ────
        if (!placed) {
          for (const day of weekStudyDays) {
            if (lastPlacedDate && day.dateKey < lastPlacedDate) continue;
            if (!dayPreferred(day.dateKey)) continue;
            const result = tryPlace(day.dateKey, day.winStart, day.winEnd, day.maxMinutes, day.busyBlocks, getStudyBlocks(day.dateKey), breakDuration, blockDur, null);
            if (result) {
              placed = result;
              explanation = week.label;
              if (!courseRoutine[courseKey]) courseRoutine[courseKey] = { dow: day.dow, startMinutes: result.start };
              break;
            }
          }
        }

        // ── Step D: Days between preferred window and real latestAllowedDate ──
        if (!placed) {
          for (const day of weekStudyDays) {
            if (lastPlacedDate && day.dateKey < lastPlacedDate) continue;
            if (!dayAllowed(day.dateKey)) continue;
            if (dayPreferred(day.dateKey)) continue; // already tried
            const result = tryPlace(day.dateKey, day.winStart, day.winEnd, day.maxMinutes, day.busyBlocks, getStudyBlocks(day.dateKey), breakDuration, blockDur, null);
            if (result) {
              placed = result;
              explanation = `${week.label} (later than preferred, still before deadline)`;
              if (!courseRoutine[courseKey]) courseRoutine[courseKey] = { dow: day.dow, startMinutes: result.start };
              break;
            }
          }
        }

        // ── Step E: Overflow to later weeks within hard latestAllowedDate ────
        if (!placed) {
          for (let owi = wi + 1; owi < weeks.length; owi++) {
            const overflowDays = studyDays.filter(d => d.dateKey >= weeks[owi].startStr && d.dateKey <= weeks[owi].endStr);
            for (const day of overflowDays) {
              if (!dayAllowed(day.dateKey)) continue;
              const result = tryPlace(day.dateKey, day.winStart, day.winEnd, day.maxMinutes, day.busyBlocks, getStudyBlocks(day.dateKey), breakDuration, blockDur, null);
              if (result) {
                placed = result;
                explanation = `Overflow to ${weeks[owi].label} (before deadline)`;
                break;
              }
            }
            if (placed) break;
          }
        }

        // ── Step F: Earlier free days before preferred window ─────────────────
        if (!placed) {
          const earlierDays = studyDays.filter(d => d.dateKey < week.startStr && dayAllowed(d.dateKey)).slice().reverse();
          for (const day of earlierDays) {
            const result = tryPlace(day.dateKey, day.winStart, day.winEnd, day.maxMinutes, day.busyBlocks, getStudyBlocks(day.dateKey), breakDuration, blockDur, null);
            if (result) {
              placed = result;
              explanation = 'Placed earlier (no later slot before deadline)';
              break;
            }
          }
        }

        if (placed) {
          if (!studyBlocksPerDay[placed.dateStr]) studyBlocksPerDay[placed.dateStr] = [];
          studyBlocksPerDay[placed.dateStr].push({ start: placed.start, end: placed.end });
          lastPlacedDate = placed.dateStr;
          scheduled.push({
            task,
            dateStr: placed.dateStr,
            startTime: fromMinutes(placed.start),
            endTime: fromMinutes(placed.end),
            explanation: blockDurations.length > 1 ? `${explanation} (part ${bi + 1}/${blockDurations.length})` : explanation,
            targetWeekIdx: entry.preferredWeekIdx,
            assignedWeekIdx: entry.assignedWeekIdx,
            allocationReason: entry.allocationReason,
          });
        } else if (bi === 0) {
          const realDeadline = task.deadline || task.exam_date || null;
          let reason = `No free slot found before deadline`;
          if (!studyDays.length) reason = 'No study days configured';
          else if (latestAllowedDate && latestAllowedDate < start) reason = `Deadline (${realDeadline}) is before study period start`;
          else if (realDeadline) reason = `No free slot found before deadline (${realDeadline})`;
          else if (maxHoursPerDay < 60) reason = 'Max study hours per day is too low';
          else reason = `No free slot available in any week`;
          unscheduled.push({ task, reason, allocationReason: entry.allocationReason });
        }
      }
    }
  }

  // ── Phase 7: Post-placement repair ───────────────────────────────────────
  // Check for weeks with ≥1 course dominating (>50%); try to swap flexible tasks
  // to a week where that course is underrepresented
  const repairLog = [];

  for (let wi = 0; wi < weeks.length; wi++) {
    const week = weeks[wi];
    const weekScheduled = scheduled.filter(s => s.dateStr >= week.startStr && s.dateStr <= week.endStr);
    if (weekScheduled.length < 3) continue;

    const courseCounts = {};
    for (const s of weekScheduled) {
      const key = s.task.course_name || s.task.course_id || 'Unknown';
      courseCounts[key] = (courseCounts[key] || 0) + 1;
    }

    const total = weekScheduled.length;
    for (const [courseName, count] of Object.entries(courseCounts)) {
      if (count / total <= 0.5) continue;

      // Find a flexible task of this course that can be moved to a neighboring week
      const movable = weekScheduled.filter(s =>
        (s.task.course_name || s.task.course_id || 'Unknown') === courseName &&
        isFlexibleTask(s.task) &&
        s.task.priority !== 'high' &&
        !s.task.deadline
      );

      for (const candidate of movable) {
        // Try to move it to wi+1 or wi-1
        for (const targetWi of [wi + 1, wi - 1]) {
          if (targetWi < 0 || targetWi >= weeks.length) continue;
          const targetWeek = weeks[targetWi];
          const targetDays = studyDays.filter(d => d.dateKey >= targetWeek.startStr && d.dateKey <= targetWeek.endStr);
          const durationMinutes = Math.round((candidate.task.estimated_hours || 2) * 60);

          for (const day of targetDays) {
            const result = tryPlace(day.dateKey, day.winStart, day.winEnd, day.maxMinutes, day.busyBlocks, getStudyBlocks(day.dateKey), breakDuration, Math.min(durationMinutes, 180), null);
            if (result) {
              // Remove old placement from studyBlocksPerDay
              const oldBlocks = studyBlocksPerDay[candidate.dateStr] || [];
              const oldStart = toMinutes(candidate.startTime);
              const oldEnd = toMinutes(candidate.endTime);
              studyBlocksPerDay[candidate.dateStr] = oldBlocks.filter(b => !(b.start === oldStart && b.end === oldEnd));

              // Apply new placement
              candidate.dateStr = result.dateStr;
              candidate.startTime = fromMinutes(result.start);
              candidate.endTime = fromMinutes(result.end);
              candidate.explanation += ' (repaired for balance)';
              if (!studyBlocksPerDay[result.dateStr]) studyBlocksPerDay[result.dateStr] = [];
              studyBlocksPerDay[result.dateStr].push({ start: result.start, end: result.end });

              repairLog.push(`Moved "${candidate.task.title}" from ${week.label} to ${targetWeek.label} (balance repair)`);
              break;
            }
          }
          if (candidate.dateStr >= targetWeek.startStr && candidate.dateStr <= targetWeek.endStr) break;
        }
        break; // one move per overloaded course per week
      }
    }
  }

  // ── Phase 8: Detailed weekly stats + debug output ─────────────────────────
  const debugLog = [];

  // Per-task debug entries
  for (const entry of tasksWithMeta) {
    const sched = scheduled.find(s => (s.task.id && s.task.id === entry.task.id) || s.task.title === entry.task.title);
    const unsched = unscheduled.find(u => (u.task.id && u.task.id === entry.task.id) || u.task.title === entry.task.title);

    debugLog.push({
      course: entry.task.course_name || entry.task.course_id || 'Unknown',
      title: entry.task.title,
      taskType: entry.task.task_type,
      preferredWeek: entry.preferredWeekIdx + 1,
      assignedWeek: entry.assignedWeekIdx + 1,
      scheduledDate: sched ? sched.dateStr : null,
      scheduledWeek: sched ? (getWeekIndex(sched.dateStr, weeks) + 1) : null,
      targetWeekReason: entry.targetWeekReason,
      allocationReason: entry.allocationReason,
      slotReason: sched ? sched.explanation : (unsched ? `UNSCHEDULED: ${unsched.reason}` : 'Not placed'),
      deadline: entry.task.deadline || null,
      latestAllowedDate: entry.latestAllowedDate || null,
      notBefore: entry.task.not_before_date || null,
      movedFromTarget: sched ? Math.abs((getWeekIndex(sched.dateStr, weeks)) - entry.preferredWeekIdx) : null,
      scheduledAfterPreferred: sched && entry.preferredScheduleDate && sched.dateStr > entry.preferredScheduleDate,
      scheduledTooLate: sched && entry.latestAllowedDate && sched.dateStr > entry.latestAllowedDate,
      scheduledBeforeNotBefore: sched && entry.task.not_before_date && sched.dateStr < entry.task.not_before_date,
    });
  }

  const weeklyStats = weeks.map((week, wi) => {
    const weekScheduled = scheduled.filter(s => s.dateStr >= week.startStr && s.dateStr <= week.endStr);

    const tasksByCourseInWeek = {};
    for (const s of weekScheduled) {
      const key = s.task.course_name || s.task.course_id || 'Unknown';
      tasksByCourseInWeek[key] = (tasksByCourseInWeek[key] || 0) + 1;
    }

    const assignedCourses = new Set(weekAssignments[wi].map(e => e.task.course_name || e.task.course_id || 'Unknown'));
    const scheduledCourses = new Set(Object.keys(tasksByCourseInWeek));
    const missingCourses = [...assignedCourses].filter(c => !scheduledCourses.has(c));

    const unscheduledForWeek = unscheduled.filter(u => {
      const entry = tasksWithMeta.find(e => (e.task.id && e.task.id === u.task.id) || e.task.title === u.task.title);
      return entry && entry.assignedWeekIdx === wi;
    });

    const total = weekScheduled.length;
    const overloadedCourses = Object.entries(tasksByCourseInWeek)
      .filter(([, count]) => total > 2 && count / total > 0.4)
      .map(([name, count]) => ({ name, count, pct: Math.round(count / total * 100) }));

    // Deadline violations: tasks scheduled after the real hard deadline cap
    const tooLate = weekScheduled.filter(s => {
      const entry = tasksWithMeta.find(e => (e.task.id && e.task.id === s.task.id) || e.task.title === s.task.title);
      return entry?.latestAllowedDate && s.dateStr > entry.latestAllowedDate;
    });
    // Tasks scheduled in the window between preferred date and real deadline (warning, not error)
    const laterThanPreferred = weekScheduled.filter(s => {
      const entry = tasksWithMeta.find(e => (e.task.id && e.task.id === s.task.id) || e.task.title === s.task.title);
      return entry?.preferredScheduleDate && s.dateStr > entry.preferredScheduleDate && (!entry.latestAllowedDate || s.dateStr <= entry.latestAllowedDate);
    });

    // Tasks moved significantly from their target week
    const farFromTarget = weekScheduled.filter(s => {
      const actualWi = getWeekIndex(s.dateStr, weeks);
      return Math.abs(actualWi - s.targetWeekIdx) > 1;
    });

    return {
      weekLabel: week.label,
      startStr: week.startStr,
      endStr: week.endStr,
      totalScheduled: total,
      tasksByCourse: tasksByCourseInWeek,
      missingCourses,
      overloadedCourses,
      unscheduledTasks: unscheduledForWeek.map(u => ({ title: u.task.title, course: u.task.course_name || u.task.course_id, reason: u.reason })),
      tooLateTasks: tooLate.map(s => ({ title: s.task.title, scheduledDate: s.dateStr, latestAllowed: tasksWithMeta.find(e => e.task.title === s.task.title)?.latestAllowedDate })),
      laterThanPreferredTasks: laterThanPreferred.map(s => ({ title: s.task.title, scheduledDate: s.dateStr, preferredDate: tasksWithMeta.find(e => e.task.title === s.task.title)?.preferredScheduleDate, note: 'Scheduled later than recommended, but still before the deadline.' })),
      farFromTargetTasks: farFromTarget.map(s => ({ title: s.task.title, targetWeek: s.targetWeekIdx + 1, actualWeek: getWeekIndex(s.dateStr, weeks) + 1 })),
    };
  });

  const totalFreeMinutes = studyDays.reduce((sum, d) => {
    const free = computeFreeBlocks(d.winStart, d.winEnd, d.busyBlocks, [], breakDuration);
    return sum + free.reduce((s, b) => s + (b.end - b.start), 0);
  }, 0);

  const allScheduledDates = scheduled.map(s => s.dateStr).sort();

  return {
    scheduled,
    unscheduled,
    totalSlots: studyDays.length,
    totalFreeMinutes,
    weeklyStats,
    weeks,
    allocationTable,
    debugLog,
    repairLog,
    firstScheduledDate: allScheduledDates[0] || null,
    lastScheduledDate: allScheduledDates[allScheduledDates.length - 1] || null,
  };
}