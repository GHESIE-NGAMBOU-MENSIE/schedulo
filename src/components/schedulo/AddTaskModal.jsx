import React, { useState } from 'react';
import { X, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';

export default function AddTaskModal({ planId, courses, defaultDate, defaultStart, onClose, onSaved }) {
  const [title, setTitle] = useState('');
  const [courseId, setCourseId] = useState(courses[0]?.id || '');
  const [taskType, setTaskType] = useState('reading');
  const [date, setDate] = useState(defaultDate || '');
  const [start, setStart] = useState(defaultStart || '09:00');
  const [end, setEnd] = useState('');
  const [hours, setHours] = useState('1');
  const [saving, setSaving] = useState(false);

  // Auto-compute end time from start + hours
  const computedEnd = (() => {
    if (!start) return '';
    const [h, m] = start.split(':').map(Number);
    const totalMin = h * 60 + m + Math.round(parseFloat(hours || 1) * 60);
    return `${String(Math.floor(totalMin / 60)).padStart(2, '0')}:${String(totalMin % 60).padStart(2, '0')}`;
  })();

  const selectedCourse = courses.find(c => c.id === courseId);

  const handleSave = async () => {
    if (!title.trim() || !date || !start) return;
    setSaving(true);
    const endTime = end || computedEnd;
    const newTask = await base44.entities.StudyTask.create({
      plan_id: planId,
      course_id: courseId || null,
      course_name: selectedCourse?.name || '',
      title: title.trim(),
      task_type: taskType,
      estimated_hours: parseFloat(hours) || 1,
      scheduled_date: date,
      scheduled_start: start,
      scheduled_end: endTime,
      status: 'open',
      priority: 'medium',
    });
    setSaving(false);
    onSaved(newTask);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl p-6 w-[400px] max-w-full" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <p className="font-semibold text-gray-900 text-base">Add task to calendar</p>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Title</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Read Chapter 3"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Course</label>
            <select
              value={courseId}
              onChange={e => setCourseId(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            >
              {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Task type</label>
            <select
              value={taskType}
              onChange={e => setTaskType(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            >
              {['reading','assignment','exercise','revision','test','project_work'].map(t => (
                <option key={t} value={t}>{t.replace('_', ' ')}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Date</label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Start</label>
              <input
                type="time"
                value={start}
                onChange={e => setStart(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Duration (h)</label>
              <input
                type="number"
                min="0.5"
                max="6"
                step="0.5"
                value={hours}
                onChange={e => setHours(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">End (auto)</label>
              <input
                type="time"
                value={end || computedEnd}
                onChange={e => setEnd(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={handleSave} disabled={saving || !title.trim() || !date}>
            <Save className="w-3.5 h-3.5 mr-1" />{saving ? 'Adding…' : 'Add task'}
          </Button>
        </div>
      </div>
    </div>
  );
}