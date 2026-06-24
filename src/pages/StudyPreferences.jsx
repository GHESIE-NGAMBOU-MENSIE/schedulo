import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Settings, ArrowRight, ArrowLeft, Clock, Coffee } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Slider } from '@/components/ui/slider';
import PhaseIndicator from '@/components/schedulo/PhaseIndicator';
import StepHeader from '@/components/schedulo/StepHeader';
import ContextChat from '@/components/schedulo/ContextChat';
import { motion } from 'framer-motion';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export default function StudyPreferences() {
  const { planId } = useParams();
  const navigate = useNavigate();
  const [preferredDays, setPreferredDays] = useState(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']);
  const [noStudyDays, setNoStudyDays] = useState(['Sunday']);
  const [preferredStart, setPreferredStart] = useState('09:00');
  const [preferredEnd, setPreferredEnd] = useState('18:00');
  const [maxHours, setMaxHours] = useState(6);
  const [breakDuration, setBreakDuration] = useState(15);

  useEffect(() => {
    const load = async () => {
      const p = await base44.entities.StudyPlan.get(planId);
      if (p.preferences?.preferred_days) setPreferredDays(p.preferences.preferred_days);
      if (p.preferences?.no_study_days) setNoStudyDays(p.preferences.no_study_days);
      if (p.preferences?.preferred_start) setPreferredStart(p.preferences.preferred_start);
      if (p.preferences?.preferred_end) setPreferredEnd(p.preferences.preferred_end);
      if (p.preferences?.max_hours) setMaxHours(p.preferences.max_hours);
      if (p.preferences?.break_duration) setBreakDuration(p.preferences.break_duration);
    };
    load();
  }, [planId]);

  const toggleDay = (day, list, setList) => {
    setList(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]);
  };

  const handleNext = async () => {
    await base44.entities.StudyPlan.update(planId, {
      preferences: {
        preferred_days: preferredDays,
        no_study_days: noStudyDays,
        preferred_start: preferredStart,
        preferred_end: preferredEnd,
        max_hours: maxHours,
        break_duration: breakDuration
      },
      step: 3,
      phase: 'courses'
    });
    navigate(`/plan/${planId}/courses`);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      <PhaseIndicator currentPhase="setup" currentStep={3} />
      <div className="max-w-3xl mx-auto px-4 py-8">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <StepHeader
            icon={Settings}
            title="Study Preferences"
            description="Tell me when and how you like to study. I'll use this to create a plan that fits your routine."
          />

          {/* Preferred days */}
          <div className="bg-white rounded-xl border border-blue-100 p-6 shadow-sm mb-6">
            <h3 className="font-semibold text-gray-900 mb-1">Which days do you prefer to study?</h3>
            <p className="text-sm text-gray-400 mb-4">Select the days you're usually available for studying.</p>
            <div className="flex flex-wrap gap-2">
              {DAYS.map(day => (
                <button
                  key={day}
                  onClick={() => toggleDay(day, preferredDays, setPreferredDays)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    preferredDays.includes(day)
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}
                >
                  {day.slice(0, 3)}
                </button>
              ))}
            </div>
          </div>

          {/* No study days */}
          <div className="bg-white rounded-xl border border-blue-100 p-6 shadow-sm mb-6">
            <h3 className="font-semibold text-gray-900 mb-1">Any days you don't want to study?</h3>
            <p className="text-sm text-gray-400 mb-4">I won't schedule study tasks on these days.</p>
            <div className="flex flex-wrap gap-2">
              {DAYS.map(day => (
                <button
                  key={day}
                  onClick={() => toggleDay(day, noStudyDays, setNoStudyDays)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    noStudyDays.includes(day)
                      ? 'bg-red-500 text-white shadow-sm'
                      : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}
                >
                  {day.slice(0, 3)}
                </button>
              ))}
            </div>
          </div>

          {/* Study times */}
          <div className="bg-white rounded-xl border border-blue-100 p-6 shadow-sm mb-6">
            <h3 className="font-semibold text-gray-900 mb-1">When do you prefer to study?</h3>
            <p className="text-sm text-gray-400 mb-4">Set the time window when I can schedule study blocks.</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-sm text-gray-600 flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> Earliest start</Label>
                <Input type="time" value={preferredStart} onChange={e => setPreferredStart(e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label className="text-sm text-gray-600 flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> Latest end</Label>
                <Input type="time" value={preferredEnd} onChange={e => setPreferredEnd(e.target.value)} className="mt-1" />
              </div>
            </div>
          </div>

          {/* Max hours */}
          <div className="bg-white rounded-xl border border-blue-100 p-6 shadow-sm mb-6">
            <h3 className="font-semibold text-gray-900 mb-1">Maximum study hours per day</h3>
            <p className="text-sm text-gray-400 mb-4">I won't plan more than this many hours of studying per day.</p>
            <div className="flex items-center gap-4">
              <Slider
                value={[maxHours]}
                onValueChange={v => setMaxHours(v[0])}
                min={1}
                max={12}
                step={1}
                className="flex-1"
              />
              <span className="text-2xl font-bold text-blue-600 w-16 text-center">{maxHours}h</span>
            </div>
          </div>

          {/* Break duration */}
          <div className="bg-white rounded-xl border border-blue-100 p-6 shadow-sm mb-6">
            <h3 className="font-semibold text-gray-900 mb-1 flex items-center gap-2">
              <Coffee className="w-4 h-4 text-amber-500" /> Break between study blocks
            </h3>
            <p className="text-sm text-gray-400 mb-4">How long should breaks be between your study sessions?</p>
            <div className="flex items-center gap-4">
              <Slider
                value={[breakDuration]}
                onValueChange={v => setBreakDuration(v[0])}
                min={5}
                max={60}
                step={5}
                className="flex-1"
              />
              <span className="text-2xl font-bold text-amber-600 w-20 text-center">{breakDuration}m</span>
            </div>
          </div>

          {/* Navigation */}
          <div className="flex justify-between items-center">
            <Button variant="ghost" onClick={() => navigate(`/plan/${planId}/dates`)}>
              <ArrowLeft className="w-4 h-4 mr-1" /> Back
            </Button>
            <Button onClick={handleNext} className="bg-blue-600 hover:bg-blue-700">
              Continue to Courses <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        </motion.div>
      </div>
      <ContextChat phase="preferences" planId={planId} suggestions={[
        "How many hours should I study per day?",
        "Should I study on weekends?",
        "How long should my breaks be?"
      ]} />
    </div>
  );
}