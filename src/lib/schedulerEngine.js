/**
 * Schedulo Rule-Based Scheduling Engine
 * Detects free slots from preferences + calendar events,
 * then places tasks context-awarein the best available slot.
 */

const DAY_NAME_TO_JS = { Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6 };
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

function dateStr(d) {
  return d.toISOString().split('T')[0];
}

function addDays(d, n) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function parseDate(str) {
  if (!str) return null;
  const d = new Date(str + 'T00:00:00');
  return isNaN(d) ? null : d;
}

/**
 * Classify a calendar event by type.
 */
function classifyEvent(ev) {
  const name = (ev.name || '').toLowerCase();
  if (/\b(exam|klausur|pr[üu]fung)\b/.test(name)) return 'exam';
  if (/\b(quiz|test)\b/.test(name)) return 'quiz';
  if (/\b(exercise|tutorial|tutorium|[üu]bung|praktikum|lab)\b/.test(name)) return 'exercise';
  if (/\b(lecture|vorlesung|seminar|class|kurs)\b/.test(name)) return 'lecture';
  return 'commitment';
}

/**
 * Try to match a calendar event to a course by name similarity.
 */
function matchEventToCourse(ev, courses) {
  const evName = (ev.name || '').toLowerCase();
  for (const c of courses) {
    const cName = (c.name || '').toLowerCase();
    // Check if course name words appear in event name
    const words = cName.split(/\s+/).filter(w => w.length > 3);
    if (words.some(w => evName.includes(w))) return c.id;
    if (evName.includes(cName) || cName.includes(evName.split(' ')[0])) return c.id;
  }
  return null;
}

/**
 * Build a map of all fixed busy blocks per date string.
 * Returns: { "2026-04-07": [{start: minutes, end: minutes, name, type, courseId}] }
 */
function buildBusyMap(calEvents, courses, startDate, endDate) {
  const busy = {};

  const addBusy = (dateKey, startMin, endMin, ev, type, courseId) => {
    if (!busy[dateKey]) busy[dateKey] = [];
    busy[dateKey].push({ start: startMin, end: endMin, name: ev.name, type, courseId, ev });
  };

  const start = parseDate(startDate);
  const end = parseDate(endDate);

  for (const ev of calEvents) {
    const evType = ev.type || classifyEvent(ev);
    const courseId = ev.course_id || matchEventToCourse(ev, courses);
    const startMin = toMinutes(ev.start_time);
    const endMin = ev.end_time ? toMinutes(ev.end_time) : startMin + 60;

    if (ev.is_recurring || ev.recurrence === 'weekly') {
      // Expand recurring event across entire study period
      const anchorDate = parseDate(ev.start_date || ev.date);
      if (!anchorDate || !start || !end) continue;
      const targetDow = anchorDate.getDay();
      let cur = new Date(start);
      // advance to first occurrence
      while (cur.getDay() !== targetDow) cur = addDays(cur, 1);
      while (cur <= end) {
        addBusy(dateStr(cur), startMin, endMin, ev, evType, courseId);
        cur = addDays(cur, 7);
      }
    } else {
      const d = parseDate(ev.start_date || ev.date);
      if (!d) continue;
      addBusy(dateStr(d), startMin, endMin, ev, evType, courseId);
    }
  }

  return busy;
}

/**
 * Generate all free study slots across the study period.
 * Returns array of { date: Date, dateStr, windowStart: minutes, windowEnd: minutes, busyBlocks, dayName }
 */
function generateFreeSlots(startDate, endDate, prefs, busyMap) {
  const schedule = prefs.schedule || {};
  const maxHoursPerDay = (prefs.max_hours || 6) * 60; // in minutes
  const breakDuration = prefs.break_duration || 15;
  const slots = [];

  const start = parseDate(startDate);
  const end = parseDate(endDate);
  if (!start || !end) return slots;

  let cur = new Date(start);
  while (cur <= end) {
    const dayName = JS_DAY_TO_NAME[cur.getDay()];
    const dayPrefs = schedule[dayName] || {};

    if (!dayPrefs.noStudy) {
      const winStart = toMinutes(dayPrefs.start || prefs.preferred_start || '09:00');
      const winEnd = toMinutes(dayPrefs.end || prefs.preferred_end || '18:00');
      const busyBlocks = (busyMap[dateStr(cur)] || []).sort((a, b) => a.start - b.start);

      slots.push({
        date: new Date(cur),
        dateStr: dateStr(cur),
        dayName,
        windowStart: winStart,
        windowEnd: winEnd,
        maxMinutes: maxHoursPerDay,
        breakDuration,
        busyBlocks
      });
    }
    cur = addDays(cur, 1);
  }
  return slots;
}

/**
 * For a given slot day, find free sub-blocks within the study window,
 * excluding busy periods. Returns [{start: minutes, end: minutes}]
 */
function getFreeBlocks(slot, alreadyUsedMinutes, alreadyScheduledBlocks) {
  const allBusy = [...slot.busyBlocks, ...alreadyScheduledBlocks].sort((a, b) => a.start - b.start);
  const freeBlocks = [];
  let cursor = slot.windowStart;

  for (const block of allBusy) {
    if (block.start > cursor) {
      freeBlocks.push({ start: cursor, end: Math.min(block.start, slot.windowEnd) });
    }
    cursor = Math.max(cursor, block.end);
  }
  if (cursor < slot.windowEnd) {
    freeBlocks.push({ start: cursor, end: slot.windowEnd });
  }

  // Filter out blocks that are too small (< 30 min)
  return freeBlocks.filter(b => b.end - b.start >= 30);
}

/**
 * Try to place a task of durationMinutes into a slot.
 * Returns {dateStr, start, end} or null if it doesn't fit.
 */
function tryPlaceInSlot(slot, durationMinutes, usedMinutesPerDay, scheduledBlocksPerDay, preferAfterMinutes) {
  const used = usedMinutesPerDay[slot.dateStr] || 0;
  if (used >= slot.maxMinutes) return null;

  const remaining = slot.maxMinutes - used;
  const actualDuration = Math.min(durationMinutes, remaining, 180); // max 3h block
  if (actualDuration < 30) return null;

  const scheduled = scheduledBlocksPerDay[slot.dateStr] || [];
  const freeBlocks = getFreeBlocks(slot, used, scheduled);

  for (const fb of freeBlocks) {
    // Try to start after preferAfterMinutes (e.g. after a lecture + break)
    const startCandidate = preferAfterMinutes != null && preferAfterMinutes > fb.start
      ? preferAfterMinutes
      : fb.start;

    if (startCandidate + actualDuration <= fb.end) {
      return { dateStr: slot.dateStr, start: startCandidate, end: startCandidate + actualDuration };
    }
    // Fallback: start at block beginning
    if (fb.start + actualDuration <= fb.end) {
      return { dateStr: slot.dateStr, start: fb.start, end: fb.start + actualDuration };
    }
  }
  return null;
}

/**
 * Determine task category for ordering purposes.
 */
function taskOrder(task) {
  const type = task.task_type || 'reading';
  const phase = task.suggested_phase || '';
  if (type === 'test' || phase.includes('before exam')) return 3;
  if (type === 'revision') return 2;
  if (type === 'exercise') return 1;
  return 0;
}

/**
 * Detect if a task type should follow a specific calendar event type.
 */
function getPreferredEventType(task) {
  const type = task.task_type;
  if (type === 'reading') return 'lecture';
  if (type === 'exercise') return 'exercise';
  if (type === 'revision' || type === 'test') return ['quiz', 'exam'];
  return null;
}

/**
 * Main scheduling function.
 * Returns { scheduled: [{task, dateStr, startTime, endTime, explanation}], unscheduled: [{task, reason}] }
 *
 * Distribution strategy: tasks are spread evenly across the full study period.
 * Each task gets a "target window" proportional to its position in the sorted list,
 * so tasks don't all pile up at the start.
 */
export function scheduleTasksEngine(tasks, calEvents, courses, prefs, startDate, endDate) {
  const busyMap = buildBusyMap(calEvents, courses, startDate, endDate);
  const allSlots = generateFreeSlots(startDate, endDate, prefs, busyMap);

  const usedMinutesPerDay = {}; // dateStr -> minutes used
  const scheduledBlocksPerDay = {}; // dateStr -> [{start, end}]

  const scheduled = [];
  const unscheduled = [];

  // Sort tasks: hard-deadline tasks first (sorted by deadline), then no-deadline tasks
  const tasksWithDeadline = tasks.filter(t => t.deadline).sort((a, b) => {
    if (a.deadline !== b.deadline) return a.deadline.localeCompare(b.deadline);
    return taskOrder(a) - taskOrder(b);
  });
  const tasksWithoutDeadline = tasks.filter(t => !t.deadline).sort((a, b) => taskOrder(a) - taskOrder(b));
  const sortedTasks = [...tasksWithDeadline, ...tasksWithoutDeadline];

  // Build course -> related events map from busy map
  const courseEventsByDate = {}; // courseId -> [{dateStr, type, endMin}]
  for (const [ds, blocks] of Object.entries(busyMap)) {
    for (const b of blocks) {
      if (b.courseId) {
        if (!courseEventsByDate[b.courseId]) courseEventsByDate[b.courseId] = [];
        courseEventsByDate[b.courseId].push({ dateStr: ds, type: b.type, endMin: b.end, name: b.name });
      }
    }
  }

  // For no-deadline tasks: compute a target start slot index to spread them evenly
  const noDeadlineCount = tasksWithoutDeadline.length;
  const slotCount = allSlots.length;

  // Track slot index cursor per task group to enforce spreading
  // Each no-deadline task gets an "earliest allowed slot" index
  const getEarliestSlotIdx = (taskIdxInNoDeadlineGroup) => {
    if (noDeadlineCount <= 1 || slotCount <= 1) return 0;
    return Math.floor((taskIdxInNoDeadlineGroup / noDeadlineCount) * slotCount);
  };

  let noDeadlineTaskIdx = 0;

  for (const task of sortedTasks) {
    const hasDeadline = !!task.deadline;
    const durationMinutes = Math.round((task.estimated_hours || 2) * 60);
    const deadline = task.deadline ? parseDate(task.deadline) : null;
    const preferredEventType = getPreferredEventType(task);

    // For no-deadline tasks, compute the earliest slot index to start searching from
    const earliestSlotIdx = hasDeadline ? 0 : getEarliestSlotIdx(noDeadlineTaskIdx);
    if (!hasDeadline) noDeadlineTaskIdx++;

    // Max 3h per block; split if > 3h
    const blocks = [];
    let remaining = durationMinutes;
    while (remaining > 0) {
      blocks.push(Math.min(remaining, 180));
      remaining -= 180;
    }

    let lastScheduledDate = null;

    for (let blockIdx = 0; blockIdx < blocks.length; blockIdx++) {
      const blockDuration = blocks[blockIdx];
      let placed = null;
      let explanation = '';

      // Step 1: Try to find a related calendar event slot (same day, after the event + break)
      if (task.course_id && preferredEventType) {
        const relatedEvents = (courseEventsByDate[task.course_id] || [])
          .filter(e => Array.isArray(preferredEventType) ? preferredEventType.includes(e.type) : e.type === preferredEventType)
          .filter(e => !deadline || e.dateStr <= task.deadline)
          .sort((a, b) => a.dateStr.localeCompare(b.dateStr));

        for (const relEv of relatedEvents) {
          const slot = allSlots.find(s => s.dateStr === relEv.dateStr);
          if (!slot) continue;
          if (deadline && parseDate(relEv.dateStr) > deadline) continue;
          const afterBreak = relEv.endMin + (prefs.break_duration || 15);
          const result = tryPlaceInSlot(slot, blockDuration, usedMinutesPerDay, scheduledBlocksPerDay, afterBreak);
          if (result) {
            placed = result;
            explanation = `Scheduled after related ${relEv.type} "${relEv.name}" on same day`;
            break;
          }
          // Try next day after the event
          const nextDaySlots = allSlots.filter(s => s.dateStr > relEv.dateStr && s.dateStr <= (task.deadline || endDate)).slice(0, 3);
          for (const ns of nextDaySlots) {
            const result2 = tryPlaceInSlot(ns, blockDuration, usedMinutesPerDay, scheduledBlocksPerDay, null);
            if (result2) {
              placed = result2;
              explanation = `Scheduled day after related ${relEv.type} "${relEv.name}"`;
              break;
            }
          }
          if (placed) break;
        }
      }

      // Step 2: No related event — use available slot, respecting spread window and deadline
      if (!placed) {
        const candidateSlots = allSlots.filter((s, idx) => {
          if (idx < earliestSlotIdx) return false;
          if (lastScheduledDate && s.dateStr < lastScheduledDate) return false;
          if (deadline && parseDate(s.dateStr) > deadline) return false;
          return true;
        });

        for (const slot of candidateSlots) {
          const result = tryPlaceInSlot(slot, blockDuration, usedMinutesPerDay, scheduledBlocksPerDay, null);
          if (result) {
            placed = result;
            explanation = task.suggested_phase
              ? `Scheduled in ${task.suggested_phase} phase`
              : 'Scheduled in next available slot';
            break;
          }
        }
      }

      // Step 3: Spread window had nothing — try any slot before deadline
      if (!placed) {
        const fallbackSlots = allSlots.filter(s => {
          if (lastScheduledDate && s.dateStr < lastScheduledDate) return false;
          if (deadline && parseDate(s.dateStr) > deadline) return false;
          return true;
        });
        for (const slot of fallbackSlots) {
          const result = tryPlaceInSlot(slot, blockDuration, usedMinutesPerDay, scheduledBlocksPerDay, null);
          if (result) {
            placed = result;
            explanation = 'Scheduled in next available slot';
            break;
          }
        }
      }

      // Step 4: Last resort — ignore deadline constraint
      if (!placed) {
        for (const slot of allSlots.filter(s => !deadline || parseDate(s.dateStr) > deadline)) {
          const result = tryPlaceInSlot(slot, blockDuration, usedMinutesPerDay, scheduledBlocksPerDay, null);
          if (result) {
            placed = result;
            explanation = `Scheduled after deadline (no earlier slot available)`;
            break;
          }
        }
      }

      if (placed) {
        usedMinutesPerDay[placed.dateStr] = (usedMinutesPerDay[placed.dateStr] || 0) + (placed.end - placed.start);
        if (!scheduledBlocksPerDay[placed.dateStr]) scheduledBlocksPerDay[placed.dateStr] = [];
        scheduledBlocksPerDay[placed.dateStr].push({ start: placed.start, end: placed.end });
        lastScheduledDate = placed.dateStr;

        scheduled.push({
          task,
          dateStr: placed.dateStr,
          startTime: fromMinutes(placed.start),
          endTime: fromMinutes(placed.end),
          explanation: blocks.length > 1 ? `${explanation} (block ${blockIdx + 1}/${blocks.length})` : explanation
        });
      } else {
        if (blockIdx === 0) {
          let reason = 'No free slot available in study period';
          if (!allSlots.length) reason = 'No study days configured';
          else if (deadline && parseDate(deadline) < parseDate(startDate)) reason = 'Deadline is before study period start';
          unscheduled.push({ task, reason });
        }
      }
    }
  }

  return {
    scheduled,
    unscheduled,
    totalSlots: allSlots.length,
    totalFreeMinutes: allSlots.reduce((sum, s) => {
      const blocks = getFreeBlocks(s, 0, []);
      return sum + blocks.reduce((bs, b) => bs + (b.end - b.start), 0);
    }, 0)
  };
}