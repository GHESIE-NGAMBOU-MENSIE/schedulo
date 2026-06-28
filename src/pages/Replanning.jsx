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
import { validateSlot, findAlternativeSlots } from '@/lib/slotValidator';
import { PLANNING_REFERENCE_DATE } from '@/lib/planningDate';

const HOUR_PX = 52;
const CAL_START_HOUR = 7;
const CAL_END_HOUR = 21;
const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// ── MiniCalendar ────────────────────────────────────────────────────────────
function MiniCalendar({ tasks, expandedBusyMap, showBlockedTimes, weekOffset, setWeekOffset, pendingChanges }) {
  const getWeekDates = () => {
    const now = new Date(PLANNING_REFERENCE_DATE);
    now.setDate(now.getDate() + weekOffset * 7);
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return d;
    });
  };

  const weekDates = getWeekDates();

  const toTopPx = (t) => {
    if (!t) return 0;
    const [h, m] = t.substring(0, 5).split(':').map(Number);
    return (h - CAL_START_HOUR + m / 60) * HOUR_PX;
  };
  const toDurPx = (s, e) => {
    if (!s || !e) return HOUR_PX;
    const [sh, sm] = s.substring(0, 5).split(':').map(Number);
    const [eh, em] = e.substring(0, 5).split(':').map(Number);
    return Math.max(((eh * 60 + em) - (sh * 60 + sm)) / 60 * HOUR_PX, 18);
  };

  const typeColors = {
    reading: 'bg-blue-100 border-blue-300 text-blue-800',
    assignment: 'bg-purple-100 border-purple-300 text-purple-800',
    exercise: 'bg-green-100 border-green-300 text-green-800',
    revision: 'bg-amber-100 border-amber-300 text-amber-800',
    test: 'bg-red-100 border-red-300 text-red-800',
    project_work: 'bg-indigo-100 border-indigo-300 text-indigo-800',
  };

  // Merge pending changes preview into tasks
  const previewTasks = tasks.map(t => {
    const change = pendingChanges?.updates?.find(u => u.task_id === t.id);
    if (change) return { ...t, ...change, _isPending: true };
    if (pendingChanges?.removals?.includes(t.id)) return { ...t, _isRemoved: true };
    return t;
  });

  return (
    <div className="bg-white rounded-xl border border-blue-100 shadow-sm overflow-hidden flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 bg-gray-50">
        <button onClick={() => setWeekOffset(w => w - 1)} className="p-1 hover:bg-gray-200 rounded"><ChevronLeft className="w-4 h-4 text-gray-500" /></button>
        <span className="text-xs font-medium text-gray-600">
          {weekDates[0]?.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – {weekDates[6]?.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        </span>
        <button onClick={() => setWeekOffset(w => w + 1)} className="p-1 hover:bg-gray-200 rounded"><ChevronRight className="w-4 h-4 text-gray-500" /></button>
      </div>
      {/* Day headers */}
      <div className="grid border-b border-gray-100" style={{ gridTemplateColumns: '36px repeat(7, 1fr)' }}>
        <div />
        {weekDates.map((d, i) => (
          <div key={i} className={`py-1 text-center border-l border-gray-100 ${d.toDateString() === PLANNING_REFERENCE_DATE.toDateString() ? 'bg-blue-50' : ''}`}>
            <p className="text-[10px] text-gray-400">{dayNames[i]}</p>
            <p className={`text-xs font-semibold ${d.toDateString() === PLANNING_REFERENCE_DATE.toDateString() ? 'text-blue-600' : 'text-gray-700'}`}>{d.getDate()}</p>
          </div>
        ))}
      </div>
      {/* Time grid */}
      <div className="overflow-y-auto flex-1">
        <div className="relative grid" style={{ gridTemplateColumns: '36px repeat(7, 1fr)', height: `${(CAL_END_HOUR - CAL_START_HOUR) * HOUR_PX}px` }}>
          {Array.from({ length: CAL_END_HOUR - CAL_START_HOUR }, (_, i) => CAL_START_HOUR + i).map(hour => (
            <React.Fragment key={hour}>
              <div className="absolute text-[10px] text-gray-400 text-right pr-1 leading-none" style={{ top: `${(hour - CAL_START_HOUR) * HOUR_PX}px`, left: 0, width: 34 }}>{hour}:00</div>
              <div className="absolute border-t border-gray-100 pointer-events-none" style={{ top: `${(hour - CAL_START_HOUR) * HOUR_PX}px`, left: 36, right: 0 }} />
            </React.Fragment>
          ))}
          {weekDates.map((d, colIdx) => {
            const ds = getLocalDateStr(d);
            const dayTasks = previewTasks.filter(t => t.scheduled_date === ds && t.scheduled_start && t.scheduled_end && !t._isRemoved);
            const dayEvents = expandedBusyMap[ds] || [];
            const colLeft = `calc(36px + ${colIdx} * ((100% - 36px) / 7))`;
            const colWidth = 'calc((100% - 36px) / 7)';
            return (
              <React.Fragment key={colIdx}>
                <div className="absolute top-0 bottom-0 border-l border-gray-100" style={{ left: colLeft }} />
                {showBlockedTimes && dayEvents.map((ev, j) => (
                  <div key={`ev-${j}`} className="absolute z-10 bg-gray-100 border border-gray-300 rounded overflow-hidden pointer-events-none"
                    style={{ top: toTopPx(ev.start_time), height: toDurPx(ev.start_time, ev.end_time), left: colLeft, width: colWidth, padding: '1px 3px' }}>
                    <p className="text-[10px] font-medium leading-tight truncate text-gray-600">{ev.name}</p>
                  </div>
                ))}
                {dayTasks.map((task, j) => (
                  <div key={`t-${j}`}
                    className={`absolute z-20 rounded border overflow-hidden transition-all ${
                      task._isPending
                        ? 'border-orange-400 bg-orange-50 text-orange-900 ring-1 ring-orange-300'
                        : task.status === 'completed'
                          ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                          : typeColors[task.task_type] || 'bg-gray-100 border-gray-200 text-gray-700'
                    }`}
                    style={{ top: toTopPx(task.scheduled_start), height: toDurPx(task.scheduled_start, task.scheduled_end), left: colLeft, width: colWidth, padding: '2px 3px' }}>
                    {task._isPending && <span className="text-[9px] font-bold text-orange-600 block leading-none">→ moved</span>}
                    <p className="text-[10px] font-semibold leading-tight truncate">{task.status === 'completed' ? '✓ ' : ''}{task.course_name}</p>
                    <p className="text-[10px] leading-tight truncate opacity-80">{task.title}</p>
                  </div>
                ))}
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function getWeekStartFromOffset(offset) {
  const ref = new Date(PLANNING_REFERENCE_DATE);
  ref.setDate(ref.getDate() + offset * 7);
  const monday = new Date(ref);
  monday.setDate(ref.getDate() - ((ref.getDay() + 6) % 7));
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
    { role: 'assistant', content: "Hi! 👋 I'm here to help you update your study plan. Tell me what changed — for example:\n\n- \"I can't study on Thursday anymore.\"\n- \"The statistics deadline moved to the 20th.\"\n- \"I didn't finish this week's tasks.\"\n- \"I need more time for this assignment.\"\n\nWhat would you like to change?" }
  ]);
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
        base44.entities.Course.filter({ plan_id: planId }),
      ]);
      setPlan(p);
      setTasks(t);
      setCourses(c);
      const { busy } = buildBusyMapPublic(p.calendar_events || [], c, p.start_date, p.end_date);
      setExpandedBusyMap(busy);

      // If no week param, jump to first week with tasks
      if (!searchParams.get('week')) {
        const scheduledDates = t.filter(x => x.scheduled_date).map(x => x.scheduled_date).sort();
        if (scheduledDates.length) {
          const firstDate = new Date(scheduledDates[0] + 'T00:00:00');
          const ref = new Date(PLANNING_REFERENCE_DATE);
          const refM = new Date(ref); refM.setDate(ref.getDate() - ((ref.getDay() + 6) % 7));
          const firstM = new Date(firstDate); firstM.setDate(firstDate.getDate() - ((firstDate.getDay() + 6) % 7));
          setWeekOffset(Math.round((firstM - refM) / (7 * 86400000)));
        }
      }
    };
    load();
  }, [planId]);

  useEffect(() => {
    if (endRef.current) endRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [messages, clarification, proposal]);

  // ── Visible week context ──────────────────────────────────────────────────
  const visibleWeekDates = getWeekDatesFromOffset(weekOffset);
  const visibleWeekStart = visibleWeekDates[0];
  const visibleWeekEnd = visibleWeekDates[6];
  const visibleWeekLabel = `${formatDate(visibleWeekStart)} – ${formatDate(visibleWeekEnd)}`;

  // ── Send message to AI ────────────────────────────────────────────────────
  const sendMessage = async (text, extraContext = '') => {
    if (!text.trim()) return;
    setMessages(prev => [...prev, { role: 'user', content: text }]);
    setInput('');
    setClarification(null);
    setLoading(true);

    try {
      const prefs = plan?.preferences || {};
      const taskSummary = tasks.map(t =>
        `- ID:${t.id} | "${t.title}" (${t.course_name}) | type:${t.task_type} | status:${t.status} | scheduled:${t.scheduled_date} ${t.scheduled_start}-${t.scheduled_end} | est:${t.estimated_hours}h | deadline:${t.deadline || 'none'} | priority:${t.priority} | manually_moved:${t.manually_moved ? 'yes' : 'no'}`
      ).join('\n');

      const history = messages.slice(-6).map(m => `${m.role}: ${m.content}`).join('\n');

      const prompt = `You are Schedulo, an AI study planning assistant helping a student with an ACTIVE study plan.

RULES — CRITICAL:
1. SURGICAL changes only. Never reschedule unaffected tasks.
2. Completed tasks MUST NOT be moved.
3. Manually moved tasks (manually_moved=yes) should only move if they now conflict with a blocked time or deadline violation.
4. Only move tasks that directly conflict with the student's change.
5. When the student mentions a weekday without a date, resolve it using the CURRENTLY VISIBLE WEEK (shown below).
6. Before applying any ambiguous change, output a clarification question in JSON.
7. Output your reasoning in JSON so the system can show a diff and confirm before saving.

CURRENTLY VISIBLE CALENDAR WEEK: ${visibleWeekLabel}
(When student says "Monday" → they mean Monday ${getLocalDateStr(visibleWeekDates[0])})
(When student says "this week" → ${getLocalDateStr(visibleWeekDates[0])} to ${getLocalDateStr(visibleWeekDates[6])})
(When student says "next week" → ${getLocalDateStr(new Date(visibleWeekDates[0].getTime() + 7*86400000))} to ${getLocalDateStr(new Date(visibleWeekDates[6].getTime() + 7*86400000))})

STUDY PREFERENCES:
Study days: ${(prefs.preferred_days || []).join(', ')}
Max hours/day: ${prefs.max_hours || 6}
Study window: ${prefs.preferred_start || '09:00'} – ${prefs.preferred_end || '21:00'}
Study period: ${plan?.start_date} to ${plan?.end_date}

CURRENT TASKS (${tasks.length} total):
${taskSummary}

CONVERSATION HISTORY:
${history}

${extraContext ? `ADDITIONAL CONTEXT: ${extraContext}\n` : ''}
STUDENT MESSAGE: "${text}"

RESPONSE FORMAT — return ONLY valid JSON with one of these structures:

Option A — Clarification needed (ambiguous weekday/scope):
{
  "type": "clarification",
  "question": "Do you mean [specific date] or [broader scope]?",
  "options": [
    { "label": "Yes, just [specific date]", "context": "Scope: single day ${getLocalDateStr(visibleWeekDates[0])}" },
    { "label": "Every [weekday] from now on", "context": "Scope: recurring from this week" },
    { "label": "Cancel", "context": "cancel" }
  ]
}

Option B — Proposal ready:
{
  "type": "proposal",
  "understanding": "I understood: [what you think they mean with specific dates]",
  "explanation": "[Friendly explanation of what will change and why]",
  "updates": [
    { "task_id": "[id]", "scheduled_date": "YYYY-MM-DD", "scheduled_start": "HH:MM", "scheduled_end": "HH:MM", "reason": "why this task moves" }
  ],
  "removals": [],
  "affected_count": 0,
  "unchanged_count": 0
}

Option C — No change needed:
{
  "type": "no_change",
  "message": "[Friendly explanation of why no changes are needed]"
}

IMPORTANT: For "updates", only include tasks that MUST move. Leave all others unchanged. If a task is completed, never include it in updates.`;

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
            message: { type: 'string' }
          }
        }
      });

      if (result.type === 'clarification') {
        setMessages(prev => [...prev, { role: 'assistant', content: result.question }]);
        setClarification({ question: result.question, options: result.options || [], originalText: text });
      } else if (result.type === 'proposal') {
        // Validate each proposed move against constraints before showing
        const prefs = plan?.preferences || {};
        const conflicts = [];
        for (const u of (result.updates || [])) {
          const task = tasks.find(t => t.id === u.task_id);
          if (!task) continue;
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
          });
          if (!validation.valid) {
            conflicts.push({ task_id: u.task_id, title: task.title, reason: validation.reason });
          }
        }

        setProposal({ ...result, conflicts });
        const conflictNote = conflicts.length > 0
          ? `\n\n⚠️ **${conflicts.length} conflict(s) detected** in the proposal — review before accepting.`
          : '';
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `**${result.understanding || 'Here is what I propose:'}**\n\n${result.explanation}${conflictNote}\n\nThis affects **${result.updates?.length || 0}** task(s). Review the changes above and accept or cancel.`
        }]);
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: result.message || 'No changes are needed for your plan.' }]);
      }
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', content: "Sorry, I couldn't process that. Please try again." }]);
    }
    setLoading(false);
  };

  // ── Accept proposal ───────────────────────────────────────────────────────
  const acceptProposal = async () => {
    if (!proposal) return;
    setLoading(true);
    const saved = [];
    const failed = [];

    try {
      for (const u of (proposal.updates || [])) {
        const task = tasks.find(t => t.id === u.task_id);
        if (!task) continue;
        try {
          await base44.entities.StudyTask.update(task.id, {
            scheduled_date: u.scheduled_date,
            scheduled_start: u.scheduled_start,
            scheduled_end: u.scheduled_end,
          });
          saved.push(task.title);
        } catch (e) {
          failed.push(task.title);
        }
      }

      for (const rid of (proposal.removals || [])) {
        try {
          await base44.entities.StudyTask.update(rid, { scheduled_date: null, scheduled_start: null, scheduled_end: null });
        } catch (e) { /* ignore */ }
      }

      // Reload tasks
      const updated = await base44.entities.StudyTask.filter({ plan_id: planId });
      setTasks(updated);
      setProposal(null);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `✅ Done! Updated ${saved.length} task(s).${failed.length > 0 ? ` Could not update: ${failed.join(', ')}.` : ''}\n\nAnything else you'd like to adjust?`
      }]);
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Something went wrong while saving. Please try again.' }]);
    }
    setLoading(false);
  };

  const cancelProposal = () => {
    setProposal(null);
    setMessages(prev => [...prev, { role: 'assistant', content: 'No problem — the plan stays unchanged. What else can I help with?' }]);
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
              description="Tell me what changed and I'll help you adjust your study plan."
            />
            <Button variant="ghost" onClick={() => navigate(`/plan/${planId}/active`)}>
              <ArrowLeft className="w-4 h-4 mr-1" /> Back to plan
            </Button>
          </div>

          <div className="flex gap-6 items-start">
            {/* Calendar panel */}
            <div className="hidden lg:flex flex-col flex-1 min-w-0" style={{ height: 580 }}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5 text-sm font-medium text-gray-700">
                  <Calendar className="w-4 h-4 text-blue-500" /> Your Calendar
                  {proposal && <span className="ml-2 text-xs bg-orange-100 text-orange-700 border border-orange-200 rounded-full px-2 py-0.5">Preview mode</span>}
                </div>
                <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer select-none">
                  <input type="checkbox" checked={showBlockedTimes} onChange={e => setShowBlockedTimes(e.target.checked)} className="w-3.5 h-3.5 accent-blue-600" />
                  Show blocked times
                </label>
              </div>
              <MiniCalendar
                tasks={tasks}
                expandedBusyMap={expandedBusyMap}
                showBlockedTimes={showBlockedTimes}
                weekOffset={weekOffset}
                setWeekOffset={setWeekOffset}
                pendingChanges={proposal}
              />
            </div>

            {/* Chat panel */}
            <div className="flex-1 min-w-0 lg:max-w-[440px] w-full">
              <div className="bg-white rounded-2xl border border-blue-100 shadow-sm overflow-hidden mb-4">
                <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-4 py-3 flex items-center gap-2">
                  <Bot className="w-5 h-5 text-white" />
                  <span className="text-white font-semibold text-sm">Schedulo Re-planning Assistant</span>
                </div>

                {/* Visible week context pill */}
                <div className="px-4 py-2 bg-blue-50 border-b border-blue-100 text-xs text-blue-700 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5" />
                  <span>Visible week: <span className="font-semibold">{visibleWeekDates[0]?.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – {visibleWeekDates[6]?.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span></span>
                </div>

                <div className="h-[360px] overflow-y-auto p-4 space-y-4">
                  {messages.map((msg, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div className={`max-w-[85%] px-4 py-3 rounded-2xl text-sm ${
                        msg.role === 'user'
                          ? 'bg-blue-600 text-white rounded-br-md'
                          : 'bg-gray-50 text-gray-800 rounded-bl-md border border-gray-100'
                      }`}>
                        {msg.role === 'assistant'
                          ? <ReactMarkdown className="prose prose-sm max-w-none">{msg.content}</ReactMarkdown>
                          : msg.content}
                      </div>
                    </motion.div>
                  ))}

                  {loading && (
                    <div className="flex justify-start">
                      <div className="bg-gray-50 rounded-2xl rounded-bl-md px-4 py-3 border border-gray-100">
                        <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
                      </div>
                    </div>
                  )}

                  {/* Clarification buttons */}
                  {clarification && !loading && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-2">
                      <p className="text-xs font-semibold text-amber-800 flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5" /> Confirm what you meant:</p>
                      {clarification.options.map((opt, i) => (
                        <button
                          key={i}
                          onClick={() => {
                            if (opt.context === 'cancel') {
                              setClarification(null);
                              setMessages(prev => [...prev, { role: 'assistant', content: 'No problem — let me know if you want to try again.' }]);
                            } else {
                              sendMessage(clarification.originalText, opt.context);
                            }
                          }}
                          className="w-full text-left text-xs px-3 py-2 rounded-lg bg-white border border-amber-200 hover:bg-amber-100 text-amber-900 transition-colors"
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Proposal diff + actions */}
                  {proposal && !loading && (
                    <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 space-y-2">
                      <p className="text-xs font-semibold text-orange-800">Proposed changes ({proposal.updates?.length || 0} task{proposal.updates?.length !== 1 ? 's' : ''}):</p>
                      {proposal.updates?.slice(0, 6).map((u, i) => {
                        const task = tasks.find(t => t.id === u.task_id);
                        const conflict = proposal.conflicts?.find(c => c.task_id === u.task_id);
                        return (
                          <div key={i} className={`rounded-lg px-3 py-2 text-xs ${conflict ? 'bg-red-50 border border-red-200' : 'bg-white border border-orange-100'}`}>
                            <p className="font-medium text-gray-800 truncate">{task?.title || u.task_id}</p>
                            <p className="text-gray-500">{task?.scheduled_date} {task?.scheduled_start}–{task?.scheduled_end} → <span className="font-medium text-orange-700">{u.scheduled_date} {u.scheduled_start}–{u.scheduled_end}</span></p>
                            <p className="text-gray-400 italic">{u.reason}</p>
                            {conflict && <p className="text-red-600 font-medium">⚠ {conflict.reason}</p>}
                          </div>
                        );
                      })}
                      {proposal.updates?.length > 6 && <p className="text-xs text-gray-400">…and {proposal.updates.length - 6} more</p>}
                      {proposal.conflicts?.length > 0 && (
                        <p className="text-xs text-red-700 font-medium">⚠ {proposal.conflicts.length} conflict(s) detected. Accepting will skip conflicting moves.</p>
                      )}
                      <div className="flex gap-2 pt-1">
                        <Button size="sm" onClick={acceptProposal} className="bg-emerald-600 hover:bg-emerald-700 flex-1">
                          <CheckCircle className="w-3.5 h-3.5 mr-1" /> Apply changes
                        </Button>
                        <Button size="sm" variant="outline" onClick={cancelProposal} className="flex-1">
                          <XCircle className="w-3.5 h-3.5 mr-1" /> Cancel
                        </Button>
                      </div>
                    </div>
                  )}

                  <div ref={endRef} />
                </div>

                {/* Input */}
                <div className="p-3 border-t border-gray-100">
                  <form onSubmit={(e) => { e.preventDefault(); sendMessage(input); }} className="flex gap-2">
                    <input
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      placeholder="Describe what changed..."
                      className="flex-1 text-sm px-4 py-2.5 rounded-full border border-gray-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none transition-all"
                      disabled={loading}
                    />
                    <button
                      type="submit"
                      disabled={!input.trim() || loading}
                      className="w-10 h-10 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white rounded-full flex items-center justify-center transition-colors"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </form>
                </div>
              </div>

              {/* Suggestion chips */}
              <div className="flex flex-wrap gap-2">
                {[
                  "I can't study on Monday",
                  "I didn't finish this week's tasks",
                  "The deadline was moved",
                  "I need to add a blocked day"
                ].map(s => (
                  <button
                    key={s}
                    onClick={() => sendMessage(s)}
                    className="px-3 py-1.5 bg-white border border-blue-200 rounded-full text-xs text-blue-600 hover:bg-blue-50 transition-colors"
                    disabled={loading}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}