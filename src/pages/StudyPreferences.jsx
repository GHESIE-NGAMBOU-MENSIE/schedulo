import React, { useState, useEffect } from 'react';
import { t } from '@/lib/i18n';
import { useParams, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Settings, ArrowRight, ArrowLeft, Clock, Coffee, BanIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import PhaseIndicator from '@/components/schedulo/PhaseIndicator';
import StepHeader from '@/components/schedulo/StepHeader';
import ContextChat from '@/components/schedulo/ContextChat';
import { Progress } from '@/components/ui/progress';
import { motion } from 'framer-motion';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const defaultSchedule = () =>
Object.fromEntries(
  DAYS.map((d) => [d, { start: '09:00', end: '18:00', noStudy: false }])
);

export default function StudyPreferences() {
  const { planId } = useParams();
  const navigate = useNavigate();
  const [schedule, setSchedule] = useState(defaultSchedule());
  const [maxHours, setMaxHours] = useState(6);
  const [maxBlockHours, setMaxBlockHours] = useState(2);
  const [breakDuration, setBreakDuration] = useState(15);

  useEffect(() => {
    const load = async () => {
      let p;
      try {
        p = await base44.entities.StudyPlan.get(planId);
      } catch (e) {
        navigate('/');
        return;
      }
      if (p.preferences?.schedule) {
        setSchedule(p.preferences.schedule);
      } else if (p.preferences?.preferred_days || p.preferences?.no_study_days) {
        // Migrate legacy preferences
        const legacyPreferred = p.preferences.preferred_days || DAYS.slice(0, 5);
        const legacyNoStudy = p.preferences.no_study_days || ['Sunday'];
        const migrated = defaultSchedule();
        for (const d of DAYS) {
          migrated[d].noStudy = legacyNoStudy.includes(d);
          if (!legacyPreferred.includes(d)) migrated[d].noStudy = true;
          if (p.preferences.preferred_start) migrated[d].start = p.preferences.preferred_start;
          if (p.preferences.preferred_end) migrated[d].end = p.preferences.preferred_end;
        }
        setSchedule(migrated);
      }
      if (p.preferences?.max_hours) setMaxHours(p.preferences.max_hours);
      if (p.preferences?.max_block_hours) setMaxBlockHours(p.preferences.max_block_hours);
      if (p.preferences?.break_duration) setBreakDuration(p.preferences.break_duration);
    };
    load();
  }, [planId]);

  const setDayField = (day, field, value) => {
    setSchedule((prev) => ({ ...prev, [day]: { ...prev[day], [field]: value } }));
  };

  const activeDays = DAYS.filter((d) => !schedule[d]?.noStudy).length;
  const progressValue = activeDays > 0 ? Math.min(100, Math.round(activeDays / 5 * 50 + 50)) : 10;

  const handleNext = async () => {
    await base44.entities.StudyPlan.update(planId, {
      preferences: {
        schedule,
        max_hours: maxHours,
        max_block_hours: maxBlockHours,
        break_duration: breakDuration
      },
      step: 3,
      phase: 'courses'
    });
    navigate(`/plan/${planId}/courses`);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      <PhaseIndicator currentPhase="setup" planId={planId} currentStep={3} />
      <div className="max-w-3xl mx-auto px-4 py-8">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <StepHeader
            icon={Settings}
            title="Study Preferences"
            description="Tell me when and how you like to study. Set your availability for each day of the week." />
          

          {/* Progress */}
          <div className="mb-6">
            <div className="flex justify-between text-xs text-gray-500 mb-1">
              
              
            </div>
            <Progress value={progressValue} className="h-2" />
          </div>

          {/* Weekly availability */}
          <div className="bg-white rounded-xl border border-blue-100 p-6 shadow-sm mb-6">
            <h3 className="font-semibold text-gray-900 mb-1">Weekly availability</h3>
            <p className="text-sm text-gray-400 mb-4">Set your study time window for each day, or mark it as a No Study Day.</p>
            <div className="space-y-3">
              {DAYS.map((day) => {
                const isNoStudy = schedule[day]?.noStudy;
                return (
                  <div
                    key={day}
                    className={`flex flex-wrap items-center gap-3 p-3 rounded-lg border transition-all ${
                    isNoStudy ? 'bg-gray-50 border-gray-100 opacity-60' : 'bg-blue-50/30 border-blue-100'}`
                    }>
                    
                    {/* Day label */}
                    <span className="w-24 text-sm font-medium text-gray-700 flex-shrink-0">{day}</span>

                    {/* Time range */}
                    <div className={`flex items-center gap-2 flex-1 min-w-0 transition-opacity ${isNoStudy ? 'opacity-30 pointer-events-none' : ''}`}>
                      <div className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                        <Input
                          type="time"
                          value={schedule[day]?.start || '09:00'}
                          onChange={(e) => setDayField(day, 'start', e.target.value)}
                          className="h-8 text-sm w-28" />
                        
                      </div>
                      <span className="text-gray-400 text-sm">–</span>
                      <Input
                        type="time"
                        value={schedule[day]?.end || '18:00'}
                        onChange={(e) => setDayField(day, 'end', e.target.value)}
                        className="h-8 text-sm w-28" />
                      
                    </div>

                    {/* No Study toggle */}
                    <button
                      onClick={() => setDayField(day, 'noStudy', !isNoStudy)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all flex-shrink-0 ${
                      isNoStudy ?
                      'bg-red-500 text-white border-red-500' :
                      'bg-white text-gray-500 border-gray-200 hover:border-red-300 hover:text-red-500'}`
                      }>
                      
                      <BanIcon className="w-3 h-3" />
                      No Study Day
                    </button>
                  </div>);

              })}
            </div>
          </div>

          {/* Max hours */}
          <div className="bg-white rounded-xl border border-blue-100 p-6 shadow-sm mb-6">
            <h3 className="font-semibold text-gray-900 mb-1">{t('maxHoursLabel')}</h3>
            
            <div className="flex items-center gap-4">
              <Slider
                value={[maxHours]}
                onValueChange={(v) => setMaxHours(v[0])}
                min={1}
                max={24}
                step={1}
                className="flex-1" />
              
              <span className="text-2xl font-bold text-blue-600 w-16 text-center">{maxHours}h</span>
            </div>
          </div>

          {/* Max block hours */}
          <div className="bg-white rounded-xl border border-blue-100 p-6 shadow-sm mb-6">
            <h3 className="font-semibold text-gray-900 mb-1">Max hours per study block</h3>
            <p className="text-sm text-gray-400 mb-3">Tasks longer than this will be automatically split into shorter blocks.</p>
            <div className="flex items-center gap-4">
              <Slider
                value={[maxBlockHours]}
                onValueChange={(v) => setMaxBlockHours(v[0])}
                min={1}
                max={6}
                step={0.5}
                className="flex-1" />
              <span className="text-2xl font-bold text-indigo-600 w-16 text-center">{maxBlockHours}h</span>
            </div>
          </div>

          {/* Break duration */}
          <div className="bg-white rounded-xl border border-blue-100 p-6 shadow-sm mb-6">
            <h3 className="font-semibold text-gray-900 mb-1 flex items-center gap-2">
              <Coffee className="w-4 h-4 text-amber-500" /> {t('breakLabel')}
            </h3>
            
            <div className="flex items-center gap-4">
              <Slider
                value={[breakDuration]}
                onValueChange={(v) => setBreakDuration(v[0])}
                min={5}
                max={1440}
                step={5}
                className="flex-1" />
              
              <span className="text-2xl font-bold text-amber-600 w-24 text-center">
                {breakDuration >= 60
                  ? `${Math.floor(breakDuration / 60)}h${breakDuration % 60 > 0 ? ` ${breakDuration % 60}m` : ''}`
                  : `${breakDuration}m`}
              </span>
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
      "How long should my breaks be?"]
      } />
    </div>);

}