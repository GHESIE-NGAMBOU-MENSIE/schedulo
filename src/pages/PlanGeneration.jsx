import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Calendar, List, ArrowLeft, Filter, CheckCircle, Clock, AlertCircle, Loader2, RotateCcw, RotateCw, Edit2, Check, X, Copy, GitCompare } from 'lucide-react';
import { PLANNING_REFERENCE_DATE, PLANNING_REFERENCE_DATE_STR } from '@/lib/planningDate';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import PhaseIndicator from '@/components/schedulo/PhaseIndicator';
import StepHeader from '@/components/schedulo/StepHeader';
import ContextChat from '@/components/schedulo/ContextChat';
import { motion } from 'framer-motion';

const HOUR_SLOTS = Array.from({ length: 14 }, (_, i) => i + 7); // 7am to 8pm

export default function PlanGeneration() {
  const { planId } = useParams();
  const navigate = useNavigate();
  const [plan, setPlan] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [view, setView] = useState('calendar');
  const [filter, setFilter] = useState('all');
  const [weekOffset, setWeekOffset] = useState(0);
  const [undoStack, setUndoStack] = useState([]);
  const [redoStack, setRedoStack] = useState([]);
  const [scenarios, setScenarios] = useState([]);
  const [activeScenario, setActiveScenario] = useState(0);
  const [showComparison, setShowComparison] = useState(false);

  useEffect(() => { loadData(); }, [planId]);

  const loadData = async () => {
    try {
      const p = await base44.entities.StudyPlan.get(planId);
      setPlan(p);
      const t = await base44.entities.StudyTask.filter({ plan_id: planId });
      setTasks(t);
      if (t.some(task => task.scheduled_date)) setGenerated(true);
      if (p.scenarios?.length) setScenarios(p.scenarios);
    } catch (e) {
      navigate('/');
    }
  };

  const generatePlan = async () => {
    setGenerating(true);
    const p = await base44.entities.StudyPlan.get(planId);
    const allTasks = await base44.entities.StudyTask.filter({ plan_id: planId });
    const prefs = p.preferences || {};
    const calEvents = p.calendar_events || [];

    const prompt = `You are a study plan scheduler. Generate a time-blocked study schedule.

IMPORTANT: Today's planning reference date is ${PLANNING_REFERENCE_DATE_STR}. Use this as "today" for all scheduling decisions. Do not treat any dates within the semester as past.

Study Period: ${p.start_date} to ${p.end_date}
Preferred Study Days: ${(prefs.preferred_days || []).join(', ')}
No-study Days: ${(prefs.no_study_days || []).join(', ')}
Study Window: ${prefs.preferred_start || '09:00'} to ${prefs.preferred_end || '18:00'}
Max Hours Per Day: ${prefs.max_hours || 6}
Break Duration: ${prefs.break_duration || 15} minutes

Fixed Calendar Events (blocked times):
${calEvents.map(e => `- ${e.name}: ${e.date} ${e.start_time}-${e.end_time} (${e.recurrence})`).join('\n')}

Tasks to schedule:
${allTasks.map(t => `- ID: ${t.id} | "${t.title}" (${t.course_name}) | ${t.estimated_hours}h | Priority: ${t.priority} | Deadline: ${t.deadline || 'none'} | Type: ${t.task_type}`).join('\n')}

Rules:
1. Respect fixed events, no-study days, and study window.
2. Max ${prefs.max_hours || 6} study hours per day.
3. Include ${prefs.break_duration || 15} minute breaks between study blocks.
4. Prioritize tasks by deadline proximity, then by priority level.
5. Distribute workload evenly across weeks.
6. Keep study blocks between 1-3 hours each. Split larger tasks into multiple blocks.
7. For each scheduled block, provide a brief explanation of why it's placed there.

Return JSON with a "schedule" array where each item has:
- task_id (string)
- scheduled_date (YYYY-MM-DD)
- scheduled_start (HH:MM)
- scheduled_end (HH:MM)
- explanation (why this time slot)`;

    try {
      const result = await base44.integrations.Core.InvokeLLM({
        prompt,
        response_json_schema: {
          type: "object",
          properties: {
            schedule: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  task_id: { type: "string" },
                  scheduled_date: { type: "string" },
                  scheduled_start: { type: "string" },
                  scheduled_end: { type: "string" },
                  explanation: { type: "string" }
                }
              }
            }
          }
        },
        model: 'claude_sonnet_4_6'
      });

      const schedule = result.schedule || [];
      for (const item of schedule) {
        const task = allTasks.find(t => t.id === item.task_id);
        if (task) {
          await base44.entities.StudyTask.update(task.id, {
            scheduled_date: item.scheduled_date,
            scheduled_start: item.scheduled_start,
            scheduled_end: item.scheduled_end,
            explanation: item.explanation
          });
        }
      }

      const updatedTasks = await base44.entities.StudyTask.filter({ plan_id: planId });
      setTasks(updatedTasks);
      setScenarios([{ name: 'Scenario 1', tasks: updatedTasks.map(t => ({ id: t.id, scheduled_date: t.scheduled_date, scheduled_start: t.scheduled_start, scheduled_end: t.scheduled_end })) }]);
      await base44.entities.StudyPlan.update(planId, {
        scenarios: [{ name: 'Scenario 1', created: new Date().toISOString() }],
        step: 8
      });
      setGenerated(true);
    } catch (e) {
      console.error(e);
    }
    setGenerating(false);
  };

  const getWeekDates = () => {
    if (!plan?.start_date) return [];
    const start = new Date(plan.start_date);
    start.setDate(start.getDate() + weekOffset * 7);
    const startDay = start.getDay();
    const monday = new Date(start);
    monday.setDate(start.getDate() - ((startDay + 6) % 7));
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return d;
    });
  };

  const getFilteredTasks = () => {
    if (filter === 'study') return tasks.filter(t => t.scheduled_date);
    if (filter === 'deadlines') return tasks.filter(t => t.deadline);
    return tasks;
  };

  const weekDates = getWeekDates();
  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const filteredTasks = getFilteredTasks();

  const getTasksForDateAndHour = (date, hour) => {
    const dateStr = date.toISOString().split('T')[0];
    return filteredTasks.filter(t => {
      if (t.scheduled_date !== dateStr) return false;
      const startHour = parseInt(t.scheduled_start?.split(':')[0] || '0');
      return startHour === hour;
    });
  };

  const getEventsForDateAndHour = (date, hour) => {
    if (!plan?.calendar_events) return [];
    const dateStr = date.toISOString().split('T')[0];
    return plan.calendar_events.filter(e => {
      if (e.date !== dateStr && e.recurrence !== 'weekly') return false;
      if (e.recurrence === 'weekly') {
        const eventDay = new Date(e.date).getDay();
        if (date.getDay() !== eventDay) return false;
      } else if (e.date !== dateStr) return false;
      const startHour = parseInt(e.start_time?.split(':')[0] || '0');
      return startHour === hour;
    });
  };

  const confirmPlan = async () => {
    await base44.entities.StudyPlan.update(planId, { status: 'active', phase: 'active', step: 9 });
    for (const t of tasks) {
      if (t.scheduled_date) {
        await base44.entities.StudyTask.update(t.id, { confirmed: true });
      }
    }
    navigate(`/plan/${planId}/active`);
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
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      <PhaseIndicator currentPhase="generation" currentStep={8} />
      <div className="max-w-6xl mx-auto px-4 py-8">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <StepHeader
            icon={Calendar}
            title="Your Study Plan"
            description={generated ? "Review your generated study plan. You can edit, reschedule, or compare scenarios." : "I'll generate a time-blocked study schedule based on your tasks and preferences."}
          />

          {!generated && (
            <div className="bg-white rounded-xl border border-blue-100 p-8 shadow-sm text-center mb-6">
              {generating ? (
                <div className="space-y-3">
                  <Loader2 className="w-10 h-10 animate-spin text-blue-500 mx-auto" />
                  <p className="text-gray-600 font-medium">Generating your personalized study plan...</p>
                  <p className="text-sm text-gray-400">Distributing tasks, respecting deadlines and preferences.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <Calendar className="w-10 h-10 text-blue-400 mx-auto" />
                  <p className="text-gray-600">Ready to generate your study plan.</p>
                  <Button onClick={generatePlan} className="bg-blue-600 hover:bg-blue-700">
                    Generate study plan
                  </Button>
                </div>
              )}
            </div>
          )}

          {generated && (
            <>
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
                <div className="flex gap-2">
                  <Select value={filter} onValueChange={setFilter}>
                    <SelectTrigger className="w-40"><Filter className="w-3.5 h-3.5 mr-1" /><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Show all</SelectItem>
                      <SelectItem value="study">Study tasks only</SelectItem>
                      <SelectItem value="deadlines">Deadlines only</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {view === 'calendar' && (
                <>
                  {/* Week navigation */}
                  <div className="flex items-center justify-between mb-3">
                    <Button variant="ghost" size="sm" onClick={() => setWeekOffset(w => w - 1)}>← Previous</Button>
                    <span className="text-sm font-medium text-gray-600">
                      {weekDates[0]?.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – {weekDates[6]?.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                    <Button variant="ghost" size="sm" onClick={() => setWeekOffset(w => w + 1)}>Next →</Button>
                  </div>

                  {/* Calendar grid */}
                  <div className="bg-white rounded-xl border border-blue-100 shadow-sm overflow-hidden mb-6">
                    <div className="grid grid-cols-8 border-b border-gray-100">
                      <div className="p-2 text-xs text-gray-400 text-center"></div>
                      {weekDates.map((d, i) => (
                        <div key={i} className={`p-2 text-center border-l border-gray-100 ${d.toDateString() === PLANNING_REFERENCE_DATE.toDateString() ? 'bg-blue-50' : ''}`}>
                          <p className="text-xs text-gray-400">{dayNames[i]}</p>
                          <p className={`text-sm font-semibold ${d.toDateString() === PLANNING_REFERENCE_DATE.toDateString() ? 'text-blue-600' : 'text-gray-700'}`}>{d.getDate()}</p>
                        </div>
                      ))}
                    </div>
                    <div className="max-h-[500px] overflow-y-auto">
                      {HOUR_SLOTS.map(hour => (
                        <div key={hour} className="grid grid-cols-8 border-b border-gray-50 min-h-[48px]">
                          <div className="p-1 text-xs text-gray-400 text-right pr-2 pt-1">{hour}:00</div>
                          {weekDates.map((d, i) => {
                            const dayTasks = getTasksForDateAndHour(d, hour);
                            const dayEvents = getEventsForDateAndHour(d, hour);
                            return (
                              <div key={i} className="border-l border-gray-50 p-0.5 relative">
                                {dayEvents.map((ev, j) => (
                                  <div key={`ev-${j}`} className="text-xs bg-gray-100 border border-gray-200 rounded px-1 py-0.5 mb-0.5 truncate text-gray-600">
                                    {ev.name}
                                  </div>
                                ))}
                                {dayTasks.map((task, j) => (
                                  <div key={`t-${j}`} className={`text-xs rounded px-1 py-0.5 mb-0.5 truncate border ${typeColors[task.task_type] || 'bg-gray-100 border-gray-200 text-gray-700'}`} title={`${task.title} (${task.course_name})`}>
                                    {task.title}
                                  </div>
                                ))}
                              </div>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {view === 'list' && (
                <div className="bg-white rounded-xl border border-blue-100 shadow-sm overflow-hidden mb-6">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wider">
                        <th className="px-4 py-3">Course</th>
                        <th className="px-4 py-3">Task</th>
                        <th className="px-4 py-3">Date & Time</th>
                        <th className="px-4 py-3">Hours</th>
                        <th className="px-4 py-3">Deadline</th>
                        <th className="px-4 py-3">Priority</th>
                        <th className="px-4 py-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {filteredTasks
                        .sort((a, b) => (a.scheduled_date || '').localeCompare(b.scheduled_date || ''))
                        .map(task => (
                        <tr key={task.id} className="hover:bg-blue-50/50">
                          <td className="px-4 py-3 text-gray-600">{task.course_name}</td>
                          <td className="px-4 py-3 font-medium text-gray-900">{task.title}</td>
                          <td className="px-4 py-3 text-gray-600">
                            {task.scheduled_date && `${task.scheduled_date} ${task.scheduled_start || ''}-${task.scheduled_end || ''}`}
                          </td>
                          <td className="px-4 py-3 text-gray-600">{task.estimated_hours}h</td>
                          <td className="px-4 py-3 text-gray-600">{task.deadline || '—'}</td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                              task.priority === 'high' ? 'bg-red-100 text-red-700' :
                              task.priority === 'medium' ? 'bg-amber-100 text-amber-700' :
                              'bg-green-100 text-green-700'
                            }`}>{task.priority}</span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                              task.status === 'completed' ? 'bg-emerald-100 text-emerald-700' :
                              task.status === 'in_progress' ? 'bg-blue-100 text-blue-700' :
                              task.status === 'postponed' ? 'bg-gray-100 text-gray-600' :
                              'bg-gray-100 text-gray-600'
                            }`}>{task.status}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Actions */}
              <div className="flex flex-wrap justify-between items-center gap-3">
                <div className="flex gap-2">
                  <Button variant="ghost" onClick={() => navigate(`/plan/${planId}/feasibility`)}>
                    <ArrowLeft className="w-4 h-4 mr-1" /> Back
                  </Button>
                  <Button variant="outline" size="sm" onClick={generatePlan}>
                    <RotateCcw className="w-4 h-4 mr-1" /> Re-generate
                  </Button>
                </div>
                <Button onClick={confirmPlan} className="bg-emerald-600 hover:bg-emerald-700">
                  <CheckCircle className="w-4 h-4 mr-1" /> Confirm and activate plan
                </Button>
              </div>
            </>
          )}
        </motion.div>
      </div>
      <ContextChat phase="plan" planId={planId} suggestions={[
        "Why is this task scheduled here?",
        "Can I move a task to another day?",
        "How do I compare different plan scenarios?"
      ]} />
    </div>
  );
}