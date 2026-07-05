import React, { useState, useEffect } from 'react';
import { ChevronDown, ChevronUp, Edit2, Check, X } from 'lucide-react';
import { Input } from '@/components/ui/input';

/**
 * Map from course_structure keys → workload category definitions.
 * "fixed" = comes from calendar (attendance time); hours shown but flagged.
 */
const STRUCTURE_TO_CATEGORY = {
  lectures: { label: 'Lectures (attendance)', color: 'bg-violet-500', fixed: true, weight: 0 },
  exercises: { label: 'Exercises (attendance)', color: 'bg-cyan-500', fixed: true, weight: 0 },
  lab_work: { label: 'Lab work (attendance)', color: 'bg-teal-500', fixed: true, weight: 0 },
  supervision_meetings: { label: 'Supervision meetings', color: 'bg-indigo-400', fixed: true, weight: 0 },
  assignments: { label: 'Assignments / submissions', color: 'bg-amber-500', fixed: false, weight: 3 },
  quizzes: { label: 'Quiz preparation', color: 'bg-orange-500', fixed: false, weight: 2 },
  testate: { label: 'Testat preparation', color: 'bg-orange-600', fixed: false, weight: 2 },
  seminar_presentation: { label: 'Seminar / presentation prep', color: 'bg-pink-500', fixed: false, weight: 4 },
  paper_essay: { label: 'Paper / essay writing', color: 'bg-rose-500', fixed: false, weight: 5 },
  project_work: { label: 'Project planning & execution', color: 'bg-emerald-500', fixed: false, weight: 6 },
  implementation: { label: 'Implementation / development', color: 'bg-green-600', fixed: false, weight: 5 },
  thesis_writing: { label: 'Thesis writing', color: 'bg-blue-600', fixed: false, weight: 8 },
  literature_work: { label: 'Literature review / research', color: 'bg-blue-400', fixed: false, weight: 6 },
  final_exam: { label: 'Exam preparation', color: 'bg-red-500', fixed: false, weight: 4 },
  oral_exam: { label: 'Oral exam preparation', color: 'bg-red-400', fixed: false, weight: 3 },
  revision_buffer: { label: 'Revision / buffer', color: 'bg-gray-400', fixed: false, weight: 1 }
};

// For courses with no structure, fall back to a generic set
const FALLBACK_STRUCTURE = ['lectures', 'final_exam', 'revision_buffer'];

// Material self-study is always added for non-thesis/non-project courses
const MATERIAL_STUDY_CATEGORY = {
  key: '__material',
  label: 'Work through course material',
  color: 'bg-blue-500',
  fixed: false,
  weight: 5
};

/**
 * Compute workload breakdown from:
 * - course.course_structure (student-confirmed elements)
 * - calendarHours: hours already covered by fixed calendar events
 * - cp * 30 = total budget
 */
function computeBreakdown(course, calendarHours) {
  const cp = course.credit_points || 5;
  const totalHours = cp * 30;

  const structure = course.course_structure && course.course_structure.length > 0 ?
  course.course_structure :
  FALLBACK_STRUCTURE;

  const isThesis = structure.some((k) => ['thesis_writing', 'literature_work'].includes(k)) ||
  (course.course_type || []).some((t) => /thesis|bachelor|master/.test(t));
  const isProject = !isThesis && structure.includes('project_work');

  // Fixed categories (from calendar) — pin their hours
  const fixedKeys = structure.filter((k) => STRUCTURE_TO_CATEGORY[k]?.fixed);
  const fixedHours = Math.min(calendarHours || 0, totalHours * 0.5);

  // Self-study categories
  const selfStudyKeys = structure.filter((k) => !STRUCTURE_TO_CATEGORY[k]?.fixed);

  // Add material study for lecture-style courses (not thesis, not pure project)
  const hasMaterialStudy = !isThesis && structure.includes('lectures');

  // Build ordered category list
  const categories = [];

  // Fixed first
  if (fixedKeys.length > 0 && fixedHours > 0) {
    // Distribute fixed hours proportionally (use 1 slot if only lectures detected)
    fixedKeys.forEach((key, i) => {
      categories.push({ key, fixed: true });
    });
  }

  // Material study (lecture courses)
  if (hasMaterialStudy) categories.push({ key: '__material', fixed: false });

  // Self-study from structure
  selfStudyKeys.forEach((key) => {
    if (key !== 'revision_buffer') categories.push({ key, fixed: false });
  });

  // Always add revision_buffer last if in structure
  if (structure.includes('revision_buffer')) categories.push({ key: 'revision_buffer', fixed: false });

  // Compute hours
  const remaining = Math.max(0, totalHours - fixedHours);

  // Distribute fixed hours across fixed categories equally
  const fixedCategoryHours = {};
  const fixedCount = categories.filter((c) => c.fixed).length;
  categories.filter((c) => c.fixed).forEach((c) => {
    fixedCategoryHours[c.key] = fixedCount > 0 ? Math.round(fixedHours / fixedCount) : 0;
  });

  // Get weights for self-study categories
  const selfStudyCats = categories.filter((c) => !c.fixed);
  const weights = selfStudyCats.map((c) => {
    if (c.key === '__material') return MATERIAL_STUDY_CATEGORY.weight;
    return STRUCTURE_TO_CATEGORY[c.key]?.weight || 2;
  });
  const totalWeight = weights.reduce((s, w) => s + w, 0);

  const breakdown = {};
  let allocated = 0;
  selfStudyCats.forEach((cat, i) => {
    if (i === selfStudyCats.length - 1) {
      breakdown[cat.key] = Math.max(0, remaining - allocated);
    } else {
      const h = Math.round(weights[i] / totalWeight * remaining);
      breakdown[cat.key] = h;
      allocated += h;
    }
  });

  // Add fixed
  categories.filter((c) => c.fixed).forEach((c) => {
    breakdown[c.key] = fixedCategoryHours[c.key] || 0;
  });

  const finalCategories = categories.map((c) => c.key);
  return { breakdown, totalHours, categories: finalCategories, fixedKeys };
}

function getCategoryMeta(key) {
  if (key === '__material') return MATERIAL_STUDY_CATEGORY;
  return STRUCTURE_TO_CATEGORY[key] || { label: key, color: 'bg-gray-400', fixed: false };
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
  }, [course.id, course.course_structure?.join(','), calendarHours]);

  const { breakdown, categories, fixedKeys } = state;
  const usedHours = Object.values(breakdown).reduce((s, v) => s + v, 0);
  const selfStudyTotal = Object.entries(breakdown).
  filter(([k]) => !fixedKeys.includes(k)).
  reduce((s, [, v]) => s + v, 0);

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
        normalised[k] = Math.round((Number(draft[k]) || 0) / draftSum * totalHours);
        acc += normalised[k];
      }
    });
    setState((p) => ({ ...p, breakdown: normalised }));
    onBreakdownChange?.(normalised);
    setEditing(false);
  };

  return (
    <div className="bg-blue-50/50 rounded-xl border border-blue-100 overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setCollapsed((p) => !p)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-blue-100/40 transition-colors">
        
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-sm">
            {cp}
          </div>
          <div className="text-left">
            <p className="text-xs text-gray-500">
              {cp} CP · <span className="font-semibold text-blue-700">{totalHours}h total</span>
              {calendarHours > 0 &&
              <span className="text-violet-600 ml-1">· {Math.round(calendarHours)}h from calendar</span>
              }
              <span className="text-gray-400 ml-1">· {Math.round(selfStudyTotal)}h self-study tasks</span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!editing && !collapsed &&
          <button
            onClick={(e) => {e.stopPropagation();startEdit();}}
            className="p-1.5 hover:bg-white rounded-lg transition-colors"
            title="Adjust hours">
            
              <Edit2 className="w-3.5 h-3.5 text-gray-400" />
            </button>
          }
          {collapsed ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronUp className="w-4 h-4 text-gray-400" />}
        </div>
      </button>

      {!collapsed &&
      <div className="px-5 pb-5">
          {/* Stacked bar */}
          <div className="flex h-2.5 rounded-full overflow-hidden mb-3 gap-px bg-gray-200">
            {categories.map((key) => {
            const hours = breakdown[key] || 0;
            const pct = totalHours > 0 ? hours / totalHours * 100 : 0;
            if (pct < 0.5) return null;
            const meta = getCategoryMeta(key);
            return (
              <div key={key} className={`${meta.color} transition-all`} style={{ width: `${pct}%` }}
              title={`${meta.label}: ${hours}h`} />);

          })}
          </div>

          {/* Category rows */}
          <div className="space-y-1.5">
            {categories.map((key) => {
            const hours = breakdown[key] || 0;
            const pct = totalHours > 0 ? Math.round(hours / totalHours * 100) : 0;
            const meta = getCategoryMeta(key);
            const isFixed = fixedKeys.includes(key);
            return (
              <div key={key} className="flex items-center gap-2.5">
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${meta.color}`} />
                  <span className="flex-1 text-xs text-gray-700">{meta.label}</span>
                  
                  {editing && !isFixed ?
                <Input type="number" min={0} max={totalHours}
                value={draft[key] ?? hours}
                onChange={(e) => setDraft((p) => ({ ...p, [key]: Number(e.target.value) || 0 }))}
                className="w-16 h-6 text-xs text-right" /> :

                <span className="font-semibold text-gray-700 text-xs w-8 text-right">{hours}h</span>
                }
                  <span className="text-xs text-gray-400 w-8 text-right">{pct}%</span>
                </div>);

          })}
          </div>

          {/* Total */}
          <div className="mt-2 pt-2 border-t border-blue-100 flex items-center justify-between text-xs text-gray-400">
            <span>Total: <strong className={Math.abs(usedHours - totalHours) <= 1 ? 'text-emerald-600' : 'text-amber-600'}>{usedHours}h</strong> / {totalHours}h</span>
            {calendarHours > 0 &&
          <span className="text-violet-500">{Math.round(calendarHours)}h covered by calendar</span>
          }
          </div>

          {editing &&
        <div className="mt-2 pt-2 border-t border-blue-100">
              {(() => {
            const draftSum = Object.values(draft).reduce((s, v) => s + (Number(v) || 0), 0);
            const diff = draftSum - totalHours;
            return (
              <p className={`text-xs mb-2 ${Math.abs(diff) > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                    {Math.abs(diff) > 0 ?
                `${draftSum}h total — ${diff > 0 ? `${diff}h over` : `${-diff}h under`} budget. Will be rescaled on save.` :
                `${draftSum}h ✓`}
                  </p>);

          })()}
              <div className="flex gap-2">
                <button onClick={saveEdit} className="flex items-center gap-1 px-2.5 py-1 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700">
                  <Check className="w-3 h-3" /> Save
                </button>
                <button onClick={() => setEditing(false)} className="flex items-center gap-1 px-2.5 py-1 bg-gray-100 text-gray-600 text-xs rounded-lg hover:bg-gray-200">
                  <X className="w-3 h-3" /> Cancel
                </button>
              </div>
            </div>
        }
        </div>
      }
    </div>);

}