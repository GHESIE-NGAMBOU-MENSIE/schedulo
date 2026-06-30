import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Sparkles, Plus, Calendar, Clock, ArrowRight, Trash2, Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import { t, getLang, setLang, LANGUAGES } from '@/lib/i18n';

export default function Home() {
  const navigate = useNavigate();
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPlans();
  }, []);

  const loadPlans = async () => {
    try {
      const list = await base44.entities.StudyPlan.list('-created_date');
      setPlans(list);
    } catch (e) {}
    setLoading(false);
  };

  const deletePlan = async (id) => {
    try { await base44.entities.StudyPlan.delete(id); } catch (e) {}
    try {
      const courses = await base44.entities.Course.filter({ plan_id: id });
      for (const c of courses) await base44.entities.Course.delete(c.id);
    } catch (e) {}
    try {
      const tasks = await base44.entities.StudyTask.filter({ plan_id: id });
      for (const t of tasks) await base44.entities.StudyTask.delete(t.id);
    } catch (e) {}
    loadPlans();
  };

  const getPhaseRoute = (plan) => {
    if (plan.status === 'active') return `/plan/${plan.id}/active`;
    if (plan.phase === 'generation') return `/plan/${plan.id}/feasibility`;
    if (plan.phase === 'courses') return `/plan/${plan.id}/courses`;
    return `/plan/${plan.id}/dates`;
  };

  const statusColors = {
    draft: 'bg-amber-100 text-amber-700',
    active: 'bg-emerald-100 text-emerald-700',
    completed: 'bg-blue-100 text-blue-700',
    archived: 'bg-gray-100 text-gray-600',
  };

  const [lang, setLangState] = useState(getLang());

  const phaseLabels = {
    setup: t('phaseSetup'),
    courses: t('phaseCourses'),
    generation: t('phaseGeneration'),
    active: t('phaseActive'),
  };

  const handleLangChange = (l) => {
    setLangState(l);
    setLang(l);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      <div className="max-w-4xl mx-auto px-4 py-12">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          {/* Header */}
          <div className="flex items-center justify-between mb-10">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-200">
                <Sparkles className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold font-heading text-gray-900">Schedulo</h1>
                <p className="text-sm text-gray-400">{t('tagline')}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* Language selector */}
              <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg p-1">
                <Globe className="w-3.5 h-3.5 text-gray-400 ml-1" />
                {Object.entries(LANGUAGES).map(([code, label]) => (
                  <button
                    key={code}
                    onClick={() => handleLangChange(code)}
                    className={`px-2.5 py-1 rounded text-xs font-medium transition-all ${lang === code ? 'bg-blue-600 text-white' : 'text-gray-500 hover:text-gray-700'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <Button onClick={() => navigate('/onboarding')} className="bg-blue-600 hover:bg-blue-700">
                <Plus className="w-4 h-4 mr-1" /> {t('newPlan')}
              </Button>
            </div>
          </div>

          {/* Plans */}
          {plans.length === 0 ? (
            <div className="bg-white rounded-2xl border border-blue-100 p-12 text-center shadow-sm">
              <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Calendar className="w-8 h-8 text-blue-400" />
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">{t('noPlansYet')}</h2>
              <p className="text-gray-400 mb-6 max-w-sm mx-auto">{t('noPlansDesc')}</p>
              <Button onClick={() => navigate('/onboarding')} className="bg-blue-600 hover:bg-blue-700">
                <Plus className="w-4 h-4 mr-1" /> {t('createFirstPlan')}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-gray-900">{t('yourPlans')}</h2>
              {plans.map((plan, i) => (
                <motion.div
                  key={plan.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                >
                  <div className="bg-white rounded-xl border border-blue-100 p-5 shadow-sm hover:shadow-md transition-all group">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold text-gray-900">{plan.name}</h3>
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[plan.status] || 'bg-gray-100 text-gray-600'}`}>
                            {plan.status}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-3 text-xs text-gray-400">
                          {plan.start_date && <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {plan.start_date} – {plan.end_date}</span>}
                          <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {phaseLabels[plan.phase] || plan.phase}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => deletePlan(plan.id)} className="p-2 opacity-0 group-hover:opacity-100 hover:bg-red-50 rounded-lg transition-all">
                          <Trash2 className="w-4 h-4 text-red-400" />
                        </button>
                        <Link to={getPhaseRoute(plan)}>
                          <Button size="sm" className="bg-blue-600 hover:bg-blue-700">
                            {plan.status === 'active' ? t('viewPlan') : t('continue')} <ArrowRight className="w-4 h-4 ml-1" />
                          </Button>
                        </Link>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}