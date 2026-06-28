import React, { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { MessageCircle, ArrowLeft, Send, Bot, Loader2, CheckCircle, XCircle, Edit2, ChevronLeft, ChevronRight, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import PhaseIndicator from '@/components/schedulo/PhaseIndicator';
import StepHeader from '@/components/schedulo/StepHeader';
import ReactMarkdown from 'react-markdown';
import { motion } from 'framer-motion';
import { buildBusyMapPublic, getLocalDateStr } from '@/lib/schedulerEngine';
import { PLANNING_REFERENCE_DATE } from '@/lib/planningDate';

const HOUR_PX = 52;
const CAL_START_HOUR = 7;
const CAL_END_HOUR = 21;
const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function MiniCalendar({ tasks, expandedBusyMap, showBlockedTimes }) {
  const [weekOffset, setWeekOffset] = useState(0);

  useEffect(() => {
    const scheduledDates = tasks
      .filter(t => t.scheduled_date)
      .map(t => t.scheduled_date)
      .sort();
    if (!scheduledDates.length) return;
    const firstDate = new Date(scheduledDates[0] + 'T00:00:00');
    const ref = new Date(PLANNING_REFERENCE_DATE);
    const refMonday = new Date(ref);
    refMonday.setDate(ref.getDate() - ((ref.getDay() + 6) % 7));
    const firstMonday = new Date(firstDate);
    firstMonday.setDate(firstDate.getDate() - ((firstDate.getDay() + 6) % 7));
    setWeekOffset(Math.round((firstMonday - refMonday) / (7 * 86400000)));
  }, [tasks]);

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
            const dayTasks = tasks.filter(t => t.scheduled_date === ds && t.scheduled_start && t.scheduled_end);
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
                    className={`absolute z-20 rounded border overflow-hidden ${task.status === 'completed' ? 'bg-emerald-50 border-emerald-300 text-emerald-700' : typeColors[task.task_type] || 'bg-gray-100 border-gray-200 text-gray-700'}`}
                    style={{ top: toTopPx(task.scheduled_start), height: toDurPx(task.scheduled_start, task.scheduled_end), left: colLeft, width: colWidth, padding: '2px 3px' }}>
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

export default function Replanning() {
  const { planId } = useParams();
  const navigate = useNavigate();
  const [tasks, setTasks] = useState([]);
  const [expandedBusyMap, setExpandedBusyMap] = useState({});
  const [showBlockedTimes, setShowBlockedTimes] = useState(true);

  useEffect(() => {
    const load = async () => {
      const [p, t, courses] = await Promise.all([
        base44.entities.StudyPlan.get(planId),
        base44.entities.StudyTask.filter({ plan_id: planId }),
        base44.entities.Course.filter({ plan_id: planId }),
      ]);
      setTasks(t);
      const { busy } = buildBusyMapPublic(p.calendar_events || [], courses, p.start_date, p.end_date);
      setExpandedBusyMap(busy);
    };
    load();
  }, [planId]);

  const [messages, setMessages] = useState([
    { role: 'assistant', content: "Hi! 👋 I'm here to help you update your study plan. Tell me what changed — for example:\n\n- \"I can't study on Thursday anymore.\"\n- \"The statistics deadline moved to the 20th.\"\n- \"I didn't complete this week's tasks.\"\n- \"I need more time for this assignment.\"\n- \"I want to focus on the exam next week.\"\n\nWhat would you like to change?" }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [proposal, setProposal] = useState(null);
  const endRef = useRef(null);

  useEffect(() => {
    if (endRef.current) endRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async (text) => {
    if (!text.trim()) return;
    const userMsg = { role: 'user', content: text };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const plan = await base44.entities.StudyPlan.get(planId);
      const tasks = await base44.entities.StudyTask.filter({ plan_id: planId });
      const prefs = plan.preferences || {};

      const taskSummary = tasks.map(t =>
        `- "${t.title}" (${t.course_name}): ${t.status}, scheduled ${t.scheduled_date} ${t.scheduled_start}-${t.scheduled_end}, ${t.estimated_hours}h, deadline: ${t.deadline || 'none'}, priority: ${t.priority}`
      ).join('\n');

      const history = messages.slice(-8).map(m => `${m.role}: ${m.content}`).join('\n');

      const prompt = `You are Schedulo, a friendly AI study planning assistant helping a student re-plan their study schedule.

IMPORTANT: Today's planning reference date is 2026-04-01. Use this as "today" for all scheduling and deadline calculations. Do not treat Summer Semester 2026 dates as past.

Current Plan:
Study Period: ${plan.start_date} to ${plan.end_date}
Preferences: study days ${(prefs.preferred_days || []).join(', ')}, max ${prefs.max_hours || 6}h/day, ${prefs.preferred_start}-${prefs.preferred_end}

Current Tasks:
${taskSummary}

Conversation history:
${history}

Student's message: ${text}

Analyze the impact of the student's request. Respond in a friendly, conversational tone.

If the change affects the plan:
1. Explain what will change
2. Show the impact on workload, deadlines, and free time
3. Propose specific changes (which tasks move where)
4. Explain why you recommend this option
5. Ask the student to accept, reject, or edit the proposal

If the change doesn't affect the plan, explain why and keep the current plan.

If the student corrects a time estimate, acknowledge it and explain how it affects future estimates for similar tasks.

Keep responses concise but helpful. Use bullet points for clarity.`;

      const response = await base44.integrations.Core.InvokeLLM({ prompt });
      setMessages(prev => [...prev, { role: 'assistant', content: response }]);

      // Check if response contains a proposal
      if (response.toLowerCase().includes('accept') || response.toLowerCase().includes('proposal') || response.toLowerCase().includes('update')) {
        setProposal({ text: response });
      }
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', content: "Sorry, I couldn't process that. Please try again!" }]);
    }
    setLoading(false);
  };

  const acceptProposal = async () => {
    setProposal(null);
    setMessages(prev => [...prev, { role: 'user', content: 'I accept the proposal.' }]);
    setLoading(true);

    try {
      const tasks = await base44.entities.StudyTask.filter({ plan_id: planId });
      const plan = await base44.entities.StudyPlan.get(planId);
      const prefs = plan.preferences || {};

      const prompt = `The student accepted the re-planning proposal. Now generate updated schedule assignments.

IMPORTANT: Today's planning reference date is 2026-04-01. Use this as "today".

Current tasks:
${tasks.map(t => `- ID: ${t.id} | "${t.title}" (${t.course_name}) | ${t.estimated_hours}h | Priority: ${t.priority} | Deadline: ${t.deadline || 'none'} | Currently: ${t.scheduled_date} ${t.scheduled_start}-${t.scheduled_end}`).join('\n')}

Preferences: study days ${(prefs.preferred_days || []).join(', ')}, max ${prefs.max_hours || 6}h/day, ${prefs.preferred_start}-${prefs.preferred_end}

Return JSON with "updates" array of {task_id, scheduled_date, scheduled_start, scheduled_end} and a "summary" string explaining the changes.`;

      const result = await base44.integrations.Core.InvokeLLM({
        prompt,
        response_json_schema: {
          type: "object",
          properties: {
            updates: { type: "array", items: { type: "object", properties: { task_id: { type: "string" }, scheduled_date: { type: "string" }, scheduled_start: { type: "string" }, scheduled_end: { type: "string" } } } },
            summary: { type: "string" }
          }
        }
      });

      if (result.updates) {
        for (const u of result.updates) {
          const task = tasks.find(t => t.id === u.task_id);
          if (task) {
            await base44.entities.StudyTask.update(task.id, {
              scheduled_date: u.scheduled_date,
              scheduled_start: u.scheduled_start,
              scheduled_end: u.scheduled_end
            });
          }
        }
      }

      setMessages(prev => [...prev, { role: 'assistant', content: `✅ Done! I've updated your plan. ${result.summary || ''}\n\nYou can check your updated calendar on the Active Plan screen. Anything else you'd like to change?` }]);
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', content: "I updated the plan based on our discussion. You can check your calendar for the changes!" }]);
    }
    setLoading(false);
  };

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
            {/* Calendar panel — visible on large screens */}
            <div className="hidden lg:flex flex-col flex-1 min-w-0" style={{ height: 580 }}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5 text-sm font-medium text-gray-700">
                  <Calendar className="w-4 h-4 text-blue-500" /> Your Calendar
                </div>
                <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer select-none">
                  <input type="checkbox" checked={showBlockedTimes} onChange={e => setShowBlockedTimes(e.target.checked)} className="w-3.5 h-3.5 accent-blue-600" />
                  Show blocked times
                </label>
              </div>
              <MiniCalendar tasks={tasks} expandedBusyMap={expandedBusyMap} showBlockedTimes={showBlockedTimes} />
            </div>

            {/* Chat panel */}
            <div className="flex-1 min-w-0 lg:max-w-[440px] w-full">
              <div className="bg-white rounded-2xl border border-blue-100 shadow-sm overflow-hidden mb-4">
                <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-4 py-3 flex items-center gap-2">
                  <Bot className="w-5 h-5 text-white" />
                  <span className="text-white font-semibold text-sm">Schedulo Re-planning Assistant</span>
                </div>

                <div className="h-[400px] overflow-y-auto p-4 space-y-4">
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
                        {msg.role === 'assistant' ? (
                          <ReactMarkdown className="prose prose-sm max-w-none">{msg.content}</ReactMarkdown>
                        ) : msg.content}
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
                  <div ref={endRef} />
                </div>

                {/* Proposal actions */}
                {proposal && !loading && (
                  <div className="px-4 py-3 border-t border-gray-100 bg-blue-50 flex gap-2">
                    <Button size="sm" onClick={acceptProposal} className="bg-emerald-600 hover:bg-emerald-700">
                      <CheckCircle className="w-4 h-4 mr-1" /> Accept proposal
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => { setProposal(null); sendMessage("I'd like to see an alternative proposal."); }}>
                      <Edit2 className="w-4 h-4 mr-1" /> Propose alternative
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => { setProposal(null); sendMessage("I reject this proposal. Let's keep the current plan."); }}>
                      <XCircle className="w-4 h-4 mr-1" /> Reject
                    </Button>
                  </div>
                )}

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
                  "I can't study on Thursday anymore",
                  "I didn't complete this week's tasks",
                  "The deadline was moved",
                  "This task took longer than expected"
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