import React from 'react';
import { Check } from 'lucide-react';

const phases = [
  { key: 'setup', label: 'Planning Setup', steps: [1, 2, 3] },
  { key: 'courses', label: 'Course Information', steps: [4, 5, 6] },
  { key: 'generation', label: 'Plan Generation', steps: [7, 8] },
  { key: 'active', label: 'Active Semester', steps: [9, 10, 11] },
];

export default function PhaseIndicator({ currentPhase, currentStep }) {
  const phaseIndex = phases.findIndex(p => p.key === currentPhase);

  return (
    <div className="w-full px-4 py-3 bg-white/80 backdrop-blur-sm border-b border-blue-100">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between">
          {phases.map((phase, idx) => {
            const isCompleted = idx < phaseIndex;
            const isCurrent = idx === phaseIndex;
            return (
              <React.Fragment key={phase.key}>
                <div className="flex items-center gap-2">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-all duration-300 ${
                    isCompleted 
                      ? 'bg-emerald-500 text-white' 
                      : isCurrent 
                        ? 'bg-blue-600 text-white shadow-lg shadow-blue-200' 
                        : 'bg-gray-100 text-gray-400'
                  }`}>
                    {isCompleted ? <Check className="w-4 h-4" /> : idx + 1}
                  </div>
                  <span className={`text-sm font-medium hidden sm:block ${
                    isCurrent ? 'text-blue-700' : isCompleted ? 'text-emerald-600' : 'text-gray-400'
                  }`}>
                    {phase.label}
                  </span>
                </div>
                {idx < phases.length - 1 && (
                  <div className={`flex-1 h-0.5 mx-3 transition-all duration-300 ${
                    idx < phaseIndex ? 'bg-emerald-400' : 'bg-gray-200'
                  }`} />
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
}