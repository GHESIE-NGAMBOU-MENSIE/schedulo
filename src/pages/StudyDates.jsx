import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Calendar, Upload, Plus, Trash2, ArrowRight, ArrowLeft, Edit2, Check, X, FileUp, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import PhaseIndicator from '@/components/schedulo/PhaseIndicator';
import StepHeader from '@/components/schedulo/StepHeader';
import ContextChat from '@/components/schedulo/ContextChat';
import { motion } from 'framer-motion';
import { Progress } from '@/components/ui/progress';

const EVENT_TYPES = ['commitment', 'course'];
const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday', 'Flexible'];

const COURSE_KEYWORDS = ['lecture', 'vorlesung', 'exercise', 'übung', 'tutorium', 'tutorial', 'seminar', 'lab', 'praktikum', 'course', 'kurs', 'class', 'module', 'vorlesung', 'algorithms', 'english', 'mathematics', 'physics', 'chemistry', 'biology', 'statistics', 'programming', 'database', 'networks', 'software', 'machine learning', 'calculus', 'algebra', 'analysis', 'informatik', 'wirtschaft', 'recht', 'medizin', 'psychologie'];
const COMMITMENT_KEYWORDS = ['meeting', 'gym', 'sport', 'party', 'dinner', 'lunch', 'breakfast', 'appointment', 'doctor', 'dentist', 'haircut', 'shopping', 'vacation', 'holiday', 'travel', 'flight', 'train', 'bus', 'work', 'job', 'birthday', 'wedding', 'funeral', 'interview', 'call', 'zoom'];

function guessType(name) {
  const n = name.toLowerCase();
  if (COMMITMENT_KEYWORDS.some(k => n.includes(k))) return 'commitment';
  if (COURSE_KEYWORDS.some(k => n.includes(k))) return 'course';
  // Default: if it looks like a subject name (single/two words, capitalized), treat as course
  const wordCount = name.trim().split(/\s+/).length;
  if (wordCount <= 3) return 'course';
  return 'commitment';
}

function isCourse(type) {
  return type === 'course';
}

const RRULE_DAYS = { MO: 'Monday', TU: 'Tuesday', WE: 'Wednesday', TH: 'Thursday', FR: 'Friday', SA: 'Saturday', SU: 'Sunday' };

function parseDateVal(val) {
  if (!val) return { date: '', time: '' };
  const raw = val.split(':').pop();
  if (raw.length === 8) return { date: `${raw.slice(0,4)}-${raw.slice(4,6)}-${raw.slice(6,8)}`, time: '' };
  if (raw.length >= 15) return { date: `${raw.slice(0,4)}-${raw.slice(4,6)}-${raw.slice(6,8)}`, time: `${raw.slice(9,11)}:${raw.slice(11,13)}` };
  return { date: '', time: '' };
}

function extractDayFromRrule(rrule) {
  const m = rrule.match(/BYDAY=([A-Z,]+)/);
  if (!m) return 'Flexible';
  const days = m[1].split(',').map(d => RRULE_DAYS[d]).filter(Boolean);
  return days.length === 1 ? days[0] : 'Flexible';
}

function extractUntilFromRrule(rrule) {
  const m = rrule.match(/UNTIL=(\d{8})/);
  if (!m) return '';
  const v = m[1];
  return `${v.slice(0,4)}-${v.slice(4,6)}-${v.slice(6,8)}`;
}

// Parse ICS and deduplicate recurring events — one entry per unique name
function parseICS(text, startDate, endDate) {
  // Unfold folded lines (lines starting with space/tab continue previous)
  const unfolded = text.replace(/\r?\n[ \t]/g, '');
  const lines = unfolded.split(/\r?\n/);
  let current = null;
  const rawEvents = [];

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') {
      current = {};
    } else if (line === 'END:VEVENT' && current) {
      rawEvents.push(current);
      current = null;
    } else if (current) {
      const colonIdx = line.indexOf(':');
      if (colonIdx === -1) continue;
      const key = line.slice(0, colonIdx);
      const val = line.slice(colonIdx + 1).trim();

      if (key === 'SUMMARY') current.name = val;
      else if (key === 'DESCRIPTION') current.description = val;
      else if (key.startsWith('DTSTART')) {
        const { date, time } = parseDateVal(line);
        current.date = date;
        current.start_time = time;
      } else if (key.startsWith('DTEND')) {
        const { time } = parseDateVal(line);
        current.end_time = time;
      } else if (key === 'RRULE') {
        current.is_recurring = true;
        current.rrule_day = extractDayFromRrule(val);
        current.rrule_until = extractUntilFromRrule(val);
      }
    }
  }

  // Deduplicate recurring by name; collect non-recurring
  const recurringMap = new Map();
  const nonRecurring = [];
  const start = startDate ? new Date(startDate) : new Date('2000-01-01');
  const end = endDate ? new Date(endDate) : new Date('2099-12-31');

  for (const ev of rawEvents) {
    const evDate = ev.date ? new Date(ev.date) : null;
    if (ev.is_recurring) {
      const name = ev.name || 'Untitled';
      if (!recurringMap.has(name)) {
        recurringMap.set(name, { ...ev });
      } else {
        const existing = recurringMap.get(name);
        if (ev.date && (!existing.end_occurrence || ev.date > existing.end_occurrence)) {
          existing.end_occurrence = ev.date;
        }
      }
    } else if (evDate && evDate >= start && evDate <= end) {
      nonRecurring.push(ev);
    }
  }

  const result = [];
  for (const [, ev] of recurringMap) {
    const type = guessType(ev.name || '');
    result.push({
      name: ev.name || 'Untitled Event',
      description: ev.description || '',
      type,
      start_date: ev.date || '',
      end_date: ev.rrule_until || ev.end_occurrence || ev.date || '',
      start_time: ev.start_time || '',
      end_time: ev.end_time || '',
      day_of_week: ev.rrule_day || 'Flexible',
      is_course: isCourse(type),
      is_recurring: true
    });
  }
  for (const ev of nonRecurring) {
    const type = guessType(ev.name || '');
    result.push({
      name: ev.name || 'Untitled Event',
      description: ev.description || '',
      type,
      start_date: ev.date || '',
      end_date: ev.date || '',
      start_time: ev.start_time || '',
      end_time: ev.end_time || '',
      day_of_week: ev.rrule_day || 'Flexible',
      is_course: isCourse(type),
      is_recurring: false
    });
  }
  return result;
}

const emptyManual = { name: '', type: 'commitment', start_date: '', end_date: '', start_time: '', end_time: '', day_of_week: 'Flexible' };

export default function StudyDates() {
  const { planId } = useParams();
  const navigate = useNavigate();
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [events, setEvents] = useState([]);
  const [showManual, setShowManual] = useState(false);
  const [editIdx, setEditIdx] = useState(null);
  const [manualEvent, setManualEvent] = useState(emptyManual);
  const [manualErrors, setManualErrors] = useState({});
  const [uploading, setUploading] = useState(false);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    const load = async () => {
      try {
        const p = await base44.entities.StudyPlan.get(planId);
        if (p.start_date) setStartDate(p.start_date);
        if (p.end_date) setEndDate(p.end_date);
        if (p.calendar_events?.length) setEvents(p.calendar_events);
      } catch (e) {
        navigate('/');
      }
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
      setEvents((prev) => {
        // Merge: avoid duplicate names from recurring
        const existingNames = new Set(prev.filter(e => e.is_recurring).map(e => e.name));
        const newEvents = parsed.filter(e => !e.is_recurring || !existingNames.has(e.name));
        return [...prev, ...newEvents];
      });
    } catch (err) {
      console.error(err);
    }
    setUploading(false);
    e.target.value = '';
  };

  const validateManual = () => {
    const errs = {};
    if (!manualEvent.name.trim()) errs.name = 'Event name is required';
    if (!manualEvent.type) errs.type = 'Event type is required';
    if (!manualEvent.start_date) errs.start_date = 'Start date is required';
    if (!manualEvent.end_date) errs.end_date = 'End date is required';
    if (manualEvent.start_date && manualEvent.end_date && manualEvent.end_date < manualEvent.start_date) {
      errs.end_date = 'End date must be after start date';
    }
    return errs;
  };

  const addManualEvent = () => {
    const errs = validateManual();
    if (Object.keys(errs).length > 0) { setManualErrors(errs); return; }
    const ev = {
      ...manualEvent,
      is_course: isCourse(manualEvent.type),
      is_recurring: false
    };
    if (editIdx !== null) {
      setEvents((prev) => prev.map((e, i) => i === editIdx ? ev : e));
      setEditIdx(null);
    } else {
      setEvents((prev) => [...prev, ev]);
    }
    setManualEvent(emptyManual);
    setManualErrors({});
    setShowManual(false);
  };

  const editEvent = (idx) => {
    const ev = events[idx];
    setManualEvent({
      name: ev.name || '',
      type: ev.type || 'commitment',
      start_date: ev.start_date || ev.date || '',
      end_date: ev.end_date || ev.date || '',
      start_time: ev.start_time || '',
      end_time: ev.end_time || '',
      day_of_week: ev.day_of_week || 'Flexible'
    });
    setManualErrors({});
    setEditIdx(idx);
    setShowManual(true);
  };

  const deleteEvent = (idx) => {
    setEvents((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleNext = async () => {
    const errs = {};
    if (!startDate) errs.startDate = 'Start date is required';
    if (!endDate) errs.endDate = 'End date is required';
    if (startDate && endDate && endDate < startDate) errs.endDate = 'End date must be after start date';
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }

    await base44.entities.StudyPlan.update(planId, {
      start_date: startDate,
      end_date: endDate,
      calendar_events: events,
      step: 2
    });

    // Create courses from detected course events (deduplicated by name)
    const courseNames = [...new Set(events.filter((e) => e.is_course).map((e) => e.name))];
    for (const name of courseNames) {
      try {
        const existing = await base44.entities.Course.filter({ plan_id: planId, name });
        if (!existing.length) {
          await base44.entities.Course.create({ plan_id: planId, name, course_type: [], confirmed: false });
        }
      } catch (e) {}
    }
    navigate(`/plan/${planId}/preferences`);
  };

  // Progress: dates = 33%, if events added = 66%, both done = 100%
  const progressValue = (!startDate && !endDate) ? 0 : (!startDate || !endDate) ? 33 : events.length === 0 ? 66 : 100;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      <PhaseIndicator currentPhase="setup" currentStep={1} planId={planId} />
      <div className="max-w-3xl mx-auto px-4 py-8">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <StepHeader
            icon={Calendar}
            title="Study Period & Calendar"
            description="Set when your study plan should start and end, then import your calendar so I can find your fixed events and free study slots."
          />

          {/* Progress bar */}
          <div className="mb-6">
            <div className="flex justify-between text-xs text-gray-500 mb-1">
              <span>Step 1 of 4 — Calendar Setup</span>
              <span>{progressValue}% complete</span>
            </div>
            <Progress value={progressValue} className="h-2" />
          </div>

          {/* Date inputs */}
          <div className="bg-white rounded-xl border border-blue-100 p-6 shadow-sm mb-6">
            <h3 className="font-semibold text-gray-900 mb-1">When should your study plan start and end?</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">
              <div>
                <Label className="text-sm text-gray-600">Start date *</Label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => { setStartDate(e.target.value); setErrors(p => ({ ...p, startDate: undefined })); }}
                  className={`mt-1 ${errors.startDate ? 'border-red-400 focus:ring-red-200' : ''}`}
                />
                {errors.startDate && <p className="text-xs text-red-500 mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{errors.startDate}</p>}
              </div>
              <div>
                <Label className="text-sm text-gray-600">End date *</Label>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => { setEndDate(e.target.value); setErrors(p => ({ ...p, endDate: undefined })); }}
                  className={`mt-1 ${errors.endDate ? 'border-red-400 focus:ring-red-200' : ''}`}
                />
                {errors.endDate && <p className="text-xs text-red-500 mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{errors.endDate}</p>}
              </div>
            </div>
          </div>

          {/* Calendar import */}
          <div className="bg-white rounded-xl border border-blue-100 p-6 shadow-sm mb-6">
            <h3 className="font-semibold text-gray-900 mb-1">Import your calendar</h3>
            <p className="text-sm text-gray-400 mb-4">Upload an .ics file from your university or personal calendar. Recurring events will be grouped into one entry.</p>
            <div className="flex flex-wrap gap-3">
              <label className="cursor-pointer">
                <input type="file" accept=".ics" onChange={handleFileUpload} className="hidden" />
                <div className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors text-sm font-medium">
                  {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileUp className="w-4 h-4" />}
                  {uploading ? 'Parsing...' : 'Upload .ics file'}
                </div>
              </label>
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setEditIdx(null); setManualEvent(emptyManual); setManualErrors({}); setShowManual(true); }}
              >
                <Plus className="w-4 h-4 mr-1" /> Add event manually
              </Button>
            </div>
          </div>

          {/* Manual event form */}
          {showManual && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="bg-white rounded-xl border border-blue-200 p-6 shadow-sm mb-6">
              <h3 className="font-semibold text-gray-900 mb-4">{editIdx !== null ? 'Edit event' : 'Add a fixed event'}</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Event Name */}
                <div className="sm:col-span-2">
                  <Label className="text-sm text-gray-600">Event name *</Label>
                  <Input
                    value={manualEvent.name}
                    onChange={(e) => { setManualEvent((p) => ({ ...p, name: e.target.value })); setManualErrors(p => ({ ...p, name: undefined })); }}
                    placeholder="e.g., Statistics Lecture"
                    className={`mt-1 ${manualErrors.name ? 'border-red-400' : ''}`}
                  />
                  {manualErrors.name && <p className="text-xs text-red-500 mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{manualErrors.name}</p>}
                </div>

                {/* Event Type */}
                <div>
                  <Label className="text-sm text-gray-600">Event type *</Label>
                  <Select value={manualEvent.type} onValueChange={(v) => { setManualEvent((p) => ({ ...p, type: v })); setManualErrors(p => ({ ...p, type: undefined })); }}>
                    <SelectTrigger className={`mt-1 ${manualErrors.type ? 'border-red-400' : ''}`}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="commitment">Commitment</SelectItem>
                      <SelectItem value="course">Course</SelectItem>
                    </SelectContent>
                  </Select>
                  {manualErrors.type && <p className="text-xs text-red-500 mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{manualErrors.type}</p>}
                </div>

                {/* Day of week */}
                <div>
                  <Label className="text-sm text-gray-600">Day of week</Label>
                  <Select value={manualEvent.day_of_week} onValueChange={(v) => setManualEvent((p) => ({ ...p, day_of_week: v }))}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {DAYS_OF_WEEK.map((d) => (
                        <SelectItem key={d} value={d}>{d}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {manualEvent.day_of_week === 'Flexible' && (
                    <p className="text-xs text-gray-400 mt-1">Flexible = no fixed day; can be done any time.</p>
                  )}
                </div>

                {/* Start date */}
                <div>
                  <Label className="text-sm text-gray-600">Start date *</Label>
                  <Input
                    type="date"
                    value={manualEvent.start_date}
                    onChange={(e) => { setManualEvent((p) => ({ ...p, start_date: e.target.value })); setManualErrors(p => ({ ...p, start_date: undefined })); }}
                    className={`mt-1 ${manualErrors.start_date ? 'border-red-400' : ''}`}
                  />
                  {manualErrors.start_date && <p className="text-xs text-red-500 mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{manualErrors.start_date}</p>}
                </div>

                {/* End date */}
                <div>
                  <Label className="text-sm text-gray-600">End date *</Label>
                  <Input
                    type="date"
                    value={manualEvent.end_date}
                    onChange={(e) => { setManualEvent((p) => ({ ...p, end_date: e.target.value })); setManualErrors(p => ({ ...p, end_date: undefined })); }}
                    className={`mt-1 ${manualErrors.end_date ? 'border-red-400' : ''}`}
                  />
                  {manualErrors.end_date && <p className="text-xs text-red-500 mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{manualErrors.end_date}</p>}
                </div>

                {/* Start time (optional) */}
                <div>
                  <Label className="text-sm text-gray-600">Start time <span className="text-gray-400 font-normal">(optional)</span></Label>
                  <Input type="time" value={manualEvent.start_time} onChange={(e) => setManualEvent((p) => ({ ...p, start_time: e.target.value }))} className="mt-1" />
                </div>

                {/* End time (optional) */}
                <div>
                  <Label className="text-sm text-gray-600">End time <span className="text-gray-400 font-normal">(optional)</span></Label>
                  <Input type="time" value={manualEvent.end_time} onChange={(e) => setManualEvent((p) => ({ ...p, end_time: e.target.value }))} className="mt-1" />
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <Button onClick={addManualEvent} size="sm">
                  <Check className="w-4 h-4 mr-1" /> {editIdx !== null ? 'Save changes' : 'Add event'}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => { setShowManual(false); setEditIdx(null); setManualErrors({}); }}>
                  <X className="w-4 h-4 mr-1" /> Cancel
                </Button>
              </div>
            </motion.div>
          )}

          {/* Detected events table */}
          {events.length > 0 && (
            <div className="bg-white rounded-xl border border-blue-100 shadow-sm mb-6 overflow-hidden">
              <div className="p-4 border-b border-blue-50">
                <h3 className="font-semibold text-gray-900">{events.length} detected events</h3>
                <p className="text-xs text-gray-400">Recurring events are shown once. Click the type badge to toggle between Course and Commitment.</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wider">
                      <th className="px-4 py-3">Name</th>
                      <th className="px-4 py-3">Type</th>
                      <th className="px-4 py-3">Day</th>
                      <th className="px-4 py-3">Time</th>
                      <th className="px-4 py-3">Start</th>
                      <th className="px-4 py-3">End</th>
                      <th className="px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {events.map((ev, i) => (
                      <tr key={i} className="hover:bg-blue-50/50 transition-colors">
                        <td className="px-4 py-3 font-medium text-gray-900">
                          {ev.name}
                          {ev.is_recurring && <span className="ml-1 text-purple-600 text-xs bg-purple-50 px-1.5 py-0.5 rounded">Recurring</span>}
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => {
                              const newType = ev.type === 'course' ? 'commitment' : 'course';
                              setEvents(prev => prev.map((e, idx) => idx === i ? { ...e, type: newType, is_course: newType === 'course' } : e));
                            }}
                            title="Click to toggle type"
                            className={`px-2 py-0.5 rounded-full text-xs font-medium cursor-pointer transition-colors hover:opacity-80 ${ev.type === 'course' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}
                          >
                            {ev.type === 'course' ? 'Course' : 'Commitment'}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-gray-600">{ev.day_of_week && ev.day_of_week !== 'Flexible' ? ev.day_of_week : '—'}</td>
                        <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                          {ev.start_time && ev.end_time ? `${ev.start_time}–${ev.end_time}` : ev.start_time || '—'}
                        </td>
                        <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{ev.start_date || ev.date || '—'}</td>
                        <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{ev.end_date || ev.date || '—'}</td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1">
                            <button onClick={() => editEvent(i)} className="p-1 hover:bg-gray-100 rounded"><Edit2 className="w-3.5 h-3.5 text-gray-400" /></button>
                            <button onClick={() => deleteEvent(i)} className="p-1 hover:bg-red-50 rounded"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Navigation */}
          <div className="flex justify-between items-center">
            <Button variant="ghost" onClick={() => navigate('/')}>
              <ArrowLeft className="w-4 h-4 mr-1" /> Back
            </Button>
            <Button onClick={handleNext} className="bg-blue-600 hover:bg-blue-700">
              Continue to Preferences <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        </motion.div>
      </div>
      {/* Permanent helper banner */}
      <div className="fixed bottom-24 right-6 z-40 max-w-xs">
        <div className="bg-blue-600 text-white text-sm px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-2 cursor-pointer hover:bg-blue-700 transition-colors" onClick={() => document.querySelector('[data-chat-toggle]')?.click()}>
          <span>👋</span>
          <span>Hi! Click the chat button below if you have any questions while creating your study plan.</span>
        </div>
      </div>
      <ContextChat phase="dates" planId={planId} suggestions={[
        "What should I upload here?",
        "What is an .ics file?",
        "How do I add events manually?"
      ]} />
    </div>
  );
}