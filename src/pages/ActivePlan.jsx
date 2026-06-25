import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Calendar, List, Filter, CheckCircle, Circle, Clock, MessageCircle, Download, AlertTriangle, ChevronLeft, ChevronRight } from 'lucide-react';
import { PLANNING_REFERENCE_DATE, PLANNING_REFERENCE_DATE_STR } from '@/lib/planningDate';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import PhaseIndicator from '@/components/schedulo/PhaseIndicator';
import StepHeader from '@/components/schedulo/StepHeader';
import ContextChat from '@/components/schedulo/ContextChat';
import { motion } from 'framer-motion';

const HOUR_SLOTS = Array.from({ length: 14 }, (_, i) => i + 7);

export default function ActivePlan() {
  const { planId } = useParams();
  const navigate = useNavigate();
  const [plan, setPlan] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [view, setView] = useState('calendar');
  const [filter, setFilter] = useState('all');
  const [weekOffset, setWeekOffset] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadData(); }, [planId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const p = await base44.entities.StudyPlan.get(planId);
      setPlan(p);
      const t = await base44.entities.StudyTask.filter({ plan_id: planId });
      setTasks(t);
    } catch (e) {
      navigate('/');
      return;
    }
    setLoading(false);
  };

  const toggleTaskStatus = async (taskId, currentStatus) => {
    const newStatus = currentStatus === 'completed' ? 'open' : 'completed';
    await base44.entities.StudyTask.update(taskId, { status: newStatus });
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: newStatus } : t));
  };

  const markInProgress = async (taskId) => {
    await base44.entities.StudyTask.update(taskId, { status: 'in_progress' });
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: 'in_progress' } : t));
  };

  const postponeTask = async (taskId) => {
    await base44.entities.StudyTask.update(taskId, { status: 'postponed' });
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: 'postponed' } : t));
  };

  const getWeekDates = () => {
    const now = new Date(PLANNING_REFERENCE_DATE);
    now.setDate(now.getDate() + weekOffset * 7);
    const startDay = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((startDay + 6) % 7));
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return d;
    });
  };

  const filteredTasks = (() => {
    if (filter === 'study') return tasks.filter(t => t.scheduled_date && t.status !== 'completed');
    if (filter === 'deadlines') return tasks.filter(t => t.deadline);
    if (filter === 'completed') return tasks.filter(t => t.status === 'completed');
    return tasks;
  })();

  const weekDates = getWeekDates();
  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  const completedCount = tasks.filter(t => t.status === 'completed').length;
  const totalCount = tasks.length;
  const progress = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const overdueCount = tasks.filter(t => t.deadline && new Date(t.deadline) < PLANNING_REFERENCE_DATE && t.status !== 'completed').length;

  const typeColors = {
    reading: 'bg-blue-100 border-blue-300 text-blue-800',
    assignment: 'bg-purple-100 border-purple-300 text-purple-800',
    exercise: 'bg-green-100 border-green-300 text-green-800',
    revision: 'bg-amber-100 border-amber-300 text-amber-800',
    test: 'bg-red-100 border-red-300 text-red-800',
    project_work: 'bg-indigo-100 border-indigo-300 text-indigo-800',
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      <PhaseIndicator currentPhase="active" currentStep={9} planId={planId} />
      <div className="max-w-6xl mx-auto px-4 py-8">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <div className="flex items-center justify-between mb-6">
            <StepHeader
              icon={Calendar}
              title="Active Study Plan"
              description="Track your progress, mark tasks as completed, and navigate to re-planning if anything changes."
            />
          </div>

          {/* Progress summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <div className="bg-white rounded-xl border border-blue-100 p-4 shadow-sm">
              <p className="text-xs text-gray-400">Progress</p>
              <p className="text-2xl font-bold text-blue-600">{progress}%</p>
              <div className="w-full h-1.5 bg-gray-100 rounded-full mt-2">
                <div className="h-1.5 bg-blue-500 rounded-full transition-all" style={{ width: `${progress}%` }} />
              </div>
            </div>
            <div className="bg-white rounded-xl border border-blue-100 p-4 shadow-sm">
              <p className="text-xs text-gray-400">Completed</p>
              <p className="text-2xl font-bold text-emerald-600">{completedCount}/{totalCount}</p>
            </div>
            <div className="bg-white rounded-xl border border-blue-100 p-4 shadow-sm">
              <p className="text-xs text-gray-400">Overdue</p>
              <p className={`text-2xl font-bold ${overdueCount > 0 ? 'text-red-600' : 'text-gray-300'}`}>{overdueCount}</p>
            </div>
            <div className="bg-white rounded-xl border border-blue-100 p-4 shadow-sm">
              <p className="text-xs text-gray-400">Total hours</p>
              <p className="text-2xl font-bold text-purple-600">{tasks.reduce((s, t) => s + (t.estimated_hours || 0), 0).toFixed(0)}h</p>
            </div>
          </div>

          {/* Quick actions */}
          <div className="flex flex-wrap gap-2 mb-4">
            <Button variant="ghost" size="sm" onClick={() => navigate(`/plan/${planId}/generate`)}>
              <ChevronLeft className="w-4 h-4 mr-1" /> Back to Plan
            </Button>
            <Button variant={view === 'calendar' ? 'default' : 'outline'} size="sm" onClick={() => setView('calendar')}>
              <Calendar className="w-4 h-4 mr-1" /> Calendar
            </Button>
            <Button variant={view === 'list' ? 'default' : 'outline'} size="sm" onClick={() => setView('list')}>
              <List className="w-4 h-4 mr-1" /> Task List
            </Button>
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger className="w-40 h-9"><Filter className="w-3.5 h-3.5 mr-1" /><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All events</SelectItem>
                <SelectItem value="study">Study tasks</SelectItem>
                <SelectItem value="deadlines">Deadlines</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
              </SelectContent>
            </Select>
            <div className="ml-auto flex gap-2">
              <Link to={`/plan/${planId}/replan`}>
                <Button variant="outline" size="sm"><MessageCircle className="w-4 h-4 mr-1" /> Re-plan</Button>
              </Link>
              <Link to={`/plan/${planId}/export`}>
                <Button variant="outline" size="sm"><Download className="w-4 h-4 mr-1" /> Export</Button>
              </Link>
            </div>
          </div>

          {view === 'calendar' && (
            <>
              <div className="flex items-center justify-between mb-3">
                <Button variant="ghost" size="sm" onClick={() => setWeekOffset(w => w - 1)}><ChevronLeft className="w-4 h-4" /> Previous</Button>
                <span className="text-sm font-medium text-gray-600">
                  {weekDates[0]?.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – {weekDates[6]?.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
                <Button variant="ghost" size="sm" onClick={() => setWeekOffset(w => w + 1)}>Next <ChevronRight className="w-4 h-4" /></Button>
              </div>
              <div className="bg-white rounded-xl border border-blue-100 shadow-sm overflow-hidden mb-6">
                <div className="grid grid-cols-8 border-b border-gray-100">
                  <div className="p-2"></div>
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
                        const dateStr = d.toISOString().split('T')[0];
                        const dayTasks = filteredTasks.filter(t => t.scheduled_date === dateStr && parseInt(t.scheduled_start?.split(':')[0] || '0') === hour);
                        const dayEvents = (plan?.calendar_events || []).filter(e => {
                          if (e.recurrence === 'weekly') { return new Date(e.date).getDay() === d.getDay() && parseInt(e.start_time?.split(':')[0] || '0') === hour; }
                          return e.date === dateStr && parseInt(e.start_time?.split(':')[0] || '0') === hour;
                        });
                        return (
                          <div key={i} className="border-l border-gray-50 p-0.5">
                            {dayEvents.map((ev, j) => (
                              <div key={`ev-${j}`} className="text-xs bg-gray-100 rounded px-1 py-0.5 mb-0.5 truncate text-gray-600">{ev.name}</div>
                            ))}
                            {dayTasks.map(task => (
                              <button key={task.id} onClick={() => toggleTaskStatus(task.id, task.status)} className={`w-full text-left text-xs rounded px-1 py-0.5 mb-0.5 truncate border ${task.status === 'completed' ? 'bg-emerald-50 border-emerald-200 text-emerald-600 line-through' : typeColors[task.task_type] || 'bg-gray-100 border-gray-200'}`} title={`${task.title} — click to toggle complete`}>
                                {task.status === 'completed' ? '✓ ' : ''}{task.title}
                              </button>
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
            <div className="space-y-2 mb-6">
              {filteredTasks.sort((a, b) => (a.scheduled_date || '').localeCompare(b.scheduled_date || '')).map(task => (
                <div key={task.id} className={`bg-white rounded-xl border p-4 shadow-sm flex items-center gap-3 transition-all ${task.status === 'completed' ? 'border-emerald-200 opacity-70' : 'border-blue-100'}`}>
                  <button onClick={() => toggleTaskStatus(task.id, task.status)} className="flex-shrink-0">
                    {task.status === 'completed' ? (
                      <CheckCircle className="w-5 h-5 text-emerald-500" />
                    ) : (
                      <Circle className="w-5 h-5 text-gray-300 hover:text-blue-400 transition-colors" />
                    )}
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className={`font-medium ${task.status === 'completed' ? 'line-through text-gray-400' : 'text-gray-900'}`}>{task.title}</p>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${typeColors[task.task_type] || 'bg-gray-100 text-gray-600'}`}>{task.task_type?.replace('_', ' ')}</span>
                    </div>
                    <p className="text-xs text-gray-400">{task.course_name} · {task.scheduled_date} {task.scheduled_start}-{task.scheduled_end} · {task.estimated_hours}h</p>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    {task.status !== 'in_progress' && task.status !== 'completed' && (
                      <Button variant="ghost" size="sm" onClick={() => markInProgress(task.id)} className="text-xs">Start</Button>
                    )}
                    {task.status !== 'postponed' && task.status !== 'completed' && (
                      <Button variant="ghost" size="sm" onClick={() => postponeTask(task.id)} className="text-xs text-amber-600">Postpone</Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </motion.div>
      </div>
      <ContextChat phase="active" planId={planId} suggestions={[
        "I didn't complete this week's tasks",
        "How am I doing overall?",
        "I want to report a delay"
      ]} />
    </div>
  );
}