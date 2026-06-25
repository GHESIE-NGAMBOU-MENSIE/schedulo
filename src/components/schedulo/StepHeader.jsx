import React from 'react';

export default function StepHeader({ title, description, icon: Icon }) {
  return (
    <div className="mb-8">
      <div className="flex items-center gap-3 mb-2">
        {Icon && (
          <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center">
            <Icon className="w-5 h-5" />
          </div>
        )}
        <h2 className="text-2xl font-bold font-heading text-gray-900">{title}</h2>
      </div>
      {description && (
        <p className="text-gray-500 text-sm ml-[52px] max-w-lg">{description}</p>
      )}
    </div>
  );
}