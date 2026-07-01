import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Edit2, Trash2, Plus, Calendar, Clock, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { motion } from 'framer-motion';

const TASK_TYPES = ['reading', 'assignment', 'exercise', 'revision', 'test', 'project_work'];

const TYPE_LABELS = {
  reading: 'Study material',
  assignment: 'Assignment',
  exercise: 'Exercise',
  revision: 'Revision',
  test: 'Exam prep',
  project_work: 'Project',
};

const TYPE_COLORS = {
  reading: 'bg-blue-100 text-blue-700',
  assignment: 'bg-amber-100 text-amber-700',
  exercise: 'bg-cyan-100 text-cyan-700',
  revision: 'bg-purple-100 text-purple-700',
  test: 'bg-red-100 text-red-700',
  project_work: 'bg-emerald-100 text-emerald-700',
};

function formatDate(dateStr) {
  if (!dateStr) return null;
  try {
    return new Date(dateStr).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

function TaskCard({ task, onEdit, onDelete, editTask, setEditTask, onSave, tasks, setTasks, courseId }) {
  const isEditing = editTask === task.id;

  const update = (field, val) => setTasks(prev => {
    const next = { ...prev };
    Object.keys(next).forEach(cId => {
      next[cId] = next[cId].map(t => t.id === task.id ? { ...t, [field]: val } : t);
    });
    return next;
  });

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
      {isEditing ? (
        <div className="space-y-3">
          <Input value={task.title} onChange={e => update('title', e.target.value)} placeholder="Task title" />
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <Select value={task.task_type} onValueChange={v => update('task_type', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{TASK_TYPES.map(tt => <SelectItem key={tt} value={tt}>{TYPE_LABELS[tt] || tt}</SelectItem>)}</SelectContent>
            </Select>
            <Input type="number" value={task.estimated_hours} onChange={e => update('estimated_hours', Number(e.target.value))} placeholder="Hours" />
            <Select value={task.priority} onValueChange={v => update('priority', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low priority</SelectItem>
                <SelectItem value="medium">Medium priority</SelectItem>
                <SelectItem value="high">High priority</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs text-gray-500">Due date</Label>
              <Input type="date" value={task.deadline || ''} onChange={e => update('deadline', e.target.value || null)} />
            </div>
            <div>
              <Label className="text-xs text-gray-500">Target date</Label>
              <Input type="date" value={task.target_date || ''} onChange={e => update('target_date', e.target.value || null)} />
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => onSave(task.id, task)}>Save</Button>
            <Button size="sm" variant="ghost" onClick={() => setEditTask(null)}>Cancel</Button>
          </div>
        </div>
      ) : (
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${TYPE_COLORS[task.task_type] || 'bg-gray-100 text-gray-600'}`}>
                {TYPE_LABELS[task.task_type] || task.task_type}
              </span>
              {task.course_name && (
                <span className="text-xs text-gray-400 truncate max-w-[140px]">{task.course_name}</span>
              )}
            </div>
            <p className="font-medium text-gray-900 text-sm">{task.title}</p>
            <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1.5 text-xs text-gray-500">
              <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {task.estimated_hours}h</span>
              {task.deadline && (
                <span className="flex items-center gap-1 text-red-600">
                  <Calendar className="w-3 h-3" /> Due {formatDate(task.deadline)}
                </span>
              )}
              {task.target_date && !task.deadline && (
                <span className="flex items-center gap-1 text-blue-600">
                  <Calendar className="w-3 h-3" /> By {formatDate(task.target_date)}
                  {task.date_confidence === 'estimated' && <span className="text-gray-400">(estimated)</span>}
                </span>
              )}
              {task.exam_date && (
                <span className="flex items-center gap-1 text-red-700 font-medium">
                  🎓 Exam {formatDate(task.exam_date)}
                </span>
              )}
            </div>
          </div>
          <div className="flex gap-1 flex-shrink-0">
            <button onClick={() => setEditTask(task.id)} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
              <Edit2 className="w-3.5 h-3.5 text-gray-400" />
            </button>
            <button onClick={() => onDelete(task.id)} className="p-1.5 hover:bg-red-50 rounded-lg transition-colors">
              <Trash2 className="w-3.5 h-3.5 text-red-400" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function WeeklyTaskList({
  tasks,         // { courseId: [task, ...] }
  courses,       // [course, ...]
  editTask,
  setEditTask,
  onSave,
  onDelete,
  setTasks,
  onAddTask,     // (courseId) => void
  planStartDate,
}) {
  const [collapsedWeeks, setCollapsedWeeks] = useState({});
  const [filterCourse, setFilterCourse] = useState('all');

  const allTasks = Object.values(tasks).flat();

  // Filter by course
  const filtered = filterCourse === 'all' ? allTasks : allTasks.filter(t => t.course_id === filterCourse);

  // Assign a sort key to each task: target_week first, then derive from deadline/target_date
  const getWeek = (task) => {
    if (task.target_week) return task.target_week;
    // Derive from date relative to plan start
    const dateStr = task.target_date || task.deadline || task.not_before_date;
    if (dateStr && planStartDate) {
      const diff = (new Date(dateStr) - new Date(planStartDate)) / (7 * 86400000);
      if (diff >= 0) return Math.ceil(diff) + 1;
    }
    return 999; // no week info → put at end
  };

  // Group by week
  const weekMap = {};
  filtered.forEach(task => {
    const w = getWeek(task);
    if (!weekMap[w]) weekMap[w] = [];
    weekMap[w].push(task);
  });

  const weeks = Object.keys(weekMap).map(Number).sort((a, b) => a - b);

  const toggleWeek = (w) => setCollapsedWeeks(p => ({ ...p, [w]: !p[w] }));

  // Course filter options
  const courseOptions = courses.map(c => ({ id: c.id, name: c.name }));

  // Courses without exam date warning
  const missingExam = courses.filter(c => !c.exam_date);

  return (
    <div>
      {/* Course filter */}
      <div className="flex flex-wrap gap-2 mb-5">
        <button
          onClick={() => setFilterCourse('all')}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${filterCourse === 'all' ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-500 hover:bg-gray-50'}`}
        >
          All courses ({allTasks.length})
        </button>
        {courseOptions.map(c => {
          const count = (tasks[c.id] || []).length;
          return (
            <button
              key={c.id}
              onClick={() => setFilterCourse(c.id)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${filterCourse === c.id ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-500 hover:bg-gray-50'}`}
            >
              {c.name} ({count})
            </button>
          );
        })}
      </div>

      {/* Missing exam warnings */}
      {missingExam.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-4 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
          <div className="text-xs text-amber-800">
            <strong>No exam date provided</strong> for: {missingExam.map(c => c.name).join(', ')}. 
            Exam preparation tasks were created provisionally. Update exam dates in course details when known.
          </div>
        </div>
      )}

      {/* Weekly groups */}
      <div className="space-y-3">
        {weeks.map(w => {
          const weekTasks = weekMap[w];
          const isCollapsed = collapsedWeeks[w];
          const totalHours = weekTasks.reduce((s, t) => s + (t.estimated_hours || 0), 0);
          const label = w === 999 ? 'No specific week' : `Week ${w}`;

          // Date range hint for numbered weeks
          let dateHint = '';
          if (w !== 999 && planStartDate) {
            const start = new Date(planStartDate);
            start.setDate(start.getDate() + (w - 1) * 7);
            const end = new Date(start);
            end.setDate(end.getDate() + 6);
            dateHint = `${start.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} – ${end.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`;
          }

          return (
            <div key={w} className="bg-blue-50/50 border border-blue-100 rounded-xl overflow-hidden">
              <button
                onClick={() => toggleWeek(w)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-blue-100/40 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-blue-600 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
                    {w === 999 ? '?' : w}
                  </div>
                  <div className="text-left">
                    <p className="font-semibold text-gray-900 text-sm">{label}</p>
                    {dateHint && <p className="text-xs text-gray-400">{dateHint}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-500">{weekTasks.length} tasks · {totalHours}h</span>
                  {isCollapsed ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronUp className="w-4 h-4 text-gray-400" />}
                </div>
              </button>

              {!isCollapsed && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="px-4 pb-4 space-y-2"
                >
                  {weekTasks.map(task => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      onEdit={() => setEditTask(task.id)}
                      onDelete={onDelete}
                      editTask={editTask}
                      setEditTask={setEditTask}
                      onSave={onSave}
                      tasks={tasks}
                      setTasks={setTasks}
                      courseId={task.course_id}
                    />
                  ))}
                  {/* Add task button — only show when filtered to a specific course */}
                  {filterCourse !== 'all' && (
                    <button
                      onClick={() => onAddTask(filterCourse)}
                      className="w-full py-2.5 border border-dashed border-blue-300 rounded-xl text-sm text-blue-500 hover:bg-blue-50 transition-colors flex items-center justify-center gap-1"
                    >
                      <Plus className="w-4 h-4" /> Add task to this week
                    </button>
                  )}
                </motion.div>
              )}
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div className="text-center py-8 text-gray-400 text-sm">No tasks yet for this selection.</div>
        )}
      </div>
    </div>
  );
}