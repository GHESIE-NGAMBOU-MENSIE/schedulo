import React, { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { MessageCircle, ArrowLeft, Send, Bot, Loader2, CheckCircle, XCircle, Edit2, ChevronLeft, ChevronRight, Calendar, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import PhaseIndicator from '@/components/schedulo/PhaseIndicator';
import StepHeader from '@/components/schedulo/StepHeader';
import ReactMarkdown from 'react-markdown';
import { motion } from 'framer-motion';
import { buildBusyMapPublic, getLocalDateStr } from '@/lib/schedulerEngine';
import { t } from '@/lib/i18n';
import { validateSlot, findAlternativeSlots } from '@/lib/slotValidator';
import { PLANNING_REFERENCE_DATE } from '@/lib/planningDate';

const HOUR_PX = 52;
const DEFAULT_CAL_START = 7;
const DEFAULT_CAL_END = 21;
const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// ── MiniCalendar ────────────────────────────────────────────────────────────
function MiniCalendar({ tasks, courses, expandedBusyMap, showBlockedTimes, weekOffset, setWeekOffset, pendingChanges }) {
  const getWeekDates = () => {
    const now = new Date(PLANNING_REFERENCE_DATE);
    now.setDate(now.getDate() + weekOffset * 7);
    const monday = new Date(now);
    monday.setDate(now.getDate() - (now.getDay() + 6) % 7);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return d;
    });
  };

  const weekDates = getWeekDates();

  // Dynamically compute calendar hours from this week's tasks/events
  const computeCalHours = () => {
    const times = weekDates.flatMap((d) => {
      const ds = getLocalDateStr(d);
      const taskTimes = tasks.filter((t) => t.scheduled_date === ds).
      flatMap((t) => [t.scheduled_start, t.scheduled_end].filter(Boolean));
      const evTimes = (expandedBusyMap[ds] || []).flatMap((e) => [e.start_time, e.end_time].filter(Boolean));
      return [...taskTimes, ...evTimes];
    });
    if (times.length === 0) return { CAL_START_HOUR: DEFAULT_CAL_START, CAL_END_HOUR: DEFAULT_CAL_END };
    const toH = (t) => parseInt(t.substring(0, 2), 10);
    return {
      CAL_START_HOUR: Math.max(0, Math.min(...times.map(toH)) - 1),
      CAL_END_HOUR: Math.min(24, Math.max(...times.map(toH)) + 2)
    };
  };

  const { CAL_START_HOUR, CAL_END_HOUR } = computeCalHours();

  const toTopPx = (t) => {
    if (!t) return 0;
    const [h, m] = t.substring(0, 5).split(':').map(Number);
    return (h - CAL_START_HOUR + m / 60) * HOUR_PX;
  };
  const toDurPx = (s, e) => {
    if (!s || !e) return HOUR_PX;
    const [sh, sm] = s.substring(0, 5).split(':').map(Number);
    const [eh, em] = e.substring(0, 5).split(':').map(Number);
    return Math.max((eh * 60 + em - (sh * 60 + sm)) / 60 * HOUR_PX, 18);
  };

  // Per-course color palette (Tailwind literal classes — must be literal for purge)
  const COURSE_COLOR_PALETTE = [
    { bg: 'bg-blue-100', border: 'border-blue-400', text: 'text-blue-900' },
    { bg: 'bg-violet-100', border: 'border-violet-400', text: 'text-violet-900' },
    { bg: 'bg-emerald-100', border: 'border-emerald-400', text: 'text-emerald-900' },
    { bg: 'bg-amber-100', border: 'border-amber-400', text: 'text-amber-900' },
    { bg: 'bg-rose-100', border: 'border-rose-400', text: 'text-rose-900' },
    { bg: 'bg-cyan-100', border: 'border-cyan-400', text: 'text-cyan-900' },
    { bg: 'bg-orange-100', border: 'border-orange-400', text: 'text-orange-900' },
    { bg: 'bg-pink-100', border: 'border-pink-400', text: 'text-pink-900' },
    { bg: 'bg-teal-100', border: 'border-teal-400', text: 'text-teal-900' },
    { bg: 'bg-indigo-100', border: 'border-indigo-400', text: 'text-indigo-900' }
  ];

  const courseColorMap = (courses || []).reduce((acc, c, i) => {
    const color = COURSE_COLOR_PALETTE[i % COURSE_COLOR_PALETTE.length];
    acc[c.id] = color;
    acc[c.name] = color;
    return acc;
  }, {});

  const getTaskColor = (task) =>
    courseColorMap[task.course_id] || courseColorMap[task.course_name] || COURSE_COLOR_PALETTE[0];

  // Merge pending changes preview into tasks (shown at NEW position)
  const previewTasks = tasks.map((t) => {
    const change = pendingChanges?.updates?.find((u) => u.task_id === t.id);
    if (change) return { ...t, ...change, _isPending: true };
    if (pendingChanges?.removals?.includes(t.id)) return { ...t, _isRemoved: true };
    return t;
  });

  // Ghost tasks: show OLD positions of moved tasks (faded, so the user sees what moved)
  const ghostTasks = (pendingChanges?.updates || []).
  map((u) => {
    const task = tasks.find((t) => t.id === u.task_id);
    if (!task || !task.scheduled_date || !task.scheduled_start || !task.scheduled_end) return null;
    if (task.scheduled_date === u.scheduled_date && task.scheduled_start === u.scheduled_start) return null;
    return { ...task, _isGhost: true };
  }).
  filter(Boolean);

  // Compute which week offsets have proposed changes (for navigation dots + jump)
  const changedWeekOffsets = React.useMemo(() => {
    if (!pendingChanges?.updates) return new Set();
    const offsets = new Set();
    const ref = new Date(PLANNING_REFERENCE_DATE);
    const refM = new Date(ref);refM.setDate(ref.getDate() - (ref.getDay() + 6) % 7);
    const allDates = pendingChanges.updates.flatMap((u) => {
      const task = tasks.find((t) => t.id === u.task_id);
      return [task?.scheduled_date, u.scheduled_date].filter(Boolean);
    });
    for (const ds of allDates) {
      const d = new Date(ds + 'T00:00:00');
      const dM = new Date(d);dM.setDate(d.getDate() - (d.getDay() + 6) % 7);
      offsets.add(Math.round((dM - refM) / (7 * 86400000)));
    }
    return offsets;
  }, [pendingChanges, tasks]);

  const hasChangesThisWeek = changedWeekOffsets.has(weekOffset);
  const sortedChangeWeeks = [...changedWeekOffsets].sort((a, b) => a - b);
  const jumpToNextChange = () => {
    const next = sortedChangeWeeks.find((w) => w > weekOffset);
    if (next !== undefined) setWeekOffset(next);else
    if (sortedChangeWeeks.length > 0) setWeekOffset(sortedChangeWeeks[0]);
  };

  return (
    <div className="bg-white rounded-xl border border-blue-100 shadow-sm overflow-hidden flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 bg-gray-50">
        <button onClick={() => setWeekOffset((w) => w - 1)} className="p-1 hover:bg-gray-200 rounded"><ChevronLeft className="w-4 h-4 text-gray-500" /></button>
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium text-gray-600">
            {weekDates[0]?.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – {weekDates[6]?.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>
          {hasChangesThisWeek && <span className="w-1.5 h-1.5 rounded-full bg-orange-400" title="Changes in this week" />}
        </div>
        <div className="flex items-center gap-1">
          {changedWeekOffsets.size > 0 &&
          <button onClick={jumpToNextChange} className="text-[10px] text-orange-600 hover:bg-orange-50 rounded px-1.5 py-0.5 font-medium" title="Jump to next week with changes">
              → Changes
            </button>
          }
          <button onClick={() => setWeekOffset((w) => w + 1)} className="p-1 hover:bg-gray-200 rounded"><ChevronRight className="w-4 h-4 text-gray-500" /></button>
        </div>
      </div>
      {/* Day headers */}
      <div className="grid border-b border-gray-100" style={{ gridTemplateColumns: '36px repeat(7, 1fr)' }}>
        <div />
        {weekDates.map((d, i) =>
        <div key={i} className={`py-1 text-center border-l border-gray-100 ${d.toDateString() === PLANNING_REFERENCE_DATE.toDateString() ? 'bg-blue-50' : ''}`}>
            <p className="text-[10px] text-gray-400">{dayNames[i]}</p>
            <p className={`text-xs font-semibold ${d.toDateString() === PLANNING_REFERENCE_DATE.toDateString() ? 'text-blue-600' : 'text-gray-700'}`}>{d.getDate()}</p>
          </div>
        )}
      </div>
      {/* Time grid */}
      <div className="overflow-y-auto flex-1">
        <div className="relative grid" style={{ gridTemplateColumns: '36px repeat(7, 1fr)', height: `${(CAL_END_HOUR - CAL_START_HOUR) * HOUR_PX}px` }}>
          {Array.from({ length: CAL_END_HOUR - CAL_START_HOUR }, (_, i) => CAL_START_HOUR + i).map((hour) =>
          <React.Fragment key={hour}>
              <div className="absolute text-[10px] text-gray-400 text-right pr-1 leading-none" style={{ top: `${(hour - CAL_START_HOUR) * HOUR_PX}px`, left: 0, width: 34 }}>{hour}:00</div>
              <div className="absolute border-t border-gray-100 pointer-events-none" style={{ top: `${(hour - CAL_START_HOUR) * HOUR_PX}px`, left: 36, right: 0 }} />
            </React.Fragment>
          )}
          {weekDates.map((d, colIdx) => {
            const ds = getLocalDateStr(d);
            const dayTasks = previewTasks.filter((t) => t.scheduled_date === ds && t.scheduled_start && t.scheduled_end && !t._isRemoved);
            const dayEvents = expandedBusyMap[ds] || [];
            const colLeft = `calc(36px + ${colIdx} * ((100% - 36px) / 7))`;
            const colWidth = 'calc((100% - 36px) / 7)';
            return (
              <React.Fragment key={colIdx}>
                <div className="absolute top-0 bottom-0 border-l border-gray-100" style={{ left: colLeft }} />
                {showBlockedTimes && dayEvents.map((ev, j) =>
                <div key={`ev-${j}`} className="absolute z-10 bg-gray-100 border border-gray-300 rounded overflow-hidden pointer-events-none"
                style={{ top: toTopPx(ev.start_time), height: toDurPx(ev.start_time, ev.end_time), left: colLeft, width: colWidth, padding: '1px 3px' }}>
                    <p className="text-[10px] font-medium leading-tight truncate text-gray-600">{ev.name}</p>
                  </div>
                )}
                {ghostTasks.filter((gt) => gt.scheduled_date === ds).map((task, j) =>
                <div key={`g-${j}`}
                className="absolute rounded border-2 border-dashed border-gray-300 bg-gray-50/60 overflow-hidden pointer-events-none"
                style={{ top: toTopPx(task.scheduled_start), height: toDurPx(task.scheduled_start, task.scheduled_end), left: colLeft, width: colWidth, padding: '2px 3px', opacity: 0.55 }}>
                    <p className="text-[10px] font-semibold leading-tight truncate text-gray-400 line-through">{task.course_name}</p>
                    <p className="text-[10px] leading-tight truncate text-gray-400">{task.title}</p>
                    <span className="text-[9px] text-gray-400 block leading-none">↸ moved</span>
                  </div>
                )}
                {dayTasks.map((task, j) =>
                <div key={`t-${j}`}
                className={`absolute z-20 rounded border overflow-hidden transition-all ${
                task._isPending ?
                'border-orange-400 bg-orange-50 text-orange-900 ring-1 ring-orange-300' :
                task.status === 'completed' ?
                'bg-emerald-50 border-emerald-300 text-emerald-700' :
                `${getTaskColor(task).bg} ${getTaskColor(task).border} ${getTaskColor(task).text}`}`
                }
                style={{ top: toTopPx(task.scheduled_start), height: toDurPx(task.scheduled_start, task.scheduled_end), left: colLeft, width: colWidth, padding: '2px 3px' }}>
                    {task._isPending && <span className="text-[9px] font-bold text-orange-600 block leading-none">→ moved</span>}
                    <p className="text-[10px] font-semibold leading-tight truncate">{task.status === 'completed' ? '✓ ' : ''}{task.course_name}</p>
                    <p className="text-[10px] leading-tight truncate opacity-80">{task.title}</p>
                  </div>
                )}
              </React.Fragment>);

          })}
        </div>
      </div>
    </div>);

}

// ── Helpers ──────────────────────────────────────────────────────────────────
function getWeekStartFromOffset(offset) {
  const ref = new Date(PLANNING_REFERENCE_DATE);
  ref.setDate(ref.getDate() + offset * 7);
  const monday = new Date(ref);
  monday.setDate(ref.getDate() - (ref.getDay() + 6) % 7);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function getWeekDatesFromOffset(offset) {
  const monday = getWeekStartFromOffset(offset);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

function formatDate(d) {
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function Replanning() {
  const { planId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [plan, setPlan] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [courses, setCourses] = useState([]);
  const [expandedBusyMap, setExpandedBusyMap] = useState({});
  const [showBlockedTimes, setShowBlockedTimes] = useState(true);

  // Week offset for the calendar — initialized from query param passed by ActivePlan
  const initialOffset = parseInt(searchParams.get('week') || '0', 10);
  const [weekOffset, setWeekOffset] = useState(isNaN(initialOffset) ? 0 : initialOffset);

  // Chat state
  const [messages, setMessages] = useState([
  { role: 'assistant', content: "Hi! 👋 I'm here to help you update your study plan. Tell me what changed — for example:\n\n- \"I can't study on Thursday anymore.\"\n- \"The statistics deadline moved to the 20th.\"\n- \"I didn't finish this week's tasks.\"\n- \"I need more time for this assignment.\"\n\nWhat would you like to change?" }]
  );
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  // Proposal state — holds pending changes to preview + confirm/cancel
  const [proposal, setProposal] = useState(null);
  // { explanation: string, updates: [{task_id, scheduled_date, scheduled_start, scheduled_end, reason}], removals: [task_id], conflicts: [...] }

  // Ambiguity clarification
  const [clarification, setClarification] = useState(null);
  // { question: string, options: [{label, action}] }

  const endRef = useRef(null);

  useEffect(() => {
    const load = async () => {
      const [p, t, c] = await Promise.all([
      base44.entities.StudyPlan.get(planId),
      base44.entities.StudyTask.filter({ plan_id: planId }),
      base44.entities.Course.filter({ plan_id: planId })]
      );
      setPlan(p);
      setTasks(t);
      setCourses(c);
      const { busy } = buildBusyMapPublic(p.calendar_events || [], c, p.start_date, p.end_date);
      setExpandedBusyMap(busy);

      // If no week param, jump to first week with tasks
      if (!searchParams.get('week')) {
        const scheduledDates = t.filter((x) => x.scheduled_date).map((x) => x.scheduled_date).sort();
        if (scheduledDates.length) {
          const firstDate = new Date(scheduledDates[0] + 'T00:00:00');
          const ref = new Date(PLANNING_REFERENCE_DATE);
          const refM = new Date(ref);refM.setDate(ref.getDate() - (ref.getDay() + 6) % 7);
          const firstM = new Date(firstDate);firstM.setDate(firstDate.getDate() - (firstDate.getDay() + 6) % 7);
          setWeekOffset(Math.round((firstM - refM) / (7 * 86400000)));
        }
      }
    };
    load();
  }, [planId]);

  useEffect(() => {
    if (endRef.current) endRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [messages, clarification, proposal]);

  // Auto-navigate calendar to the week of the first proposed change
  useEffect(() => {
    if (proposal?.updates?.length > 0) {
      const firstNewDate = proposal.updates.find((u) => u.scheduled_date)?.scheduled_date;
      if (firstNewDate) {
        const targetDate = new Date(firstNewDate + 'T00:00:00');
        const ref = new Date(PLANNING_REFERENCE_DATE);
        const refM = new Date(ref);refM.setDate(ref.getDate() - (ref.getDay() + 6) % 7);
        const targetM = new Date(targetDate);targetM.setDate(targetDate.getDate() - (targetDate.getDay() + 6) % 7);
        setWeekOffset(Math.round((targetM - refM) / (7 * 86400000)));
      }
    }
  }, [proposal]);

  // ── Visible week context ──────────────────────────────────────────────────
  const visibleWeekDates = getWeekDatesFromOffset(weekOffset);
  const visibleWeekStart = visibleWeekDates[0];
  const visibleWeekEnd = visibleWeekDates[6];
  const visibleWeekLabel = `${formatDate(visibleWeekStart)} – ${formatDate(visibleWeekEnd)}`;

  // ── Pre-resolve weekday mentions to exact dates (JS-side, no LLM guessing) ──
  const WEEKDAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  // Returns { date: 'YYYY-MM-DD', label: 'Wednesday, 17 Jun 2026' } or null
  const resolveWeekdayInText = (text) => {
    const lower = text.toLowerCase();
    for (let i = 0; i < WEEKDAY_NAMES.length; i++) {
      if (lower.includes(WEEKDAY_NAMES[i])) {
        // Mon=0 in our array (visibleWeekDates[0]=Monday), map to JS day
        // visibleWeekDates[0]=Mon, [1]=Tue...,[6]=Sun
        const idxMap = { 1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 0: 6 }; // JS day → array idx
        const jsDay = i; // 0=Sun,1=Mon,...
        const arrayIdx = idxMap[jsDay];
        const d = visibleWeekDates[arrayIdx];
        return { date: getLocalDateStr(d), label: formatDate(d), dayIdx: arrayIdx };
      }
    }
    return null;
  };

  // Build a compact calendar-state snapshot for a specific date
  const buildDayContext = (dateStr) => {
    const tasksOnDay = tasks.filter((t) => t.scheduled_date === dateStr && !['completed'].includes(t.status));
    const eventsOnDay = expandedBusyMap[dateStr] || [];
    if (tasksOnDay.length === 0 && eventsOnDay.length === 0) {
      return `CALENDAR STATE FOR ${dateStr}: No study tasks and no blocked events on this date.`;
    }
    const taskLines = tasksOnDay.map((t) =>
    `  - TASK ID:${t.id} | "${t.title}" (${t.course_name}) | ${t.scheduled_start}–${t.scheduled_end} | ${t.estimated_hours}h | status:${t.status} | deadline:${t.deadline || 'none'} | manually_moved:${t.manually_moved ? 'yes' : 'no'}`
    ).join('\n');
    const eventLines = eventsOnDay.map((e) =>
    `  - BLOCKED EVENT: "${e.name}" ${e.start_time}–${e.end_time}`
    ).join('\n');
    return `CALENDAR STATE FOR ${dateStr} (${tasksOnDay.length} task(s), ${eventsOnDay.length} blocked event(s)):
TASKS THAT WILL BE AFFECTED:
${taskLines || '  (none)'}
BLOCKED EVENTS:
${eventLines || '  (none)'}
INSTRUCTION: You MUST include ALL tasks listed above in the "updates" array of your proposal (unless they are already completed). Do NOT return "no_change" if any tasks are listed above.`;
  };

  // Build week context snapshot
  const buildWeekContext = (weekDates) => {
    return weekDates.map((d) => {
      const ds = getLocalDateStr(d);
      const t = tasks.filter((x) => x.scheduled_date === ds && x.status !== 'completed');
      return `${ds} (${d.toLocaleDateString('en-US', { weekday: 'short' })}): ${t.length} task(s)`;
    }).join(', ');
  };

  // ── Sequence analysis for multi-day/week re-planning ─────────────────────
  // Sequential types must preserve order; flexible types can move freely
  const SEQUENTIAL_TYPES = ['reading', 'exercise', 'revision', 'test', 'assignment'];
  const FLEXIBLE_TYPES = ['project_work'];

  const isSequential = (task) => SEQUENTIAL_TYPES.includes(task.task_type);

  // Given a set of affected task IDs (those on blocked dates), compute which
  // additional tasks from the same course must also shift to preserve order.
  // Returns a structured analysis object for injection into the AI prompt.
  const buildSequenceAnalysis = (affectedDateStrings) => {
    const affectedTasks = tasks.filter(
      (t) => affectedDateStrings.includes(t.scheduled_date) && t.status !== 'completed'
    );
    if (affectedTasks.length === 0) return null;

    // Group ALL non-completed tasks by course, sorted by scheduled date then start time
    const byCourse = {};
    tasks.filter((t) => t.status !== 'completed' && t.scheduled_date).forEach((t) => {
      if (!byCourse[t.course_id || t.course_name]) byCourse[t.course_id || t.course_name] = [];
      byCourse[t.course_id || t.course_name].push(t);
    });
    Object.values(byCourse).forEach((arr) =>
    arr.sort((a, b) => {
      const dateComp = (a.scheduled_date || '').localeCompare(b.scheduled_date || '');
      return dateComp !== 0 ? dateComp : (a.scheduled_start || '').localeCompare(b.scheduled_start || '');
    })
    );

    const sequenceChains = []; // tasks that must shift together to preserve order
    const flexibleAffected = []; // tasks that can move freely
    const deadlineWarnings = [];
    const processedCourses = new Set();

    affectedTasks.forEach((affected) => {
      const courseKey = affected.course_id || affected.course_name;
      if (!isSequential(affected) && !processedCourses.has(courseKey + '_flex')) {
        flexibleAffected.push(affected);
        processedCourses.add(courseKey + '_flex');
        return;
      }
      if (processedCourses.has(courseKey)) return;
      processedCourses.add(courseKey);

      const courseArr = byCourse[courseKey] || [];
      const affectedIdx = courseArr.findIndex((t) => t.id === affected.id);
      if (affectedIdx === -1) return;

      // Find all tasks in this course that appear at or after the first affected task
      // in the course sequence — those must all shift forward together
      const firstAffectedInCourse = courseArr.findIndex((t) => affectedDateStrings.includes(t.scheduled_date) && t.status !== 'completed');
      const chainTasks = courseArr.slice(firstAffectedInCourse); // everything from first affected onward

      const chainInfo = {
        courseKey,
        courseName: affected.course_name,
        tasks: chainTasks.map((t, idx) => ({
          id: t.id,
          title: t.title,
          date: t.scheduled_date,
          start: t.scheduled_start,
          end: t.scheduled_end,
          type: t.task_type,
          deadline: t.deadline,
          positionInCourse: firstAffectedInCourse + idx,
          mustShift: affectedDateStrings.includes(t.scheduled_date),
          shiftReason: affectedDateStrings.includes(t.scheduled_date) ?
          'directly blocked' :
          'must follow earlier tasks in sequence'
        }))
      };

      // Check for deadline problems — if the last task has a deadline and there's not enough room
      chainTasks.forEach((t) => {
        if (t.deadline) {
          const lastDate = chainTasks[chainTasks.length - 1]?.scheduled_date;
          if (lastDate && lastDate > t.deadline) {
            deadlineWarnings.push(`"${t.title}" (${t.course_name}) has deadline ${t.deadline} but would be pushed past it`);
          }
        }
      });

      sequenceChains.push(chainInfo);
    });

    return { sequenceChains, flexibleAffected, deadlineWarnings, totalAffected: affectedTasks.length };
  };

  // Detect if student is asking about a whole week or multiple days being unavailable
  const isWeekLevelRequest = (text) => {
    const lower = text.toLowerCase();
    return lower.includes('this week') || lower.includes('whole week') || lower.includes('entire week') ||
    lower.includes('sick') || lower.includes('away') || lower.includes('vacation') ||
    lower.includes('all week') || lower.includes('not available this week') ||
    lower.includes('can\'t study this week') || lower.includes('cannot study this week');
  };

  // ── Send message to AI ────────────────────────────────────────────────────
  const sendMessage = async (text, extraContext = '') => {
    if (!text.trim()) return;
    setMessages((prev) => [...prev, { role: 'user', content: text }]);
    setInput('');
    setClarification(null);
    setLoading(true);

    try {
      const prefs = plan?.preferences || {};

      // Pre-resolve any weekday mention to a concrete date
      const resolvedDay = resolveWeekdayInText(text);
      const dayContext = resolvedDay ? buildDayContext(resolvedDay.date) : '';

      // Check if "this week" / "next week" mentioned
      const lowerText = text.toLowerCase();
      const isThisWeek = lowerText.includes('this week');
      const isNextWeek = lowerText.includes('next week');
      const nextWeekDates = getWeekDatesFromOffset(weekOffset + 1);
      const weekContext = isThisWeek || isNextWeek ?
      buildWeekContext(isNextWeek ? nextWeekDates : visibleWeekDates) :
      '';

      // ── Extract blocked dates from the user message (enforced in code) ──
      // Detect phrases like "can't study on Wednesday", "not available on Wednesday",
      // "no study on Wednesday", "cannot study this day", "I can't study this week"
      const blockedDates = [];
      const isUnavailabilityMsg = /\b(can'?t|cannot|can not|not available|no study|no studying|unable|don'?t want to study|won'?t be (?:able to )?study)\b/i.test(lowerText) ||
      /\b(blocked|unavailable|off|away)\b/i.test(lowerText);
      if (isUnavailabilityMsg) {
        if (isWeekLevelRequest(text) || isThisWeek) {
          // Block the entire visible week
          blockedDates.push(...visibleWeekDates.map((d) => getLocalDateStr(d)));
        } else if (isNextWeek) {
          blockedDates.push(...nextWeekDates.map((d) => getLocalDateStr(d)));
        } else if (resolvedDay) {
          // Block the single resolved weekday
          blockedDates.push(resolvedDay.date);
        }
      }

      // Week-level sequence analysis
      const isWeekRequest = isWeekLevelRequest(text) || isThisWeek;
      let sequenceContext = '';
      if (isWeekRequest) {
        const affectedWeekDates = visibleWeekDates.map((d) => getLocalDateStr(d));
        const analysis = buildSequenceAnalysis(affectedWeekDates);
        if (analysis && analysis.totalAffected > 0) {
          const chainLines = analysis.sequenceChains.map((chain) => {
            const taskLines = chain.tasks.map((t) =>
            `      ${t.mustShift ? '[MUST MOVE]' : '[MUST FOLLOW]'} ID:${t.id} | "${t.title}" | current: ${t.date} ${t.start}-${t.end} | deadline:${t.deadline || 'none'} | position:${t.positionInCourse + 1}`
            ).join('\n');
            return `  Course: ${chain.courseName} — ${chain.tasks.length} task(s) in sequence:\n${taskLines}`;
          }).join('\n\n');

          const flexLines = analysis.flexibleAffected.map((t) =>
          `  [FLEXIBLE] ID:${t.id} | "${t.title}" (${t.course_name}) | current: ${t.scheduled_date} ${t.scheduled_start}-${t.scheduled_end}`
          ).join('\n');

          sequenceContext = `
SEQUENCE ANALYSIS FOR BLOCKED WEEK (${getLocalDateStr(visibleWeekDates[0])} – ${getLocalDateStr(visibleWeekDates[6])}):
Total tasks affected on blocked dates: ${analysis.totalAffected}

SEQUENTIAL CHAINS (must shift whole chain to preserve learning order):
${chainLines || '  (none)'}

FLEXIBLE TASKS (can move to any free slot without order constraint):
${flexLines || '  (none)'}

${analysis.deadlineWarnings.length > 0 ? `DEADLINE WARNINGS:\n${analysis.deadlineWarnings.map((w) => '  ⚠ ' + w).join('\n')}` : ''}

CRITICAL ORDERING RULES:
- [MUST FOLLOW] tasks are LATER in the same course sequence. They MUST be scheduled AFTER their [MUST MOVE] predecessors, even if they are not on the blocked dates.
- Never schedule a later chapter/topic before an earlier one of the same course.
- Shift the ENTIRE chain forward by one week minimum — do not interleave with existing tasks of the same course.
- For each [MUST MOVE] task, calculate a new date by adding 7 days to its current date. For [MUST FOLLOW] tasks that now come too early, shift them +7 days too.
- Keep the same time slot (start/end times) when shifting — only change the date.
- If a task deadline would be violated by shifting, include it in the proposal but flag the reason as "deadline risk".`;
        }
      }

      // Only send non-completed tasks to keep prompt focused
      const taskSummary = tasks.
      filter((t) => t.status !== 'completed').
      map((t) =>
      `- ID:${t.id} | "${t.title}" (${t.course_name}) | ${t.scheduled_date} ${t.scheduled_start}-${t.scheduled_end} | ${t.estimated_hours}h | deadline:${t.deadline || 'none'} | priority:${t.priority} | manually_moved:${t.manually_moved ? 'yes' : 'no'}`
      ).join('\n');

      const history = messages.slice(-6).map((m) => `${m.role}: ${m.content}`).join('\n');

      const prompt = `You are Schedulo, an AI study planning assistant helping a student with an ACTIVE study plan.

RULES — CRITICAL:
1. SURGICAL changes only. Never reschedule tasks not listed in affected sections below.
2. Completed tasks MUST NOT be moved.
3. Manually moved tasks (manually_moved=yes) should only move if they conflict with a blocked time or deadline violation.
4. When the student mentions a weekday without a date, use the RESOLVED DATE provided below.
5. For ambiguous scope (one day vs recurring), output a clarification question.
6. Output JSON only — system shows a diff for the student to confirm before saving.
7. NEVER output "no_change" if the CALENDAR STATE or SEQUENCE ANALYSIS section lists tasks for the affected date(s).
8. SEQUENCE ORDER: When shifting sequential tasks (readings, exercises, chapters), you MUST shift the entire course chain together. Never leave a later chapter scheduled before an earlier one.
9. COMMITMENT CHANGES: If the student wants to modify a calendar commitment (e.g. "move my work shift from Monday to Wednesday", "delete my gym session"), use the "commitment_change" response type. The system will automatically detect conflicts with study tasks and reschedule them.
10. BLOCKED DATES: If a "HARD BLOCKED DATES" section is present above, you MUST NOT propose any task on those dates. Move ALL tasks currently on blocked dates to other days. Never propose the same date/time slot as the task's original slot — always propose a real change.

CURRENTLY VISIBLE CALENDAR WEEK: ${visibleWeekLabel}
Resolved weekday dates:
- Monday: ${getLocalDateStr(visibleWeekDates[0])}
- Tuesday: ${getLocalDateStr(visibleWeekDates[1])}
- Wednesday: ${getLocalDateStr(visibleWeekDates[2])}
- Thursday: ${getLocalDateStr(visibleWeekDates[3])}
- Friday: ${getLocalDateStr(visibleWeekDates[4])}
- Saturday: ${getLocalDateStr(visibleWeekDates[5])}
- Sunday: ${getLocalDateStr(visibleWeekDates[6])}
- "this week" = ${getLocalDateStr(visibleWeekDates[0])} to ${getLocalDateStr(visibleWeekDates[6])}
- "next week" = ${getLocalDateStr(nextWeekDates[0])} to ${getLocalDateStr(nextWeekDates[6])}

CALENDAR COMMITMENTS (fixed events in the student's calendar):
${(plan?.calendar_events || []).filter((e) => !e.is_course).map((e) => `- "${e.name}" | day: ${e.day_of_week || 'Flexible'} | time: ${e.start_time || '?'}–${e.end_time || '?'} | recurring: ${e.is_recurring ? 'yes' : 'no'} | start: ${e.start_date || '?'}`).join('\n') || '(none)'}

${dayContext ? `\n${dayContext}\n` : ''}
${weekContext ? `\nWEEK TASK SUMMARY: ${weekContext}\n` : ''}
${sequenceContext ? `\n${sequenceContext}\n` : ''}
${blockedDates.length > 0 ? `\nHARD BLOCKED DATES (no study tasks may be scheduled on these dates under any circumstance):\n${blockedDates.map((d) => `- ${d}`).join('\n')}\n` : ''}

STUDY PREFERENCES:
Study days: ${(prefs.preferred_days || []).join(', ')}
Max hours/day: ${prefs.max_hours || 6}
Study window: ${prefs.preferred_start || '09:00'} – ${prefs.preferred_end || '21:00'}
Study period: ${plan?.start_date} to ${plan?.end_date}

ALL ACTIVE TASKS (${tasks.filter((t) => t.status !== 'completed').length} non-completed):
${taskSummary}

CONVERSATION HISTORY:
${history}

${extraContext ? `ADDITIONAL CONTEXT: ${extraContext}\n` : ''}
STUDENT MESSAGE: "${text}"

RESPONSE FORMAT — return ONLY valid JSON:

Option A — Clarification needed (e.g. "just this Monday" vs "every Monday"):
{
  "type": "clarification",
  "question": "Do you mean [specific date] or [broader scope]?",
  "options": [
    { "label": "Just ${resolvedDay ? resolvedDay.label : 'this date'}", "context": "Scope: single day${resolvedDay ? ' ' + resolvedDay.date : ''}" },
    { "label": "Every ${resolvedDay ? WEEKDAY_NAMES[resolvedDay.dayIdx !== undefined ? resolvedDay.dayIdx === 6 ? 0 : resolvedDay.dayIdx + 1 : 1] : 'weekday'} from now on", "context": "Scope: recurring" },
    { "label": "Cancel", "context": "cancel" }
  ]
}

Option B — Proposal ready (study task changes):
{
  "type": "proposal",
  "understanding": "I understood: [what the student means, naming the blocked dates and affected courses]",
  "explanation": "[Friendly explanation naming specific tasks and how sequences are preserved. If whole chains shift, mention that explicitly. List any deadline warnings.]",
  "updates": [
    { "task_id": "[id]", "scheduled_date": "YYYY-MM-DD", "scheduled_start": "HH:MM", "scheduled_end": "HH:MM", "reason": "why this task moves" }
  ],
  "removals": [],
  "affected_count": 0,
  "unchanged_count": 0
}

Option C — Commitment change (modifying calendar events like work shifts, gym, etc.):
{
  "type": "commitment_change",
  "understanding": "I understood: [what the student wants to change about their calendar]",
  "explanation": "[Friendly explanation of the calendar change]",
  "commitment_changes": [
    { "event_name": "[exact event name from the calendar list]", "action": "move", "new_day_of_week": "Wednesday", "new_start_time": "HH:MM", "new_end_time": "HH:MM", "new_start_date": "YYYY-MM-DD" }
  ]
}
Use action "move" to reschedule an event to a different day/time, or action "delete" to remove it.
For "move", set new_day_of_week to the full weekday name (e.g. "Wednesday"), and provide new_start_time and new_end_time in HH:MM format.
If the student mentions a weekday, use the resolved date from above for new_start_date.

Option D — No change needed (ONLY if affected sections above listed zero tasks):
{
  "type": "no_change",
  "message": "[Must reference the specific date(s) and confirm zero tasks found]"
}

IMPORTANT: Include ALL [MUST MOVE] and [MUST FOLLOW] tasks from the SEQUENCE ANALYSIS in updates. Preserve order: task at position N must have an earlier date than task at position N+1 within the same course.`;

      const result = await base44.integrations.Core.InvokeLLM({
        prompt,
        response_json_schema: {
          type: 'object',
          properties: {
            type: { type: 'string' },
            question: { type: 'string' },
            options: { type: 'array', items: { type: 'object', properties: { label: { type: 'string' }, context: { type: 'string' } } } },
            understanding: { type: 'string' },
            explanation: { type: 'string' },
            updates: { type: 'array', items: { type: 'object', properties: { task_id: { type: 'string' }, scheduled_date: { type: 'string' }, scheduled_start: { type: 'string' }, scheduled_end: { type: 'string' }, reason: { type: 'string' } } } },
            removals: { type: 'array', items: { type: 'string' } },
            affected_count: { type: 'number' },
            unchanged_count: { type: 'number' },
            message: { type: 'string' },
            commitment_changes: { type: 'array', items: { type: 'object', properties: {
                  event_name: { type: 'string' },
                  action: { type: 'string' },
                  new_day_of_week: { type: 'string' },
                  new_start_time: { type: 'string' },
                  new_end_time: { type: 'string' },
                  new_start_date: { type: 'string' }
                } } }
          }
        }
      });

      if (result.type === 'clarification') {
        // Inject concrete resolved date into options if AI returned generic placeholders
        const opts = (result.options || []).map((o) => ({
          ...o,
          label: resolvedDay ?
          o.label.replace('[specific date]', resolvedDay.label).replace('[date]', resolvedDay.label) :
          o.label
        }));
        setMessages((prev) => [...prev, { role: 'assistant', content: result.question }]);
        setClarification({ question: result.question, options: opts, originalText: text });
      } else if (result.type === 'commitment_change') {
        // Handle commitment (calendar event) modifications
        await handleCommitmentChange(result, blockedDates);
      } else if (result.type === 'proposal') {
        // Validate each proposed move against constraints before showing
        const prefs = plan?.preferences || {};
        const conflicts = [];
        const autoResolved = [];
        for (const u of result.updates || []) {
          const task = tasks.find((t) => t.id === u.task_id);
          if (!task) continue;

          // ── Same-slot rejection: AI proposed the exact same slot as the original ──
          const isSameSlot = task.scheduled_date === u.scheduled_date &&
          task.scheduled_start === u.scheduled_start &&
          task.scheduled_end === u.scheduled_end;
          if (isSameSlot) {
            const [eh, em] = (task.scheduled_end || '10:00').split(':').map(Number);
            const [sh, sm] = (task.scheduled_start || '09:00').split(':').map(Number);
            const duration = eh * 60 + em - (sh * 60 + sm);
            const alternatives = findAlternativeSlots({
              newDate: u.scheduled_date,
              duration,
              task,
              allTasks: tasks,
              busyMap: expandedBusyMap,
              prefs,
              planStart: plan?.start_date,
              planEnd: plan?.end_date,
              blockedDates
            });
            if (alternatives.length > 0) {
              const slot = alternatives[0];
              autoResolved.push({
                task_id: u.task_id,
                original_date: u.scheduled_date,
                original_start: u.scheduled_start,
                original_end: u.scheduled_end,
                new_date: slot.date,
                new_start: slot.start,
                new_end: slot.end,
                reason: 'AI proposed the same slot — moved to a real alternative'
              });
              u.scheduled_date = slot.date;
              u.scheduled_start = slot.start;
              u.scheduled_end = slot.end;
              u.reason = `${u.reason} → auto-resolved (same-slot rejected, moved to ${slot.date} ${slot.start}–${slot.end})`;
            } else {
              conflicts.push({ task_id: u.task_id, title: task.title, reason: 'AI proposed the same slot and no alternative was found.' });
            }
            continue;
          }

          // ── Full validation including blocked dates ──
          const validation = validateSlot({
            newDate: u.scheduled_date,
            newStart: u.scheduled_start,
            newEnd: u.scheduled_end,
            task,
            allTasks: tasks,
            busyMap: expandedBusyMap,
            prefs,
            planStart: plan?.start_date,
            planEnd: plan?.end_date,
            blockedDates
          });
          if (!validation.valid) {
            // Auto-find a conflict-free alternative slot, excluding blocked dates
            const [eh, em] = (u.scheduled_end || '10:00').split(':').map(Number);
            const [sh, sm] = (u.scheduled_start || '09:00').split(':').map(Number);
            const duration = eh * 60 + em - (sh * 60 + sm);
            const alternatives = findAlternativeSlots({
              newDate: u.scheduled_date,
              duration,
              task,
              allTasks: tasks,
              busyMap: expandedBusyMap,
              prefs,
              planStart: plan?.start_date,
              planEnd: plan?.end_date,
              blockedDates
            });
            if (alternatives.length > 0) {
              const slot = alternatives[0];
              autoResolved.push({
                task_id: u.task_id,
                original_date: u.scheduled_date,
                original_start: u.scheduled_start,
                original_end: u.scheduled_end,
                new_date: slot.date,
                new_start: slot.start,
                new_end: slot.end,
                reason: `Moved to avoid conflict: ${validation.reason}`
              });
              // Update the proposal with the conflict-free slot
              u.scheduled_date = slot.date;
              u.scheduled_start = slot.start;
              u.scheduled_end = slot.end;
              u.reason = `${u.reason} → auto-resolved conflict (moved to ${slot.date} ${slot.start}–${slot.end})`;
            } else {
              conflicts.push({ task_id: u.task_id, title: task.title, reason: validation.reason });
            }
          }
        }

        setProposal({ ...result, conflicts });
        const conflictNote = conflicts.length > 0 ?
        `\n\n⚠️ **${conflicts.length} conflict(s) could not be auto-resolved** — these moves will be skipped.` :
        autoResolved.length > 0 ?
        `\n\n✅ **${autoResolved.length} conflict(s) auto-resolved** — moved to the next available free slot.` :
        '';
        setMessages((prev) => [...prev, {
          role: 'assistant',
          content: `**${result.understanding || 'Here is what I propose:'}**\n\n${result.explanation}${conflictNote}\n\nThis affects **${result.updates?.length || 0}** task(s). Review the changes above and accept or cancel.`
        }]);
      } else {
        setMessages((prev) => [...prev, { role: 'assistant', content: result.message || 'No changes are needed for your plan.' }]);
      }
    } catch (e) {
      setMessages((prev) => [...prev, { role: 'assistant', content: "Sorry, I couldn't process that. Please try again." }]);
    }
    setLoading(false);
  };

  // ── Handle commitment (calendar event) changes ────────────────────────────
  const handleCommitmentChange = async (result, blockedDates = []) => {
    const changes = result.commitment_changes || [];
    if (changes.length === 0) {
      setMessages((prev) => [...prev, { role: 'assistant', content: result.message || 'I could not detect any commitment changes to make.' }]);
      return;
    }

    const updatedEvents = [...(plan.calendar_events || [])];
    const affectedTaskUpdates = [];

    for (const change of changes) {
      const { event_name, action, new_day_of_week, new_start_time, new_end_time, new_start_date } = change;
      // Find the event by name (case-insensitive)
      const evIdx = updatedEvents.findIndex((e) => (e.name || '').toLowerCase() === (event_name || '').toLowerCase());
      if (evIdx === -1) continue;

      if (action === 'move') {
        const ev = { ...updatedEvents[evIdx] };
        if (new_day_of_week) ev.day_of_week = new_day_of_week;
        if (new_start_time) ev.start_time = new_start_time;
        if (new_end_time) ev.end_time = new_end_time;
        if (new_start_date) {
          ev.start_date = new_start_date;
          // Adjust end_date if recurring and end was same as start
          if (ev.is_recurring && ev.end_date === updatedEvents[evIdx].start_date) {
            ev.end_date = new_start_date;
          }
        }
        updatedEvents[evIdx] = ev;
      } else if (action === 'delete') {
        updatedEvents.splice(evIdx, 1);
      }
    }

    // Save updated calendar events to the plan
    await base44.entities.StudyPlan.update(planId, { calendar_events: updatedEvents });
    setPlan((prev) => ({ ...prev, calendar_events: updatedEvents }));

    // Rebuild busy map with updated events
    const { busy: newBusy } = buildBusyMapPublic(updatedEvents, courses, plan.start_date, plan.end_date);
    setExpandedBusyMap(newBusy);

    // Find study tasks that now conflict with the updated calendar events
    const prefs = plan?.preferences || {};
    const conflictTasks = [];
    for (const task of tasks) {
      if (!task.scheduled_date || !task.scheduled_start || !task.scheduled_end) continue;
      if (task.status === 'completed') continue;
      const dayBusy = newBusy[task.scheduled_date] || [];
      const taskStart = parseInt(task.scheduled_start.substring(0, 2)) * 60 + parseInt(task.scheduled_start.substring(3, 5));
      const taskEnd = parseInt(task.scheduled_end.substring(0, 2)) * 60 + parseInt(task.scheduled_end.substring(3, 5));
      const hasConflict = dayBusy.some((b) => taskStart < b.end && taskEnd > b.start);
      if (hasConflict) {
        // Auto-find a conflict-free alternative
        const [eh, em] = task.scheduled_end.split(':').map(Number);
        const [sh, sm] = task.scheduled_start.split(':').map(Number);
        const duration = eh * 60 + em - (sh * 60 + sm);
        const alternatives = findAlternativeSlots({
          newDate: task.scheduled_date,
          duration,
          task,
          allTasks: tasks,
          busyMap: newBusy,
          prefs,
          planStart: plan?.start_date,
          planEnd: plan?.end_date,
          blockedDates
        });
        if (alternatives.length > 0) {
          const slot = alternatives[0];
          affectedTaskUpdates.push({
            task_id: task.id,
            title: task.title,
            course_name: task.course_name,
            old_date: task.scheduled_date,
            old_start: task.scheduled_start,
            old_end: task.scheduled_end,
            new_date: slot.date,
            new_start: slot.start,
            new_end: slot.end
          });
        }
      }
    }

    if (affectedTaskUpdates.length > 0) {
      // Show proposal with auto-resolved task moves
      setProposal({
        type: 'proposal',
        understanding: result.understanding || 'I updated your calendar commitments.',
        explanation: result.explanation || `I've updated your calendar. ${affectedTaskUpdates.length} study task(s) conflicted with the new schedule and have been auto-rescheduled to the next available free slot.`,
        updates: affectedTaskUpdates.map((u) => ({
          task_id: u.task_id,
          scheduled_date: u.new_date,
          scheduled_start: u.new_start,
          scheduled_end: u.new_end,
          reason: `Auto-rescheduled due to calendar change`
        })),
        removals: [],
        conflicts: [],
        isCommitmentChange: true
      });
      setMessages((prev) => [...prev, {
        role: 'assistant',
        content: `**${result.understanding || 'Calendar updated!'}**\n\n${result.explanation || ''}\n\nI've also detected **${affectedTaskUpdates.length} study task(s)** that now conflict with your updated calendar. I've automatically found conflict-free slots for them — review and accept below.`
      }]);
    } else {
      setMessages((prev) => [...prev, {
        role: 'assistant',
        content: `**${result.understanding || 'Calendar updated!'}**\n\n${result.explanation || ''}\n\nNo study tasks were affected by this change.`
      }]);
    }
  };

  // ── Accept proposal ───────────────────────────────────────────────────────
  const acceptProposal = async () => {
    if (!proposal) return;
    setLoading(true);
    const saved = [];
    const failed = [];

    try {
      for (const u of proposal.updates || []) {
        const task = tasks.find((t) => t.id === u.task_id);
        if (!task) continue;
        try {
          await base44.entities.StudyTask.update(task.id, {
            scheduled_date: u.scheduled_date,
            scheduled_start: u.scheduled_start,
            scheduled_end: u.scheduled_end
          });
          saved.push(task.title);
        } catch (e) {
          failed.push(task.title);
        }
      }

      for (const rid of proposal.removals || []) {
        try {
          await base44.entities.StudyTask.update(rid, { scheduled_date: null, scheduled_start: null, scheduled_end: null });
        } catch (e) {/* ignore */}
      }

      // Reload tasks
      const updated = await base44.entities.StudyTask.filter({ plan_id: planId });
      setTasks(updated);
      // If this was a commitment change, also reload the plan and busy map
      if (proposal.isCommitmentChange) {
        const updatedPlan = await base44.entities.StudyPlan.get(planId);
        setPlan(updatedPlan);
        const { busy: updatedBusy } = buildBusyMapPublic(updatedPlan.calendar_events || [], courses, updatedPlan.start_date, updatedPlan.end_date);
        setExpandedBusyMap(updatedBusy);
      }
      setProposal(null);
      setMessages((prev) => [...prev, {
        role: 'assistant',
        content: `✅ Done! Updated ${saved.length} task(s).${failed.length > 0 ? ` Could not update: ${failed.join(', ')}.` : ''}\n\nAnything else you'd like to adjust?`
      }]);
    } catch (e) {
      setMessages((prev) => [...prev, { role: 'assistant', content: 'Something went wrong while saving. Please try again.' }]);
    }
    setLoading(false);
  };

  const cancelProposal = () => {
    setProposal(null);
    setMessages((prev) => [...prev, { role: 'assistant', content: 'No problem — the plan stays unchanged. What else can I help with?' }]);
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      <PhaseIndicator currentPhase="active" currentStep={10} />
      <div className="max-w-7xl mx-auto px-4 py-8">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <div className="flex items-center justify-between mb-6">
            <StepHeader
              icon={MessageCircle}
              title="Re-plan Your Schedule"
              description="Tell me what changed and I'll help you adjust your study plan." />
            
            <Button variant="ghost" onClick={() => navigate(`/plan/${planId}/active`)}>
              <ArrowLeft className="w-4 h-4 mr-1" /> Back to plan
            </Button>
          </div>

          <div className="flex flex-col lg:flex-row gap-6 items-start">
            {/* Calendar panel */}
            <div className="flex flex-col flex-1 min-w-0 h-[496px]">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5 text-sm font-medium text-gray-700">
                  <Calendar className="w-4 h-4 text-blue-500" /> Your Calendar
                  {proposal && <span className="ml-2 text-xs bg-orange-100 text-orange-700 border border-orange-200 rounded-full px-2 py-0.5">Preview mode</span>}
                </div>
                <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer select-none">
                  <input type="checkbox" checked={showBlockedTimes} onChange={(e) => setShowBlockedTimes(e.target.checked)} className="w-3.5 h-3.5 accent-blue-600" />
                  Show blocked times
                </label>
              </div>
              <MiniCalendar
                tasks={tasks}
                courses={courses}
                expandedBusyMap={expandedBusyMap}
                showBlockedTimes={showBlockedTimes}
                weekOffset={weekOffset}
                setWeekOffset={setWeekOffset}
                pendingChanges={proposal} />
              
            </div>

            {/* Chat panel */}
            <div className="flex-1 min-w-0 lg:max-w-[440px] w-full">
              <div className="bg-white rounded-2xl border border-blue-100 shadow-sm overflow-hidden mb-4">
                <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-4 py-3 flex items-center gap-2">
                  <Bot className="w-5 h-5 text-white" />
                  <span className="text-white font-semibold text-sm">Schedulo Re-planning Assistant</span>
                </div>

                {/* AI warning */}
                


                

                {/* Visible week context pill */}
                <div className="px-4 py-2 bg-blue-50 border-b border-blue-100 text-xs text-blue-700 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5" />
                  <span>Visible week: <span className="font-semibold">{visibleWeekDates[0]?.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – {visibleWeekDates[6]?.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span></span>
                </div>

                <div className="h-[360px] overflow-y-auto p-4 space-y-4">
                  {messages.map((msg, i) =>
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    
                      <div className={`max-w-[85%] px-4 py-3 rounded-2xl text-sm ${
                    msg.role === 'user' ?
                    'bg-blue-600 text-white rounded-br-md' :
                    'bg-gray-50 text-gray-800 rounded-bl-md border border-gray-100'}`
                    }>
                        {msg.role === 'assistant' ?
                      <ReactMarkdown className="prose prose-sm max-w-none">{msg.content}</ReactMarkdown> :
                      msg.content}
                      </div>
                    </motion.div>
                  )}

                  {loading &&
                  <div className="flex justify-start">
                      <div className="bg-gray-50 rounded-2xl rounded-bl-md px-4 py-3 border border-gray-100">
                        <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
                      </div>
                    </div>
                  }

                  {/* Clarification buttons */}
                  {clarification && !loading &&
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-2">
                      <p className="text-xs font-semibold text-amber-800 flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5" /> Confirm what you meant:</p>
                      {clarification.options.map((opt, i) =>
                    <button
                      key={i}
                      onClick={() => {
                        if (opt.context === 'cancel') {
                          setClarification(null);
                          setMessages((prev) => [...prev, { role: 'assistant', content: 'No problem — let me know if you want to try again.' }]);
                        } else {
                          sendMessage(clarification.originalText, opt.context);
                        }
                      }}
                      className="w-full text-left text-xs px-3 py-2 rounded-lg bg-white border border-amber-200 hover:bg-amber-100 text-amber-900 transition-colors">
                      
                          {opt.label}
                        </button>
                    )}
                    </div>
                  }

                  {/* Proposal diff + actions */}
                  {proposal && !loading &&
                  <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 space-y-2">
                      <p className="text-xs font-semibold text-orange-800">Proposed changes ({proposal.updates?.length || 0} task{proposal.updates?.length !== 1 ? 's' : ''}):</p>

                      {/* Group by course for sequence visibility */}
                      {(() => {
                      const updates = proposal.updates || [];
                      const MAX_SHOW = 8;
                      const shown = updates.slice(0, MAX_SHOW);
                      // Group consecutive same-course tasks to show chain label
                      let lastCourse = null;
                      return (
                        <>
                            {shown.map((u, i) => {
                            const task = tasks.find((t) => t.id === u.task_id);
                            const conflict = proposal.conflicts?.find((c) => c.task_id === u.task_id);
                            const isDeadlineRisk = u.reason?.toLowerCase().includes('deadline');
                            const courseChanged = task?.course_name !== lastCourse;
                            lastCourse = task?.course_name;
                            return (
                              <React.Fragment key={i}>
                                  {courseChanged && task?.course_name &&
                                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mt-1">{task.course_name}</p>
                                }
                                  <div className={`rounded-lg px-3 py-2 text-xs ${
                                conflict ? 'bg-red-50 border border-red-200' :
                                isDeadlineRisk ? 'bg-amber-50 border border-amber-200' :
                                'bg-white border border-orange-100'}`
                                }>
                                    <p className="font-medium text-gray-800 truncate">{task?.title || u.task_id}</p>
                                    <p className="text-gray-500 text-[11px]">
                                      {task?.scheduled_date} {task?.scheduled_start}–{task?.scheduled_end}
                                      {' → '}
                                      <span className="font-medium text-orange-700">{u.scheduled_date} {u.scheduled_start}–{u.scheduled_end}</span>
                                    </p>
                                    {u.reason && <p className="text-gray-400 italic text-[10px]">{u.reason}</p>}
                                    {conflict && <p className="text-red-600 font-medium text-[10px]">⚠ {conflict.reason}</p>}
                                    {isDeadlineRisk && !conflict && <p className="text-amber-700 font-medium text-[10px]">⚠ Deadline risk</p>}
                                  </div>
                                </React.Fragment>);

                          })}
                            {updates.length > MAX_SHOW &&
                          <p className="text-xs text-gray-400 text-center py-1">…and {updates.length - MAX_SHOW} more task(s)</p>
                          }
                          </>);

                    })()}

                      {proposal.conflicts?.length > 0 &&
                    <p className="text-xs text-red-700 font-medium">⚠ {proposal.conflicts.length} conflict(s) detected. Conflicting moves will be skipped.</p>
                    }
                      <div className="flex gap-2 pt-1">
                        <Button size="sm" onClick={acceptProposal} className="bg-emerald-600 hover:bg-emerald-700 flex-1">
                          <CheckCircle className="w-3.5 h-3.5 mr-1" /> Apply changes
                        </Button>
                        <Button size="sm" variant="outline" onClick={cancelProposal} className="flex-1">
                          <XCircle className="w-3.5 h-3.5 mr-1" /> Cancel
                        </Button>
                      </div>
                    </div>
                  }

                  <div ref={endRef} />
                </div>

                {/* Input */}
                <div className="p-3 border-t border-gray-100">
                  <form onSubmit={(e) => {e.preventDefault();sendMessage(input);}} className="flex gap-2">
                    <input
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      placeholder="Describe what changed..."
                      className="flex-1 text-sm px-4 py-2.5 rounded-full border border-gray-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none transition-all"
                      disabled={loading} />
                    
                    <button
                      type="submit"
                      disabled={!input.trim() || loading}
                      className="w-10 h-10 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white rounded-full flex items-center justify-center transition-colors">
                      
                      <Send className="w-4 h-4" />
                    </button>
                  </form>
                </div>
              </div>

              {/* Suggestion chips */}
              <div className="flex flex-wrap gap-2">
                {[
                "I can't study on Monday",
                "I'm sick and can't study this week",
                "The deadline was moved",
                "Move my work shift from Monday to Wednesday"].
                map((s) =>
                <button
                  key={s}
                  onClick={() => sendMessage(s)}
                  className="px-3 py-1.5 bg-white border border-blue-200 rounded-full text-xs text-blue-600 hover:bg-blue-50 transition-colors"
                  disabled={loading}>
                  
                    {s}
                  </button>
                )}
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>);

}