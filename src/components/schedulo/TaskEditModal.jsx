import React, { useState } from 'react';
import { X, Save, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';

export default function TaskEditModal({ task, onClose, onSaved, onDeleted }) {
  const [date, setDate] = useState(task.scheduled_date || '');
  const [start, setStart] = useState(task.scheduled_start || '');
  const [end, setEnd] = useState(task.scheduled_end || '');
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await base44.entities.StudyTask.update(task.id, {
      scheduled_date: date || null,
      scheduled_start: start || null,
      scheduled_end: end || null,
    });
    setSaving(false);
    onSaved({ ...task, scheduled_date: date || null, scheduled_start: start || null, scheduled_end: end || null });
  };

  const handleDelete = async () => {
    await base44.entities.StudyTask.update(task.id, {
      scheduled_date: null,
      scheduled_start: null,
      scheduled_end: null,
    });
    onDeleted(task.id);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl p-6 w-[360px] max-w-full" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-4">
          <div className="min-w-0">
            <p className="font-semibold text-gray-900 text-base leading-snug">{task.title}</p>
            <p className="text-xs text-gray-400 mt-0.5">{task.course_name} · {task.task_type?.replace('_', ' ')}</p>
          </div>
          <button onClick={onClose} className="ml-3 flex-shrink-0 text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Date</label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Start time</label>
              <input
                type="time"
                value={start}
                onChange={e => setStart(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">End time</label>
              <input
                type="time"
                value={end}
                onChange={e => setEnd(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              />
            </div>
          </div>
          {task.estimated_hours && (
            <p className="text-xs text-gray-400">Estimated: {task.estimated_hours}h{task.deadline ? ` · Due: ${task.deadline}` : ''}</p>
          )}
        </div>

        <div className="flex justify-between items-center mt-5">
          {!confirmDelete ? (
            <button
              onClick={() => setConfirmDelete(true)}
              className="text-xs text-red-400 hover:text-red-600 flex items-center gap-1"
            >
              <Trash2 className="w-3.5 h-3.5" /> Unschedule
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-xs text-red-600">Remove from calendar?</span>
              <button onClick={handleDelete} className="text-xs text-red-600 font-semibold hover:underline">Yes</button>
              <button onClick={() => setConfirmDelete(false)} className="text-xs text-gray-400 hover:underline">No</button>
            </div>
          )}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              <Save className="w-3.5 h-3.5 mr-1" />{saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}