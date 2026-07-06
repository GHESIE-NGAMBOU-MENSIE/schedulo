import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Calendar, List, ArrowLeft, CheckCircle, AlertCircle, Loader2, RotateCcw, Info, ChevronDown, ChevronUp, Plus } from 'lucide-react';
import { PLANNING_REFERENCE_DATE } from '@/lib/planningDate';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import PhaseIndicator from '@/components/schedulo/PhaseIndicator';
import StepHeader from '@/components/schedulo/StepHeader';
import ContextChat from '@/components/schedulo/ContextChat';
import TaskEditModal from '@/components/schedulo/TaskEditModal';
import AddTaskModal from '@/components/schedulo/AddTaskModal';
import { scheduleTasksEngine, buildBusyMapPublic, findConflict, getLocalDateStr } from '@/lib/schedulerEngine';
import { validateSlot, findAlternativeSlots } from '@/lib/slotValidator';
import { motion } from 'framer-motion';

function parseDate(str) {
  if (!str) return null;
  const s = str.includes('T') ? str : str + 'T00:00:00';
  const d = new Date(s);
  return isNaN(d) ? null : d;
}

export default function PlanGeneration() {
  const { planId } = useParams();
  const navigate = useNavigate();
  const [plan, setPlan] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [courses, setCourses] = useState([]);
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [view, setView] = useState('calendar');
  const [filter, setFilter] = useState('all');
  const [weekOffset, setWeekOffset] = useState(0);
  const [validationSummary, setValidationSummary] = useState(null);
  const [showValidation, setShowValidation] = useState(false);
  const [showAllocationTable, setShowAllocationTable] = useState(false);
  const [showDebugLog, setShowDebugLog] = useState(false);
  const [allocationTable, setAllocationTable] = useState([]);
  const [debugLog, setDebugLog] = useState([]);
  const [repairLog, setRepairLog] = useState([]);
  const [unscheduledTasks, setUnscheduledTasks] = useState([]);
  const [conflicts, setConflicts] = useState([]);
  const [generationError, setGenerationError] = useState(null);
  const [expandedBusyMap, setExpandedBusyMap] = useState({});
  const [tooltip, setTooltip] = useState(null); // {task, x, y}
  const [editingTask, setEditingTask] = useState(null);
  const [addingToDay, setAddingToDay] = useState(null); // { date, startTime }
  const [showBlockedTimes, setShowBlockedTimes] = useState(true);
  const [dragInfo, setDragInfo] = useState(null); // { taskId, offsetMinutes }
  const [dragError, setDragError] = useState(null); // { reason, alternatives, task, duration }
  const calGridRef = useRef(null);

  useEffect(() => { loadData(); }, [planId]);

  const loadData = async () => {
    try {
      const [p, t, c] = await Promise.all([
        base44.entities.StudyPlan.get(planId),
        base44.entities.StudyTask.filter({ plan_id: planId }),
        base44.entities.Course.filter({ plan_id: planId })
      ]);
      setPlan(p);
      setTasks(t);
      setCourses(c);
      if (t.some(task => task.scheduled_date)) {
        setGenerated(true);
        const { busy, rawCount, expandedCount } = buildBusyMapPublic(p.calendar_events || [], c, p.start_date, p.end_date);
        setExpandedBusyMap(busy);
        const foundConflicts = [];
        for (const task of t) {
          if (!task.scheduled_date) continue;
          const conflictingEvent = findConflict(task, busy);
          if (conflictingEvent) foundConflicts.push({ task, eventName: conflictingEvent });
        }
        setConflicts(foundConflicts);
      }
    } catch (e) {
      navigate('/');
    }
  };

  const generatePlan = async () => {
    setGenerating(true);
    setGenerationError(null);
    try {
      const [p, allTasks, allCourses] = await Promise.all([
        base44.entities.StudyPlan.get(planId),
        base44.entities.StudyTask.filter({ plan_id: planId }),
        base44.entities.Course.filter({ plan_id: planId })
      ]);

      const prefs = p.preferences || {};
      const calEvents = p.calendar_events || [];

      // Run rule-based engine
      const result = scheduleTasksEngine(
        allTasks,
        calEvents,
        allCourses,
        prefs,
        p.start_date,
        p.end_date
      );

      const { scheduled, unscheduled, totalSlots, totalFreeMinutes, weeklyStats, weeks, allocationTable: allocTable, debugLog: dbgLog, repairLog: repairLg } = result;
      setAllocationTable(allocTable || []);
      setDebugLog(dbgLog || []);
      setRepairLog(repairLg || []);

      // Save scheduled blocks to DB
      let savedCount = 0;
      for (const block of scheduled) {
        await base44.entities.StudyTask.update(block.task.id, {
          scheduled_date: block.dateStr,
          scheduled_start: block.startTime,
          scheduled_end: block.endTime,
          explanation: block.explanation
        });
        savedCount++;
      }

      // Clear scheduling from tasks that had dates before but weren't re-scheduled
      // (covers re-generation: reset all first, then apply new schedule)
      // We already overwrote matched ones; mark unscheduled ones explicitly
      for (const u of unscheduled) {
        await base44.entities.StudyTask.update(u.task.id, {
          scheduled_date: null,
          scheduled_start: null,
          scheduled_end: null,
          explanation: u.reason
        });
      }

      const updatedTasks = await base44.entities.StudyTask.filter({ plan_id: planId });
      setTasks(updatedTasks);
      setUnscheduledTasks(unscheduled);

      // Conflict detection on generated results — use expanded busy map
      const { busy: builtBusy, rawCount, expandedCount } = buildBusyMapPublic(calEvents, allCourses, p.start_date, p.end_date);
      setExpandedBusyMap(builtBusy);
      const foundConflicts = [];
      for (const t of updatedTasks) {
        if (!t.scheduled_date) continue;
        const conflictingEvent = findConflict(t, builtBusy);
        if (conflictingEvent) {
          foundConflicts.push({ task: t, eventName: conflictingEvent });
        }
      }
      setConflicts(foundConflicts);

      // Validation summary
      const allScheduledDates = updatedTasks.filter(t => t.scheduled_date).map(t => t.scheduled_date).sort();
      const activeCourses = [...new Set(allTasks.map(t => t.course_name || t.course_id).filter(Boolean))];
      setValidationSummary({
        totalTasks: allTasks.length,
        scheduledCount: savedCount,
        unscheduledCount: unscheduled.length,
        totalStudyDays: totalSlots,
        totalFreeHours: Math.round(totalFreeMinutes / 60),
        totalWeeks: weeks ? weeks.length : 0,
        activeCourses,
        firstScheduledDate: allScheduledDates[0] || null,
        lastScheduledDate: allScheduledDates[allScheduledDates.length - 1] || null,
        planEndDate: p.end_date,
        weeklyStats: weeklyStats || [],
        rawFixedEvents: rawCount,
        expandedFixedEvents: expandedCount,
      });

      await base44.entities.StudyPlan.update(planId, {
        scenarios: [{ name: 'Plan 1', created: new Date().toISOString() }],
        step: 8
      });

      setGenerated(true);
    } catch (e) {
      console.error('Plan generation failed:', e);
      setGenerationError(e.message || String(e));
    }
    setGenerating(false);
  };

  const getWeekDates = () => {
    if (!plan?.start_date) return [];
    const start = new Date(plan.start_date + 'T00:00:00');
    start.setDate(start.getDate() + weekOffset * 7);
    const dow = start.getDay();
    const monday = new Date(start);
    monday.setDate(start.getDate() - ((dow + 6) % 7));
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return d;
    });
  };

  const weekDates = getWeekDates();
  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  const scheduledTasks = tasks.filter(t => t.scheduled_date && t.scheduled_start && t.scheduled_end);
  const filteredTasks = filter === 'unscheduled'
    ? tasks.filter(t => !t.scheduled_date)
    : filter === 'scheduled'
    ? scheduledTasks
    : tasks;

  const HOUR_PX = 60;

  // Dynamically compute calendar bounds from tasks & events this week
  const computeCalHours = () => {
    const weekTaskTimes = weekDates.flatMap(d => {
      const ds = getLocalDateStr(d);
      const tTimes = scheduledTasks
        .filter(t => t.scheduled_date === ds)
        .flatMap(t => [t.scheduled_start, t.scheduled_end].filter(Boolean));
      const eTimes = (expandedBusyMap[ds] || []).flatMap(e => [e.start_time, e.end_time].filter(Boolean));
      return [...tTimes, ...eTimes];
    });
    if (weekTaskTimes.length === 0) return { startHour: 7, endHour: 21 };
    const toH = (t) => parseInt(t.substring(0, 2), 10);
    const minH = Math.max(0, Math.min(...weekTaskTimes.map(toH)) - 1);
    const maxH = Math.min(24, Math.max(...weekTaskTimes.map(toH)) + 2);
    return { startHour: minH, endHour: maxH };
  };

  const { startHour: CAL_START_HOUR, endHour: CAL_END_HOUR } = computeCalHours();

  const toTopPx = (timeStr) => {
    if (!timeStr) return 0;
    const [h, m] = timeStr.substring(0, 5).split(':').map(Number);
    return (h - CAL_START_HOUR + m / 60) * HOUR_PX;
  };

  const toDurationPx = (startStr, endStr) => {
    if (!startStr || !endStr) return HOUR_PX;
    const [sh, sm] = startStr.substring(0, 5).split(':').map(Number);
    const [eh, em] = endStr.substring(0, 5).split(':').map(Number);
    const mins = (eh * 60 + em) - (sh * 60 + sm);
    return Math.max(mins / 60 * HOUR_PX, 20);
  };

  // Use local date string to avoid UTC timezone shifting
  const getTasksForDay = (date) => {
    const ds = getLocalDateStr(date);
    return scheduledTasks.filter(t => t.scheduled_date === ds);
  };

  // Read from the expanded busy map — same source as the scheduler
  const getEventsForDay = (date) => {
    const ds = getLocalDateStr(date);
    return expandedBusyMap[ds] || [];
  };

  const weekHasScheduledTasks = weekDates.some(d => {
    return scheduledTasks.some(t => t.scheduled_date === getLocalDateStr(d));
  });

  const [confirming, setConfirming] = useState(false);

  const confirmPlan = async () => {
    setConfirming(true);
    try {
      await base44.entities.StudyPlan.update(planId, { status: 'active', phase: 'active', step: 9 });
      await base44.entities.StudyTask.updateMany(
        { plan_id: planId, status: 'open' },
        { $set: { confirmed: true } }
      );
      navigate(`/plan/${planId}/active`);
    } catch (e) {
      console.error('Confirm failed:', e);
      setConfirming(false);
    }
  };

  // Per-course color palette (Tailwind literal classes)
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
    { bg: 'bg-indigo-100', border: 'border-indigo-400', text: 'text-indigo-900' },
  ];

  const courseColorMap = courses.reduce((acc, c, i) => {
    acc[c.id] = COURSE_COLOR_PALETTE[i % COURSE_COLOR_PALETTE.length];
    // also index by name for tasks that only have course_name
    acc[c.name] = COURSE_COLOR_PALETTE[i % COURSE_COLOR_PALETTE.length];
    return acc;
  }, {});

  const getTaskColor = (task) => {
    return courseColorMap[task.course_id] || courseColorMap[task.course_name] || COURSE_COLOR_PALETTE[0];
  };

  // ── Format task title nicely (remove "[title]" placeholder artifacts) ────
  const formatTaskTitle = (task) => {
    // Remove literal "[title]", "[topic]", "[chapter title]" placeholders from LLM output
    return (task.title || '').replace(/\s*:\s*\[.*?\]/g, '').trim();
  };

  // ── Task edit/add helpers ────────────────────────────────────────────────
  const handleTaskSaved = (updatedTask) => {
    setTasks(prev => prev.map(t => t.id === updatedTask.id ? updatedTask : t));
    setEditingTask(null);
  };

  const handleTaskDeleted = (taskId) => {
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, scheduled_date: null, scheduled_start: null, scheduled_end: null } : t));
    setEditingTask(null);
  };

  const handleTaskAdded = (newTask) => {
    setTasks(prev => [...prev, newTask]);
    setAddingToDay(null);
  };

  // ── Drag-and-drop ────────────────────────────────────────────────────────
  const pxToMinutes = (px) => (px / HOUR_PX) * 60;
  const minutesToTimeStr = (min) => {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
  };

  const handleDragStart = (e, task) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const offsetPx = e.clientY - rect.top;
    const [sh, sm] = (task.scheduled_start || '09:00').split(':').map(Number);
    const taskStartMin = sh * 60 + sm;
    const cursorOffsetMin = Math.round(pxToMinutes(offsetPx) / 15) * 15;
    setDragInfo({ taskId: task.id, offsetMinutes: cursorOffsetMin, taskStartMin });
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('taskId', task.id);
    setTooltip(null);
  };

  const handleDrop = async (e, targetDate) => {
    e.preventDefault();
    if (!dragInfo) return;
    const taskId = e.dataTransfer.getData('taskId');
    const task = tasks.find(t => t.id === taskId);
    if (!task) { setDragInfo(null); return; }

    const gridEl = calGridRef.current;
    if (!gridEl) { setDragInfo(null); return; }
    const gridRect = gridEl.getBoundingClientRect();
    const dropPx = e.clientY - gridRect.top;
    const dropMin = CAL_START_HOUR * 60 + Math.round(pxToMinutes(dropPx) / 15) * 15 - dragInfo.offsetMinutes;
    const [eh, em] = (task.scheduled_end || '10:00').split(':').map(Number);
    const [sh, sm] = (task.scheduled_start || '09:00').split(':').map(Number);
    const duration = (eh * 60 + em) - (sh * 60 + sm);
    const newStart = Math.max(CAL_START_HOUR * 60, Math.min(dropMin, (CAL_END_HOUR - 1) * 60));
    const newEnd = newStart + duration;
    const newDate = getLocalDateStr(targetDate);
    const newStartStr = minutesToTimeStr(newStart);
    const newEndStr = minutesToTimeStr(newEnd);

    // Validate before saving
    const validation = validateSlot({
      newDate, newStart: newStartStr, newEnd: newEndStr, task,
      allTasks: tasks, busyMap: expandedBusyMap, prefs: plan?.preferences || {},
      planStart: plan?.start_date, planEnd: plan?.end_date,
    });

    if (!validation.valid) {
      const alternatives = findAlternativeSlots({
        newDate, duration, task, allTasks: tasks, busyMap: expandedBusyMap,
        prefs: plan?.preferences || {}, planStart: plan?.start_date, planEnd: plan?.end_date,
      });
      setDragError({ reason: validation.reason, alternatives, task, duration });
      setDragInfo(null);
      return;
    }

    const updatedTask = { ...task, scheduled_date: newDate, scheduled_start: newStartStr, scheduled_end: newEndStr };
    setTasks(prev => prev.map(t => t.id === taskId ? updatedTask : t));
    await base44.entities.StudyTask.update(taskId, {
      scheduled_date: newDate, scheduled_start: newStartStr, scheduled_end: newEndStr,
    });
    setDragInfo(null);
  };

  const handleDragOver = (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; };

  const applyAlternativeSlot = async (task, slot) => {
    const updatedTask = { ...task, scheduled_date: slot.date, scheduled_start: slot.start, scheduled_end: slot.end };
    setTasks(prev => prev.map(t => t.id === task.id ? updatedTask : t));
    await base44.entities.StudyTask.update(task.id, {
      scheduled_date: slot.date, scheduled_start: slot.start, scheduled_end: slot.end,
    });
    setDragError(null);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      <PhaseIndicator currentPhase="generation" currentStep={8} planId={planId} />
      <div className="max-w-6xl mx-auto px-4 py-8">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <StepHeader
            icon={Calendar}
            title="Your Study Plan"
            description={generated
              ? "Review and adjust your study plan. Drag and drop tasks, edit times, and delete tasks when needed."
              : "I'll build a context-aware study schedule by placing your tasks into the best available time slots."}
          />
          {generated && !generating && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-4 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-amber-800">This plan was generated automatically. Please review and adjust it — drag tasks to reschedule, click to edit times, or delete tasks you don't need.</p>
            </div>
          )}

          {/* Generation error */}
          {generationError && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4 flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold text-red-800">Generation failed</p>
                <p className="text-xs text-red-600 mt-0.5">{generationError}</p>
              </div>
            </div>
          )}

          {/* Generate / Loading state */}
          {!generated && (
            <div className="bg-white rounded-xl border border-blue-100 p-8 shadow-sm text-center mb-6">
              {generating ? (
                <div className="space-y-3">
                  <Loader2 className="w-10 h-10 animate-spin text-blue-500 mx-auto" />
                  <p className="text-gray-600 font-medium">Analyzing your calendar and scheduling tasks...</p>
                  <p className="text-sm text-gray-400">Detecting free slots, connecting tasks to lectures and exercises.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <Calendar className="w-10 h-10 text-blue-400 mx-auto" />
                  <p className="text-gray-600">Ready to generate your context-aware study plan.</p>
                  <p className="text-sm text-gray-400">{tasks.length} tasks will be placed into your real calendar slots.</p>
                  <Button onClick={generatePlan} className="bg-blue-600 hover:bg-blue-700">
                    Generate study plan
                  </Button>
                </div>
              )}
            </div>
          )}

          {generating && generated && (
            <div className="bg-blue-50 rounded-xl p-4 mb-4 flex items-center gap-3">
              <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
              <span className="text-sm text-blue-700">Re-generating your study plan...</span>
            </div>
          )}

          {generated && !generating && (
            <>
              {/* Conflict warnings */}
              {conflicts.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-red-800">{conflicts.length} scheduling conflict{conflicts.length > 1 ? 's' : ''} detected</p>
                      <ul className="mt-2 space-y-1">
                        {conflicts.map((c, i) => (
                          <li key={i} className="text-xs text-red-700">
                            <span className="font-medium">"{c.task.title}"</span> overlaps with <span className="font-medium">"{c.eventName}"</span> on {c.task.scheduled_date} {c.task.scheduled_start}–{c.task.scheduled_end}
                          </li>
                        ))}
                      </ul>
                      <p className="text-xs text-red-600 mt-2">Re-generate to resolve conflicts.</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Drag/edit conflict warning */}
              {dragError && (
                <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 mb-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2 min-w-0">
                      <AlertCircle className="w-5 h-5 text-orange-500 mt-0.5 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-orange-800">Move not possible</p>
                        <p className="text-xs text-orange-700 mt-0.5">{dragError.reason}</p>
                        {dragError.alternatives?.length > 0 && (
                          <div className="mt-2">
                            <p className="text-xs font-medium text-orange-800 mb-1">Available alternatives:</p>
                            <div className="flex flex-wrap gap-2">
                              {dragError.alternatives.map((slot, i) => (
                                <button
                                  key={i}
                                  onClick={() => applyAlternativeSlot(dragError.task, slot)}
                                  className="text-xs bg-white border border-orange-300 hover:bg-orange-100 text-orange-800 rounded-lg px-3 py-1.5 transition-colors"
                                >
                                  {slot.date} · {slot.start}–{slot.end}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                        {dragError.alternatives?.length === 0 && (
                          <p className="text-xs text-orange-600 mt-1">No free alternative slots found nearby. Try adjusting your study preferences or extending the study period.</p>
                        )}
                      </div>
                    </div>
                    <button onClick={() => setDragError(null)} className="flex-shrink-0 text-orange-400 hover:text-orange-600 text-lg leading-none">×</button>
                  </div>
                </div>
              )}

              {/* Validation summary */}
              {validationSummary && (
                <div className="mb-4">
                  <button
                    onClick={() => setShowValidation(v => !v)}
                    className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600"
                  >
                    <Info className="w-3.5 h-3.5" />
                    Plan validation summary
                    {showValidation ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  </button>
                  {showValidation && (
                    <div className="mt-2 space-y-3">
                      {/* Overview stats */}
                      <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-xs text-gray-600 grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div><p className="font-semibold text-gray-800">{validationSummary.activeCourses.length}</p><p>Active courses</p></div>
                        <div><p className="font-semibold text-gray-800">{validationSummary.totalWeeks}</p><p>Study weeks</p></div>
                        <div><p className="font-semibold text-gray-800">{validationSummary.scheduledCount}/{validationSummary.totalTasks}</p><p>Tasks scheduled</p></div>
                        <div><p className="font-semibold text-gray-800">{validationSummary.totalFreeHours}h</p><p>Total free time</p></div>
                        <div><p className="font-semibold text-gray-800 text-xs">{validationSummary.firstScheduledDate || '—'}</p><p>First task date</p></div>
                        <div><p className="font-semibold text-gray-800 text-xs">{validationSummary.lastScheduledDate || '—'}</p><p>Last task date</p></div>
                        <div><p className="font-semibold text-gray-800 text-xs">{validationSummary.planEndDate}</p><p>Study period ends</p></div>
                        <div>
                          <p className="font-semibold text-gray-800">{validationSummary.rawFixedEvents ?? 0} → {validationSummary.expandedFixedEvents ?? 0}</p>
                          <p>Fixed events (raw → expanded)</p>
                        </div>
                        <div>
                          <p className="font-semibold text-gray-800">{weekDates.reduce((sum, d) => sum + (expandedBusyMap[getLocalDateStr(d)] || []).length, 0)}</p>
                          <p>Fixed events this week</p>
                        </div>
                      </div>
                      {/* Fixed event expansion warning */}
                      {(validationSummary.rawFixedEvents ?? 0) > 0 && (validationSummary.expandedFixedEvents ?? 0) === 0 && (
                        <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-800">
                          ⚠ Fixed calendar events could not be expanded. Please check recurrence and date fields.
                        </div>
                      )}
                      {/* Late end warning */}
                      {validationSummary.lastScheduledDate && validationSummary.planEndDate &&
                        validationSummary.lastScheduledDate < validationSummary.planEndDate &&
                        (() => {
                          const lastD = parseDate(validationSummary.lastScheduledDate);
                          const endD = parseDate(validationSummary.planEndDate);
                          const diffDays = Math.round((endD - lastD) / 86400000);
                          return diffDays > 14 ? (
                            <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2 text-xs text-yellow-800">
                              ⚠ The generated plan ends {diffDays} days before your study period ends. Tasks may need to be distributed further across the semester.
                            </div>
                          ) : null;
                        })()
                      }
                      {/* Weekly breakdown */}
                      {validationSummary.weeklyStats.filter(w => w.totalScheduled > 0 || w.missingCourses.length > 0).map((w, i) => (
                        <div key={i} className="bg-gray-50 border border-gray-100 rounded-lg px-3 py-2 text-xs">
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-semibold text-gray-700">{w.weekLabel} <span className="font-normal text-gray-400">({w.startStr} – {w.endStr})</span></span>
                            <span className="text-gray-500">{w.totalScheduled} task{w.totalScheduled !== 1 ? 's' : ''}</span>
                          </div>
                          {Object.entries(w.tasksByCourse).length > 0 && (
                            <div className="flex flex-wrap gap-1 mb-1">
                              {Object.entries(w.tasksByCourse).map(([course, count]) => (
                                <span key={course} className="bg-blue-50 text-blue-700 border border-blue-100 rounded px-1.5 py-0.5">{course}: {count}</span>
                              ))}
                            </div>
                          )}
                          {w.missingCourses.length > 0 && (
                            <p className="text-amber-600">⚠ No slot for: {w.missingCourses.join(', ')}</p>
                          )}
                          {w.overloadedCourses.length > 0 && w.overloadedCourses.map(oc => (
                            <p key={oc.name} className="text-orange-600">⚠ {oc.name} dominates this week ({oc.pct}% of tasks)</p>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Allocation table */}
              {allocationTable.length > 0 && (
                <div className="mb-4">
                  <button onClick={() => setShowAllocationTable(v => !v)} className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600">
                    <Info className="w-3.5 h-3.5" />
                    Weekly allocation table (pre-scheduling)
                    {showAllocationTable ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  </button>
                  {showAllocationTable && (
                    <div className="mt-2 space-y-2 max-h-96 overflow-y-auto">
                      {allocationTable.filter(w => w.entries.length > 0).map((w, i) => (
                        <div key={i} className="bg-gray-50 border border-gray-100 rounded-lg px-3 py-2 text-xs">
                          <p className="font-semibold text-gray-700 mb-1">{w.weekLabel} <span className="font-normal text-gray-400">({w.startStr} – {w.endStr})</span></p>
                          <div className="space-y-1">
                            {w.entries.map((e, j) => (
                              <div key={j} className="flex flex-wrap gap-x-3 gap-y-0.5 items-baseline">
                                <span className="font-medium text-gray-800">{e.course}:</span>
                                <span className="text-gray-600">{e.title}</span>
                                <span className="text-gray-400">[{e.taskType}]</span>
                                {e.deadline && <span className="text-red-500">due {e.deadline}</span>}
                                {e.latestAllowedDate && <span className="text-orange-500">latest {e.latestAllowedDate}</span>}
                                {e.notBefore && <span className="text-blue-400">not before {e.notBefore}</span>}
                                <span className="text-gray-400 italic">{e.reason}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Debug log */}
              {debugLog.length > 0 && (
                <div className="mb-4">
                  <button onClick={() => setShowDebugLog(v => !v)} className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600">
                    <Info className="w-3.5 h-3.5" />
                    Debug: per-task scheduling decisions
                    {showDebugLog ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  </button>
                  {showDebugLog && (
                    <div className="mt-2 max-h-80 overflow-y-auto">
                      {repairLog.length > 0 && (
                        <div className="mb-2 bg-purple-50 border border-purple-100 rounded-lg px-3 py-2 text-xs text-purple-700 space-y-0.5">
                          <p className="font-semibold">Repair actions:</p>
                          {repairLog.map((r, i) => <p key={i}>{r}</p>)}
                        </div>
                      )}
                      <table className="w-full text-xs border-collapse">
                        <thead>
                          <tr className="bg-gray-100 text-gray-600">
                            <th className="text-left px-2 py-1">Course</th>
                            <th className="text-left px-2 py-1">Task</th>
                            <th className="text-left px-2 py-1">Preferred Wk</th>
                            <th className="text-left px-2 py-1">Assigned Wk</th>
                            <th className="text-left px-2 py-1">Scheduled Date</th>
                            <th className="text-left px-2 py-1">Flags</th>
                          </tr>
                        </thead>
                        <tbody>
                          {debugLog.map((d, i) => (
                            <tr key={i} className={`border-t border-gray-100 ${d.scheduledTooLate ? 'bg-red-50' : d.scheduledBeforeNotBefore ? 'bg-yellow-50' : ''}`}>
                              <td className="px-2 py-1 text-gray-600 truncate max-w-[80px]">{d.course}</td>
                              <td className="px-2 py-1 text-gray-800 truncate max-w-[120px]" title={d.title}>{d.title}</td>
                              <td className="px-2 py-1 text-center">{d.preferredWeek}</td>
                              <td className="px-2 py-1 text-center">{d.assignedWeek}</td>
                              <td className="px-2 py-1">{d.scheduledDate || <span className="text-amber-500">—</span>}</td>
                              <td className="px-2 py-1">
                                {d.scheduledTooLate && <span className="text-red-600 font-semibold">LATE </span>}
                                {d.scheduledBeforeNotBefore && <span className="text-yellow-600 font-semibold">EARLY </span>}
                                {!d.scheduledDate && <span className="text-amber-500">UNSCHED </span>}
                                {d.movedFromTarget > 1 && <span className="text-blue-500">+{d.movedFromTarget}wk </span>}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* Toolbar */}
              <div className="flex flex-wrap gap-2 items-center justify-between mb-4">
                <div className="flex gap-2">
                  <Button variant={view === 'calendar' ? 'default' : 'outline'} size="sm" onClick={() => setView('calendar')}>
                    <Calendar className="w-4 h-4 mr-1" /> Calendar
                  </Button>
                  <Button variant={view === 'list' ? 'default' : 'outline'} size="sm" onClick={() => setView('list')}>
                    <List className="w-4 h-4 mr-1" /> Task List
                  </Button>
                </div>
                <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer select-none">
                  <input type="checkbox" checked={showBlockedTimes} onChange={e => setShowBlockedTimes(e.target.checked)} className="w-3.5 h-3.5 accent-blue-600" />
                  Show blocked times
                </label>
                <Select value={filter} onValueChange={setFilter}>
                  <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All tasks</SelectItem>
                    <SelectItem value="scheduled">Scheduled only</SelectItem>
                    <SelectItem value="unscheduled">Unscheduled only</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Calendar view */}
              {view === 'calendar' && (
                <>
                  <div className="flex items-center justify-between mb-3">
                    <Button variant="ghost" size="sm" onClick={() => setWeekOffset(w => w - 1)}>← Previous</Button>
                    <span className="text-sm font-medium text-gray-600">
                      {weekDates[0]?.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – {weekDates[6]?.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                    <Button variant="ghost" size="sm" onClick={() => setWeekOffset(w => w + 1)}>Next →</Button>
                  </div>

                  {!weekHasScheduledTasks && (
                    <div className="text-center py-6 text-sm text-gray-400 bg-white rounded-xl border border-blue-50 mb-4">
                      No tasks scheduled for this week. Use the arrows to navigate to weeks with tasks.
                    </div>
                  )}

                  <div className="bg-white rounded-xl border border-blue-100 shadow-sm overflow-hidden mb-6">
                    {/* Day headers */}
                    <div className="grid border-b border-gray-100" style={{ gridTemplateColumns: '48px repeat(7, 1fr)' }}>
                      <div className="p-2" />
                      {weekDates.map((d, i) => (
                        <div key={i} className={`p-2 text-center border-l border-gray-100 group relative ${d.toDateString() === PLANNING_REFERENCE_DATE.toDateString() ? 'bg-blue-50' : ''}`}>
                          <p className="text-xs text-gray-400">{dayNames[i]}</p>
                          <p className={`text-sm font-semibold ${d.toDateString() === PLANNING_REFERENCE_DATE.toDateString() ? 'text-blue-600' : 'text-gray-700'}`}>{d.getDate()}</p>
                          <button
                            onClick={() => setAddingToDay({ date: getLocalDateStr(d), startTime: '09:00' })}
                            className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity w-5 h-5 rounded-full bg-blue-100 hover:bg-blue-200 text-blue-600 flex items-center justify-center"
                            title="Add task to this day"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                    {/* Time grid */}
                    <div className="max-h-[580px] overflow-y-auto">
                      <div
                        ref={calGridRef}
                        className="relative grid"
                        style={{ gridTemplateColumns: '48px repeat(7, 1fr)', height: `${(CAL_END_HOUR - CAL_START_HOUR) * HOUR_PX}px` }}
                      >
                        {/* Hour lines + labels */}
                        {Array.from({ length: CAL_END_HOUR - CAL_START_HOUR }, (_, i) => CAL_START_HOUR + i).map(hour => (
                          <React.Fragment key={hour}>
                            <div
                              className="absolute text-xs text-gray-400 text-right pr-2 leading-none"
                              style={{ top: `${(hour - CAL_START_HOUR) * HOUR_PX}px`, left: 0, width: 44 }}
                            >
                              {hour}:00
                            </div>
                            <div
                              className="absolute border-t border-gray-100 pointer-events-none"
                              style={{ top: `${(hour - CAL_START_HOUR) * HOUR_PX}px`, left: 48, right: 0 }}
                            />
                          </React.Fragment>
                        ))}
                        {/* Day columns */}
                        {weekDates.map((d, colIdx) => {
                          const dayTasks = getTasksForDay(d);
                          const dayEvents = getEventsForDay(d);
                          const colLeft = `calc(48px + ${colIdx} * ((100% - 48px) / 7))`;
                          const colWidth = 'calc((100% - 48px) / 7)';
                          const dateStr = getLocalDateStr(d);
                          return (
                            <React.Fragment key={colIdx}>
                              {/* Drop zone for this column */}
                              <div
                                className="absolute top-0 bottom-0 border-l border-gray-100"
                                style={{ left: colLeft, width: colWidth }}
                                onDragOver={handleDragOver}
                                onDrop={e => handleDrop(e, d)}
                              />
                              {/* Calendar events (fixed commitments) */}
                              {showBlockedTimes && dayEvents.map((ev, j) => {
                                const top = toTopPx(ev.start_time);
                                const height = toDurationPx(ev.start_time, ev.end_time);
                                return (
                                  <div
                                    key={`ev-${j}`}
                                    className="absolute z-10 bg-gray-100 border border-gray-300 rounded text-gray-600 overflow-hidden pointer-events-none"
                                    style={{ top, height, left: colLeft, width: colWidth, padding: '2px 4px' }}
                                  >
                                    <p className="text-xs font-medium leading-tight truncate">{ev.name}</p>
                                    <p className="text-xs opacity-70 leading-tight">{ev.start_time}–{ev.end_time}</p>
                                  </div>
                                );
                              })}
                              {/* Study tasks — draggable */}
                              {dayTasks.map((task, j) => {
                                const top = toTopPx(task.scheduled_start);
                                const height = toDurationPx(task.scheduled_start, task.scheduled_end);
                                const color = getTaskColor(task);
                                const hasConflict = conflicts.some(c => c.task.id === task.id);
                                return (
                                  <div
                                    key={`t-${j}`}
                                    draggable
                                    onDragStart={e => handleDragStart(e, task)}
                                    className={`absolute z-20 rounded border overflow-hidden cursor-grab active:cursor-grabbing select-none ${hasConflict ? 'border-red-500 ring-1 ring-red-400' : `${color.bg} ${color.border}`} ${color.text}`}
                                    style={{ top, height, left: colLeft, width: colWidth, padding: '3px 5px', backgroundColor: hasConflict ? '#fee2e2' : undefined }}
                                    onClick={() => setEditingTask(task)}
                                  >
                                    {hasConflict && <span className="absolute top-0.5 right-0.5 text-red-500 text-xs">⚠</span>}
                                    <p className="text-xs font-semibold leading-tight truncate">{task.course_name}</p>
                                    <p className="text-xs leading-tight truncate opacity-80">{formatTaskTitle(task)}</p>
                                  </div>
                                );
                              })}
                            </React.Fragment>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* List view */}
              {view === 'list' && (
                <div className="space-y-2 mb-6">
                  {filteredTasks
                    .sort((a, b) => (a.scheduled_date || 'zzz').localeCompare(b.scheduled_date || 'zzz'))
                    .map(task => (
                      <div key={task.id} className={`bg-white rounded-xl border px-4 py-3 shadow-sm flex items-center justify-between gap-3 ${!task.scheduled_date ? 'border-amber-200 opacity-70' : 'border-blue-100'}`}>
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="min-w-0">
                            <span className="font-semibold text-gray-900 block truncate">{formatTaskTitle(task)}</span>
                            <span className="text-xs text-gray-400">{task.course_name}</span>
                          </div>
                          <span className={`flex-shrink-0 px-2 py-0.5 rounded-full text-xs font-medium border ${getTaskColor(task).bg} ${getTaskColor(task).border} ${getTaskColor(task).text}`}>
                            {task.task_type?.replace('_', ' ')}
                          </span>
                        </div>
                        <div className="flex-shrink-0 text-right">
                          {task.scheduled_date ? (
                            <span className="text-sm text-gray-500 whitespace-nowrap">
                              {task.scheduled_date} · {task.scheduled_start}–{task.scheduled_end}
                            </span>
                          ) : (
                            <span className="text-xs text-amber-500 flex items-center gap-1">
                              <AlertCircle className="w-3.5 h-3.5" /> Unscheduled
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  {filteredTasks.length === 0 && (
                    <p className="text-center text-gray-400 text-sm py-8">No tasks match this filter.</p>
                  )}
                </div>
              )}

              {/* Unscheduled tasks section */}
              {unscheduledTasks.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
                  <div className="flex items-start gap-2 mb-3">
                    <AlertCircle className="w-5 h-5 text-amber-500 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-amber-800">{unscheduledTasks.length} task{unscheduledTasks.length > 1 ? 's' : ''} could not be scheduled</p>
                      <p className="text-xs text-amber-600 mt-0.5">Suggestions: increase max daily hours, add more study days, extend the study period, or reduce break duration.</p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {unscheduledTasks.map((u, i) => (
                      <div key={i} className="bg-white border border-amber-200 rounded-lg px-3 py-2.5 flex flex-wrap gap-x-4 gap-y-1 items-start">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-gray-900 truncate">{u.task.title}</p>
                          <p className="text-xs text-gray-500">{u.task.course_name}</p>
                        </div>
                        <div className="flex flex-wrap gap-2 text-xs shrink-0">
                          <span className="text-gray-500">{u.task.estimated_hours}h est.</span>
                          {u.task.deadline && <span className="text-amber-700">Due {u.task.deadline}</span>}
                          <span className={`font-medium ${u.task.priority === 'high' ? 'text-red-600' : u.task.priority === 'low' ? 'text-gray-400' : 'text-amber-600'}`}>{u.task.priority} priority</span>
                        </div>
                        <p className="w-full text-xs text-amber-700 mt-0.5">⚠ {u.reason}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex flex-wrap justify-between items-center gap-3">
                <div className="flex gap-2">
                  <Button variant="ghost" onClick={() => navigate(`/plan/${planId}/feasibility`)}>
                    <ArrowLeft className="w-4 h-4 mr-1" /> Back
                  </Button>
                  <Button variant="outline" size="sm" onClick={generatePlan} disabled={generating}>
                    <RotateCcw className="w-4 h-4 mr-1" /> Re-generate
                  </Button>
                </div>
                <Button onClick={confirmPlan} className="bg-emerald-600 hover:bg-emerald-700" disabled={scheduledTasks.length === 0 || confirming}>
                  {confirming ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-1" />}
                  {confirming ? 'Activating...' : 'Confirm and activate plan'}
                </Button>
              </div>
            </>
          )}
        </motion.div>
      </div>

      {/* Edit task modal */}
      {editingTask && (
        <TaskEditModal
          task={editingTask}
          onClose={() => setEditingTask(null)}
          onSaved={handleTaskSaved}
          onDeleted={handleTaskDeleted}
          validateSlotFn={(date, start, end) => validateSlot({
            newDate: date, newStart: start, newEnd: end, task: editingTask,
            allTasks: tasks, busyMap: expandedBusyMap, prefs: plan?.preferences || {},
            planStart: plan?.start_date, planEnd: plan?.end_date,
          })}
          findSlotsFn={(date, duration) => findAlternativeSlots({
            newDate: date, duration, task: editingTask, allTasks: tasks,
            busyMap: expandedBusyMap, prefs: plan?.preferences || {},
            planStart: plan?.start_date, planEnd: plan?.end_date,
          })}
        />
      )}

      {/* Add task modal */}
      {addingToDay && (
        <AddTaskModal
          planId={planId}
          courses={courses}
          defaultDate={addingToDay.date}
          defaultStart={addingToDay.startTime}
          onClose={() => setAddingToDay(null)}
          onSaved={handleTaskAdded}
        />
      )}

      {/* Task tooltip */}
      {tooltip && (
        <div
          className="fixed z-50 bg-white border border-gray-200 rounded-xl shadow-xl p-4 w-72 pointer-events-none"
          style={{ top: Math.min(tooltip.y + 12, window.innerHeight - 280), left: Math.min(tooltip.x + 12, window.innerWidth - 300) }}
        >
          <p className="font-semibold text-gray-900 text-sm mb-1">{formatTaskTitle(tooltip.task)}</p>
          <div className="space-y-0.5 text-xs text-gray-600">
            <p><span className="font-medium text-gray-700">Course:</span> {tooltip.task.course_name}</p>
            <p><span className="font-medium text-gray-700">Date:</span> {tooltip.task.scheduled_date}</p>
            <p><span className="font-medium text-gray-700">Time:</span> {tooltip.task.scheduled_start}–{tooltip.task.scheduled_end}</p>
            <p><span className="font-medium text-gray-700">Estimated:</span> {tooltip.task.estimated_hours}h</p>
            {tooltip.task.deadline && <p><span className="font-medium text-gray-700">Deadline:</span> {tooltip.task.deadline}</p>}
            {tooltip.task.explanation && <p className="mt-1 text-gray-500 italic">{tooltip.task.explanation}</p>}
          </div>
        </div>
      )}

      <ContextChat phase="plan" planId={planId} suggestions={[
        "Why is this task scheduled here?",
        "How can I free up more study time?",
        "What if I have too many unscheduled tasks?"
      ]} />
    </div>
  );
}