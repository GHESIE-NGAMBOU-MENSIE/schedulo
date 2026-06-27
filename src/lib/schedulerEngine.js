/**
 * Schedulo Rule-Based Scheduling Engine v2
 *
 * Core invariants enforced for every placed block:
 *  - Inside the study period
 *  - Inside the preferred study window for that day
 *  - Does NOT overlap any fixed calendar event (busy block)
 *  - Does NOT overlap any already-placed study block
 *  - Break duration is respected AFTER every busy block and AFTER every study block
 *  - Respects max study hours per day
 *  - Does not fall on a no-study day
 *  - Is before its deadline (if set)
 */

const JS_DAY_TO_NAME = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

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
  return d.toISOString().split('T')[0];
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

/**
 * Build a map of all fixed busy blocks per date string.
 * { "2026-04-07": [{start: minutes, end: minutes, name, type, courseId}] }
 */
function buildBusyMap(calEvents, courses, startDate, endDate) {
  const busy = {};

  const addBusy = (dateKey, startMin, endMin, ev, type, courseId) => {
    if (!busy[dateKey]) busy[dateKey] = [];
    busy[dateKey].push({ start: startMin, end: endMin, name: ev.name || 'Event', type, courseId });
  };

  const start = parseDate(startDate);
  const end = parseDate(endDate);

  for (const ev of calEvents) {
    const evType = ev.type || classifyEvent(ev);
    const courseId = ev.course_id || matchEventToCourse(ev, courses);
    const startMin = toMinutes(ev.start_time);
    // If no end time, assume 1 hour
    const endMin = ev.end_time ? toMinutes(ev.end_time) : startMin + 60;

    const isRecurring = ev.is_recurring || ev.recurrence === 'weekly' || ev.recurrence === 'WEEKLY';
    const evDateStr = ev.start_date || ev.date;

    if (isRecurring) {
      const anchorDate = parseDate(evDateStr);
      if (!anchorDate || !start || !end) continue;
      const targetDow = anchorDate.getDay();
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

/**
 * Compute free sub-blocks within a day's study window, accounting for:
 *  - fixed busy blocks (calendar events)
 *  - already-placed study blocks
 *  - break duration AFTER each busy or study block
 *
 * Returns [{start, end}] sorted, filtered to >= 30 min
 */
function computeFreeBlocks(windowStart, windowEnd, busyBlocks, studyBlocks, breakDuration) {
  // Merge all occupied intervals, adding break padding after each
  const occupied = [];

  for (const b of busyBlocks) {
    // Fixed events block their exact time; also add a break gap after them
    occupied.push({ start: b.start, end: b.end + breakDuration });
  }
  for (const b of studyBlocks) {
    // Study blocks also need a break after them before the next study block can start
    occupied.push({ start: b.start, end: b.end + breakDuration });
  }

  // Sort and merge overlapping intervals
  occupied.sort((a, b) => a.start - b.start);
  const merged = [];
  for (const iv of occupied) {
    if (merged.length && iv.start <= merged[merged.length - 1].end) {
      merged[merged.length - 1].end = Math.max(merged[merged.length - 1].end, iv.end);
    } else {
      merged.push({ ...iv });
    }
  }

  // Compute gaps = free blocks
  const free = [];
  let cursor = windowStart;
  for (const iv of merged) {
    if (iv.start > cursor) {
      free.push({ start: cursor, end: Math.min(iv.start, windowEnd) });
    }
    cursor = Math.max(cursor, iv.end);
  }
  if (cursor < windowEnd) {
    free.push({ start: cursor, end: windowEnd });
  }

  return free.filter(b => b.end - b.start >= 30);
}

/**
 * Try to place a block of durationMinutes on a given day.
 * Returns {dateStr, start, end} or null.
 *
 * @param preferAfterMinutes - if set, prefer starting at or after this minute (e.g. after a lecture + break)
 */
function tryPlace(dateKey, windowStart, windowEnd, maxMinutes, busyBlocks, studyBlocks, breakDuration, durationMinutes, preferAfterMinutes) {
  // Check daily cap
  const usedMinutes = studyBlocks.reduce((sum, b) => sum + (b.end - b.start), 0);
  if (usedMinutes >= maxMinutes) return null;

  const actualDuration = Math.min(durationMinutes, maxMinutes - usedMinutes, 180);
  if (actualDuration < 30) return null;

  const freeBlocks = computeFreeBlocks(windowStart, windowEnd, busyBlocks, studyBlocks, breakDuration);

  for (const fb of freeBlocks) {
    // Try preferred start first
    if (preferAfterMinutes != null && preferAfterMinutes >= fb.start && preferAfterMinutes + actualDuration <= fb.end) {
      return { dateStr: dateKey, start: preferAfterMinutes, end: preferAfterMinutes + actualDuration };
    }
    // Then try from block start
    if (fb.start + actualDuration <= fb.end) {
      return { dateStr: dateKey, start: fb.start, end: fb.start + actualDuration };
    }
  }
  return null;
}

function taskOrder(task) {
  const type = task.task_type || 'reading';
  const phase = task.suggested_phase || '';
  if (type === 'test' || phase.includes('before exam')) return 3;
  if (type === 'revision') return 2;
  if (type === 'exercise') return 1;
  return 0;
}

function getPreferredEventType(task) {
  if (task.task_type === 'reading') return 'lecture';
  if (task.task_type === 'exercise') return 'exercise';
  if (task.task_type === 'revision' || task.task_type === 'test') return ['quiz', 'exam'];
  return null;
}

/**
 * Check if a placed task overlaps with any fixed event on its day.
 * Returns the conflicting event name or null.
 */
export function findConflict(task, busyMap) {
  if (!task.scheduled_date || !task.scheduled_start || !task.scheduled_end) return null;
  const dayBusy = busyMap[task.scheduled_date] || [];
  const taskStart = toMinutes(task.scheduled_start);
  const taskEnd = toMinutes(task.scheduled_end);
  for (const b of dayBusy) {
    if (taskStart < b.end && taskEnd > b.start) {
      return b.name;
    }
  }
  return null;
}

/**
 * Build the busy map from raw calendar events — exported so the UI can use it for conflict detection.
 */
export function buildBusyMapPublic(calEvents, courses, startDate, endDate) {
  return buildBusyMap(calEvents, courses, startDate, endDate);
}

/**
 * Main scheduling function.
 * Returns { scheduled, unscheduled, totalSlots, totalFreeMinutes }
 */
export function scheduleTasksEngine(tasks, calEvents, courses, prefs, startDate, endDate) {
  const busyMap = buildBusyMap(calEvents, courses, startDate, endDate);
  const breakDuration = prefs.break_duration != null ? prefs.break_duration : 15;
  const maxHoursPerDay = (prefs.max_hours || 6) * 60;
  const schedule = prefs.schedule || {};

  const start = parseDate(startDate);
  const end = parseDate(endDate);
  if (!start || !end) return { scheduled: [], unscheduled: tasks.map(t => ({ task: t, reason: 'No valid study period dates' })), totalSlots: 0, totalFreeMinutes: 0 };

  // Build list of study days
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
        winStart,
        winEnd,
        maxMinutes: maxHoursPerDay,
        busyBlocks: (busyMap[toDateStr(cur)] || []).sort((a, b) => a.start - b.start),
      });
    }
    cur = addDays(cur, 1);
  }

  // Per-day mutable state: already-placed study blocks
  const studyBlocksPerDay = {}; // dateKey -> [{start, end}]
  const getStudyBlocks = (dk) => studyBlocksPerDay[dk] || [];

  const scheduled = [];
  const unscheduled = [];

  // Sort: deadline tasks first, then no-deadline spread evenly
  const tasksWithDeadline = tasks.filter(t => t.deadline).sort((a, b) => {
    if (a.deadline !== b.deadline) return a.deadline.localeCompare(b.deadline);
    return taskOrder(a) - taskOrder(b);
  });
  const tasksWithoutDeadline = tasks.filter(t => !t.deadline).sort((a, b) => taskOrder(a) - taskOrder(b));
  const sortedTasks = [...tasksWithDeadline, ...tasksWithoutDeadline];

  // Build course -> related events map
  const courseEventsByDate = {};
  for (const [ds, blocks] of Object.entries(busyMap)) {
    for (const b of blocks) {
      if (b.courseId) {
        if (!courseEventsByDate[b.courseId]) courseEventsByDate[b.courseId] = [];
        courseEventsByDate[b.courseId].push({ dateStr: ds, type: b.type, endMin: b.end, name: b.name });
      }
    }
  }

  // For no-deadline tasks: evenly spread start indices
  const noDeadlineCount = tasksWithoutDeadline.length;
  const totalDays = studyDays.length;
  const getEarliestDayIdx = (idx) => {
    if (noDeadlineCount <= 1 || totalDays <= 1) return 0;
    return Math.floor((idx / noDeadlineCount) * totalDays);
  };

  let noDeadlineIdx = 0;

  for (const task of sortedTasks) {
    const hasDeadline = !!task.deadline;
    const deadlineDate = task.deadline ? parseDate(task.deadline) : null;
    const durationMinutes = Math.round((task.estimated_hours || 2) * 60);
    const preferredEventType = getPreferredEventType(task);
    const earliestDayIdx = hasDeadline ? 0 : getEarliestDayIdx(noDeadlineIdx);
    if (!hasDeadline) noDeadlineIdx++;

    // Split into max-3h blocks
    const blockDurations = [];
    let rem = durationMinutes;
    while (rem > 0) { blockDurations.push(Math.min(rem, 180)); rem -= 180; }

    let lastPlacedDate = null;

    for (let bi = 0; bi < blockDurations.length; bi++) {
      const blockDur = blockDurations[bi];
      let placed = null;
      let explanation = '';

      // ── Step 1: place after related calendar event (same day, after event + break) ──
      if (task.course_id && preferredEventType) {
        const relatedEvents = (courseEventsByDate[task.course_id] || [])
          .filter(e => Array.isArray(preferredEventType) ? preferredEventType.includes(e.type) : e.type === preferredEventType)
          .filter(e => !deadlineDate || e.dateStr <= task.deadline)
          .sort((a, b) => a.dateStr.localeCompare(b.dateStr));

        for (const relEv of relatedEvents) {
          const day = studyDays.find(d => d.dateKey === relEv.dateStr);
          if (!day) continue;
          if (deadlineDate && parseDate(relEv.dateStr) > deadlineDate) continue;
          const preferAfter = relEv.endMin + breakDuration;
          const result = tryPlace(day.dateKey, day.winStart, day.winEnd, day.maxMinutes, day.busyBlocks, getStudyBlocks(day.dateKey), breakDuration, blockDur, preferAfter);
          if (result) {
            placed = result;
            explanation = `After ${relEv.type} "${relEv.name}"`;
            break;
          }
          // Try next 3 days after the event
          const nextDays = studyDays.filter(d => d.dateKey > relEv.dateStr && (!deadlineDate || d.dateKey <= task.deadline)).slice(0, 3);
          for (const nd of nextDays) {
            const r2 = tryPlace(nd.dateKey, nd.winStart, nd.winEnd, nd.maxMinutes, nd.busyBlocks, getStudyBlocks(nd.dateKey), breakDuration, blockDur, null);
            if (r2) { placed = r2; explanation = `Day after ${relEv.type} "${relEv.name}"`; break; }
          }
          if (placed) break;
        }
      }

      // ── Step 2: spread window, respecting deadline ──
      if (!placed) {
        const candidates = studyDays.filter((d, idx) => {
          if (idx < earliestDayIdx) return false;
          if (lastPlacedDate && d.dateKey < lastPlacedDate) return false;
          if (deadlineDate && parseDate(d.dateKey) > deadlineDate) return false;
          return true;
        });
        for (const day of candidates) {
          const result = tryPlace(day.dateKey, day.winStart, day.winEnd, day.maxMinutes, day.busyBlocks, getStudyBlocks(day.dateKey), breakDuration, blockDur, null);
          if (result) { placed = result; explanation = task.suggested_phase ? `${task.suggested_phase} phase` : 'Next available slot'; break; }
        }
      }

      // ── Step 3: ignore spread — any slot before deadline ──
      if (!placed) {
        const candidates = studyDays.filter(d => {
          if (lastPlacedDate && d.dateKey < lastPlacedDate) return false;
          if (deadlineDate && parseDate(d.dateKey) > deadlineDate) return false;
          return true;
        });
        for (const day of candidates) {
          const result = tryPlace(day.dateKey, day.winStart, day.winEnd, day.maxMinutes, day.busyBlocks, getStudyBlocks(day.dateKey), breakDuration, blockDur, null);
          if (result) { placed = result; explanation = 'Next available slot'; break; }
        }
      }

      // ── Step 4: last resort — after deadline ──
      if (!placed) {
        for (const day of studyDays.filter(d => deadlineDate ? parseDate(d.dateKey) > deadlineDate : false)) {
          const result = tryPlace(day.dateKey, day.winStart, day.winEnd, day.maxMinutes, day.busyBlocks, getStudyBlocks(day.dateKey), breakDuration, blockDur, null);
          if (result) { placed = result; explanation = 'Scheduled after deadline (no earlier slot available)'; break; }
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
      } else {
        if (bi === 0) {
          let reason = 'No free slot available in study period';
          if (!studyDays.length) reason = 'No study days configured — enable at least one study day in preferences';
          else if (deadlineDate && deadlineDate < start) reason = 'Deadline is before the study period starts';
          else if (maxHoursPerDay < 60) reason = 'Maximum study hours per day is very low — increase it in preferences';
          unscheduled.push({ task, reason });
        }
      }
    }
  }

  // Compute total free hours for debug info
  const totalFreeMinutes = studyDays.reduce((sum, d) => {
    const free = computeFreeBlocks(d.winStart, d.winEnd, d.busyBlocks, [], breakDuration);
    return sum + free.reduce((s, b) => s + (b.end - b.start), 0);
  }, 0);

  return { scheduled, unscheduled, totalSlots: studyDays.length, totalFreeMinutes };
}