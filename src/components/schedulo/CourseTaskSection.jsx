import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Edit2, Trash2, Plus, Calendar, Clock, RefreshCw, Loader2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import WorkloadBreakdown from '@/components/schedulo/WorkloadBreakdown';

const TASK_TYPES = ['reading', 'assignment', 'exercise', 'revision', 'test', 'project_work'];

const TYPE_COLORS = {
  reading: 'bg-blue-100 text-blue-700',
  assignment: 'bg-amber-100 text-amber-700',
  exercise: 'bg-cyan-100 text-cyan-700',
  revision: 'bg-purple-100 text-purple-700',
  test: 'bg-red-100 text-red-700',
  project_work: 'bg-emerald-100 text-emerald-700'
};

const TYPE_LABELS = {
  reading: 'Study material',
  assignment: 'Assignment',
  exercise: 'Exercise',
  revision: 'Revision',
  test: 'Exam / Quiz prep',
  project_work: 'Project work'
};

function formatDate(d) {
  if (!d) return null;
  try {return new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });} catch {return d;}
}

function getWeek(task, planStartDate) {
  if (task.target_week) return task.target_week;
  const dateStr = task.target_date || task.deadline || task.not_before_date;
  if (dateStr && planStartDate) {
    const diff = (new Date(dateStr) - new Date(planStartDate)) / (7 * 86400000);
    if (diff >= 0) return Math.ceil(diff) + 1;
  }
  return 999;
}

function TaskRow({ task, onEdit, onDelete, isEditing, onSave, onCancelEdit, tasks, setTasks, courseId }) {
  const update = (field, val) => setTasks((prev) => ({
    ...prev,
    [courseId]: prev[courseId].map((t) => t.id === task.id ? { ...t, [field]: val } : t)
  }));

  if (isEditing) {
    return (
      <div className="bg-white rounded-lg border border-blue-200 p-3 space-y-2">
        <Input value={task.title} onChange={(e) => update('title', e.target.value)} placeholder="Task title" className="text-sm" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Select value={task.task_type} onValueChange={(v) => update('task_type', v)}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>{TASK_TYPES.map((tt) => <SelectItem key={tt} value={tt}>{TYPE_LABELS[tt]}</SelectItem>)}</SelectContent>
          </Select>
          <div className="flex items-center gap-1">
            <Input type="number" value={task.estimated_hours} min={0.5} step={0.5}
            onChange={(e) => update('estimated_hours', Number(e.target.value))}
            className="h-8 text-xs" placeholder="h" />
            <span className="text-xs text-gray-400">h</span>
          </div>
          <div>
            <Input type="date" value={task.deadline || ''} onChange={(e) => update('deadline', e.target.value || null)}
            className="h-8 text-xs" title="Deadline" />
          </div>
          <div>
            <Input type="number" value={task.target_week || ''} onChange={(e) => update('target_week', e.target.value ? Number(e.target.value) : null)}
            className="h-8 text-xs" placeholder="Week #" title="Target week" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs text-gray-400">Target date</Label>
            <Input type="date" value={task.target_date || ''} onChange={(e) => update('target_date', e.target.value || null)} className="h-8 text-xs" />
          </div>
          <div>
            <Label className="text-xs text-gray-400">Exam date</Label>
            <Input type="date" value={task.exam_date || ''} onChange={(e) => update('exam_date', e.target.value || null)} className="h-8 text-xs" />
          </div>
        </div>
        <div className="flex gap-2">
          <Button size="sm" className="h-7 text-xs" onClick={() => onSave(task.id, task)}>Save</Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onCancelEdit}>Cancel</Button>
        </div>
      </div>);

  }

  return (
    <div className="flex items-start gap-2 py-2 px-3 bg-white rounded-lg border border-gray-100 hover:border-blue-100 transition-colors group">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
          <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${TYPE_COLORS[task.task_type] || 'bg-gray-100 text-gray-600'}`}>
            {TYPE_LABELS[task.task_type] || task.task_type}
          </span>
        </div>
        <p className="text-sm text-gray-800 font-medium leading-snug">{task.title}</p>
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5 text-xs text-gray-400">
          <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{task.estimated_hours}h</span>
          {task.deadline && <span className="text-red-500 flex items-center gap-1"><Calendar className="w-3 h-3" />Due {formatDate(task.deadline)}</span>}
          {task.target_date && !task.deadline && <span className="text-blue-500 flex items-center gap-1"><Calendar className="w-3 h-3" />By {formatDate(task.target_date)}</span>}
          
          {task.source_text && <span className="text-gray-300 italic truncate max-w-[200px]" title={task.source_text}>"{task.source_text.slice(0, 60)}"</span>}
        </div>
      </div>
      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
        <button onClick={() => onEdit(task.id)} className="p-1 hover:bg-gray-100 rounded transition-colors">
          <Edit2 className="w-3.5 h-3.5 text-gray-400" />
        </button>
        <button onClick={() => onDelete(task.id)} className="p-1 hover:bg-red-50 rounded transition-colors">
          <Trash2 className="w-3.5 h-3.5 text-red-400" />
        </button>
      </div>
    </div>);

}

export default function CourseTaskSection({
  course,
  calendarHours,
  courseTasks,
  tasks,
  setTasks,
  editTask,
  setEditTask,
  onSave,
  onDelete,
  onAddTask,
  onReExtract,
  planStartDate,
  onBreakdownChange,
  isFallback,
  isExtracting
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [collapsedWeeks, setCollapsedWeeks] = useState({});

  const cp = course.credit_points || 0;
  const totalHours = cp * 30;
  const taskHoursSum = courseTasks.reduce((s, t) => s + (t.estimated_hours || 0), 0);

  // Type ordering: content first, then assessments, then exam prep / revision last
  const TYPE_ORDER = { reading: 0, exercise: 1, assignment: 2, test: 3, project_work: 4, revision: 5 };

  // Group tasks by week, sorted within each week by task_order then type
  const weekMap = {};
  courseTasks.forEach((task) => {
    const w = getWeek(task, planStartDate);
    if (!weekMap[w]) weekMap[w] = [];
    weekMap[w].push(task);
  });
  Object.keys(weekMap).forEach((w) => {
    weekMap[w].sort((a, b) => {
      // Primary: explicit task_order from LLM
      if (a.task_order != null && b.task_order != null) return a.task_order - b.task_order;
      if (a.task_order != null) return -1;
      if (b.task_order != null) return 1;
      // Secondary: chapter/exercise number
      const aNum = a.chapter_number || a.exercise_number || a.assignment_number || 999;
      const bNum = b.chapter_number || b.exercise_number || b.assignment_number || 999;
      if (aNum !== bNum) return aNum - bNum;
      // Tertiary: type priority
      return (TYPE_ORDER[a.task_type] ?? 4) - (TYPE_ORDER[b.task_type] ?? 4);
    });
  });
  const weeks = Object.keys(weekMap).map(Number).sort((a, b) => a - b);

  const toggleWeek = (w) => setCollapsedWeeks((p) => ({ ...p, [w]: !p[w] }));

  const bufferHours = courseTasks.
  filter((t) => t.task_type === 'revision' && (t.title || '').toLowerCase().includes('buffer')).
  reduce((s, t) => s + (t.estimated_hours || 0), 0);
  const bufferPct = totalHours > 0 ? bufferHours / totalHours * 100 : 0;

  return (
    <div className="bg-white rounded-2xl border border-blue-100 shadow-sm overflow-hidden mb-6">
      {/* Course header */}
      <button
        onClick={() => setCollapsed((p) => !p)}
        className="w-full flex items-start justify-between px-6 py-5 hover:bg-blue-50/30 transition-colors">
        
        <div className="flex items-start gap-3 text-left">
          <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-sm flex-shrink-0 mt-0.5">
            {cp}
          </div>
          <div>
            <p className="font-semibold text-gray-900 text-base">{course.name}</p>
            


            
          </div>
        </div>
        <div className="flex items-center gap-2 ml-4 flex-shrink-0">
          <button
            onClick={(e) => {e.stopPropagation();onReExtract(course.id);}}
            disabled={isExtracting}
            className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
            title="Re-extract tasks for this course">
            
            {isExtracting ? <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400" /> : <RefreshCw className="w-3.5 h-3.5 text-gray-400" />}
          </button>
          {collapsed ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronUp className="w-4 h-4 text-gray-400" />}
        </div>
      </button>

      {!collapsed &&
      <div className="px-6 pb-6">
          {/* Workload breakdown */}
          <div className="mb-4">
            <WorkloadBreakdown
            course={course}
            calendarHours={calendarHours}
            onBreakdownChange={onBreakdownChange} />
          
          </div>

          {/* Warnings */}
          {isFallback &&
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 mb-3 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-amber-800">
                Not enough course information — tasks were generated using a generic template. Please add more details in the course page or edit the tasks below.
              </p>
            </div>
        }
          {bufferPct > 30 &&
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 mb-3 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-amber-800">
                A large portion of the workload ({bufferPct.toFixed(0)}%) is in revision/buffer. Add more course materials to get more specific tasks.
              </p>
            </div>
        }

          {/* Weekly task groups */}
          {courseTasks.length === 0 ?
        <p className="text-center text-sm text-gray-400 py-4">No tasks yet for this course.</p> :

        <div className="space-y-2 mb-3">
              {weeks.map((w) => {
            const weekTasks = weekMap[w];
            const isOpen = !collapsedWeeks[w]; // default open
            const weekHours = weekTasks.reduce((s, t) => s + (t.estimated_hours || 0), 0);
            const label = w === 999 ? 'No specific week' : `Week ${w}`;
            let dateHint = '';
            if (w !== 999 && planStartDate) {
              const start = new Date(planStartDate);
              start.setDate(start.getDate() + (w - 1) * 7);
              const end = new Date(start);end.setDate(end.getDate() + 6);
              dateHint = `${start.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} – ${end.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`;
            }

            return (
              <div key={w} className="border border-gray-100 rounded-xl overflow-hidden">
                    <button
                  onClick={() => toggleWeek(w)}
                  className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-50 hover:bg-blue-50/40 transition-colors">
                  
                      <div className="flex items-center gap-2.5">
                        <div className="w-6 h-6 rounded-md bg-blue-600 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
                          {w === 999 ? '?' : w}
                        </div>
                        <div className="text-left">
                          <span className="text-sm font-semibold text-gray-800">{label}</span>
                          {dateHint && <span className="text-xs text-gray-400 ml-2">{dateHint}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-400">{weekTasks.length} tasks · {weekHours}h</span>
                        {isOpen ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />}
                      </div>
                    </button>
                    {isOpen &&
                <div className="p-2 space-y-1.5">
                        {weekTasks.map((task) =>
                  <TaskRow
                    key={task.id}
                    task={task}
                    onEdit={setEditTask}
                    onDelete={onDelete}
                    isEditing={editTask === task.id}
                    onSave={onSave}
                    onCancelEdit={() => setEditTask(null)}
                    tasks={tasks}
                    setTasks={setTasks}
                    courseId={course.id} />

                  )}
                      </div>
                }
                  </div>);

          })}
            </div>
        }

          {/* Add task */}
          <button
          onClick={() => onAddTask(course.id)}
          className="w-full py-2 border border-dashed border-blue-200 rounded-xl text-xs text-blue-500 hover:bg-blue-50 transition-colors flex items-center justify-center gap-1">
          
            <Plus className="w-3.5 h-3.5" /> Add task to {course.name}
          </button>
        </div>
      }
    </div>);

}