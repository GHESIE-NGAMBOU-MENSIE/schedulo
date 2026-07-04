import React from 'react';

// Simple i18n — language stored in localStorage, reactive via a custom event
export const LANGUAGES = { en: 'English', de: 'Deutsch' };

export function getLang() {
  return localStorage.getItem('schedulo_lang') || 'en';
}

export function setLang(lang) {
  localStorage.setItem('schedulo_lang', lang);
  // Dispatch a custom event so React components can react without a full reload
  window.dispatchEvent(new CustomEvent('schedulo_lang_change', { detail: lang }));
}

const T = {
  en: {
    // Home
    tagline: 'Your smart semester planner',
    newPlan: 'New Plan',
    noPlansYet: 'No study plans yet',
    noPlansDesc: "Create your first study plan and I'll help you organize your semester step by step.",
    createFirstPlan: 'Create your first plan',
    yourPlans: 'Your Study Plans',
    viewPlan: 'View plan',
    continue: 'Continue',
    // Phases
    phaseSetup: 'Planning Setup',
    phaseCourses: 'Course Information',
    phaseGeneration: 'Plan Generation',
    phaseActive: 'Active Semester',
    // AI warnings
    aiWarningCourses: 'Courses were detected by AI. Please review and correct any errors.',
    aiWarningTasks: 'Tasks were extracted by AI. Please review and edit if needed.',
    aiWarningPlan: 'This plan was generated automatically. Please review and adjust it.',
    aiWarningReplan: 'AI suggestions can be wrong. Please verify important dates and tasks before applying.',
    aiWarningChat: 'AI responses may contain errors. Always verify suggestions.',
    // Study Preferences
    maxHoursLabel: 'Maximum study hours per day',
    breakLabel: 'Break between study blocks',
    // Course description placeholder
    courseDescPlaceholder: 'Provide course details such as number of chapters, course content, assignments, exams, and deadlines so study tasks can be extracted.',
    // Plan generation description
    planReviewDesc: 'Review and adjust your study plan. Drag and drop tasks, edit times, and delete tasks when needed.',
    // Fallback tasks
    fallbackNotice: 'No detailed course information was provided. Fallback study tasks have been created based on a simple course structure. Please review and edit them.',
  },
  de: {
    tagline: 'Dein intelligenter Semesterplaner',
    newPlan: 'Neuer Plan',
    noPlansYet: 'Noch keine Lernpläne',
    noPlansDesc: 'Erstelle deinen ersten Lernplan und ich helfe dir, dein Semester Schritt für Schritt zu organisieren.',
    createFirstPlan: 'Ersten Plan erstellen',
    yourPlans: 'Deine Lernpläne',
    viewPlan: 'Plan ansehen',
    continue: 'Weiter',
    phaseSetup: 'Planung einrichten',
    phaseCourses: 'Kursinformationen',
    phaseGeneration: 'Plangenerierung',
    phaseActive: 'Aktives Semester',
    aiWarningCourses: 'Kurse wurden von KI erkannt. Bitte überprüfe und korrigiere Fehler.',
    aiWarningTasks: 'Aufgaben wurden von KI extrahiert. Bitte überprüfe und bearbeite sie.',
    aiWarningPlan: 'Dieser Plan wurde automatisch erstellt. Bitte überprüfe und passe ihn an.',
    aiWarningReplan: 'KI-Vorschläge können fehlerhaft sein. Bitte überprüfe wichtige Termine und Aufgaben.',
    aiWarningChat: 'KI-Antworten können Fehler enthalten. Überprüfe Vorschläge immer.',
    maxHoursLabel: 'Maximale Lernstunden pro Tag',
    breakLabel: 'Pause zwischen Lernblöcken',
    courseDescPlaceholder: 'Gib Kursdetails an, z. B. Anzahl der Kapitel, Kursinhalt, Aufgaben, Prüfungen und Fristen, damit Lernaufgaben extrahiert werden können.',
    planReviewDesc: 'Überprüfe und passe deinen Lernplan an. Verschiebe Aufgaben per Drag & Drop, bearbeite Zeiten und lösche Aufgaben bei Bedarf.',
    fallbackNotice: 'Keine detaillierten Kursinformationen angegeben. Es wurden Standard-Lernaufgaben auf Basis einer einfachen Kursstruktur erstellt. Bitte überprüfe und bearbeite sie.',
  }
};

export function t(key) {
  const lang = getLang();
  return T[lang]?.[key] ?? T['en'][key] ?? key;
}

/**
 * React hook — returns current lang and re-renders when it changes.
 * Usage: const lang = useLang();  then use t() as normal.
 */
export function useLang() {
  const [lang, setLangState] = React.useState(getLang());
  React.useEffect(() => {
    const handler = (e) => setLangState(e.detail);
    window.addEventListener('schedulo_lang_change', handler);
    return () => window.removeEventListener('schedulo_lang_change', handler);
  }, []);
  return lang;
}