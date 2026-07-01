import React, { useState, useEffect } from 'react';
import { ChevronDown, ChevronUp, Edit2, Check, X } from 'lucide-react';
import { Input } from '@/components/ui/input';

// Default distribution ratios per category (must sum to 1.0)
const DEFAULT_RATIOS = {
  attendance:   0.10,
  material:     0.25,
  exercises:    0.20,
  assignments:  0.15,
  exam_prep:    0.20,
  revision:     0.10,
};

const CATEGORY_META = {
  attendance:  { label: 'Course attendance / lectures',   color: 'bg-violet-500' },
  material:    { label: 'Work through course material',   color: 'bg-blue-500'   },
  exercises:   { label: 'Exercises / practice',           color: 'bg-cyan-500'   },
  assignments: { label: 'Assignments / submissions',      color: 'bg-amber-500'  },
  exam_prep:   { label: 'Exam preparation',               color: 'bg-red-500'    },
  revision:    { label: 'Revision / buffer',              color: 'bg-emerald-500'},
};

// Derive initial breakdown from course data and calendar attendance hours
function computeBreakdown(course, calendarHours) {
  const cp = course.credit_points || 5;
  const totalHours = cp * 30;

  // If the course has calendar attendance hours, pin that category
  const attendanceHours = calendarHours || 0;
  const remaining = totalHours - attendanceHours;

  // Distribute remaining proportionally across non-attendance categories
  const nonAttendanceKeys = Object.keys(DEFAULT_RATIOS).filter(k => k !== 'attendance');
  const nonAttendanceSum = nonAttendanceKeys.reduce((s, k) => s + DEFAULT_RATIOS[k], 0);

  const breakdown = {};
  breakdown.attendance = Math.round(attendanceHours);
  let allocated = breakdown.attendance;
  nonAttendanceKeys.forEach((key, i) => {
    if (i === nonAttendanceKeys.length - 1) {
      breakdown[key] = totalHours - allocated; // last category absorbs rounding
    } else {
      const h = Math.round((DEFAULT_RATIOS[key] / nonAttendanceSum) * remaining);
      breakdown[key] = h;
      allocated += h;
    }
  });
  return { breakdown, totalHours };
}

export default function WorkloadBreakdown({ course, calendarHours = 0, onBreakdownChange }) {
  const cp = course.credit_points || 5;
  const totalHours = cp * 30;

  const [breakdown, setBreakdown] = useState(() => computeBreakdown(course, calendarHours).breakdown);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({});
  const [collapsed, setCollapsed] = useState(false);

  // When course changes (tab switch), recompute
  useEffect(() => {
    const next = computeBreakdown(course, calendarHours).breakdown;
    setBreakdown(next);
    onBreakdownChange?.(next);
  }, [course.id]);

  const usedHours = Object.values(breakdown).reduce((s, v) => s + v, 0);
  const delta = totalHours - usedHours; // positive = under-allocated

  const startEdit = () => {
    setDraft({ ...breakdown });
    setEditing(true);
  };

  const saveEdit = () => {
    // Normalise so they always sum to totalHours
    const draftSum = Object.values(draft).reduce((s, v) => s + (Number(v) || 0), 0);
    const normalised = {};
    const keys = Object.keys(draft);
    let acc = 0;
    keys.forEach((k, i) => {
      if (i === keys.length - 1) {
        normalised[k] = totalHours - acc;
      } else {
        normalised[k] = Math.round(((Number(draft[k]) || 0) / draftSum) * totalHours);
        acc += normalised[k];
      }
    });
    setBreakdown(normalised);
    onBreakdownChange?.(normalised);
    setEditing(false);
  };

  const cancelEdit = () => setEditing(false);

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
            <p className="text-xs text-gray-500">{cp} CP · Expected workload: <span className="font-semibold text-blue-700">{totalHours}h</span></p>
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

      {/* Body */}
      {!collapsed && (
        <div className="px-5 pb-5">
          {/* Stacked progress bar */}
          <div className="flex h-3 rounded-full overflow-hidden mb-4 gap-px">
            {Object.entries(breakdown).map(([key, hours]) => {
              const pct = totalHours > 0 ? (hours / totalHours) * 100 : 0;
              if (pct === 0) return null;
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

          {/* Legend / editable rows */}
          <div className="space-y-2">
            {Object.entries(breakdown).map(([key, hours]) => {
              const pct = totalHours > 0 ? Math.round((hours / totalHours) * 100) : 0;
              const meta = CATEGORY_META[key];
              return (
                <div key={key} className="flex items-center gap-3">
                  <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${meta.color}`} />
                  <span className="flex-1 text-sm text-gray-700">{meta.label}</span>
                  {editing ? (
                    <Input
                      type="number"
                      min={0}
                      max={totalHours}
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

          {/* Edit controls */}
          {editing && (
            <div className="mt-3 pt-3 border-t border-gray-100">
              {(() => {
                const draftSum = Object.values(draft).reduce((s, v) => s + (Number(v) || 0), 0);
                const diff = draftSum - totalHours;
                return (
                  <p className={`text-xs mb-2 ${Math.abs(diff) > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                    {Math.abs(diff) > 0
                      ? `Total: ${draftSum}h — ${diff > 0 ? `${diff}h over` : `${-diff}h under`} budget (${totalHours}h). Hours will be rescaled on save.`
                      : `Total: ${draftSum}h ✓`}
                  </p>
                );
              })()}
              <div className="flex gap-2">
                <button onClick={saveEdit} className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700 transition-colors">
                  <Check className="w-3.5 h-3.5" /> Save
                </button>
                <button onClick={cancelEdit} className="flex items-center gap-1 px-3 py-1.5 bg-gray-100 text-gray-600 text-xs rounded-lg hover:bg-gray-200 transition-colors">
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