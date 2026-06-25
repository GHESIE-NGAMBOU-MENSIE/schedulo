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
const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Flexible'];

// Academic subjects and course-related keywords that indicate a course
const COURSE_KEYWORDS = [
  // Event-type keywords
  'lecture', 'vorlesung', 'exercise', 'übung', 'tutorium', 'tutorial', 'seminar', 'lab', 'praktikum',
  'kurs', 'course', 'module', 'unit', 'class', 'workshop',
  // Common academic subjects (English + German)
  'mathematics', 'math', 'maths', 'mathematik',
  'algorithms', 'algorithmen',
  'databases', 'datenbanken',
  'software engineering', 'softwaretechnik',
  'english', 'deutsch', 'french', 'spanish', 'linguistics', 'language',
  'physics', 'physik', 'chemistry', 'chemie', 'biology', 'biologie',
  'statistics', 'statistik', 'probability',
  'programming', 'programmierung',
  'networks', 'netzwerke', 'networking',
  'operating systems', 'betriebssysteme',
  'machine learning', 'deep learning', 'artificial intelligence',
  'computer science', 'informatik',
  'economics', 'volkswirtschaft', 'betriebswirtschaft',
  'psychology', 'psychologie',
  'history', 'geschichte',
  'philosophy', 'philosophie',
  'literature', 'literatur',
  'accounting', 'buchhaltung',
  'management', 'marketing',
  'calculus', 'analysis', 'algebra', 'geometry',
  'logic', 'logik',
  'ethics', 'ethik',
  'law', 'recht',
  'architecture', 'architektur',
];

// Keywords that clearly indicate a non-course commitment
const COMMITMENT_KEYWORDS = [
  'doctor', 'arzt', 'zahnarzt', 'dentist', 'appointment', 'termin',
  'gym', 'fitness', 'sport', 'training', 'workout',
  'meeting', 'besprechung',
  'party', 'birthday', 'geburtstag',
  'shopping', 'errands',
  'work', 'job', 'arbeit', 'shift',
  'student association', 'fachschaft', 'asta',
  'personal', 'private',
  'vacation', 'urlaub', 'holiday',
  'travel', 'reise',
];

function guessType(name) {
  const n = name.toLowerCase();
  // Check commitment keywords first (more specific)
  if (COMMITMENT_KEYWORDS.some(kw => n.includes(kw))) return 'commitment';
  // Check course keywords
  if (COURSE_KEYWORDS.some(kw => n.includes(kw))) return 'course';
  return 'commitment';
}

function isCourse(type) {
  return type === 'course';
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function getDayOfWeek(dateStr) {
  if (!dateStr) return 'Flexible';
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? 'Flexible' : DAY_NAMES[d.getDay()];
}

// Parse ICS and deduplicate recurring events — one entry per unique (name+time) combination
function parseICS(text, startDate, endDate) {
  const lines = text.split(/\r?\n/);
  let current = null;
  const rawEvents = [];
  const start = startDate ? new Date(startDate) : new Date('2000-01-01');
  const end = endDate ? new Date(endDate) : new Date('2099-12-31');

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') {
      current = {};
    } else if (line === 'END:VEVENT' && current) {
      rawEvents.push(current);
      current = null;
    } else if (current) {
      if (line.startsWith('SUMMARY:')) current.name = line.slice(8).trim();
      else if (line.startsWith('DTSTART')) {
        const val = line.split(':').pop();
        if (val.length === 8) {
          current.date = `${val.slice(0, 4)}-${val.slice(4, 6)}-${val.slice(6, 8)}`;
          current.start_time = '';
          current.end_time = '';
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
        current.is_recurring = true;
      }
    }
  }

  // Deduplicate: group by name+time key. Keep one entry per unique event pattern.
  const seen = new Map(); // key -> first occurrence entry
  const nonRecurring = [];

  for (const ev of rawEvents) {
    const evDate = ev.date ? new Date(ev.date) : null;
    const key = `${ev.name || ''}|${ev.start_time || ''}|${ev.end_time || ''}`;

    if (ev.is_recurring) {
      if (!seen.has(key)) {
        seen.set(key, { ...ev });
      }
    } else if (evDate && evDate >= start && evDate <= end) {
      // For non-recurring, also deduplicate by name+time if very similar
      if (!seen.has(key)) {
        seen.set(key, { ...ev, is_recurring: false });
      }
    }
  }

  return Array.from(seen.values()).map(ev => ({
    name: ev.name || 'Untitled Event',
    type: guessType(ev.name || ''),
    start_date: ev.date || '',
    end_date: ev.date || '',
    start_time: ev.start_time || '',
    end_time: ev.end_time || '',
    day_of_week: getDayOfWeek(ev.date),
    is_course: isCourse(guessType(ev.name || '')),
    is_recurring: !!ev.is_recurring
  }));
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
      const p = await base44.entities.StudyPlan.get(planId);
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
      setEvents((prev) => {
        // Merge: avoid duplicates by name+time key
        const existingKeys = new Set(prev.map(e => `${e.name}|${e.start_time}|${e.end_time}`));
        const newEvents = parsed.filter(e => !existingKeys.has(`${e.name}|${e.start_time}|${e.end_time}`));
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
      <PhaseIndicator currentPhase="setup" currentStep={1} />
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

          {/* Detected events - card display */}
          {events.length > 0 && (
            <div className="mb-6">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="font-semibold text-gray-900">{events.length} blocked time periods</h3>
                  <p className="text-xs text-gray-400">Each entry is a unique event pattern. The planner will avoid scheduling study time during these periods.</p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {events.map((ev, i) => (
                  <div key={i} className={`bg-white rounded-xl border shadow-sm p-4 flex items-start justify-between gap-2 ${ev.is_course ? 'border-blue-200' : 'border-gray-200'}`}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                        <span className="font-medium text-gray-900 truncate">{ev.name}</span>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ${ev.is_course ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                          {ev.is_course ? 'Course' : 'Commitment'}
                        </span>
                        {ev.is_recurring && <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-purple-50 text-purple-600 flex-shrink-0">Recurring</span>}
                      </div>
                      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500">
                        {ev.day_of_week && ev.day_of_week !== 'Flexible' && (
                          <span>📅 {ev.day_of_week}</span>
                        )}
                        {ev.start_time && ev.end_time && (
                          <span>🕐 {ev.start_time}–{ev.end_time}</span>
                        )}
                        {!ev.start_time && ev.start_date && (
                          <span>📆 {ev.start_date}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <button onClick={() => editEvent(i)} className="p-1.5 hover:bg-gray-100 rounded-lg"><Edit2 className="w-3.5 h-3.5 text-gray-400" /></button>
                      <button onClick={() => deleteEvent(i)} className="p-1.5 hover:bg-red-50 rounded-lg"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>
                    </div>
                  </div>
                ))}
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
      <ContextChat phase="dates" planId={planId} persistentTooltip suggestions={[
        "What should I upload here?",
        "What is an .ics file?",
        "How do I add events manually?"
      ]} />
    </div>
  );
}