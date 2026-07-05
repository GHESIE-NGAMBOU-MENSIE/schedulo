import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { ListChecks, ArrowRight, ArrowLeft, Loader2, Plus, AlertTriangle, RefreshCw, AlertCircle, Check } from 'lucide-react';
import CourseTaskSection from '@/components/schedulo/CourseTaskSection';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import PhaseIndicator from '@/components/schedulo/PhaseIndicator';
import StepHeader from '@/components/schedulo/StepHeader';
import ContextChat from '@/components/schedulo/ContextChat';
import { motion } from 'framer-motion';

const TASK_TYPES = ['reading', 'assignment', 'exercise', 'revision', 'test', 'project_work'];
const TYPE_LABELS = { reading: 'Study material', assignment: 'Assignment', exercise: 'Exercise', revision: 'Revision', test: 'Exam/Quiz prep', project_work: 'Project work' };

// Map course_structure keys to LLM-friendly descriptions
const STRUCTURE_LABELS = {
  lectures: 'Lectures (attendance time — counted in workload)',
  exercises: 'Exercises / tutorials (attendance)',
  lab_work: 'Lab sessions (attendance)',
  supervision_meetings: 'Supervision meetings',
  assignments: 'Assignments / submissions with deadlines',
  quizzes: 'Quizzes (with preparation)',
  testate: 'Testate (with preparation)',
  seminar_presentation: 'Seminar presentation',
  paper_essay: 'Paper / essay',
  project_work: 'Project planning and execution milestones',
  implementation: 'Implementation / development tasks',
  thesis_writing: 'Thesis writing milestones',
  literature_work: 'Literature search, reading, and review',
  final_exam: 'Final exam preparation',
  oral_exam: 'Oral exam preparation',
  revision_buffer: 'Revision / buffer tasks'
};

function buildPrompt(course, plan, selfStudyBudget, calHours, workloadBreakdown) {
  const structure = course.course_structure && course.course_structure.length > 0 ?
  course.course_structure :
  [];

  const isThesis = structure.some((k) => ['thesis_writing', 'literature_work'].includes(k)) ||
  (course.course_type || []).some((t) => /thesis|bachelor|master/.test(t));
  const isProject = !isThesis && structure.includes('project_work');

  const structureDesc = structure.length > 0 ?
  `CONFIRMED COURSE STRUCTURE (student-confirmed — generate tasks ONLY for these elements):\n${structure.map((k) => `  - ${STRUCTURE_LABELS[k] || k}`).join('\n')}` :
  `COURSE TYPE: ${(course.course_type || []).join(', ') || 'lecture'}`;

  const wbLines = workloadBreakdown ?
  Object.entries(workloadBreakdown).map(([k, v]) => `  - ${k}: ${v}h`).join('\n') :
  `  - Self-study tasks: ~${Math.round(selfStudyBudget)}h`;

  // Compute rough course week count for phasing instructions
  const courseStart = course.course_start_date || plan.start_date;
  const courseEnd = course.course_end_date || plan.end_date;
  const courseWeeks = courseStart && courseEnd ?
  Math.max(4, Math.ceil((new Date(courseEnd) - new Date(courseStart)) / (7 * 86400000))) :
  14;
  const examPrepStartWeek = Math.max(1, Math.round(courseWeeks * 0.65));
  const finalRevWeek = Math.max(examPrepStartWeek + 1, courseWeeks - 1);

  const numChapters = course.num_chapters || null;
  const numExercises = course.num_exercises || null;
  const numAssignments = course.num_assignments || null;
  const numQuizzes = course.num_quizzes || null;
  const contentInfo = [
  numChapters ? `CHAPTERS/TOPICS: ${numChapters}` : null,
  numExercises ? `EXERCISE SHEETS: ${numExercises}` : null,
  numAssignments ? `ASSIGNMENTS: ${numAssignments}` : null,
  numQuizzes ? `QUIZZES/TESTATE: ${numQuizzes}` : null].
  filter(Boolean).join('\n');

  const thesisRules = isThesis ? `
## THESIS / RESEARCH PROJECT RULES
Generate milestones ONLY from this list (in chronological order):
1. Topic clarification / refine research question (2-4h) → target_week=1
2. Literature search (2-4h per round) → target_week=2
3. Read and annotate papers (2-3h each) → early weeks
4. Methodology / design decisions (3-4h) → middle weeks
5. Implementation / artifact development milestones (3-6h each) → middle weeks
6. Evaluation / experiment setup (3-4h) → later weeks
7. Write thesis chapter: [name from materials or "Introduction/Related Work/Methodology/Results/Conclusion"] (3-5h each) → later weeks
8. Revision and proofreading (2-4h per round) → final weeks
9. Supervision meeting preparation (1-2h each) → spread across
10. Buffer — final corrections (2h) → last week
DO NOT create lecture reading, exercise, or final_exam prep tasks.` : '';

  const projectRules = isProject ? `
## PROJECT COURSE RULES
Generate milestones in chronological order:
1. Project planning / requirements (2-4h) → target_week=1 or 2
2. Background research (2-3h) → target_week=2 or 3
3. Implementation milestones (3-5h each) → weeks 3 through ${Math.round(courseWeeks * 0.7)}
4. Testing / validation (2-3h) → week ${Math.round(courseWeeks * 0.8)}
5. Documentation (2-4h) → week ${Math.round(courseWeeks * 0.85)}
6. Presentation preparation (2-3h) → week ${courseWeeks - 1}
7. Buffer (1-2h) → last week
DO NOT create lecture reading or exam prep tasks unless explicitly in the structure.` : '';

  const lecturePhasing = !isThesis && !isProject ? `
## CHRONOLOGICAL PHASING — CRITICAL
The course has approximately ${courseWeeks} weeks (Week 1 to Week ${courseWeeks}).
Assign tasks to weeks STRICTLY following this order:

PHASE 1 — Content weeks (Week 1 to Week ${examPrepStartWeek - 1}):
  - Lecture review tasks → spread week by week (Week 1, Week 2, ... Week ${examPrepStartWeek - 1})
  - Chapter reading tasks → one per chapter, in order (Chapter 1 → Week 1, Chapter 2 → Week 2, etc.)
  - Exercise sheets → after the corresponding chapter week (Exercise 1 → Week 1 or 2, etc.)
  - Assignments → before their deadline
  - Quiz/Testat preparation → 1-2 weeks BEFORE the quiz/Testat date (NOT in Week 1 unless the quiz is in Week 2)

PHASE 2 — Exam preparation (Week ${examPrepStartWeek} to Week ${finalRevWeek}):
  - ONLY place exam prep tasks here (task_type="test", titles like "Review chapters 1-N", "Practice past papers")
  - NEVER place exam prep in Phase 1
  - If exam_date is known, place exam prep tasks ending 3-5 days before it

PHASE 3 — Final revision (Week ${finalRevWeek} to Week ${courseWeeks}):
  - Final revision and buffer tasks only

ABSOLUTE RULE: Do NOT place "Prepare for final exam" or any exam prep task before Week ${examPrepStartWeek}.
ABSOLUTE RULE: Weeks 1-${Math.max(1, examPrepStartWeek - 1)} must ONLY contain content tasks (reading, exercises, assignments).` : '';

  return `You are a study task extractor. Extract concrete, actionable study tasks for this course.

TODAY: ${new Date().toISOString().slice(0, 10)}
STUDY PERIOD: ${plan.start_date} to ${plan.end_date}
COURSE PERIOD: ${courseStart} to ${courseEnd} (${courseWeeks} weeks total)

COURSE: ${course.name}
CREDIT POINTS: ${course.credit_points || 5} CP = ${(course.credit_points || 5) * 30}h total workload
CALENDAR ATTENDANCE: ${Math.round(calHours)}h (already counted — do NOT create tasks for these)
SELF-STUDY BUDGET: ~${Math.round(selfStudyBudget)}h to distribute across tasks
EXAM TYPE: ${course.exam_type || 'unknown'}
EXAM DATE: ${course.exam_date || (course.exam_window_end ? `window: ${course.exam_window_start || '?'}–${course.exam_window_end}` : 'unknown')}
DIFFICULTY: ${course.difficulty || 'medium'} | FAMILIARITY: ${course.familiarity || 'medium'}
DESCRIPTION: ${course.description || 'none'}

${contentInfo ? `COURSE CONTENT COUNTS:\n${contentInfo}\n` : ''}
${structureDesc}

WORKLOAD BUDGET PER CATEGORY (tasks in each category should sum to approx these hours):
${wbLines}
The sum of ALL task hours should be approximately ${Math.round(selfStudyBudget)}h.

COURSE MATERIALS / SYLLABUS:
${course.materials_text || '(none provided — use neutral generic titles like "Work through Chapter N", "Review lecture Week N", "Solve Exercise Sheet N". DO NOT invent topic names like "Graph Theory" or "Machine Learning" unless the course name or description explicitly mentions them.)'}
${course.material_files?.length > 0 ? `UPLOADED FILES: ${course.material_files.join(', ')}` : ''}
${lecturePhasing}
${thesisRules}
${projectRules}

## TASK CREATION RULES
1. CHAPTERS → task_type="reading", title="Work through Chapter N" (add ": [Title]" ONLY if the materials explicitly name it), max 2-3h each, chapter_number=N
2. LECTURE REVIEW → task_type="reading", title="Review lecture Week N" or "Review lecture content", 1-2h each
3. EXERCISE SHEETS → task_type="exercise", title="Solve Exercise Sheet N", exercise_number=N, placed after the corresponding chapter week
4. ASSIGNMENTS → task_type="assignment", title="Complete Assignment N", deadline=due date if known, target_date=5-7 days before deadline, assignment_number=N
5. QUIZ/TESTAT PREP → task_type="test", title="Prepare for Quiz N" or "Prepare for Testat N", deadline=quiz date if known, target_date=3-5 days before. Place in the week BEFORE the quiz, NOT in Week 1 if quiz is later.
6. EXAM PREP → task_type="test", titles like "Review all chapters", "Practice past exam questions", "Final revision". ONLY in Phase 2/3 weeks (Week ${examPrepStartWeek}+).
7. REVISION/BUFFER → task_type="revision", placed in final weeks only.

## QUALITY RULES
- Max 3h per task. Split larger blocks.
- Do NOT invent chapter/topic names not present in the materials. Use neutral titles.
- If no detailed materials: use generic but honest titles ("Work through Chapter 1", "Review lecture Week 2").
- Tasks must be returned in chronological order (smallest target_week first).
- Use "" for missing dates (not null).
- source_text: exact quote from materials if available, else "".
- task_order: assign sequential integers starting at 1, reflecting the correct study sequence within the course.

Return JSON: { "tasks": [ ... ] }`;
}

function buildFallbackTasks(course, selfStudyBudget) {
  const structure = course.course_structure || [];
  const cp = course.credit_points || 5;
  const hoursPerWeek = Math.max(2, Math.round(selfStudyBudget / 14));

  const isThesis = structure.some((k) => ['thesis_writing', 'literature_work'].includes(k)) ||
  (course.course_type || []).some((t) => /thesis|bachelor|master/.test(t));

  if (isThesis) {
    return [
    { title: `Clarify research question and scope`, task_type: 'project_work', estimated_hours: 3, priority: 'high', target_week: 1 },
    { title: `Initial literature search`, task_type: 'reading', estimated_hours: 4, priority: 'high', target_week: 2 },
    { title: `Read and annotate key papers (round 1)`, task_type: 'reading', estimated_hours: 4, priority: 'high', target_week: 3 },
    { title: `Read and annotate key papers (round 2)`, task_type: 'reading', estimated_hours: 4, priority: 'medium', target_week: 4 },
    { title: `Define methodology / approach`, task_type: 'project_work', estimated_hours: 3, priority: 'high', target_week: 5 },
    { title: `Write thesis outline`, task_type: 'project_work', estimated_hours: 2, priority: 'high', target_week: 5 },
    { title: `Implementation / artifact development (milestone 1)`, task_type: 'project_work', estimated_hours: 5, priority: 'high', target_week: 6 },
    { title: `Implementation / artifact development (milestone 2)`, task_type: 'project_work', estimated_hours: 5, priority: 'high', target_week: 8 },
    { title: `Write chapter: Introduction`, task_type: 'project_work', estimated_hours: 3, priority: 'high', target_week: 9 },
    { title: `Write chapter: Related Work`, task_type: 'project_work', estimated_hours: 4, priority: 'high', target_week: 10 },
    { title: `Write chapter: Methodology`, task_type: 'project_work', estimated_hours: 4, priority: 'high', target_week: 11 },
    { title: `Write chapter: Results / Implementation`, task_type: 'project_work', estimated_hours: 4, priority: 'high', target_week: 12 },
    { title: `Write chapter: Discussion / Conclusion`, task_type: 'project_work', estimated_hours: 3, priority: 'high', target_week: 13 },
    { title: `Revision and proofreading`, task_type: 'revision', estimated_hours: 4, priority: 'high', target_week: 14 },
    { title: `Buffer — final corrections`, task_type: 'revision', estimated_hours: 2, priority: 'medium', target_week: 14 }];

  }

  if (structure.includes('project_work')) {
    return [
    { title: `Project planning and requirements`, task_type: 'project_work', estimated_hours: 3, priority: 'high', target_week: 1 },
    { title: `Background research`, task_type: 'reading', estimated_hours: 3, priority: 'medium', target_week: 2 },
    { title: `Implementation milestone 1`, task_type: 'project_work', estimated_hours: 5, priority: 'high', target_week: 4 },
    { title: `Implementation milestone 2`, task_type: 'project_work', estimated_hours: 5, priority: 'high', target_week: 7 },
    { title: `Testing and validation`, task_type: 'exercise', estimated_hours: 3, priority: 'medium', target_week: 9 },
    { title: `Documentation`, task_type: 'project_work', estimated_hours: 4, priority: 'medium', target_week: 11 },
    { title: `Presentation preparation`, task_type: 'project_work', estimated_hours: 3, priority: 'high', target_week: 13 },
    { title: `Buffer`, task_type: 'revision', estimated_hours: 2, priority: 'low', target_week: 14 }];

  }

  // Generic lecture course
  const tasks = [];
  for (let i = 1; i <= 5; i++) {
    tasks.push({ title: `Work through course material — Part ${i}`, task_type: 'reading', estimated_hours: Math.max(2, Math.round(selfStudyBudget * 0.08)), priority: 'medium', target_week: i * 2 });
  }
  if (structure.includes('assignments')) {
    for (let i = 1; i <= 3; i++) {
      tasks.push({ title: `Complete assignment ${i}`, task_type: 'assignment', estimated_hours: 3, priority: 'high', target_week: i * 3 });
    }
  }
  if (structure.includes('final_exam') || structure.includes('oral_exam') || structure.length === 0) {
    tasks.push({ title: `Prepare for final exam — review all chapters`, task_type: 'test', estimated_hours: 4, priority: 'high', target_week: 13, exam_date: course.exam_date || null });
    tasks.push({ title: `Prepare for final exam — practice problems`, task_type: 'test', estimated_hours: 3, priority: 'high', target_week: 14, exam_date: course.exam_date || null });
  }
  tasks.push({ title: `Revision and buffer`, task_type: 'revision', estimated_hours: Math.max(2, Math.round(selfStudyBudget * 0.05)), priority: 'low', target_week: 14 });
  return tasks;
}

export default function TaskExtraction() {
  const { planId } = useParams();
  const navigate = useNavigate();
  const [courses, setCourses] = useState([]);
  const [tasks, setTasks] = useState({});
  const [extracting, setExtracting] = useState(false);
  const [extractingCourseId, setExtractingCourseId] = useState(null);
  const [extracted, setExtracted] = useState(false);
  const [editTask, setEditTask] = useState(null);
  const [showAddTask, setShowAddTask] = useState(false);
  const [addTaskForCourse, setAddTaskForCourse] = useState(null);
  const [newTask, setNewTask] = useState({ title: '', task_type: 'reading', deadline: '', estimated_hours: 2, target_week: '' });
  const [confirming, setConfirming] = useState(false);
  const [workloadBreakdowns, setWorkloadBreakdowns] = useState({});
  const [calendarHoursByCourse, setCalendarHoursByCourse] = useState({});
  const [planStartDate, setPlanStartDate] = useState('');
  const [fallbackCourses, setFallbackCourses] = useState(new Set());
  const [showReExtractConfirm, setShowReExtractConfirm] = useState(false);
  const [plan, setPlan] = useState(null);
  const [selectedCourseId, setSelectedCourseId] = useState(null);

  useEffect(() => {loadData();}, [planId]);

  const loadData = async () => {
    const p = await base44.entities.StudyPlan.get(planId);
    setPlan(p);
    setPlanStartDate(p.start_date || '');

    const courseList = await base44.entities.Course.filter({ plan_id: planId });
    setCourses(courseList);

    // Calendar hours per course
    const events = p.calendar_events || [];
    const weekCount = p.start_date && p.end_date ?
    Math.ceil((new Date(p.end_date) - new Date(p.start_date)) / (7 * 86400000)) :
    14;
    const calHours = {};
    courseList.forEach((c) => {
      const nameLower = c.name.toLowerCase().split(' ').filter((w) => w.length > 3);
      const matching = events.filter((e) => {
        const eLower = (e.name || '').toLowerCase();
        return nameLower.some((w) => eLower.includes(w));
      });
      const hpw = matching.reduce((s, e) => {
        if (e.start_time && e.end_time) {
          const [sh, sm] = e.start_time.split(':').map(Number);
          const [eh, em] = e.end_time.split(':').map(Number);
          return s + Math.max(0, (eh * 60 + em - sh * 60 - sm) / 60);
        }
        return s + 1.5;
      }, 0);
      calHours[c.id] = Math.round(hpw * weekCount * 10) / 10;
    });
    setCalendarHoursByCourse(calHours);

    const existingTasks = await base44.entities.StudyTask.filter({ plan_id: planId });
    if (existingTasks.length > 0) {
      const grouped = {};
      courseList.forEach((c) => {grouped[c.id] = [];});
      existingTasks.forEach((t) => {if (grouped[t.course_id] !== undefined) grouped[t.course_id].push(t);});
      setTasks(grouped);
      setExtracted(true);
      if (courseList.length > 0) setSelectedCourseId(courseList[0].id);
    } else {
      extractAllCourses(courseList, p, calHours, false);
    }
  };

  const getSelfStudyBudget = (course, calHours) => {
    const cp = course.credit_points || 5;
    const total = cp * 30;
    const cal = calHours[course.id] || 0;
    return Math.max(total * 0.5, total - cal);
  };

  const extractSingleCourse = async (course, p, calHours, wb, deleteFirst = false) => {
    setExtractingCourseId(course.id);
    const selfStudyBudget = getSelfStudyBudget(course, calHours);

    if (deleteFirst) {
      await base44.entities.StudyTask.deleteMany({ plan_id: planId, course_id: course.id });
    }

    const prompt = buildPrompt(course, p, selfStudyBudget, calHours[course.id] || 0, wb);
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
              target_date: { type: "string" },
              not_before_date: { type: "string" },
              target_week: { type: "number" },
              task_order: { type: "number" },
              source_week_label: { type: "string" },
              related_course_event_date: { type: "string" },
              related_course_event_type: { type: "string" },
              exam_date: { type: "string" },
              chapter_number: { type: "number" },
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

    let extracted = [];
    try {
      const result = await base44.integrations.Core.InvokeLLM({ prompt, response_json_schema: taskSchema });
      extracted = result.tasks || [];
    } catch (e) {
      console.error('Extraction failed for', course.name, e);
    }

    let isFallback = false;
    if (extracted.length === 0) {
      extracted = buildFallbackTasks(course, selfStudyBudget);
      isFallback = true;
    }

    // Scale to CP self-study budget
    if (extracted.length > 0) {
      const rawSum = extracted.reduce((s, t) => s + (t.estimated_hours || 2), 0);
      if (rawSum > 0 && Math.abs(rawSum - selfStudyBudget) > selfStudyBudget * 0.12) {
        const scale = selfStudyBudget / rawSum;
        extracted = extracted.map((t) => ({
          ...t,
          estimated_hours: Math.max(0.5, Math.round((t.estimated_hours || 2) * scale * 2) / 2)
        }));
      }
    }

    const toNull = (v) => !v || v === '' ? null : v;
    const created = [];
    for (const t of extracted) {
      const record = await base44.entities.StudyTask.create({
        plan_id: planId,
        course_id: course.id,
        course_name: course.name,
        title: t.title,
        task_type: TASK_TYPES.includes(t.task_type) ? t.task_type : 'reading',
        deadline: toNull(t.deadline),
        estimated_hours: t.estimated_hours || 2,
        priority: ['low', 'medium', 'high'].includes(t.priority) ? t.priority : 'medium',
        status: 'open',
        confirmed: false,
        target_date: toNull(t.target_date),
        not_before_date: toNull(t.not_before_date),
        target_week: t.target_week || null,
        task_order: t.task_order || null,
        source_week_label: t.source_week_label || null,
        related_course_event_date: toNull(t.related_course_event_date),
        related_course_event_type: t.related_course_event_type || null,
        exam_date: toNull(t.exam_date),
        chapter_number: t.chapter_number || null,
        exercise_number: t.exercise_number || null,
        assignment_number: t.assignment_number || null,
        date_confidence: t.date_confidence || 'none',
        source_text: t.source_text || null
      });
      created.push(record);
    }

    setExtractingCourseId(null);
    return { created, isFallback };
  };

  const extractAllCourses = async (courseList, p, calHours, deleteExisting) => {
    setExtracting(true);
    setShowReExtractConfirm(false);
    if (deleteExisting) {
      await base44.entities.StudyTask.deleteMany({ plan_id: planId });
    }
    const newTasks = {};
    const newFallbacks = new Set();
    for (const course of courseList) {
      const wb = workloadBreakdowns[course.id];
      const { created, isFallback } = await extractSingleCourse(course, p, calHours, wb, false);
      newTasks[course.id] = created;
      if (isFallback) newFallbacks.add(course.id);
    }
    setTasks(newTasks);
    setFallbackCourses(newFallbacks);
    setExtracted(true);
    setExtracting(false);
    if (courseList.length > 0) setSelectedCourseId(courseList[0].id);
  };

  const handleReExtractCourse = async (courseId) => {
    const course = courses.find((c) => c.id === courseId);
    if (!course || !plan) return;
    const wb = workloadBreakdowns[courseId];
    const { created, isFallback } = await extractSingleCourse(course, plan, calendarHoursByCourse, wb, true);
    setTasks((prev) => ({ ...prev, [courseId]: created }));
    setFallbackCourses((prev) => {
      const next = new Set(prev);
      isFallback ? next.add(courseId) : next.delete(courseId);
      return next;
    });
  };

  const updateTask = async (taskId, updates) => {
    await base44.entities.StudyTask.update(taskId, updates);
    const courseId = Object.keys(tasks).find((cId) => tasks[cId].some((t) => t.id === taskId));
    if (courseId) setTasks((prev) => ({ ...prev, [courseId]: prev[courseId].map((t) => t.id === taskId ? { ...t, ...updates } : t) }));
    setEditTask(null);
  };

  const deleteTask = async (taskId) => {
    await base44.entities.StudyTask.delete(taskId);
    const courseId = Object.keys(tasks).find((cId) => tasks[cId].some((t) => t.id === taskId));
    if (courseId) setTasks((prev) => ({ ...prev, [courseId]: prev[courseId].filter((t) => t.id !== taskId) }));
  };

  const addTask = async () => {
    const course = courses.find((c) => c.id === addTaskForCourse);
    if (!course || !newTask.title.trim()) return;
    const record = await base44.entities.StudyTask.create({
      plan_id: planId, course_id: course.id, course_name: course.name,
      title: newTask.title, task_type: newTask.task_type,
      deadline: newTask.deadline || null, estimated_hours: Number(newTask.estimated_hours) || 2,
      priority: 'medium', status: 'open', confirmed: false, date_confidence: 'none',
      target_week: newTask.target_week ? Number(newTask.target_week) : null
    });
    setTasks((prev) => ({ ...prev, [course.id]: [...(prev[course.id] || []), record] }));
    setNewTask({ title: '', task_type: 'reading', deadline: '', estimated_hours: 2, target_week: '' });
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
      setConfirming(false);
    }
  };

  const totalTasks = Object.values(tasks).flat().length;
  const totalHours = Object.values(tasks).flat().reduce((s, t) => s + (t.estimated_hours || 0), 0);
  const cpTotal = courses.reduce((s, c) => s + (c.credit_points || 0) * 30, 0);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      <PhaseIndicator currentPhase="courses" currentStep={6} planId={planId} />
      <div className="max-w-4xl mx-auto px-4 py-8">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <StepHeader
            icon={ListChecks}
            title="Task Extraction"
            description="Tasks are generated based on your confirmed course structure and credit points. Review and edit each course before continuing." />

          {/* Loading state */}
          {!extracted && extracting &&
          <div className="bg-white rounded-xl border border-blue-100 p-8 shadow-sm text-center mb-6">
              <Loader2 className="w-10 h-10 animate-spin text-blue-500 mx-auto mb-3" />
              <p className="text-gray-700 font-medium">Extracting tasks from course materials...</p>
              <p className="text-sm text-gray-400 mt-1">Analyzing course structure, chapters, assignments, and deadlines.</p>
            </div>
          }

          {/* Re-extract all confirmation */}
          {showReExtractConfirm &&
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 mb-6">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-500 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="font-semibold text-amber-800 mb-1">Replace all existing tasks?</p>
                  <p className="text-sm text-amber-700 mb-3">This will delete all {totalTasks} tasks and re-extract from scratch.</p>
                  <div className="flex gap-2">
                    <Button size="sm" className="bg-amber-600 hover:bg-amber-700"
                  onClick={() => extractAllCourses(courses, plan, calendarHoursByCourse, true)}>
                      Yes, re-extract all
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setShowReExtractConfirm(false)}>Cancel</Button>
                  </div>
                </div>
              </div>
            </div>
          }

          {extracted &&
          <>
              {/* Summary bar */}
              <div className="bg-white border border-blue-100 rounded-xl p-4 mb-5 flex flex-wrap gap-6 items-center justify-between shadow-sm">
                <div className="flex gap-6">
                  <div className="text-center">
                    <p className="text-xl font-bold text-blue-700">{totalTasks}</p>
                    <p className="text-xs text-gray-400">Tasks</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xl font-bold text-blue-700">{totalHours.toFixed(0)}h</p>
                    <p className="text-xs text-gray-400">Task hours</p>
                  </div>
                  {cpTotal > 0 &&
                <div className="text-center">
                      <p className="text-xl font-bold text-emerald-700">{cpTotal}h</p>
                      <p className="text-xs text-gray-400">CP workload</p>
                    </div>
                }
                  <div className="text-center">
                    <p className="text-xl font-bold text-blue-700">{courses.length}</p>
                    <p className="text-xs text-gray-400">Courses</p>
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={() => setShowReExtractConfirm(true)} disabled={extracting}>
                  <RefreshCw className="w-4 h-4 mr-1" /> Re-extract all
                </Button>
              </div>

              {/* AI notice */}
              <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 mb-5 flex items-start gap-2 hidden">
                <AlertCircle className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-blue-800 hidden">
                  Tasks were generated based on your confirmed course structure and credit points. Review each course below — edit, delete, or add tasks as needed before continuing.
                </p>
              </div>

              {/* Course tabs */}
              {courses.length > 1 &&
            <div className="flex flex-wrap gap-2 mb-4">
                  {courses.map((course) => {
                const ct = tasks[course.id] || [];
                const isActive = selectedCourseId === course.id;
                const isFb = fallbackCourses.has(course.id);
                const isExtr = extractingCourseId === course.id;
                return (
                  <button
                    key={course.id}
                    onClick={() => setSelectedCourseId(course.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${
                    isActive ?
                    'bg-blue-600 text-white border-blue-600 shadow' :
                    'bg-white text-gray-600 border-gray-200 hover:border-blue-300 hover:text-blue-700'}`
                    }>
                    
                        {isExtr && <Loader2 className="w-3 h-3 animate-spin" />}
                        {isFb && !isExtr && <AlertTriangle className="w-3 h-3 text-amber-400" />}
                        <span>{course.name}</span>
                        <span className={`text-xs ${isActive ? 'text-blue-200' : 'text-gray-400'}`}>
                          {ct.length}
                        </span>
                      </button>);

              })}
                </div>
            }

              {/* Selected course section */}
              {courses.filter((c) => courses.length === 1 || c.id === selectedCourseId).map((course) =>
            <CourseTaskSection
              key={course.id}
              course={course}
              calendarHours={calendarHoursByCourse[course.id] || 0}
              courseTasks={tasks[course.id] || []}
              tasks={tasks}
              setTasks={setTasks}
              editTask={editTask}
              setEditTask={setEditTask}
              onSave={updateTask}
              onDelete={deleteTask}
              onAddTask={(cId) => {setAddTaskForCourse(cId);setShowAddTask(true);}}
              onReExtract={handleReExtractCourse}
              planStartDate={planStartDate}
              onBreakdownChange={(bd) => setWorkloadBreakdowns((prev) => ({ ...prev, [course.id]: bd }))}
              isFallback={fallbackCourses.has(course.id)}
              isExtracting={extractingCourseId === course.id} />

            )}

              {/* Add task modal */}
              {showAddTask && addTaskForCourse &&
            <div className="mt-4 bg-white rounded-xl border border-blue-200 p-4 shadow-sm space-y-3">
                  <p className="text-sm font-semibold text-gray-700">
                    Add task — {courses.find((c) => c.id === addTaskForCourse)?.name}
                  </p>
                  <Input value={newTask.title} onChange={(e) => setNewTask((p) => ({ ...p, title: e.target.value }))} placeholder="Task title" />
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <Select value={newTask.task_type} onValueChange={(v) => setNewTask((p) => ({ ...p, task_type: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{TASK_TYPES.map((tt) => <SelectItem key={tt} value={tt}>{TYPE_LABELS[tt]}</SelectItem>)}</SelectContent>
                    </Select>
                    <Input type="number" value={newTask.estimated_hours} onChange={(e) => setNewTask((p) => ({ ...p, estimated_hours: e.target.value }))} placeholder="Hours" />
                    <Input type="number" value={newTask.target_week} onChange={(e) => setNewTask((p) => ({ ...p, target_week: e.target.value }))} placeholder="Week #" />
                    <Input type="date" value={newTask.deadline} onChange={(e) => setNewTask((p) => ({ ...p, deadline: e.target.value }))} />
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={addTask} disabled={!newTask.title.trim()}><Plus className="w-4 h-4 mr-1" />Add</Button>
                    <Button size="sm" variant="ghost" onClick={() => {setShowAddTask(false);setAddTaskForCourse(null);}}>Cancel</Button>
                  </div>
                </div>
            }

              <div className="flex justify-between items-center mt-6">
                <Button variant="ghost" onClick={() => navigate(`/plan/${planId}/courses`)}>
                  <ArrowLeft className="w-4 h-4 mr-1" /> Back
                </Button>
                <Button onClick={confirmAll} disabled={confirming || totalTasks === 0} className="bg-blue-600 hover:bg-blue-700">
                  {confirming ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" />Confirming...</> : <>Confirm & continue <ArrowRight className="w-4 h-4 ml-1" /></>}
                </Button>
              </div>
            </>
          }
        </motion.div>
      </div>
      <ContextChat phase="tasks" planId={planId} suggestions={[
      "Why is this course showing generic tasks?",
      "How are task hours calculated from credit points?",
      "How do I add assignments with deadlines?",
      "Why is thesis not showing exercises?"]
      } />
    </div>);

}