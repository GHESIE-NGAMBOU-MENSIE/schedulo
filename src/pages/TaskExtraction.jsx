import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { ListChecks, ArrowRight, ArrowLeft, Loader2, Edit2, Check, Trash2, Plus, ChevronDown, ChevronUp, AlertTriangle, RefreshCw, AlertCircle } from 'lucide-react';
import WorkloadBreakdown from '@/components/schedulo/WorkloadBreakdown';
import WeeklyTaskList from '@/components/schedulo/WeeklyTaskList';
import { t } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import PhaseIndicator from '@/components/schedulo/PhaseIndicator';
import StepHeader from '@/components/schedulo/StepHeader';
import ContextChat from '@/components/schedulo/ContextChat';
import { motion } from 'framer-motion';

const TASK_TYPES = ['reading', 'assignment', 'exercise', 'revision', 'test', 'project_work'];

function TaskTemporalBadges({ task }) {
  const items = [];
  if (task.target_date) items.push({ label: `Target: ${task.target_date}`, color: 'bg-blue-50 text-blue-700' });
  if (task.target_week) items.push({ label: `Week ${task.target_week}${task.source_week_label ? ` (${task.source_week_label})` : ''}`, color: 'bg-indigo-50 text-indigo-700' });
  if (task.not_before_date) items.push({ label: `Not before: ${task.not_before_date}`, color: 'bg-amber-50 text-amber-700' });
  if (task.related_course_event_date) items.push({ label: `${task.related_course_event_type || 'Event'}: ${task.related_course_event_date}`, color: 'bg-purple-50 text-purple-700' });
  if (task.exam_date) items.push({ label: `Exam: ${task.exam_date}`, color: 'bg-red-50 text-red-700' });
  if (items.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-1.5">
      {items.map((item, i) =>
      <span key={i} className={`px-2 py-0.5 rounded text-xs font-medium ${item.color}`}>{item.label}</span>
      )}
    </div>);

}

function TaskEditForm({ task, courseId, onSave, onCancel, setTasks }) {
  const update = (field, val) => setTasks((prev) => ({
    ...prev,
    [courseId]: prev[courseId].map((t) => t.id === task.id ? { ...t, [field]: val } : t)
  }));

  return (
    <div className="space-y-3">
      <Input value={task.title} onChange={(e) => update('title', e.target.value)} placeholder="Task title" />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Select value={task.task_type} onValueChange={(v) => update('task_type', v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{TASK_TYPES.map((tt) => <SelectItem key={tt} value={tt}>{tt.replace('_', ' ')}</SelectItem>)}</SelectContent>
        </Select>
        <Input type="number" value={task.estimated_hours} onChange={(e) => update('estimated_hours', Number(e.target.value))} placeholder="Hours" />
        <div>
          <Label className="text-xs text-gray-500">Deadline</Label>
          <Input type="date" value={task.deadline || ''} onChange={(e) => update('deadline', e.target.value || null)} />
        </div>
        <Select value={task.priority} onValueChange={(v) => update('priority', v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="low">Low</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="high">High</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <div>
          <Label className="text-xs text-gray-500">Target date</Label>
          <Input type="date" value={task.target_date || ''} onChange={(e) => update('target_date', e.target.value || null)} />
        </div>
        <div>
          <Label className="text-xs text-gray-500">Not before</Label>
          <Input type="date" value={task.not_before_date || ''} onChange={(e) => update('not_before_date', e.target.value || null)} />
        </div>
        <div>
          <Label className="text-xs text-gray-500">Target week #</Label>
          <Input type="number" value={task.target_week || ''} onChange={(e) => update('target_week', e.target.value ? Number(e.target.value) : null)} placeholder="e.g. 3" />
        </div>
        <div>
          <Label className="text-xs text-gray-500">Related event date</Label>
          <Input type="date" value={task.related_course_event_date || ''} onChange={(e) => update('related_course_event_date', e.target.value || null)} />
        </div>
        <div>
          <Label className="text-xs text-gray-500">Related event type</Label>
          <Input value={task.related_course_event_type || ''} onChange={(e) => update('related_course_event_type', e.target.value)} placeholder="lecture / exercise / quiz" />
        </div>
        <div>
          <Label className="text-xs text-gray-500">Exam date</Label>
          <Input type="date" value={task.exam_date || ''} onChange={(e) => update('exam_date', e.target.value || null)} />
        </div>
      </div>
      {task.source_text &&
      <p className="text-xs text-gray-400 italic border-l-2 border-gray-200 pl-2">Source: "{task.source_text}"</p>
      }
      <div className="flex gap-2">
        <Button size="sm" onClick={() => onSave(task.id, task)}><Check className="w-4 h-4 mr-1" /> Save</Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </div>);

}

export default function TaskExtraction() {
  const { planId } = useParams();
  const navigate = useNavigate();
  const [courses, setCourses] = useState([]);
  const [tasks, setTasks] = useState({});
  const [extracting, setExtracting] = useState(false);
  const [extractingCourse, setExtractingCourse] = useState('');
  const [extracted, setExtracted] = useState(false);
  const [editTask, setEditTask] = useState(null);
  const [activeCourse, setActiveCourse] = useState(0);
  const [showAddTask, setShowAddTask] = useState(false);
  const [newTask, setNewTask] = useState({ title: '', task_type: 'reading', deadline: '', estimated_hours: 2, priority: 'medium' });
  const [confirming, setConfirming] = useState(false);
  const [expandedSource, setExpandedSource] = useState({});
  const [coverageStats, setCoverageStats] = useState({});
  const [showReExtractConfirm, setShowReExtractConfirm] = useState(false);
  const [workloadBreakdowns, setWorkloadBreakdowns] = useState({});
  const [calendarHoursByCourse, setCalendarHoursByCourse] = useState({});
  const [planStartDate, setPlanStartDate] = useState('');
  const [addTaskForCourse, setAddTaskForCourse] = useState(null); // courseId

  useEffect(() => {loadData();}, [planId]);

  const loadData = async () => {
    const courseList = await base44.entities.Course.filter({ plan_id: planId });
    setCourses(courseList);

    // Compute calendar attendance hours per course from plan events
    try {
      const plan = await base44.entities.StudyPlan.get(planId);
      setPlanStartDate(plan.start_date || '');
      const events = plan.calendar_events || [];
      const hours = {};
      courseList.forEach(c => {
        const courseLower = c.name.toLowerCase().replace(/\b(vorlesung|lecture|course|übung|exercise|lab|seminar)\b/gi, '').trim();
        const matching = events.filter(e => {
          const eLower = (e.name || '').toLowerCase();
          return eLower.includes(courseLower) || courseLower.includes(eLower.split(' ')[0]);
        });
        // Each event is weekly during study period — estimate hours
        const weekCount = plan.start_date && plan.end_date
          ? Math.ceil((new Date(plan.end_date) - new Date(plan.start_date)) / (7 * 86400000))
          : 14;
        const hoursPerEvent = matching.map(e => {
          if (e.start_time && e.end_time) {
            const [sh, sm] = e.start_time.split(':').map(Number);
            const [eh, em] = e.end_time.split(':').map(Number);
            return ((eh * 60 + em) - (sh * 60 + sm)) / 60;
          }
          return 1.5; // assume 90min if no time given
        });
        const totalPerWeek = hoursPerEvent.reduce((s, h) => s + h, 0);
        hours[c.id] = Math.round(totalPerWeek * weekCount * 10) / 10;
      });
      setCalendarHoursByCourse(hours);
    } catch (e) {}

    const existingTasks = await base44.entities.StudyTask.filter({ plan_id: planId });
    if (existingTasks.length > 0) {
      const grouped = {};
      courseList.forEach((c) => {grouped[c.id] = [];});
      existingTasks.forEach((t) => {if (grouped[t.course_id] !== undefined) grouped[t.course_id].push(t);});
      setTasks(grouped);
      setExtracted(true);
    } else {
      extractTasksForCourses(courseList, false);
    }
  };

  const [fallbackCourses, setFallbackCourses] = useState(new Set()); // course IDs that used fallback

  // Client-side fallback: parse chapter/topic lines from materials_text
  // Returns ~10 tasks (5 reading + 5 exercise) when no course info given
  const buildFallbackTasks = (course) => {
    const material = course.materials_text || '';
    const lines = material.split('\n').map((l) => l.trim()).filter(Boolean);
    const chapterRe = /^(chapter|ch\.?|topic|week|session|lecture|woche|sitzung|einheit|thema)\s*(\d+)[:\s\-–]*(.*)/i;
    const found = lines.map((l) => l.match(chapterRe)).filter(Boolean);

    if (found.length >= 3) {
      return found.map((m, i) => ({
        title: `Read ${m[1]} ${m[2]}${m[3] ? ': ' + m[3].trim() : ''}`,
        task_type: 'reading', estimated_hours: 2, priority: 'medium',
        target_week: parseInt(m[2]) || i + 1,
        source_week_label: m[0].trim().slice(0, 80),
        source_text: m[0].trim().slice(0, 200),
        date_confidence: 'none'
      }));
    }
    // Generic 10-task fallback structure
    return [
      { title: `Read Chapter 1: Introduction to ${course.name}`, task_type: 'reading', estimated_hours: 2, priority: 'medium', target_week: 1, date_confidence: 'none' },
      { title: `Read Chapter 2: Core Concepts`, task_type: 'reading', estimated_hours: 2, priority: 'medium', target_week: 2, date_confidence: 'none' },
      { title: `Read Chapter 3: Advanced Topics`, task_type: 'reading', estimated_hours: 2, priority: 'medium', target_week: 3, date_confidence: 'none' },
      { title: `Read Chapter 4: Applications`, task_type: 'reading', estimated_hours: 2, priority: 'medium', target_week: 4, date_confidence: 'none' },
      { title: `Read Chapter 5: Summary and Review`, task_type: 'reading', estimated_hours: 2, priority: 'medium', target_week: 5, date_confidence: 'none' },
      { title: `Practice exercises – Week 1`, task_type: 'exercise', estimated_hours: 1.5, priority: 'medium', target_week: 1, date_confidence: 'none' },
      { title: `Practice exercises – Week 2`, task_type: 'exercise', estimated_hours: 1.5, priority: 'medium', target_week: 2, date_confidence: 'none' },
      { title: `Practice exercises – Week 3`, task_type: 'exercise', estimated_hours: 1.5, priority: 'medium', target_week: 3, date_confidence: 'none' },
      { title: `Practice exercises – Week 4`, task_type: 'exercise', estimated_hours: 1.5, priority: 'medium', target_week: 4, date_confidence: 'none' },
      { title: `Prepare for final exam: ${course.name}`, task_type: 'test', estimated_hours: 3, priority: 'high', deadline: course.exam_date || null, exam_date: course.exam_date || null, date_confidence: course.exam_date ? 'exact' : 'none' },
    ];
  };

  const extractTasksForCourses = async (courseList, deleteExisting = false) => {
    setExtracting(true);
    setShowReExtractConfirm(false);
    const newTasks = {};
    const newCoverageStats = {};
    const plan = await base44.entities.StudyPlan.get(planId);

    if (deleteExisting) {
      await base44.entities.StudyTask.deleteMany({ plan_id: planId });
    }

    for (const course of courseList) {
      setExtractingCourse(course.name);

      // CP-based workload budget
      const cp = course.credit_points || 5;
      const cpTotalHours = cp * 30;
      // Subtract calendar attendance hours
      const calHours = calendarHoursByCourse[course.id] || 0;
      const selfStudyBudget = Math.max(cpTotalHours - calHours, cpTotalHours * 0.6);

      const wb = workloadBreakdowns[course.id];
      const wbText = wb
        ? `WORKLOAD BUDGET (student-approved hours per category):
${Object.entries(wb).map(([k, v]) => `- ${k}: ${v}h`).join('\n')}
Total: ${Object.values(wb).reduce((s, v) => s + v, 0)}h

When generating tasks, respect these budgets exactly. For each category, split the hours into multiple small tasks (max 3h per task, never one vague large task). Example: exam_prep 24h → "Review Chapter 1" (2h), "Review Chapter 2" (2h), ..., "Practice past papers" (3h), "Create summary sheet" (2h), "Final revision" (2h).`
        : `WORKLOAD BUDGET (based on ${cp} CP = ${cpTotalHours}h total):
- Calendar attendance already covers: ${Math.round(calHours)}h
- Self-study tasks to generate: ~${Math.round(selfStudyBudget)}h total
- Keep individual task size between 1h and 3h. Split larger work into subtasks.
- The sum of all generated task hours should be approximately ${Math.round(selfStudyBudget)}h.`;

      const prompt = `You are a study task extractor. Read the course material below and create one concrete study task for EVERY chapter, topic, weekly session, exercise, assignment, quiz, test, or exam you find.

TODAY: ${new Date().toISOString().slice(0, 10)}
STUDY PERIOD: ${plan.start_date} to ${plan.end_date}

COURSE: ${course.name}
TYPE: ${(course.course_type || []).join(', ') || 'lecture'}
CREDIT POINTS: ${course.credit_points || 5}
EXAM TYPE: ${course.exam_type || 'unknown'}
EXAM DATE: ${course.exam_date || (course.exam_window_end ? `window: ${course.exam_window_start || '?'} – ${course.exam_window_end}` : 'unknown')}
COURSE PERIOD: ${course.course_start_date || plan.start_date} to ${course.course_end_date || plan.end_date}
DIFFICULTY: ${course.difficulty || 'medium'} | FAMILIARITY: ${course.familiarity || 'medium'}
DESCRIPTION: ${course.description || ''}
${course.exam_type === 'none' ? 'NOTE: This course has NO exam. Do not create exam preparation tasks.' : ''}
${course.exam_type === 'window' ? `NOTE: Exact exam date unknown. Plan exam preparation to finish by ${course.exam_window_end}. Mark exam prep tasks as estimated.` : ''}
${course.exam_type === 'unknown' ? 'NOTE: Exam date unknown. Create provisional exam preparation tasks at the end of the course period. Mark them as estimated.' : ''}
${wbText}
MATERIALS / SYLLABUS:
${course.materials_text || '(no materials — use course name and description to create reasonable tasks)'}

## EXTRACTION RULES — FOLLOW EXACTLY

**One task per item — never summarize multiple chapters into one task.**

1. CHAPTER / READING SECTION → task_type="reading", title="Read Chapter N: [title]", chapter_number=N
2. WEEKLY SESSION / TOPIC / LECTURE → task_type="revision", title="Review [topic]", set not_before_date = session date if known, target_date = 1-3 days after
3. EXERCISE SHEET / LAB → task_type="exercise", title="Work through Exercise [N]", exercise_number=N, not_before_date = release date if known
4. ASSIGNMENT / SUBMISSION → task_type="assignment", title="Complete Assignment [N]: [topic]", deadline = due date, target_date = 5-7 days before
5. QUIZ / TEST / TESTAT → task_type="test", title="Prepare for quiz/test: [topic]", deadline = quiz date, target_date = 3-5 days before
6. EXAM → task_type="test", title="Prepare for final exam", deadline = exam date, exam_date = exam date
7. PROJECT / THESIS / SEMINAR (no chapters) → generate milestones: Refine research question, Search literature, Read papers, Write outline, Write draft, Revise, Submit

## DATE RULES
- Dates in material → save as YYYY-MM-DD
- "Week N" or "KW N" → set target_week=N, source_week_label="Week N"
- Type A (lecture/exercise/session): not_before_date = event date, target_date = 1-3 days after, NO deadline
- Type B (quiz/assignment/exam): deadline = event date, target_date = 3-7 days before
- date_confidence: "exact" if date from material, "estimated" if inferred, "none" if unknown
- source_text: the exact line from the material this task came from (or "" if none)

## CRITICAL
- Return AS MANY tasks as there are items in the material. If 10 chapters → 10+ tasks.
- NEVER return fewer than 3 tasks for any course with material or a description.
- For missing date fields, use "" (empty string), not null.

Return JSON: { "tasks": [ ... ] }`;

      const taskSchema = {
        type: "object",
        properties: {
          tasks: {
            type: "array",
            items: {
              type: "object",
              properties: {
                title: { type: "string" },
                task_type: { type: "string" },
                deadline: { type: "string" },
                estimated_hours: { type: "number" },
                priority: { type: "string" },
                suggested_phase: { type: "string" },
                target_date: { type: "string" },
                not_before_date: { type: "string" },
                target_week: { type: "number" },
                source_week_label: { type: "string" },
                related_course_event_date: { type: "string" },
                related_course_event_type: { type: "string" },
                exam_date: { type: "string" },
                chapter_number: { type: "number" },
                topic_number: { type: "number" },
                exercise_number: { type: "number" },
                assignment_number: { type: "number" },
                date_confidence: { type: "string" },
                source_text: { type: "string" }
              },
              required: ["title", "task_type", "estimated_hours"]
            }
          }
        }
      };

      let extractedTasks = [];
      try {
        const result = await base44.integrations.Core.InvokeLLM({
          prompt,
          response_json_schema: taskSchema
        });
        extractedTasks = result.tasks || [];
      } catch (e) {
        console.error('Extraction failed for', course.name, e);
      }

      // Fallback: if AI returned nothing or too few tasks, build tasks client-side
      const noInfo = !course.materials_text && !course.description;
      if (extractedTasks.length === 0) {
        extractedTasks = buildFallbackTasks(course);
        if (noInfo) {
          setFallbackCourses(prev => new Set([...prev, course.id]));
        }
      }

      // Scale task hours so their sum matches the CP-based self-study budget.
      // This ensures workload is always grounded in credit points, not AI guesses.
      if (extractedTasks.length > 0) {
        const rawSum = extractedTasks.reduce((s, t) => s + (t.estimated_hours || 2), 0);
        if (rawSum > 0 && Math.abs(rawSum - selfStudyBudget) > selfStudyBudget * 0.1) {
          const scaleFactor = selfStudyBudget / rawSum;
          extractedTasks = extractedTasks.map(t => ({
            ...t,
            estimated_hours: Math.max(0.5, Math.round((t.estimated_hours || 2) * scaleFactor * 2) / 2),
          }));
        }
      }

      const created = [];
      for (const t of extractedTasks) {
        const toNull = (v) => !v || v === '' ? null : v;
        const record = await base44.entities.StudyTask.create({
          plan_id: planId,
          course_id: course.id,
          course_name: course.name,
          title: t.title,
          task_type: TASK_TYPES.includes(t.task_type) ? t.task_type : 'reading',
          deadline: toNull(t.deadline),
          estimated_hours: t.estimated_hours || 2,
          priority: ['low', 'medium', 'high'].includes(t.priority) ? t.priority : 'medium',
          suggested_phase: t.suggested_phase || '',
          status: 'open',
          confirmed: false,
          target_date: toNull(t.target_date),
          not_before_date: toNull(t.not_before_date),
          target_week: t.target_week || null,
          source_week_label: t.source_week_label || null,
          related_course_event_date: toNull(t.related_course_event_date),
          related_course_event_type: t.related_course_event_type || null,
          exam_date: toNull(t.exam_date),
          chapter_number: t.chapter_number || null,
          topic_number: t.topic_number || null,
          exercise_number: t.exercise_number || null,
          assignment_number: t.assignment_number || null,
          date_confidence: t.date_confidence || 'none',
          source_text: t.source_text || null
        });
        created.push(record);
      }

      newTasks[course.id] = created;
      newCoverageStats[course.id] = { tasksCreated: created.length, tasksWithDates: created.filter((t) => t.target_date || t.target_week || t.deadline).length };
    }

    setTasks(newTasks);
    setCoverageStats(newCoverageStats);
    setExtracted(true);
    setExtracting(false);
    setExtractingCourse('');
  };

  const handleReExtract = () => {
    const hasExisting = Object.values(tasks).flat().length > 0;
    if (hasExisting) {
      setShowReExtractConfirm(true);
    } else {
      extractTasksForCourses(courses, false);
    }
  };

  const updateTask = async (taskId, updates) => {
    await base44.entities.StudyTask.update(taskId, updates);
    const courseId = Object.keys(tasks).find((cId) => tasks[cId].some((t) => t.id === taskId));
    if (courseId) {
      setTasks((prev) => ({ ...prev, [courseId]: prev[courseId].map((t) => t.id === taskId ? { ...t, ...updates } : t) }));
    }
    setEditTask(null);
  };

  const deleteTask = async (taskId) => {
    await base44.entities.StudyTask.delete(taskId);
    const courseId = Object.keys(tasks).find((cId) => tasks[cId].some((t) => t.id === taskId));
    if (courseId) {
      setTasks((prev) => ({ ...prev, [courseId]: prev[courseId].filter((t) => t.id !== taskId) }));
    }
  };

  const addTask = async () => {
    const courseId = addTaskForCourse || courses[activeCourse]?.id;
    const course = courses.find(c => c.id === courseId);
    if (!course || !newTask.title.trim()) return;
    const record = await base44.entities.StudyTask.create({
      plan_id: planId, course_id: course.id, course_name: course.name,
      title: newTask.title, task_type: newTask.task_type,
      deadline: newTask.deadline || null, estimated_hours: Number(newTask.estimated_hours) || 2,
      priority: newTask.priority, status: 'open', confirmed: false, date_confidence: 'none',
      target_week: newTask.target_week || null,
    });
    setTasks((prev) => ({ ...prev, [course.id]: [...(prev[course.id] || []), record] }));
    setNewTask({ title: '', task_type: 'reading', deadline: '', estimated_hours: 2, priority: 'medium', target_week: '' });
    setShowAddTask(false);
    setAddTaskForCourse(null);
  };

  const confirmAll = async () => {
    if (confirming) return;
    setConfirming(true);
    try {
      await base44.entities.StudyTask.updateMany({ plan_id: planId }, { $set: { confirmed: true } });
      await base44.entities.StudyPlan.update(planId, { phase: 'generation', step: 7 });
      navigate(`/plan/${planId}/feasibility`);
    } catch (e) {
      console.error(e);
      setConfirming(false);
    }
  };

  const currentCourse = courses[activeCourse];
  const currentTasks = currentCourse ? tasks[currentCourse.id] || [] : [];
  const totalHours = Object.values(tasks).flat().reduce((sum, t) => sum + (t.estimated_hours || 0), 0);
  const tasksWithDates = Object.values(tasks).flat().filter((t) => t.target_date || t.target_week || t.deadline).length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      <PhaseIndicator currentPhase="courses" currentStep={6} planId={planId} />
      <div className="max-w-4xl mx-auto px-4 py-8">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <StepHeader
            icon={ListChecks}
            title="Task Extraction"
            description="I'll analyze your course materials and extract study tasks with dates and weeks from your syllabus or lecture plan." />
          

          {!extracted && extracting &&
          <div className="bg-white rounded-xl border border-blue-100 p-8 shadow-sm text-center mb-6">
              <Loader2 className="w-10 h-10 animate-spin text-blue-500 mx-auto mb-3" />
              {extractingCourse &&
            <p className="text-xs font-semibold text-blue-500 uppercase tracking-wide mb-1">{extractingCourse}</p>
            }
              <p className="text-gray-700 font-medium">Extracting tasks from course material...</p>
              <p className="text-sm text-gray-400 mt-1">Detecting chapters, exercises, assignments, quizzes, and deadlines.</p>
            </div>
          }

          {/* Re-extract confirmation dialog */}
          {showReExtractConfirm &&
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 mb-6">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-500 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="font-semibold text-amber-800 mb-1">Replace existing tasks?</p>
                  <p className="text-sm text-amber-700 mb-3">
                    Re-extracting will delete all {Object.values(tasks).flat().length} existing tasks for this plan and create new ones. This cannot be undone.
                  </p>
                  <div className="flex gap-2">
                    <Button size="sm" className="bg-amber-600 hover:bg-amber-700" onClick={() => extractTasksForCourses(courses, true)}>
                      Yes, delete and re-extract
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setShowReExtractConfirm(false)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          }

          {extracted && (
            <>
              {/* Guidance banner */}
              <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 mb-4 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-blue-800">
                  Tasks were extracted by AI. Please check whether the weekly order, workload, deadlines, and task names make sense. You can edit, delete, or add tasks before continuing.
                </p>
              </div>

              {/* Fallback notice per course */}
              {fallbackCourses.size > 0 && courses.filter(c => fallbackCourses.has(c.id)).map(c => (
                <div key={c.id} className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-4 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-amber-800"><strong>{c.name}:</strong> {t('fallbackNotice')}</p>
                </div>
              ))}

              {/* Summary bar */}
              {(() => {
                const cpTotal = courses.reduce((s, c) => s + (c.credit_points || 0) * 30, 0);
                return (
                  <div className="bg-white border border-blue-100 rounded-xl p-4 mb-5 flex flex-wrap gap-6 items-center justify-between">
                    <div className="flex gap-6">
                      <div className="text-center">
                        <p className="text-2xl font-bold text-blue-700">{Object.values(tasks).flat().length}</p>
                        <p className="text-xs text-gray-500">Tasks</p>
                      </div>
                      <div className="text-center">
                        <p className="text-2xl font-bold text-blue-700">{totalHours.toFixed(0)}h</p>
                        <p className="text-xs text-gray-500">Task hours</p>
                      </div>
                      {cpTotal > 0 && (
                        <div className="text-center">
                          <p className="text-2xl font-bold text-emerald-700">{cpTotal}h</p>
                          <p className="text-xs text-gray-500">CP workload</p>
                        </div>
                      )}
                      <div className="text-center">
                        <p className="text-2xl font-bold text-blue-700">{courses.length}</p>
                        <p className="text-xs text-gray-500">Courses</p>
                      </div>
                    </div>
                    <Button variant="outline" size="sm" onClick={handleReExtract} disabled={extracting}>
                      {extracting ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <RefreshCw className="w-4 h-4 mr-1" />}
                      Re-extract all
                    </Button>
                  </div>
                );
              })()}

              {/* Workload breakdowns — one per course, collapsible */}
              <div className="mb-5 space-y-2">
                {courses.map(c => (
                  <WorkloadBreakdown
                    key={c.id}
                    course={c}
                    calendarHours={calendarHoursByCourse[c.id] || 0}
                    onBreakdownChange={(bd) =>
                      setWorkloadBreakdowns(prev => ({ ...prev, [c.id]: bd }))
                    }
                  />
                ))}
              </div>

              {/* Weekly task list */}
              <WeeklyTaskList
                tasks={tasks}
                courses={courses}
                editTask={editTask}
                setEditTask={setEditTask}
                onSave={updateTask}
                onDelete={deleteTask}
                setTasks={setTasks}
                onAddTask={(courseId) => { setAddTaskForCourse(courseId); setShowAddTask(true); }}
                planStartDate={planStartDate}
              />

              {/* Add task form (global, triggered from weekly list) */}
              {showAddTask && (
                <div className="mt-4 bg-white rounded-xl border border-blue-200 p-4 shadow-sm space-y-3">
                  <p className="text-sm font-semibold text-gray-700">
                    Add task{addTaskForCourse ? ` — ${courses.find(c => c.id === addTaskForCourse)?.name}` : ''}
                  </p>
                  <Input value={newTask.title} onChange={e => setNewTask(p => ({ ...p, title: e.target.value }))} placeholder="Task title" />
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <Select value={newTask.task_type} onValueChange={v => setNewTask(p => ({ ...p, task_type: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{TASK_TYPES.map(tt => <SelectItem key={tt} value={tt}>{tt.replace('_', ' ')}</SelectItem>)}</SelectContent>
                    </Select>
                    <Input type="number" value={newTask.estimated_hours} onChange={e => setNewTask(p => ({ ...p, estimated_hours: e.target.value }))} placeholder="Hours" />
                    <Input type="number" value={newTask.target_week} onChange={e => setNewTask(p => ({ ...p, target_week: e.target.value }))} placeholder="Week #" />
                    <Input type="date" value={newTask.deadline} onChange={e => setNewTask(p => ({ ...p, deadline: e.target.value }))} />
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={addTask} disabled={!newTask.title.trim()}><Plus className="w-4 h-4 mr-1" /> Add</Button>
                    <Button size="sm" variant="ghost" onClick={() => { setShowAddTask(false); setAddTaskForCourse(null); }}>Cancel</Button>
                  </div>
                </div>
              )}

              {!showAddTask && (
                <button
                  onClick={() => { setAddTaskForCourse(null); setShowAddTask(true); }}
                  className="w-full mt-4 py-3 border border-dashed border-blue-200 rounded-xl text-sm text-blue-500 hover:bg-blue-50 transition-colors"
                >
                  <Plus className="w-4 h-4 inline mr-1" /> Add task manually
                </button>
              )}

              <div className="flex justify-between items-center mt-6">
                <Button variant="ghost" onClick={() => navigate(`/plan/${planId}/courses`)}>
                  <ArrowLeft className="w-4 h-4 mr-1" /> Back
                </Button>
                <Button onClick={confirmAll} disabled={confirming} className="bg-blue-600 hover:bg-blue-700">
                  {confirming ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Confirming...</> : <>Confirm & continue <ArrowRight className="w-4 h-4 ml-1" /></>}
                </Button>
              </div>
            </>
          )}
        </motion.div>
      </div>
      <ContextChat phase="tasks" planId={planId} suggestions={[
      "How are task hours estimated?",
      "Why does a task have a target date?",
      "Can I change the deadline?"]
      } />
    </div>);

}