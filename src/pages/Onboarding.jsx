import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Calendar, BookOpen, BarChart3, RefreshCw, ArrowRight, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import ContextChat from '@/components/schedulo/ContextChat';
import { t, useLang } from '@/lib/i18n';

export default function Onboarding() {
  const navigate = useNavigate();
  const [showChat, setShowChat] = useState(false);
  useLang(); // re-render on language change

  const phases = [
    { icon: Calendar, title: t('phase1Title'), desc: t('phase1Desc') },
    { icon: BookOpen, title: t('phase2Title'), desc: t('phase2Desc') },
    { icon: BarChart3, title: t('phase3Title'), desc: t('phase3Desc') },
    { icon: RefreshCw, title: t('phase4Title'), desc: t('phase4Desc') }
  ];

  const handleStart = async () => {
    try {
      const plan = await base44.entities.StudyPlan.create({
        name: 'My Study Plan',
        status: 'draft',
        phase: 'setup',
        step: 1,
        preferences: {},
        calendar_events: [],
        scenarios: [],
        active_scenario: 0
      });
      navigate(`/plan/${plan.id}/dates`);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="max-w-2xl w-full"
      >
        <div className="text-center mb-10">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: 'spring' }}
            className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-blue-200"
          >
            <Sparkles className="w-8 h-8 text-white" />
          </motion.div>
          <h1 className="text-4xl font-bold font-heading text-gray-900 mb-4">
            {t('onboardingTitle')}
          </h1>
          <p className="text-lg text-gray-600 max-w-md mx-auto leading-relaxed">
            {t('onboardingDesc')}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-10">
          {phases.map((phase, i) => (
            <motion.div
              key={phase.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 + i * 0.1 }}
              className="bg-white rounded-xl p-5 border border-blue-100 shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <phase.icon className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-xs font-semibold text-blue-500 bg-blue-50 px-2 py-0.5 rounded-full">Phase {i + 1}</span>
                  <h3 className="font-semibold text-gray-900 mt-1">{phase.title}</h3>
                  <p className="text-sm text-gray-500 mt-1">{phase.desc}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
          className="text-center"
        >
          <Button
            onClick={handleStart}
            size="lg"
            className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-6 text-lg rounded-xl shadow-lg shadow-blue-200 hover:shadow-xl transition-all"
          >
            {t('startPlanning')}
            <ArrowRight className="w-5 h-5 ml-2" />
          </Button>
        </motion.div>
      </motion.div>

      {showChat && (
        <ContextChat
          phase="onboarding"
          planId={null}
          autoOpen={true}
          initialMessage="👋 Hi! I'm here if you have any questions while creating your study plan. Feel free to ask for help at any time."
          suggestions={[
            "How does Schedulo work?",
            "What do I need to get started?",
            "What is an .ics calendar file?"
          ]}
        />
      )}
    </div>
  );
}