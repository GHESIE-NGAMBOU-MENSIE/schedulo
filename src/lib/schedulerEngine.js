/**
 * Schedulo Scheduling Engine v3
 *
 * Architecture:
 *  Phase 1 – Divide study period into calendar weeks
 *  Phase 2 – Assign each task to a target week (semester-plan-aware, deadline-aware, course-type-aware)
 *  Phase 3 – Within each week, balance tasks across active courses (max 40% per course rule)
 *  Phase 4 – Place each week's tasks into valid free calendar slots, respecting:
 *             - preferred weekday/time routine (stability rule)
 *             - course-event anchors (after lecture/exercise)
 *             - no overlap with fixed events
 *             - break gap between study blocks
 *             - daily study hour cap
 *             - no-study days
 *             - deadlines
 */

const JS_DAY_TO_NAME = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// ─── Utility helpers ────────────────────────────────────────────────────────

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
  // Use local date parts to avoid UTC timezone shifting
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${day}`;
}

// Export-friendly alias for use in UI components
export function getLocalDateStr(d) {
  return toDateStr(d);
}

function addDays(d, n) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function parseDate(str) {
  if (!str) return null;
  const s = str.includes('T') ? str : str + 'T00:00:00';
  const d = new Date(s);
  return isNaN(d) ? null : d;
}

// Week number (0-based) from a reference start date (Monday of week 0)
function getWeekIndex(dateStr, weeks) {
  for (let i = 0; i < weeks.length; i++) {
    if (dateStr >= weeks[i].startStr && dateStr <= weeks[i].endStr) return i;
  }
  return -1;
}

// ─── Event classification ────────────────────────────────────────────────────

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

// ─── Busy map (fixed calendar events) ────────────────────────────────────────

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

    // Normalize recurrence — accept all common formats
    const rec = (ev.recurrence || ev.recurrence_rule || ev.rrule || '').toString().toUpperCase();
    const isRecurring =
      ev.is_recurring === true || ev.is_recurring === 'true' ||
      rec === 'WEEKLY' || rec.includes('FREQ=WEEKLY');

    // Normalize date field — accept start, startDate, start_datetime, start_date, date
    const evDateStr = ev.start_date || ev.date ||
      (ev.start ? ev.start.substring(0, 10) : null) ||
      (ev.startDate ? ev.startDate.substring(0, 10) : null) ||
      (ev.start_datetime ? ev.start_datetime.substring(0, 10) : null);

    // Normalize time fields
    const evStartTime = ev.start_time ||
      (ev.start && ev.start.includes('T') ? ev.start.substring(11, 16) : null) ||
      (ev.start_datetime && ev.start_datetime.includes('T') ? ev.start_datetime.substring(11, 16) : null) || '00:00';
    const evEndTime = ev.end_time ||
      (ev.end && ev.end.includes('T') ? ev.end.substring(11, 16) : null) ||
      (ev.end_datetime && ev.end_datetime.includes('T') ? ev.end_datetime.substring(11, 16) : null) ||
      (ev.endDate && ev.endDate.includes('T') ? ev.endDate.substring(11, 16) : null) || null;

    const startMin = toMinutes(evStartTime);
    const endMin = evEndTime ? toMinutes(evEndTime) : startMin + 60;

    if (isRecurring) {
      if (!start || !end) continue;

      // Determine day-of-week for recurrence
      // 1) Try anchor date from stored date field
      // 2) Fall back to day_of_week name (e.g. "Monday") stored by ICS parser
      const DAY_NAME_TO_DOW = { Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6 };
      let targetDow = null;
      const anchorDate = parseDate(evDateStr);
      if (anchorDate) {
        targetDow = anchorDate.getDay();
      } else if (ev.day_of_week && DAY_NAME_TO_DOW[ev.day_of_week] !== undefined) {
        targetDow = DAY_NAME_TO_DOW[ev.day_of_week];
      }
      if (targetDow === null) continue;

      let cur = new Date(start);
      while (cur.getDay() !== targetDow) cur = addDays(cur, 1);
      while (cur <= end) {
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

// ─── Free slot computation ───────────────────────────────────────────────────

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

  // Try preferred start time first (routine stability)
  if (preferStartMinutes != null) {
    for (const fb of freeBlocks) {
      if (preferStartMinutes >= fb.start && preferStartMinutes + actualDuration <= fb.end) {
        return { dateStr: dateKey, start: preferStartMinutes, end: preferStartMinutes + actualDuration };
      }
    }
  }

  // Fall back to first available slot
  for (const fb of freeBlocks) {
    if (fb.start + actualDuration <= fb.end) {
      return { dateStr: dateKey, start: fb.start, end: fb.start + actualDuration };
    }
  }
  return null;
}

// ─── Conflict detection ──────────────────────────────────────────────────────

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

// ─── Week generation ─────────────────────────────────────────────────────────

function buildWeeks(startDate, endDate) {
  const start = parseDate(startDate);
  const end = parseDate(endDate);
  if (!start || !end) return [];

  // Find Monday of the week containing start
  const dow = start.getDay(); // 0=Sun
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
    // Only include weeks that overlap with study period
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

// ─── Course type detection ───────────────────────────────────────────────────

function isProjectLikeCourse(course) {
  const types = (course.course_type || []).map(t => t.toLowerCase());
  const name = (course.name || '').toLowerCase();
  return types.some(t => /project|thesis|seminar|slr|dsr|capstone|bachelor|master/.test(t))
    || /thesis|projekt|bachelor|master|seminar|slr|dsr/.test(name);
}

// ─── Task ordering within a course ──────────────────────────────────────────

function taskInternalOrder(task) {
  const type = task.task_type || 'reading';
  const title = (task.title || '').toLowerCase();
  // Extract chapter/week number from title for sequential ordering
  const numMatch = title.match(/\b(\d+)\b/);
  const num = numMatch ? parseInt(numMatch[1]) : 999;

  let typeOrder = 0;
  if (type === 'reading') typeOrder = 0;
  if (type === 'exercise') typeOrder = 1;
  if (type === 'assignment') typeOrder = 2;
  if (type === 'project_work') typeOrder = 3;
  if (type === 'revision') typeOrder = 4;
  if (type === 'test') typeOrder = 5;

  return num * 10 + typeOrder;
}

// ─── Determine target week for a task ────────────────────────────────────────

function assignTargetWeek(task, courseIndex, courseTasks, weeks, courses, courseEventsByWeek) {
  if (!weeks.length) return 0;

  const course = courses.find(c => c.id === task.course_id || c.name === task.course_name);
  const isProject = course ? isProjectLikeCourse(course) : false;

  // If deadline set, must finish by deadline week
  let latestWeekIdx = weeks.length - 1;
  if (task.deadline) {
    const di = getWeekIndex(task.deadline, weeks);
    if (di >= 0) latestWeekIdx = di;
    else if (task.deadline < weeks[0].startStr) latestWeekIdx = 0;
  }

  // Get exam week for course to avoid scheduling after exam
  let examWeekIdx = weeks.length - 1;
  if (course?.exam_date) {
    const ew = getWeekIndex(course.exam_date, weeks);
    if (ew >= 0) examWeekIdx = Math.max(0, ew - 1); // week before exam
  }
  const effectiveLatest = Math.min(latestWeekIdx, examWeekIdx);

  // Position of this task among all tasks of the same course (0-based)
  const sortedCourseTasks = [...courseTasks].sort((a, b) => taskInternalOrder(a) - taskInternalOrder(b));
  const posInCourse = sortedCourseTasks.findIndex(t => t.id === task.id || t.title === task.title);
  const totalCourseTasks = sortedCourseTasks.length;

  if (isProject) {
    // Distribute project tasks evenly across available weeks
    const fraction = totalCourseTasks <= 1 ? 0 : posInCourse / (totalCourseTasks - 1);
    return Math.round(fraction * effectiveLatest);
  }

  // Weekly lecture course: one task per week, sequential
  // Reading tasks: spread one per week
  // Exercise tasks: same week as their corresponding reading (or +0)
  const type = task.task_type || 'reading';

  // Count reading/primary tasks for the course to determine weekly cadence
  const readingTasks = sortedCourseTasks.filter(t => t.task_type === 'reading' || t.task_type === 'assignment' || t.task_type === 'project_work');
  const exerciseTasks = sortedCourseTasks.filter(t => t.task_type === 'exercise' || t.task_type === 'revision');

  if (type === 'reading' || type === 'assignment' || type === 'project_work') {
    const posAmongPrimary = readingTasks.findIndex(t => t.id === task.id || t.title === task.title);
    if (posAmongPrimary < 0) {
      const fraction = totalCourseTasks <= 1 ? 0 : posInCourse / (totalCourseTasks - 1);
      return Math.min(Math.round(fraction * effectiveLatest), effectiveLatest);
    }
    // One primary task per week, starting at week 0
    return Math.min(posAmongPrimary, effectiveLatest);
  }

  if (type === 'exercise' || type === 'revision') {
    // Pair with corresponding reading task (same index)
    const posAmongExercise = exerciseTasks.findIndex(t => t.id === task.id || t.title === task.title);
    if (posAmongExercise < 0) {
      const fraction = totalCourseTasks <= 1 ? 0 : posInCourse / (totalCourseTasks - 1);
      return Math.min(Math.round(fraction * effectiveLatest), effectiveLatest);
    }
    // Same week as the matching reading task
    return Math.min(posAmongExercise, effectiveLatest);
  }

  if (type === 'test') {
    // Tests near the end / before exam
    return effectiveLatest;
  }

  // Default: distribute evenly
  const fraction = totalCourseTasks <= 1 ? 0 : posInCourse / (totalCourseTasks - 1);
  return Math.min(Math.round(fraction * effectiveLatest), effectiveLatest);
}

// ─── Main scheduling engine ──────────────────────────────────────────────────

export function scheduleTasksEngine(tasks, calEvents, courses, prefs, startDate, endDate) {
  const busyMap = buildBusyMap(calEvents, courses, startDate, endDate);
  const breakDuration = prefs.break_duration != null ? prefs.break_duration : 15;
  const maxHoursPerDay = (prefs.max_hours || 6) * 60;
  const schedule = prefs.schedule || {};

  const start = parseDate(startDate);
  const end = parseDate(endDate);
  if (!start || !end) {
    return { scheduled: [], unscheduled: tasks.map(t => ({ task: t, reason: 'No valid study period dates' })), totalSlots: 0, totalFreeMinutes: 0, weeklyStats: [] };
  }

  // ── Phase 0: Build study days ──────────────────────────────────────────────
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
        dow: cur.getDay(), // 0=Sun
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

  // ── Phase 1: Build weeks ───────────────────────────────────────────────────
  const weeks = buildWeeks(startDate, endDate);
  if (!weeks.length) {
    return { scheduled: [], unscheduled: tasks.map(t => ({ task: t, reason: 'Study period too short to create weeks' })), totalSlots: studyDays.length, totalFreeMinutes: 0, weeklyStats: [] };
  }

  // ── Phase 2: Build course-event anchors by week ────────────────────────────
  // courseEventsByWeek[courseId][weekIdx] = [{dateStr, type, endMin, name}]
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

  // ── Phase 3: Assign each task to a target week ────────────────────────────
  // Group tasks by course
  const tasksByCourse = {};
  for (const task of tasks) {
    const key = task.course_id || task.course_name || '__none';
    if (!tasksByCourse[key]) tasksByCourse[key] = [];
    tasksByCourse[key].push(task);
  }

  // tasksWithTargetWeek: [{task, targetWeekIdx}]
  const tasksWithTargetWeek = [];
  for (const [courseKey, courseTasks] of Object.entries(tasksByCourse)) {
    for (const task of courseTasks) {
      const targetWeekIdx = assignTargetWeek(task, 0, courseTasks, weeks, courses, courseEventsByWeek);
      tasksWithTargetWeek.push({ task, targetWeekIdx });
    }
  }

  // ── Phase 4: Balance tasks across courses within each week ────────────────
  // weekAssignments[weekIdx] = [{task, targetWeekIdx}]
  const weekAssignments = {};
  for (let i = 0; i < weeks.length; i++) weekAssignments[i] = [];
  for (const entry of tasksWithTargetWeek) {
    const wi = Math.max(0, Math.min(entry.targetWeekIdx, weeks.length - 1));
    weekAssignments[wi].push(entry);
  }

  // Balance: prevent >40% domination per course per week
  // Move excess tasks to adjacent weeks if other courses need attention
  for (let wi = 0; wi < weeks.length; wi++) {
    const weekEntries = weekAssignments[wi];
    if (weekEntries.length === 0) continue;

    const courseCounts = {};
    for (const e of weekEntries) {
      const key = e.task.course_id || e.task.course_name || '__none';
      courseCounts[key] = (courseCounts[key] || 0) + 1;
    }

    const total = weekEntries.length;
    const activeCourses = Object.keys(courseCounts).length;
    if (activeCourses <= 1) continue;

    const maxAllowed = Math.max(2, Math.ceil(total * 0.4));

    for (const [courseKey, count] of Object.entries(courseCounts)) {
      if (count <= maxAllowed) continue;
      // Move excess (non-deadline, non-high-priority) tasks to next week
      const excess = count - maxAllowed;
      const courseEntries = weekEntries.filter(e =>
        (e.task.course_id || e.task.course_name || '__none') === courseKey &&
        e.task.priority !== 'high' &&
        !e.task.deadline
      );
      // Move from the end (later tasks in the course)
      const toMove = courseEntries.slice(-excess);
      for (const entry of toMove) {
        const nextWi = Math.min(wi + 1, weeks.length - 1);
        if (nextWi !== wi) {
          weekAssignments[wi] = weekAssignments[wi].filter(e => e !== entry);
          entry.targetWeekIdx = nextWi;
          weekAssignments[nextWi].push(entry);
        }
      }
    }
  }

  // ── Phase 5: Place tasks week by week into actual time slots ──────────────
  const scheduled = [];
  const unscheduled = [];

  // Routine memory: courseKey -> {dow, startMinutes} — tracks stable weekly slot
  const courseRoutine = {};

  // Helper: get preferred event type for anchoring
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

    // Get study days for this week
    const weekStudyDays = studyDays.filter(d => d.dateKey >= week.startStr && d.dateKey <= week.endStr);
    if (!weekStudyDays.length) {
      for (const e of weekEntries) {
        unscheduled.push({ task: e.task, reason: `No study days available in ${week.label}` });
      }
      continue;
    }

    // Sort entries: high priority / deadline first, then by internal order
    weekEntries.sort((a, b) => {
      const aPrio = a.task.priority === 'high' ? 0 : a.task.priority === 'medium' ? 1 : 2;
      const bPrio = b.task.priority === 'high' ? 0 : b.task.priority === 'medium' ? 1 : 2;
      if (aPrio !== bPrio) return aPrio - bPrio;
      if (a.task.deadline && b.task.deadline) return a.task.deadline.localeCompare(b.task.deadline);
      if (a.task.deadline) return -1;
      if (b.task.deadline) return 1;
      return taskInternalOrder(a.task) - taskInternalOrder(b.task);
    });

    for (const entry of weekEntries) {
      const task = entry.task;
      const courseKey = task.course_id || task.course_name || '__none';
      const durationMinutes = Math.round((task.estimated_hours || 2) * 60);
      const deadlineDate = task.deadline ? parseDate(task.deadline) : null;
      const preferredEventType = getPreferredEventType(task);

      // Split into max-3h blocks
      const blockDurations = [];
      let rem = durationMinutes;
      while (rem > 0) { blockDurations.push(Math.min(rem, 180)); rem -= 180; }

      let lastPlacedDate = null;

      for (let bi = 0; bi < blockDurations.length; bi++) {
        const blockDur = blockDurations[bi];
        let placed = null;
        let explanation = '';

        // ── Step A: Try after course event anchor in this week ───────────────
        if (task.course_id && preferredEventType) {
          const weekCourseEvents = (courseEventsByWeek[task.course_id]?.[wi] || [])
            .filter(e => Array.isArray(preferredEventType) ? preferredEventType.includes(e.type) : e.type === preferredEventType)
            .sort((a, b) => a.dateStr.localeCompare(b.dateStr));

          for (const relEv of weekCourseEvents) {
            const day = weekStudyDays.find(d => d.dateKey === relEv.dateStr);
            if (!day) continue;
            if (deadlineDate && parseDate(relEv.dateStr) > deadlineDate) continue;
            const preferAfter = relEv.endMin + breakDuration;
            const result = tryPlace(day.dateKey, day.winStart, day.winEnd, day.maxMinutes, day.busyBlocks, getStudyBlocks(day.dateKey), breakDuration, blockDur, preferAfter);
            if (result) {
              placed = result;
              explanation = `After ${relEv.type} "${relEv.name}"`;
              // Update routine
              courseRoutine[courseKey] = { dow: day.dow, startMinutes: result.start };
              break;
            }
          }
        }

        // ── Step B: Try routine slot (stable weekly day+time) ────────────────
        if (!placed && courseRoutine[courseKey]) {
          const routine = courseRoutine[courseKey];
          const routineDay = weekStudyDays.find(d => d.dow === routine.dow);
          if (routineDay && (!deadlineDate || parseDate(routineDay.dateKey) <= deadlineDate)) {
            const result = tryPlace(routineDay.dateKey, routineDay.winStart, routineDay.winEnd, routineDay.maxMinutes, routineDay.busyBlocks, getStudyBlocks(routineDay.dateKey), breakDuration, blockDur, routine.startMinutes);
            if (result) {
              placed = result;
              explanation = 'Routine slot';
            }
          }
        }

        // ── Step C: Try any day in the week ──────────────────────────────────
        if (!placed) {
          for (const day of weekStudyDays) {
            if (lastPlacedDate && day.dateKey < lastPlacedDate) continue;
            if (deadlineDate && parseDate(day.dateKey) > deadlineDate) continue;
            const result = tryPlace(day.dateKey, day.winStart, day.winEnd, day.maxMinutes, day.busyBlocks, getStudyBlocks(day.dateKey), breakDuration, blockDur, null);
            if (result) {
              placed = result;
              explanation = `${week.label}`;
              // Set routine from first successful placement
              if (!courseRoutine[courseKey]) {
                courseRoutine[courseKey] = { dow: day.dow, startMinutes: result.start };
              }
              break;
            }
          }
        }

        // ── Step D: Overflow to adjacent weeks (deadline permitting) ─────────
        if (!placed) {
          // Try next weeks first (prefer not to go backward)
          const overflowWeeks = [];
          for (let owi = wi + 1; owi < weeks.length; owi++) overflowWeeks.push(owi);
          for (let owi = wi - 1; owi >= 0; owi--) overflowWeeks.push(owi);

          for (const owi of overflowWeeks) {
            const overflowDays = studyDays.filter(d => d.dateKey >= weeks[owi].startStr && d.dateKey <= weeks[owi].endStr);
            for (const day of overflowDays) {
              if (deadlineDate && parseDate(day.dateKey) > deadlineDate) continue;
              const result = tryPlace(day.dateKey, day.winStart, day.winEnd, day.maxMinutes, day.busyBlocks, getStudyBlocks(day.dateKey), breakDuration, blockDur, null);
              if (result) {
                placed = result;
                explanation = `Overflow from ${week.label} to ${weeks[owi].label}`;
                break;
              }
            }
            if (placed) break;
          }
        }

        // ── Step E: Last resort — after deadline ─────────────────────────────
        if (!placed && deadlineDate) {
          for (const day of studyDays) {
            if (parseDate(day.dateKey) <= deadlineDate) continue;
            const result = tryPlace(day.dateKey, day.winStart, day.winEnd, day.maxMinutes, day.busyBlocks, getStudyBlocks(day.dateKey), breakDuration, blockDur, null);
            if (result) {
              placed = result;
              explanation = 'Scheduled after deadline (no earlier slot available)';
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
          });
        } else if (bi === 0) {
          let reason = `No free slot available in ${week.label} or adjacent weeks`;
          if (!studyDays.length) reason = 'No study days configured — enable at least one study day in preferences';
          else if (deadlineDate && deadlineDate < start) reason = 'Deadline is before the study period starts';
          else if (maxHoursPerDay < 60) reason = 'Maximum study hours per day is very low — increase it in preferences';
          unscheduled.push({ task, reason });
        }
      }
    }
  }

  // ── Phase 6: Build weekly stats for validation summary ────────────────────
  const weeklyStats = weeks.map((week, wi) => {
    const weekScheduled = scheduled.filter(s => s.dateStr >= week.startStr && s.dateStr <= week.endStr);
    const tasksByCourseInWeek = {};
    for (const s of weekScheduled) {
      const key = s.task.course_name || s.task.course_id || 'Unknown';
      tasksByCourseInWeek[key] = (tasksByCourseInWeek[key] || 0) + 1;
    }

    // Which courses have remaining unscheduled tasks that could have gone here
    const unscheduledForWeek = unscheduled.filter(u => {
      const entry = tasksWithTargetWeek.find(e => e.task.id === u.task.id);
      return entry && entry.targetWeekIdx === wi;
    });

    const missingCourses = [...new Set(unscheduledForWeek.map(u => u.task.course_name || u.task.course_id))];

    const total = weekScheduled.length;
    const overloadedCourses = Object.entries(tasksByCourseInWeek)
      .filter(([, count]) => total > 2 && count / total > 0.4)
      .map(([name, count]) => ({ name, count, pct: Math.round(count / total * 100) }));

    return {
      weekLabel: week.label,
      startStr: week.startStr,
      endStr: week.endStr,
      totalScheduled: total,
      tasksByCourse: tasksByCourseInWeek,
      missingCourses,
      overloadedCourses,
    };
  });

  const totalFreeMinutes = studyDays.reduce((sum, d) => {
    const free = computeFreeBlocks(d.winStart, d.winEnd, d.busyBlocks, [], breakDuration);
    return sum + free.reduce((s, b) => s + (b.end - b.start), 0);
  }, 0);

  return { scheduled, unscheduled, totalSlots: studyDays.length, totalFreeMinutes, weeklyStats, weeks };
}