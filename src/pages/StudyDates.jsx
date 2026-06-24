import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Calendar, Upload, Plus, Trash2, ArrowRight, ArrowLeft, Edit2, Check, X, FileUp, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import PhaseIndicator from '@/components/schedulo/PhaseIndicator';
import StepHeader from '@/components/schedulo/StepHeader';
import ContextChat from '@/components/schedulo/ContextChat';
import { motion } from 'framer-motion';

const EVENT_TYPES = ['lecture', 'exercise', 'work', 'sport', 'private', 'tutorial', 'meeting', 'other'];
const RECURRENCE_OPTIONS = ['none', 'weekly', 'custom'];

function parseICS(text, startDate, endDate) {
  const events = [];
  const lines = text.split(/\r?\n/);
  let current = null;
  const start = new Date(startDate);
  const end = new Date(endDate);

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') {
      current = {};
    } else if (line === 'END:VEVENT' && current) {
      if (current.date) {
        const evDate = new Date(current.date);
        if (evDate >= start && evDate <= end) {
          events.push(current);
        }
      }
      current = null;
    } else if (current) {
      if (line.startsWith('SUMMARY:')) current.name = line.slice(8).trim();else
      if (line.startsWith('DTSTART')) {
        const val = line.split(':').pop();
        if (val.length === 8) {
          current.date = `${val.slice(0, 4)}-${val.slice(4, 6)}-${val.slice(6, 8)}`;
          current.start_time = '09:00';
          current.end_time = '10:00';
        } else if (val.length >= 15) {
          current.date = `${val.slice(0, 4)}-${val.slice(4, 6)}-${val.slice(6, 8)}`;
          current.start_time = `${val.slice(9, 11)}:${val.slice(11, 13)}`;
        }
      } else if (line.startsWith('DTEND')) {
        const val = line.split(':').pop();
        if (val.length >= 15) {
          current.end_time = `${val.slice(9, 11)}:${val.slice(11, 13)}`;
        }
      } else if (line.startsWith('RRULE:')) {
        current.recurrence = line.includes('WEEKLY') ? 'weekly' : 'custom';
      }
    }
  }
  return events.map((e) => ({
    name: e.name || 'Untitled Event',
    type: guessType(e.name || ''),
    date: e.date || '',
    start_time: e.start_time || '09:00',
    end_time: e.end_time || '10:00',
    recurrence: e.recurrence || 'none',
    is_course: isCourse(e.name || '', e)
  }));
}

function guessType(name) {
  const n = name.toLowerCase();
  if (n.includes('lecture') || n.includes('vorlesung')) return 'lecture';
  if (n.includes('exercise') || n.includes('übung') || n.includes('tutorium')) return 'exercise';
  if (n.includes('tutorial')) return 'tutorial';
  if (n.includes('work') || n.includes('arbeit') || n.includes('job')) return 'work';
  if (n.includes('sport') || n.includes('gym') || n.includes('fitness')) return 'sport';
  if (n.includes('meeting') || n.includes('besprechung')) return 'meeting';
  return 'other';
}

function isCourse(name, event) {
  const type = guessType(name);
  return ['lecture', 'exercise', 'tutorial'].includes(type);
}

export default function StudyDates() {
  const { planId } = useParams();
  const navigate = useNavigate();
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [events, setEvents] = useState([]);
  const [showManual, setShowManual] = useState(false);
  const [editIdx, setEditIdx] = useState(null);
  const [manualEvent, setManualEvent] = useState({ name: '', type: 'other', date: '', start_time: '09:00', end_time: '10:00', recurrence: 'none' });
  const [uploading, setUploading] = useState(false);
  const [plan, setPlan] = useState(null);

  useEffect(() => {
    const load = async () => {
      const p = await base44.entities.StudyPlan.get(planId);
      setPlan(p);
      if (p.start_date) setStartDate(p.start_date);
      if (p.end_date) setEndDate(p.end_date);
      if (p.calendar_events?.length) setEvents(p.calendar_events);
    };
    load();
  }, [planId]);

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    try {
      const text = await file.text();
      const parsed = parseICS(text, startDate || '2000-01-01', endDate || '2099-12-31');
      setEvents((prev) => [...prev, ...parsed]);
    } catch (err) {
      console.error(err);
    }
    setUploading(false);
  };

  const addManualEvent = () => {
    if (editIdx !== null) {
      setEvents((prev) => prev.map((ev, i) => i === editIdx ? { ...manualEvent, is_course: isCourse(manualEvent.name, manualEvent) } : ev));
      setEditIdx(null);
    } else {
      setEvents((prev) => [...prev, { ...manualEvent, is_course: isCourse(manualEvent.name, manualEvent) }]);
    }
    setManualEvent({ name: '', type: 'other', date: '', start_time: '09:00', end_time: '10:00', recurrence: 'none' });
    setShowManual(false);
  };

  const editEvent = (idx) => {
    setManualEvent(events[idx]);
    setEditIdx(idx);
    setShowManual(true);
  };

  const deleteEvent = (idx) => {
    setEvents((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleNext = async () => {
    await base44.entities.StudyPlan.update(planId, {
      start_date: startDate,
      end_date: endDate,
      calendar_events: events,
      step: 2
    });
    // Create courses from detected course events
    const courseNames = [...new Set(events.filter((e) => e.is_course).map((e) => e.name))];
    for (const name of courseNames) {
      try {
        await base44.entities.Course.create({ plan_id: planId, name, course_type: [], confirmed: false });
      } catch (e) {}
    }
    navigate(`/plan/${planId}/preferences`);
  };

  const today = new Date().toISOString().split('T')[0];

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      <PhaseIndicator currentPhase="setup" currentStep={1} />
      <div className="max-w-3xl mx-auto px-4 py-8">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <StepHeader
            icon={Calendar}
            title="Study Period & Calendar"
            description="Set when your study plan should start and end, then import your calendar so I can find your fixed events and free study slots." />
          

          {/* Date inputs */}
          <div className="bg-white rounded-xl border border-blue-100 p-6 shadow-sm mb-6">
            <h3 className="font-semibold text-gray-900 mb-1">When should your study plan start and end?</h3>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label className="text-sm text-gray-600">Start date</Label>
                <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label className="text-sm text-gray-600">End date</Label>
                <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="mt-1" />
              </div>
            </div>
          </div>

          {/* Calendar import */}
          <div className="bg-white rounded-xl border border-blue-100 p-6 shadow-sm mb-6">
            <h3 className="font-semibold text-gray-900 mb-1">Import your calendar</h3>
            <p className="text-sm text-gray-400 mb-4">Upload an .ics file from your university or personal calendar. I'll detect lectures, work, appointments, and free time.</p>
            <div className="flex flex-wrap gap-3">
              <label className="cursor-pointer">
                <input type="file" accept=".ics" onChange={handleFileUpload} className="hidden" />
                <div className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors text-sm font-medium">
                  {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileUp className="w-4 h-4" />}
                  {uploading ? 'Parsing...' : 'Upload .ics file'}
                </div>
              </label>
              <Button variant="outline" size="sm" onClick={() => {setEditIdx(null);setManualEvent({ name: '', type: 'other', date: '', start_time: '09:00', end_time: '10:00', recurrence: 'none' });setShowManual(true);}}>
                <Plus className="w-4 h-4 mr-1" /> Add event manually
              </Button>
            </div>
          </div>

          {/* Manual event form */}
          {showManual &&
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="bg-white rounded-xl border border-blue-200 p-6 shadow-sm mb-6">
              <h3 className="font-semibold text-gray-900 mb-4">{editIdx !== null ? 'Edit event' : 'Add a fixed event'}</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <Label className="text-sm text-gray-600">Event name</Label>
                  <Input value={manualEvent.name} onChange={(e) => setManualEvent((p) => ({ ...p, name: e.target.value }))} placeholder="e.g., Statistics Lecture" className="mt-1" />
                </div>
                <div>
                  <Label className="text-sm text-gray-600">Type</Label>
                  <Select value={manualEvent.type} onValueChange={(v) => setManualEvent((p) => ({ ...p, type: v }))}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {EVENT_TYPES.map((t) => <SelectItem key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-sm text-gray-600">Date</Label>
                  <Input type="date" value={manualEvent.date} onChange={(e) => setManualEvent((p) => ({ ...p, date: e.target.value }))} className="mt-1" />
                </div>
                <div>
                  <Label className="text-sm text-gray-600">Start time</Label>
                  <Input type="time" value={manualEvent.start_time} onChange={(e) => setManualEvent((p) => ({ ...p, start_time: e.target.value }))} className="mt-1" />
                </div>
                <div>
                  <Label className="text-sm text-gray-600">End time</Label>
                  <Input type="time" value={manualEvent.end_time} onChange={(e) => setManualEvent((p) => ({ ...p, end_time: e.target.value }))} className="mt-1" />
                </div>
                <div>
                  <Label className="text-sm text-gray-600">Recurrence</Label>
                  <Select value={manualEvent.recurrence} onValueChange={(v) => setManualEvent((p) => ({ ...p, recurrence: v }))}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {RECURRENCE_OPTIONS.map((r) => <SelectItem key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <Button onClick={addManualEvent} disabled={!manualEvent.name || !manualEvent.date} size="sm">
                  <Check className="w-4 h-4 mr-1" /> {editIdx !== null ? 'Save changes' : 'Add event'}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => {setShowManual(false);setEditIdx(null);}}>Cancel</Button>
              </div>
            </motion.div>
          }

          {/* Detected events table */}
          {events.length > 0 &&
          <div className="bg-white rounded-xl border border-blue-100 shadow-sm mb-6 overflow-hidden">
              <div className="p-4 border-b border-blue-50">
                <h3 className="font-semibold text-gray-900">{events.length} detected events</h3>
                <p className="text-xs text-gray-400">Review, edit, or remove events. Events marked as courses will appear in the next phase.</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wider">
                      <th className="px-4 py-3">Name</th>
                      <th className="px-4 py-3">Type</th>
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">Time</th>
                      <th className="px-4 py-3">Recurrence</th>
                      <th className="px-4 py-3">Course?</th>
                      <th className="px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {events.map((ev, i) =>
                  <tr key={i} className="hover:bg-blue-50/50 transition-colors">
                        <td className="px-4 py-3 font-medium text-gray-900">{ev.name}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      ev.type === 'lecture' ? 'bg-blue-100 text-blue-700' :
                      ev.type === 'exercise' ? 'bg-purple-100 text-purple-700' :
                      ev.type === 'work' ? 'bg-amber-100 text-amber-700' :
                      ev.type === 'sport' ? 'bg-green-100 text-green-700' :
                      'bg-gray-100 text-gray-600'}`
                      }>
                            {ev.type}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-600">{ev.date}</td>
                        <td className="px-4 py-3 text-gray-600">{ev.start_time} – {ev.end_time}</td>
                        <td className="px-4 py-3 text-gray-600">{ev.recurrence}</td>
                        <td className="px-4 py-3">{ev.is_course && <span className="text-blue-600 text-xs font-semibold">✓ Course</span>}</td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1">
                            <button onClick={() => editEvent(i)} className="p-1 hover:bg-gray-100 rounded"><Edit2 className="w-3.5 h-3.5 text-gray-400" /></button>
                            <button onClick={() => deleteEvent(i)} className="p-1 hover:bg-red-50 rounded"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>
                          </div>
                        </td>
                      </tr>
                  )}
                  </tbody>
                </table>
              </div>
            </div>
          }

          {/* Navigation */}
          <div className="flex justify-between items-center">
            <Button variant="ghost" onClick={() => navigate('/')}>
              <ArrowLeft className="w-4 h-4 mr-1" /> Back
            </Button>
            <Button onClick={handleNext} disabled={!startDate || !endDate} className="bg-blue-600 hover:bg-blue-700">
              Continue to Preferences <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        </motion.div>
      </div>
      <ContextChat phase="dates" planId={planId} suggestions={[
      "What should I upload here?",
      "What is an .ics file?",
      "How do I add events manually?"]
      } />
    </div>);

}