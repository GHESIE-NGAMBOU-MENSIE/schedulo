/**
 * Slot Validator — checks whether a proposed task placement is valid
 * and suggests free alternative slots when it's not.
 */

function toMin(timeStr) {
  if (!timeStr) return 0;
  const [h, m] = timeStr.substring(0, 5).split(':').map(Number);
  return h * 60 + m;
}

function fromMin(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function parseDate(str) {
  if (!str) return null;
  const s = str.includes('T') ? str : str + 'T00:00:00';
  const d = new Date(s);
  return isNaN(d) ? null : d;
}

function addDays(dateStr, n) {
  const d = parseDate(dateStr);
  if (!d) return null;
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

const JS_DAY_TO_NAME = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * Validate a proposed slot and return { valid, reason } or { valid: true }.
 *
 * @param {object} params
 * @param {string} params.newDate       - "YYYY-MM-DD"
 * @param {string} params.newStart      - "HH:MM"
 * @param {string} params.newEnd        - "HH:MM"
 * @param {object} params.task          - the task being moved (has .id, .deadline, .not_before_date, etc.)
 * @param {object[]} params.allTasks    - all tasks in the plan (to check other task overlaps)
 * @param {object}  params.busyMap      - expanded busy map { "YYYY-MM-DD": [{start, end, name}] }
 * @param {object}  params.prefs        - study preferences { schedule, max_hours, preferred_start, preferred_end, break_duration }
 * @param {string}  params.planStart    - "YYYY-MM-DD"
 * @param {string}  params.planEnd      - "YYYY-MM-DD"
 * @param {string|null} params.latestAllowedDate - pre-computed latest allowed date (optional)
 * @param {string[]} params.blockedDates - dates that are fully unavailable (no study allowed at all)
 */
export function validateSlot({ newDate, newStart, newEnd, task, allTasks, busyMap, prefs, planStart, planEnd, latestAllowedDate, blockedDates }) {
  const newStartMin = toMin(newStart);
  const newEndMin = toMin(newEnd);
  const dayName = JS_DAY_TO_NAME[parseDate(newDate)?.getDay()];
  const schedule = prefs?.schedule || {};
  const dayPrefs = schedule[dayName] || {};
  const maxHoursPerDay = (prefs?.max_hours || 6) * 60; // minutes

  // 0. Blocked date (hard block — no study at all on this date)
  if (blockedDates && blockedDates.includes(newDate)) {
    return { valid: false, reason: `This date (${newDate}) is blocked — the student said they cannot study on this day.` };
  }

  // 1. Outside study period
  if (planStart && newDate < planStart) return { valid: false, reason: `This date is before your study period starts (${planStart}).` };
  if (planEnd && newDate > planEnd) return { valid: false, reason: `This date is after your study period ends (${planEnd}).` };

  // 2. No-study day
  if (dayPrefs.noStudy) return { valid: false, reason: `${dayName} is marked as a No Study Day.` };

  // 3. Preferred window
  const winStart = toMin(dayPrefs.start || prefs?.preferred_start || '07:00');
  const winEnd = toMin(dayPrefs.end || prefs?.preferred_end || '21:00');
  if (newStartMin < winStart) return { valid: false, reason: `This time is before your preferred study start (${fromMin(winStart)}).` };
  if (newEndMin > winEnd) return { valid: false, reason: `This time exceeds your preferred study end (${fromMin(winEnd)}).` };

  // 4. Task date constraints
  if (task.not_before_date && newDate < task.not_before_date)
    return { valid: false, reason: `This task cannot be scheduled before ${task.not_before_date}.` };
  const deadline = latestAllowedDate || task.deadline || task.exam_date || null;
  if (deadline && newDate > deadline)
    return { valid: false, reason: `This task must be completed before ${deadline}.` };

  // 5. Overlap with fixed calendar events
  const dayBusy = busyMap[newDate] || [];
  for (const ev of dayBusy) {
    if (newStartMin < ev.end && newEndMin > ev.start) {
      return { valid: false, reason: `This time overlaps with "${ev.name}" (${fromMin(ev.start)}–${fromMin(ev.end)}).` };
    }
  }

  // 6. Overlap with other study tasks (same day, exclude self)
  const sameDayTasks = (allTasks || []).filter(t =>
    t.id !== task.id &&
    t.scheduled_date === newDate &&
    t.scheduled_start &&
    t.scheduled_end
  );
  for (const other of sameDayTasks) {
    const os = toMin(other.scheduled_start);
    const oe = toMin(other.scheduled_end);
    if (newStartMin < oe && newEndMin > os) {
      return {
        valid: false,
        reason: `This time overlaps with another study task: "${other.title || other.course_name}" (${other.scheduled_start}–${other.scheduled_end}).`
      };
    }
  }

  // 7. Daily max hours
  const existingMinutes = sameDayTasks.reduce((sum, t) => sum + (toMin(t.scheduled_end) - toMin(t.scheduled_start)), 0);
  const newDuration = newEndMin - newStartMin;
  if (existingMinutes + newDuration > maxHoursPerDay) {
    return { valid: false, reason: `Adding this task would exceed your daily maximum of ${prefs?.max_hours || 6}h of study.` };
  }

  return { valid: true };
}

/**
 * Find up to `limit` free slots for a task near the proposed date.
 * Searches forward and backward from the proposed date.
 *
 * @returns {Array<{date, start, end, label}>}
 */
export function findAlternativeSlots({ newDate, duration, task, allTasks, busyMap, prefs, planStart, planEnd, latestAllowedDate, blockedDates, limit = 5 }) {
  const schedule = prefs?.schedule || {};
  const maxHoursPerDay = (prefs?.max_hours || 6) * 60;
  const slots = [];
  const blockedSet = new Set(blockedDates || []);

  // Search window: ±14 days from newDate, clamped to plan period and deadline
  const searchStart = planStart && newDate < planStart ? planStart : (addDays(newDate, -14) || newDate);
  const effectiveStart = planStart && searchStart < planStart ? planStart : searchStart;
  const deadline = latestAllowedDate || task.deadline || task.exam_date || planEnd;
  const effectiveEnd = deadline && planEnd ? (deadline < planEnd ? deadline : planEnd) : (planEnd || deadline || addDays(newDate, 14));

  // Build candidate dates sorted by proximity to newDate
  const candidates = [];
  let cur = parseDate(effectiveStart);
  const end = parseDate(effectiveEnd);
  if (!cur || !end) return [];
  while (cur <= end) {
    candidates.push(cur.toISOString().slice(0, 10));
    cur.setDate(cur.getDate() + 1);
  }
  candidates.sort((a, b) => {
    const da = Math.abs(parseDate(a) - parseDate(newDate));
    const db = Math.abs(parseDate(b) - parseDate(newDate));
    return da - db;
  });

  for (const dateStr of candidates) {
    if (slots.length >= limit) break;
    // Hard-blocked dates: never return a slot on these dates
    if (blockedSet.has(dateStr)) continue;
    const dayName = JS_DAY_TO_NAME[parseDate(dateStr)?.getDay()];
    const dayPrefs = schedule[dayName] || {};
    if (dayPrefs.noStudy) continue;

    const winStart = toMin(dayPrefs.start || prefs?.preferred_start || '07:00');
    const winEnd = toMin(dayPrefs.end || prefs?.preferred_end || '21:00');
    if (task.not_before_date && dateStr < task.not_before_date) continue;

    const dayBusy = (busyMap[dateStr] || []).sort((a, b) => a.start - b.start);
    const sameDayOtherTasks = (allTasks || [])
      .filter(t => t.id !== task.id && t.scheduled_date === dateStr && t.scheduled_start && t.scheduled_end)
      .map(t => ({ start: toMin(t.scheduled_start), end: toMin(t.scheduled_end) }))
      .sort((a, b) => a.start - b.start);

    const existingMinutes = sameDayOtherTasks.reduce((s, t) => s + (t.end - t.start), 0);
    if (existingMinutes + duration > maxHoursPerDay) continue;

    // Merge busy blocks
    const allBusy = [...dayBusy.map(e => ({ start: e.start, end: e.end })), ...sameDayOtherTasks].sort((a, b) => a.start - b.start);

    // Find free gaps
    let cursor = winStart;
    for (const block of allBusy) {
      if (block.start > cursor && cursor + duration <= block.start && cursor + duration <= winEnd) {
        slots.push({ date: dateStr, start: fromMin(cursor), end: fromMin(cursor + duration) });
        break;
      }
      cursor = Math.max(cursor, block.end);
    }
    if (slots.length < limit && cursor + duration <= winEnd) {
      // Check this slot isn't already added for this date
      if (!slots.some(s => s.date === dateStr)) {
        slots.push({ date: dateStr, start: fromMin(cursor), end: fromMin(cursor + duration) });
      }
    }
  }

  return slots.slice(0, limit);
}