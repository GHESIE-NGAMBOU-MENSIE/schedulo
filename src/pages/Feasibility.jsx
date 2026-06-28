import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { BarChart3, ArrowRight, ArrowLeft, AlertTriangle, CheckCircle, XCircle, Loader2, RefreshCw } from 'lucide-react';
import { PLANNING_REFERENCE_DATE } from '@/lib/planningDate';
import { Button } from '@/components/ui/button';
import PhaseIndicator from '@/components/schedulo/PhaseIndicator';
import StepHeader from '@/components/schedulo/StepHeader';
import ContextChat from '@/components/schedulo/ContextChat';
import { motion } from 'framer-motion';

export default function Feasibility() {
  const { planId } = useParams();
  const navigate = useNavigate();
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState(null);
  const [plan, setPlan] = useState(null);

  useEffect(() => {
    loadPlan();
  }, [planId]);

  const loadPlan = async () => {
    try {
      const p = await base44.entities.StudyPlan.get(planId);
      setPlan(p);
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

    // Calculate weekly available hours from per-day schedule
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
    const totalWorkload = tasks.reduce((sum, t) => sum + (t.estimated_hours || 0), 0);
    const hoursPerWeek = totalWorkload / totalWeeks;

    const eventsBlocking = (p.calendar_events || []).length;

    const deadlineIssues = [];
    const overloadedWeeks = [];

    tasks.forEach((t) => {
      if (t.deadline) {
        const dl = new Date(t.deadline);
        const daysUntil = Math.ceil((dl - PLANNING_REFERENCE_DATE) / (1000 * 60 * 60 * 24));
        if (daysUntil < 3) deadlineIssues.push(`"${t.title}" deadline is in ${daysUntil} days — very tight!`);else
        if (daysUntil < 7) deadlineIssues.push(`"${t.title}" deadline is in ${daysUntil} days — plan to start soon.`);
      }
    });

    for (let w = 0; w < totalWeeks; w++) {
      if (hoursPerWeek > weeklyAvailableHours) {
        overloadedWeeks.push(w + 1);
      }
    }

    let status = 'feasible';
    const issues = [];
    const suggestions = [];

    if (totalWorkload > totalAvailableHours) {
      status = 'not_feasible';
      issues.push(`You have ${(totalWorkload - totalAvailableHours).toFixed(0)} more hours of workload than available study time.`);
      suggestions.push('Increase your available study days or hours per day.');
      suggestions.push('Consider studying on weekends if not already.');
      suggestions.push('Split large tasks into smaller sessions.');
      suggestions.push('Reduce or postpone lower-priority tasks.');
    } else if (totalWorkload > totalAvailableHours * 0.85) {
      status = 'warning';
      issues.push('Your workload is close to your maximum capacity. You have little buffer for unexpected delays.');
      suggestions.push('Consider starting a few days earlier to create buffer time.');
      suggestions.push('Prioritize your most important tasks.');
    }

    if (deadlineIssues.length > 0) {
      if (status === 'feasible') status = 'warning';
      issues.push(...deadlineIssues);
      suggestions.push('Prioritize tasks with close deadlines.');
    }

    if (hoursPerWeek > weeklyAvailableHours) {
      if (status === 'feasible') status = 'warning';
      issues.push(`Average weekly workload (${hoursPerWeek.toFixed(1)}h) exceeds your weekly available hours (${weeklyAvailableHours.toFixed(1)}h).`);
      suggestions.push('Increase your daily study window or add more study days.');
    }

    const analysisResult = {
      status,
      totalAvailableHours: Math.round(totalAvailableHours),
      totalWorkload: Math.round(totalWorkload),
      totalWeeks,
      hoursPerWeek: Number(hoursPerWeek.toFixed(1)),
      studyDaysPerWeek,
      maxHoursPerDay,
      eventsBlocking,
      issues,
      suggestions,
      taskCount: tasks.length,
      courseCount: courses.length
    };

    await base44.entities.StudyPlan.update(planId, { feasibility: analysisResult });
    setResult(analysisResult);
    setChecking(false);
  };

  const statusConfig = {
    feasible: { icon: CheckCircle, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200', label: 'Feasible', desc: 'Your study plan looks good! The workload fits within your available time.' },
    warning: { icon: AlertTriangle, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200', label: 'Warning', desc: 'Your plan is possible but tight. Consider the suggestions below.' },
    not_feasible: { icon: XCircle, color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200', label: 'Not Feasible', desc: 'Your plan exceeds your available time. You need to make some adjustments.' }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      <PhaseIndicator currentPhase="generation" currentStep={7} planId={planId} />
      <div className="max-w-3xl mx-auto px-4 py-8">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <StepHeader
            icon={BarChart3}
            title="Feasibility Check"
            description="I'll compare your total workload against your available study time, deadlines, and preferences to check if your plan is realistic." />
          

          {!result && !checking &&
          <div className="bg-white rounded-xl border border-blue-100 p-8 shadow-sm text-center mb-6">
              <BarChart3 className="w-10 h-10 text-blue-400 mx-auto mb-3" />
              <p className="text-gray-600 mb-1">Ready to analyze your study plan feasibility.</p>
              
              <Button onClick={runCheck} className="bg-blue-600 hover:bg-blue-700">
                Run feasibility check
              </Button>
            </div>
          }

          {checking &&
          <div className="bg-white rounded-xl border border-blue-100 p-8 shadow-sm text-center mb-6">
              <Loader2 className="w-10 h-10 animate-spin text-blue-500 mx-auto mb-3" />
              <p className="text-gray-600">Analyzing your plan...</p>
            </div>
          }

          {result &&
          <>
              {/* Status */}
              <div className={`${statusConfig[result.status].bg} ${statusConfig[result.status].border} border rounded-xl p-6 mb-6`}>
                <div className="flex items-center gap-3 mb-2">
                  {React.createElement(statusConfig[result.status].icon, { className: `w-6 h-6 ${statusConfig[result.status].color}` })}
                  <h3 className={`text-lg font-bold ${statusConfig[result.status].color}`}>{statusConfig[result.status].label}</h3>
                </div>
                <p className="text-sm text-gray-600">{statusConfig[result.status].desc}</p>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                {[
              { label: 'Available hours', value: `${result.totalAvailableHours}h`, color: 'text-blue-600' },
              { label: 'Total workload', value: `${result.totalWorkload}h`, color: result.totalWorkload > result.totalAvailableHours ? 'text-red-600' : 'text-emerald-600' },
              { label: 'Hours per week', value: `${result.hoursPerWeek}h`, color: 'text-purple-600' },
              { label: 'Study weeks', value: result.totalWeeks, color: 'text-amber-600' }].
              map((stat) =>
              <div key={stat.label} className="bg-white rounded-xl border border-blue-100 p-4 text-center shadow-sm">
                    <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
                    <p className="text-xs text-gray-400 mt-1">{stat.label}</p>
                  </div>
              )}
              </div>

              {/* Issues */}
              {result.issues.length > 0 &&
            <div className="bg-white rounded-xl border border-blue-100 p-6 shadow-sm mb-4">
                  <h3 className="font-semibold text-gray-900 mb-3">Issues found</h3>
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

              {/* Suggestions */}
              {result.suggestions.length > 0 &&
            <div className="bg-white rounded-xl border border-blue-100 p-6 shadow-sm mb-6">
                  <h3 className="font-semibold text-gray-900 mb-3">Suggestions</h3>
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

              <div className="flex flex-wrap gap-2 mb-6">
                <Button variant="outline" onClick={() => navigate(`/plan/${planId}/preferences`)}>
                  Adjust preferences
                </Button>
                <Button variant="outline" onClick={() => navigate(`/plan/${planId}/tasks`)}>
                  Edit tasks
                </Button>
                <Button variant="outline" onClick={() => {setResult(null);runCheck();}}>
                  <RefreshCw className="w-4 h-4 mr-1" /> Re-check
                </Button>
              </div>
            </>
          }

          <div className="flex justify-between items-center">
            <Button variant="ghost" onClick={() => navigate(`/plan/${planId}/tasks`)}>
              <ArrowLeft className="w-4 h-4 mr-1" /> Back
            </Button>
            <Button onClick={() => navigate(`/plan/${planId}/generate`)} disabled={!result} className="bg-blue-600 hover:bg-blue-700">
              Generate study plan <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        </motion.div>
      </div>
      <ContextChat phase="feasibility" planId={planId} suggestions={[
      "Why is my plan not feasible?",
      "How can I reduce my workload?",
      "Should I study on weekends?"]
      } />
    </div>);

}