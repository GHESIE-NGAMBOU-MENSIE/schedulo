import React, { useState, useEffect } from 'react';
import { ChevronDown, ChevronUp, Edit2, Check, X } from 'lucide-react';
import { Input } from '@/components/ui/input';

const CATEGORY_META = {
  attendance:  { label: 'Course attendance / lectures',  color: 'bg-violet-500' },
  material:    { label: 'Work through course material',  color: 'bg-blue-500'   },
  exercises:   { label: 'Exercises / practice',          color: 'bg-cyan-500'   },
  assignments: { label: 'Assignments / submissions',     color: 'bg-amber-500'  },
  quizzes:     { label: 'Quizzes / tests',               color: 'bg-orange-500' },
  exam_prep:   { label: 'Exam preparation',              color: 'bg-red-500'    },
  project:     { label: 'Project / lab work',            color: 'bg-emerald-500'},
  revision:    { label: 'Revision / buffer',             color: 'bg-purple-500' },
};

/**
 * Determine which categories are relevant for a course.
 * Returns an ordered list of category keys.
 */
function getRelevantCategories(course) {
  const types = (course.course_type || []).map(t => t.toLowerCase());
  const name = (course.name || '').toLowerCase();
  const isProject = types.some(t => /project|thesis|seminar|capstone|bachelor|master|slr|dsr/.test(t))
    || /thesis|projekt|bachelor|master|seminar/.test(name);
  const hasLecture = !isProject && types.some(t => /lecture|vorlesung|class|kurs/.test(t)) || !isProject;
  const hasExercise = types.some(t => /exercise|übung|tutorium|tutorial|lab|praktikum/.test(t))
    || (course.materials_text || '').toLowerCase().includes('exercise')
    || (course.description || '').toLowerCase().includes('exercise');
  const hasAssignment = (course.materials_text || '').toLowerCase().includes('assignment')
    || (course.description || '').toLowerCase().includes('assignment')
    || types.some(t => /assignment/.test(t));
  const hasQuiz = (course.materials_text || '').toLowerCase().includes('quiz')
    || (course.description || '').toLowerCase().includes('quiz')
    || types.some(t => /quiz|test/.test(t));
  const hasExam = course.exam_type !== 'none' && course.exam_type !== undefined;

  const cats = [];
  if (hasLecture) cats.push('attendance');
  cats.push('material');
  if (hasExercise || isProject) cats.push('exercises');
  if (isProject) cats.push('project');
  if (hasAssignment) cats.push('assignments');
  if (hasQuiz) cats.push('quizzes');
  if (hasExam && !isProject) cats.push('exam_prep');
  cats.push('revision');
  return cats;
}

/**
 * Default ratio weights per category (unnormalized — will be normalized to sum to 1).
 */
const CATEGORY_WEIGHTS = {
  attendance:  2,
  material:    5,
  exercises:   3,
  assignments: 2,
  quizzes:     1,
  exam_prep:   4,
  project:     6,
  revision:    2,
};

/**
 * Compute breakdown based on:
 * - CP-based total (cp × 30)
 * - Calendar attendance hours (pinned, subtracted from budget first)
 * - Only relevant categories for this course
 */
function computeBreakdown(course, calendarHours) {
  const cp = course.credit_points || 5;
  const totalHours = cp * 30;
  const attendanceHours = Math.min(calendarHours || 0, totalHours * 0.4); // cap at 40%

  const cats = getRelevantCategories(course);
  const nonAttendanceCats = cats.filter(k => k !== 'attendance');
  const remaining = Math.max(0, totalHours - attendanceHours);

  // Compute weights for non-attendance categories
  const totalWeight = nonAttendanceCats.reduce((s, k) => s + (CATEGORY_WEIGHTS[k] || 1), 0);

  const breakdown = {};
  if (cats.includes('attendance')) {
    breakdown.attendance = Math.round(attendanceHours);
  }

  let allocated = breakdown.attendance || 0;
  nonAttendanceCats.forEach((key, i) => {
    if (i === nonAttendanceCats.length - 1) {
      breakdown[key] = Math.max(0, totalHours - allocated);
    } else {
      const h = Math.round(((CATEGORY_WEIGHTS[key] || 1) / totalWeight) * remaining);
      breakdown[key] = h;
      allocated += h;
    }
  });

  return { breakdown, totalHours, categories: cats };
}

export default function WorkloadBreakdown({ course, calendarHours = 0, onBreakdownChange }) {
  const cp = course.credit_points || 5;
  const totalHours = cp * 30;

  const [state, setState] = useState(() => computeBreakdown(course, calendarHours));
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({});
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const next = computeBreakdown(course, calendarHours);
    setState(next);
    onBreakdownChange?.(next.breakdown);
  }, [course.id, calendarHours]);

  const { breakdown, categories } = state;

  const startEdit = () => {
    setDraft({ ...breakdown });
    setEditing(true);
  };

  const saveEdit = () => {
    const draftSum = Object.values(draft).reduce((s, v) => s + (Number(v) || 0), 0);
    if (draftSum === 0) return;
    const keys = Object.keys(draft);
    const normalised = {};
    let acc = 0;
    keys.forEach((k, i) => {
      if (i === keys.length - 1) {
        normalised[k] = Math.max(0, totalHours - acc);
      } else {
        normalised[k] = Math.round(((Number(draft[k]) || 0) / draftSum) * totalHours);
        acc += normalised[k];
      }
    });
    setState(p => ({ ...p, breakdown: normalised }));
    onBreakdownChange?.(normalised);
    setEditing(false);
  };

  const usedHours = Object.values(breakdown).reduce((s, v) => s + v, 0);

  return (
    <div className="bg-white rounded-xl border border-blue-100 shadow-sm mb-4 overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setCollapsed(p => !p)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-blue-50/40 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-sm">
            {cp}
          </div>
          <div className="text-left">
            <p className="font-semibold text-gray-900 text-sm">{course.name}</p>
            <p className="text-xs text-gray-500">
              {cp} CP · Expected workload:{' '}
              <span className="font-semibold text-blue-700">{totalHours}h</span>
              {calendarHours > 0 && (
                <span className="text-violet-600 ml-1">({Math.round(calendarHours)}h from calendar)</span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!editing && (
            <button
              onClick={e => { e.stopPropagation(); startEdit(); }}
              className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
              title="Adjust hours"
            >
              <Edit2 className="w-3.5 h-3.5 text-gray-400" />
            </button>
          )}
          {collapsed ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronUp className="w-4 h-4 text-gray-400" />}
        </div>
      </button>

      {!collapsed && (
        <div className="px-5 pb-5">
          {/* Stacked progress bar */}
          <div className="flex h-3 rounded-full overflow-hidden mb-4 gap-px bg-gray-100">
            {categories.map(key => {
              const hours = breakdown[key] || 0;
              const pct = totalHours > 0 ? (hours / totalHours) * 100 : 0;
              if (pct < 0.5) return null;
              return (
                <div
                  key={key}
                  className={`${CATEGORY_META[key].color} transition-all`}
                  style={{ width: `${pct}%` }}
                  title={`${CATEGORY_META[key].label}: ${hours}h`}
                />
              );
            })}
          </div>

          {/* Category rows */}
          <div className="space-y-2">
            {categories.map(key => {
              const hours = breakdown[key] || 0;
              const pct = totalHours > 0 ? Math.round((hours / totalHours) * 100) : 0;
              const meta = CATEGORY_META[key];
              return (
                <div key={key} className="flex items-center gap-3">
                  <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${meta.color}`} />
                  <span className="flex-1 text-sm text-gray-700">{meta.label}</span>
                  {editing ? (
                    <Input
                      type="number" min={0} max={totalHours}
                      value={draft[key] ?? hours}
                      onChange={e => setDraft(p => ({ ...p, [key]: Number(e.target.value) || 0 }))}
                      className="w-20 h-7 text-sm text-right"
                    />
                  ) : (
                    <span className="font-semibold text-gray-800 text-sm w-10 text-right">{hours}h</span>
                  )}
                  <span className="text-xs text-gray-400 w-9 text-right">{pct}%</span>
                </div>
              );
            })}
          </div>

          {/* Total check */}
          <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
            <span>Total: <strong className={usedHours === totalHours ? 'text-emerald-600' : 'text-amber-600'}>{usedHours}h</strong> / {totalHours}h</span>
            {calendarHours > 0 && (
              <span className="text-violet-600">
                {Math.round(calendarHours)}h already covered by calendar events
              </span>
            )}
          </div>

          {/* Edit controls */}
          {editing && (
            <div className="mt-3 pt-3 border-t border-gray-100">
              {(() => {
                const draftSum = Object.values(draft).reduce((s, v) => s + (Number(v) || 0), 0);
                const diff = draftSum - totalHours;
                return (
                  <p className={`text-xs mb-2 ${Math.abs(diff) > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                    {Math.abs(diff) > 0
                      ? `Total: ${draftSum}h — ${diff > 0 ? `${diff}h over` : `${-diff}h under`} budget (${totalHours}h). Will be rescaled on save.`
                      : `Total: ${draftSum}h ✓`}
                  </p>
                );
              })()}
              <div className="flex gap-2">
                <button onClick={saveEdit} className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700">
                  <Check className="w-3.5 h-3.5" /> Save
                </button>
                <button onClick={() => setEditing(false)} className="flex items-center gap-1 px-3 py-1.5 bg-gray-100 text-gray-600 text-xs rounded-lg hover:bg-gray-200">
                  <X className="w-3.5 h-3.5" /> Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}