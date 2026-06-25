// Fixed planning reference date for Summer Semester 2026
// All planning logic, scheduling, and date calculations use this as "today"
export const PLANNING_REFERENCE_DATE = new Date('2026-04-01');

export const PLANNING_REFERENCE_DATE_STR = '2026-04-01';

/**
 * Returns the planning reference date string (YYYY-MM-DD)
 * Use this instead of new Date() / Date.now() / today anywhere in planning logic
 */
export function getPlanningToday() {
  return PLANNING_REFERENCE_DATE;
}

export function getPlanningTodayStr() {
  return PLANNING_REFERENCE_DATE_STR;
}