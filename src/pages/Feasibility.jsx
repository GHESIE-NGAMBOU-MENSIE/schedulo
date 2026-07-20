import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { t, useLang } from '@/lib/i18n';
import { BarChart3, ArrowRight, ArrowLeft, AlertTriangle, CheckCircle, XCircle, Loader2, RefreshCw, BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import PhaseIndicator from '@/components/schedulo/PhaseIndicator';
import StepHeader from '@/components/schedulo/StepHeader';
import ContextChat from '@/components/schedulo/ContextChat';
import { motion } from 'framer-motion';

export default function Feasibility() {
  const { planId } = useParams();
  const navigate = useNavigate();
  useLang(); // re-render on language change
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState(null);
  const [plan, setPlan] = useState(null);

  useEffect(() => {loadPlan();}, [planId]);

  const loadPlan = async () => {
    try {
      const p = await base44.entities.StudyPlan.get(planId);
      setPlan(p);
      // Auto-run if we already have a stored result
      if (p.feasibility) setResult(p.feasibility);
    } catch (e) {
      navigate('/');
    }
  };

  const runCheck = async () => {
    setChecking(true);
    const p = await base44.entities.StudyPlan.get(planId);
    const tasks = await base44.entities.StudyTask.filter({ plan_id: planId });
    const courses = await base44.entities.Course.filter({ plan_id: planId });
    const prefs = p.preferences || {};

    const startDate = new Date(p.start_date);
    const endDate = new Date(p.end_date);
    const totalDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
    const totalWeeks = Math.max(1, Math.ceil(totalDays / 7));

    // ── Available study hours ──────────────────────────────────────────────
    const daySchedule = prefs.schedule || {};
    const maxHoursPerDay = prefs.max_hours || 6;
    const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

    const weeklyAvailableHours = DAYS.reduce((sum, day) => {
      const dayPref = daySchedule[day];
      if (!dayPref || dayPref.noStudy) return sum;
      const [sh, sm] = (dayPref.start || '09:00').split(':').map(Number);
      const [eh, em] = (dayPref.end || '18:00').split(':').map(Number);
      const windowHours = Math.max(0, eh + em / 60 - (sh + sm / 60));
      return sum + Math.min(windowHours, maxHoursPerDay);
    }, 0);

    const studyDaysPerWeek = DAYS.filter((day) => daySchedule[day] && !daySchedule[day].noStudy).length;
    const totalAvailableHours = weeklyAvailableHours * totalWeeks;

    // ── CP-based workload (canonical) ─────────────────────────────────────
    // 1 CP = 30h — this is the ground truth regardless of extracted tasks
    const calEvents = p.calendar_events || [];

    const coursesWithMeta = courses.map((course) => {
      const cp = course.credit_points || 0;
      const cpHours = cp * 30;

      // Estimate calendar attendance hours for this course
      const courseLower = (course.name || '').toLowerCase().
      replace(/\b(vorlesung|lecture|course|übung|exercise|lab|seminar)\b/gi, '').trim();
      const matchingEvents = calEvents.filter((e) => {
        const eLower = (e.name || '').toLowerCase();
        return eLower.includes(courseLower.split(' ')[0]) || courseLower.includes(eLower.split(' ')[0]);
      });

      const weekCount = totalWeeks;
      const calHoursPerWeek = matchingEvents.reduce((s, e) => {
        if (e.start_time && e.end_time) {
          const [sh, sm] = e.start_time.split(':').map(Number);
          const [eh, em] = e.end_time.split(':').map(Number);
          return s + Math.max(0, (eh * 60 + em - sh * 60 - sm) / 60);
        }
        return s + 1.5;
      }, 0);

      const calHoursTotal = Math.round(calHoursPerWeek * weekCount * 10) / 10;
      const remainingHours = Math.max(0, cpHours - calHoursTotal);
      const taskHours = tasks.filter((t) => t.course_id === course.id).
      reduce((s, t) => s + (t.estimated_hours || 0), 0);

      return {
        id: course.id,
        name: course.name,
        cp,
        cpHours,
        calHoursTotal,
        remainingHours,
        taskHours,
        examDate: course.exam_date,
        examType: course.exam_type
      };
    });

    const totalCpWorkload = coursesWithMeta.reduce((s, c) => s + c.cpHours, 0);
    const totalCalHours = coursesWithMeta.reduce((s, c) => s + c.calHoursTotal, 0);
    const totalRemainingWorkload = Math.max(
      coursesWithMeta.reduce((s, c) => s + c.remainingHours, 0),
      tasks.reduce((s, t) => s + (t.estimated_hours || 0), 0)
    );

    const hoursPerWeek = totalRemainingWorkload / totalWeeks;

    // ── Status determination ──────────────────────────────────────────────
    let status = 'feasible';
    const issues = [];
    const suggestions = [];

    if (totalRemainingWorkload > totalAvailableHours) {
      status = 'not_feasible';
      const gap = Math.round(totalRemainingWorkload - totalAvailableHours);
      issues.push(`Your courses require ~${Math.round(totalRemainingWorkload)}h of self-study, but your availability is ~${Math.round(totalAvailableHours)}h — a gap of ${gap}h.`);
      suggestions.push('Increase your daily study window or add more study days.');
      suggestions.push('Reduce no-study days where possible.');
      suggestions.push('Check if any course CPs can be reduced or deferred.');
    }

    const missingExam = coursesWithMeta.filter((c) => !c.examDate && c.examType !== 'none');
    if (missingExam.length > 0) {
      issues.push(`No exam date set for: ${missingExam.map((c) => c.name).join(', ')}. Exam preparation timing may be unreliable.`);
      suggestions.push('Add exam dates in course details for more accurate planning.');
    }

    const analysisResult = {
      status,
      totalAvailableHours: Math.round(totalAvailableHours),
      totalCpWorkload: Math.round(totalCpWorkload),
      totalCalHours: Math.round(totalCalHours),
      totalRemainingWorkload: Math.round(totalRemainingWorkload),
      totalWeeks,
      hoursPerWeek: Number(hoursPerWeek.toFixed(1)),
      weeklyAvailableHours: Number(weeklyAvailableHours.toFixed(1)),
      studyDaysPerWeek,
      maxHoursPerDay,
      issues,
      suggestions,
      taskCount: tasks.length,
      courseCount: courses.length,
      coursesWithMeta
    };

    await base44.entities.StudyPlan.update(planId, { feasibility: analysisResult });
    setResult(analysisResult);
    setChecking(false);
  };

  const statusConfig = {
    feasible: { icon: CheckCircle, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200', label: t('feasible'), desc: t('feasibleDesc') },
    not_feasible: { icon: XCircle, color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200', label: t('notFeasible'), desc: t('notFeasibleDesc') }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      <PhaseIndicator currentPhase="generation" currentStep={7} planId={planId} />
      <div className="max-w-3xl mx-auto px-4 py-8">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <StepHeader
            icon={BarChart3}
            title={t('feasibilityTitle')}
            description={t('feasibilityDesc')} />

          {!result && !checking &&
          <div className="bg-white rounded-xl border border-blue-100 p-8 shadow-sm text-center mb-6">
              <BarChart3 className="w-10 h-10 text-blue-400 mx-auto mb-3" />
              <p className="text-gray-600 mb-4">{t('readyToAnalyze')}</p>
              <Button onClick={runCheck} className="bg-blue-600 hover:bg-blue-700">
                {t('runFeasibilityCheck')}
              </Button>
            </div>
          }

          {checking &&
          <div className="bg-white rounded-xl border border-blue-100 p-8 shadow-sm text-center mb-6">
              <Loader2 className="w-10 h-10 animate-spin text-blue-500 mx-auto mb-3" />
              <p className="text-gray-600">{t('analyzing')}</p>
            </div>
          }

          {result &&
          <>
              {/* Action buttons — above the feasibility message */}
              <div className="flex flex-wrap gap-2 mb-6">
                <Button variant="outline" onClick={() => navigate(`/plan/${planId}/preferences`)}>
                  {t('adjustPreferences')}
                </Button>
                <Button variant="outline" onClick={() => navigate(`/plan/${planId}/tasks`)}>
                  {t('editTasks')}
                </Button>
                <Button variant="outline" onClick={() => {setResult(null);runCheck();}}>
                  <RefreshCw className="w-4 h-4 mr-1" /> {t('reCheck')}
                </Button>
                <Button onClick={() => navigate(`/plan/${planId}/generate`)} className="bg-blue-600 hover:bg-blue-700">
                  {t('generateCalendar')} <ArrowRight className="w-4 h-4 ml-1" />
                </Button>
              </div>

              {/* Status */}
              <div className={`${statusConfig[result.status].bg} ${statusConfig[result.status].border} border rounded-xl p-6 mb-6`}>
                <div className="flex items-center gap-3 mb-2">
                  {React.createElement(statusConfig[result.status].icon, { className: `w-6 h-6 ${statusConfig[result.status].color}` })}
                  <h3 className={`text-lg font-bold ${statusConfig[result.status].color}`}>{statusConfig[result.status].label}</h3>
                </div>
                <p className="text-sm text-gray-600">{statusConfig[result.status].desc}</p>
              </div>

              {/* Per-course breakdown */}
              {result.coursesWithMeta && result.coursesWithMeta.length > 0 &&
            <div className="bg-white rounded-xl border border-blue-100 p-5 shadow-sm mb-5">
                  <div className="flex items-center gap-2 mb-3">
                    <BookOpen className="w-4 h-4 text-blue-500" />
                    <h3 className="font-semibold text-gray-900 text-sm">Workload per course</h3>
                  </div>
                  <div className="space-y-2">
                    {result.coursesWithMeta.map((c, i) => {
                  const pct = result.totalCpWorkload > 0 ? Math.round(c.cpHours / result.totalCpWorkload * 100) : 0;
                  return (
                    <div key={i} className="flex items-center gap-3 text-sm">
                          <div className="w-2 h-2 rounded-full bg-blue-400 flex-shrink-0" />
                          <span className="flex-1 text-gray-700 truncate">{c.name}</span>
                          <span className="text-gray-400 text-xs">{c.cp} CP</span>
                          <span className="font-semibold text-blue-700 w-14 text-right">{c.cpHours}h</span>
                          {c.calHoursTotal > 0 &&
                      <span className="text-violet-500 text-xs w-20 text-right">−{c.calHoursTotal}h cal</span>
                      }
                          <span className="text-gray-500 text-xs w-20 text-right">{c.remainingHours}h self-study</span>
                        </div>);

                })}
                    <div className="flex items-center gap-3 text-sm border-t border-gray-100 pt-2 mt-1">
                      <div className="w-2 h-2 rounded-full flex-shrink-0" />
                      <span className="flex-1 font-semibold text-gray-800">Total</span>
                      <span className="text-gray-400 text-xs">{result.courseCount} courses</span>
                      <span className="font-bold text-blue-700 w-14 text-right">{result.totalCpWorkload}h</span>
                      {result.totalCalHours > 0 &&
                  <span className="text-violet-500 text-xs w-20 text-right">−{result.totalCalHours}h cal</span>
                  }
                      <span className="font-bold text-gray-700 text-xs w-20 text-right">{result.totalRemainingWorkload}h</span>
                    </div>
                  </div>
                </div>
            }

              {/* Issues — only shown when not feasible */}
              {result.status === 'not_feasible' && result.issues.length > 0 &&
            <div className="bg-white rounded-xl border border-blue-100 p-6 shadow-sm mb-4">
                  <h3 className="font-semibold text-gray-900 mb-3">{t('issuesFound')}</h3>
                  <ul className="space-y-2">
                    {result.issues.map((issue, i) =>
                <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                        <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                        {issue}
                      </li>
                )}
                  </ul>
                </div>
            }

              {/* Suggestions — only shown when not feasible */}
              {result.status === 'not_feasible' && result.suggestions.length > 0 &&
            <div className="bg-white rounded-xl border border-blue-100 p-6 shadow-sm mb-6">
                  <h3 className="font-semibold text-gray-900 mb-3">{t('suggestions')}</h3>
                  <ul className="space-y-2">
                    {result.suggestions.map((s, i) =>
                <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                        <span className="text-blue-500 mt-0.5 flex-shrink-0">💡</span>
                        {s}
                      </li>
                )}
                  </ul>
                </div>
            }

            </>
          }

          <div className="flex justify-between items-center">
            <Button variant="ghost" onClick={() => navigate(`/plan/${planId}/tasks`)}>
              <ArrowLeft className="w-4 h-4 mr-1" /> {t('back')}
            </Button>
            

            
          </div>
        </motion.div>
      </div>
      <ContextChat phase="feasibility" planId={planId} suggestions={[
      "Why is my workload so high?",
      "How does the CP workload work?",
      "How can I reduce my workload?",
      "Should I study on weekends?"]
      } />
    </div>);

}