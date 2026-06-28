import React, { useState } from 'react';
import { X, Save, Trash2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';

/**
 * TaskEditModal
 *
 * Props:
 *  task          - the task being edited
 *  onClose       - close handler
 *  onSaved       - called with updated task object after successful save
 *  onDeleted     - called with task.id after unscheduling
 *  validateSlotFn  - (date, start, end) => { valid, reason } | undefined
 *  findSlotsFn     - (date, duration) => [{date, start, end}] | undefined
 */
export default function TaskEditModal({ task, onClose, onSaved, onDeleted, validateSlotFn, findSlotsFn }) {
  const [date, setDate] = useState(task.scheduled_date || '');
  const [start, setStart] = useState(task.scheduled_start || '');
  const [end, setEnd] = useState(task.scheduled_end || '');
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [validationError, setValidationError] = useState(null); // { reason, alternatives }

  const durationMin = (() => {
    if (!start || !end) return 60;
    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = end.split(':').map(Number);
    return Math.max(30, (eh * 60 + em) - (sh * 60 + sm));
  })();

  const handleSave = async () => {
    // Validate if validator provided
    if (validateSlotFn && date && start && end) {
      const result = validateSlotFn(date, start, end);
      if (!result.valid) {
        const alternatives = findSlotsFn ? findSlotsFn(date, durationMin) : [];
        setValidationError({ reason: result.reason, alternatives });
        return;
      }
    }
    setValidationError(null);
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
      scheduled_date: null, scheduled_start: null, scheduled_end: null,
    });
    onDeleted(task.id);
  };

  const applyAlternative = (slot) => {
    setDate(slot.date);
    setStart(slot.start);
    setEnd(slot.end);
    setValidationError(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl p-6 w-[380px] max-w-full" onClick={e => e.stopPropagation()}>
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
              onChange={e => { setDate(e.target.value); setValidationError(null); }}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Start time</label>
              <input
                type="time"
                value={start}
                onChange={e => { setStart(e.target.value); setValidationError(null); }}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">End time</label>
              <input
                type="time"
                value={end}
                onChange={e => { setEnd(e.target.value); setValidationError(null); }}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              />
            </div>
          </div>
          {task.estimated_hours && (
            <p className="text-xs text-gray-400">
              Estimated: {task.estimated_hours}h
              {task.deadline ? ` · Due: ${task.deadline}` : ''}
              {task.not_before_date ? ` · Not before: ${task.not_before_date}` : ''}
            </p>
          )}

          {/* Validation error */}
          {validationError && (
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-orange-500 mt-0.5 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-orange-800">Not possible</p>
                  <p className="text-xs text-orange-700 mt-0.5">{validationError.reason}</p>
                  {validationError.alternatives?.length > 0 && (
                    <div className="mt-2">
                      <p className="text-xs font-medium text-orange-800 mb-1">Available alternatives (click to apply):</p>
                      <div className="flex flex-col gap-1">
                        {validationError.alternatives.map((slot, i) => (
                          <button
                            key={i}
                            onClick={() => applyAlternative(slot)}
                            className="text-xs text-left bg-white border border-orange-200 hover:bg-orange-50 text-orange-800 rounded px-2 py-1 transition-colors"
                          >
                            {slot.date} · {slot.start}–{slot.end}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {validationError.alternatives?.length === 0 && (
                    <p className="text-xs text-orange-600 mt-1">No free alternative slots found nearby.</p>
                  )}
                </div>
              </div>
            </div>
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