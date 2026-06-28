import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { ListChecks, ArrowRight, ArrowLeft, Loader2, Edit2, Check, Trash2, Plus, ChevronDown, ChevronUp, Calendar, Clock, AlertTriangle, RefreshCw } from 'lucide-react';
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
      {items.map((item, i) => (
        <span key={i} className={`px-2 py-0.5 rounded text-xs font-medium ${item.color}`}>{item.label}</span>
      ))}
    </div>
  );
}

function TaskEditForm({ task, courseId, onSave, onCancel, setTasks }) {
  const update = (field, val) => setTasks(prev => ({
    ...prev,
    [courseId]: prev[courseId].map(t => t.id === task.id ? { ...t, [field]: val } : t)
  }));

  return (
    <div className="space-y-3">
      <Input value={task.title} onChange={e => update('title', e.target.value)} placeholder="Task title" />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Select value={task.task_type} onValueChange={v => update('task_type', v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{TASK_TYPES.map(tt => <SelectItem key={tt} value={tt}>{tt.replace('_', ' ')}</SelectItem>)}</SelectContent>
        </Select>
        <Input type="number" value={task.estimated_hours} onChange={e => update('estimated_hours', Number(e.target.value))} placeholder="Hours" />
        <div>
          <Label className="text-xs text-gray-500">Deadline</Label>
          <Input type="date" value={task.deadline || ''} onChange={e => update('deadline', e.target.value || null)} />
        </div>
        <Select value={task.priority} onValueChange={v => update('priority', v)}>
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
          <Input type="date" value={task.target_date || ''} onChange={e => update('target_date', e.target.value || null)} />
        </div>
        <div>
          <Label className="text-xs text-gray-500">Not before</Label>
          <Input type="date" value={task.not_before_date || ''} onChange={e => update('not_before_date', e.target.value || null)} />
        </div>
        <div>
          <Label className="text-xs text-gray-500">Target week #</Label>
          <Input type="number" value={task.target_week || ''} onChange={e => update('target_week', e.target.value ? Number(e.target.value) : null)} placeholder="e.g. 3" />
        </div>
        <div>
          <Label className="text-xs text-gray-500">Related event date</Label>
          <Input type="date" value={task.related_course_event_date || ''} onChange={e => update('related_course_event_date', e.target.value || null)} />
        </div>
        <div>
          <Label className="text-xs text-gray-500">Related event type</Label>
          <Input value={task.related_course_event_type || ''} onChange={e => update('related_course_event_type', e.target.value)} placeholder="lecture / exercise / quiz" />
        </div>
        <div>
          <Label className="text-xs text-gray-500">Exam date</Label>
          <Input type="date" value={task.exam_date || ''} onChange={e => update('exam_date', e.target.value || null)} />
        </div>
      </div>
      {task.source_text && (
        <p className="text-xs text-gray-400 italic border-l-2 border-gray-200 pl-2">Source: "{task.source_text}"</p>
      )}
      <div className="flex gap-2">
        <Button size="sm" onClick={() => onSave(task.id, task)}><Check className="w-4 h-4 mr-1" /> Save</Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}

export default function TaskExtraction() {
  const { planId } = useParams();
  const navigate = useNavigate();
  const [courses, setCourses] = useState([]);
  const [tasks, setTasks] = useState({});
  const [extracting, setExtracting] = useState(false);
  const [extractingCourse, setExtractingCourse] = useState('');
  const [extractStep, setExtractStep] = useState(''); // 'source_items' | 'tasks'
  const [extracted, setExtracted] = useState(false);
  const [editTask, setEditTask] = useState(null);
  const [activeCourse, setActiveCourse] = useState(0);
  const [showAddTask, setShowAddTask] = useState(false);
  const [newTask, setNewTask] = useState({ title: '', task_type: 'reading', deadline: '', estimated_hours: 2, priority: 'medium' });
  const [confirming, setConfirming] = useState(false);
  const [expandedSource, setExpandedSource] = useState({});
  const [coverageStats, setCoverageStats] = useState({}); // courseId -> stats
  const [showReExtractConfirm, setShowReExtractConfirm] = useState(false);

  useEffect(() => { loadData(); }, [planId]);

  const loadData = async () => {
    const courseList = await base44.entities.Course.filter({ plan_id: planId });
    setCourses(courseList);
    const existingTasks = await base44.entities.StudyTask.filter({ plan_id: planId });
    if (existingTasks.length > 0) {
      const grouped = {};
      courseList.forEach(c => { grouped[c.id] = []; });
      existingTasks.forEach(t => { if (grouped[t.course_id] !== undefined) grouped[t.course_id].push(t); });
      setTasks(grouped);
      setExtracted(true);
    } else {
      extractTasksForCourses(courseList, false);
    }
  };

  const extractTasksForCourses = async (courseList, deleteExisting = false) => {
    setExtracting(true);
    setShowReExtractConfirm(false);
    const newTasks = {};
    const newCoverageStats = {};
    const plan = await base44.entities.StudyPlan.get(planId);

    // Delete existing tasks for this plan before re-extracting
    if (deleteExisting) {
      await base44.entities.StudyTask.deleteMany({ plan_id: planId });
    }

    for (const course of courseList) {
      setExtractingCourse(course.name);

      // ── Pass 1: Extract source items ──────────────────────────────────────
      setExtractStep('source_items');

      const sourceItemSchema = {
        type: "object",
        properties: {
          source_items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                item_type: { type: "string" },
                number: { type: "number" },
                title: { type: "string" },
                date: { type: "string" },
                week: { type: "number" },
                week_label: { type: "string" },
                source_line: { type: "string" },
                date_confidence: { type: "string" }
              }
            }
          },
          summary: {
            type: "object",
            properties: {
              chapters: { type: "number" },
              topics: { type: "number" },
              sessions: { type: "number" },
              exercises: { type: "number" },
              assignments: { type: "number" },
              quizzes_tests: { type: "number" },
              exams: { type: "number" },
              milestones: { type: "number" }
            }
          }
        }
      };

      const pass1Prompt = `You are a course material parser. Your job is to enumerate EVERY structured item in the uploaded course material — do NOT summarize.

COURSE: ${course.name}
STUDY PERIOD: ${plan.start_date} to ${plan.end_date}
MATERIALS:
${course.materials_text || '(no materials provided — use course description below)'}
DESCRIPTION: ${course.description || ''}
EXAM DATE: ${course.exam_date || 'unknown'}

## YOUR TASK

Go through the course material line by line and list EVERY item you find. Be exhaustive.

For each item, identify:
- item_type: "chapter" | "topic" | "session" | "lecture" | "exercise" | "assignment" | "quiz" | "test" | "exam" | "presentation" | "project_milestone" | "reading" | "deadline" | "submission" | "testat" | "lab"
- number: sequence number if present (1, 2, 3...)
- title: the title or description of the item
- date: exact date in YYYY-MM-DD format if present, null if not
- week: week number if present
- week_label: original label (e.g. "Week 3", "KW 14", "Woche 2")
- source_line: the exact line/text from the material
- date_confidence: "exact" | "estimated" | "none"

## RULES

1. If the material lists 12 chapters → return 12 chapter items
2. If the material lists 10 weekly sessions → return 10 session items
3. If the material lists 5 exercise sheets → return 5 exercise items
4. DO NOT group or summarize. Each item in the material = one entry in source_items.
5. Also include a summary count of how many items of each type you found.

Return JSON matching the schema.`;

      let sourceItems = [];
      let coverageSummary = {};
      try {
        const pass1Result = await base44.integrations.Core.InvokeLLM({
          prompt: pass1Prompt,
          response_json_schema: sourceItemSchema,
          model: 'claude_sonnet_4_6'
        });
        sourceItems = pass1Result.source_items || [];
        coverageSummary = pass1Result.summary || {};
      } catch (e) {
        console.error('Pass 1 failed for', course.name, e);
      }

      newCoverageStats[course.id] = { ...coverageSummary, sourceItemCount: sourceItems.length };

      // ── Pass 2: For each source item, generate study tasks ────────────────
      setExtractStep('tasks');

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
                dependencies: { type: "array", items: { type: "string" } },
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
              }
            }
          }
        }
      };

      const sourceItemsJson = sourceItems.length > 0
        ? JSON.stringify(sourceItems, null, 2)
        : `(no source items extracted — generate tasks from description)\nCourse: ${course.name}\nDescription: ${course.description || ''}\nMaterials: ${course.materials_text || ''}`;

      const pass2Prompt = `You are a study task generator. For each source item below, create one or more concrete study tasks.

COURSE: ${course.name}
TYPE: ${(course.course_type || []).join(', ')}
CREDIT POINTS: ${course.credit_points || 'unknown'}
DIFFICULTY: ${course.difficulty || 'medium'} | FAMILIARITY: ${course.familiarity || 'medium'} | PRIORITY: ${course.priority || 'medium'}
EXAM DATE: ${course.exam_date || 'none'}
STUDY PERIOD: ${plan.start_date} to ${plan.end_date}
TODAY: ${new Date().toISOString().slice(0, 10)}

SOURCE ITEMS (one entry per chapter/topic/session/exercise/etc. found in the course material):
${sourceItemsJson}

## RULES — MUST FOLLOW EXACTLY

### One task per source item minimum
For EVERY source item in the list above, create at least one task.
- chapter → "Read Chapter N: [title]" (reading)
- session/lecture → "Review [topic] lecture" (revision), set not_before_date = session date, target_date = 1–3 days after
- exercise → "Work through Exercise [N]: [title]" (exercise), set not_before_date = release date
- assignment → "Complete Assignment [N]: [title]" (assignment), set deadline = due date
- quiz/test/testat → "Prepare for [quiz/test]: [topic]" (test), set deadline = quiz date, target_date = 3–5 days before
- exam → "Prepare for final exam" (test) + "Review key concepts before exam" (revision), set deadline = exam date, exam_date = exam date
- project_milestone → "Work on [milestone]" (project_work)
- presentation → "Prepare presentation: [topic]" (project_work), set deadline = presentation date

### Date handling
- TYPE A (lecture, exercise, lab, session): not_before_date = item date; target_date = 1–3 days after; do NOT set deadline
- TYPE B (quiz, test, assignment, exam, submission): deadline = item date; target_date = 3–7 days before deadline
- Always copy week and week_label from the source item to the task
- Always copy source_line to source_text

### Time estimation
- Total workload = ${course.credit_points || 5} credit points × 27h adjusted for difficulty (${course.difficulty}) and familiarity (${course.familiarity})
- Distribute proportionally across all tasks (reading: ~2h, exercise: ~1.5h, revision: ~1h, assignment: ~3h, test prep: ~2h)

### Project/Research courses
If this is a thesis, seminar, DSR, or project course with no specific chapters, generate these milestones:
Refine research question → Search literature → Read papers → Outline → Write draft → Revise → Final submission

Return JSON with a "tasks" array. Each task MUST include source_text (the original source_line).`;

      const created = [];
      try {
        const pass2Result = await base44.integrations.Core.InvokeLLM({
          prompt: pass2Prompt,
          response_json_schema: taskSchema,
          model: 'claude_sonnet_4_6'
        });

        const extractedTasks = pass2Result.tasks || [];
        for (const t of extractedTasks) {
          const record = await base44.entities.StudyTask.create({
            plan_id: planId,
            course_id: course.id,
            course_name: course.name,
            title: t.title,
            task_type: TASK_TYPES.includes(t.task_type) ? t.task_type : 'reading',
            deadline: t.deadline || null,
            estimated_hours: t.estimated_hours || 2,
            priority: ['low', 'medium', 'high'].includes(t.priority) ? t.priority : 'medium',
            dependencies: t.dependencies || [],
            suggested_phase: t.suggested_phase || '',
            status: 'open',
            confirmed: false,
            target_date: t.target_date || null,
            not_before_date: t.not_before_date || null,
            target_week: t.target_week || null,
            source_week_label: t.source_week_label || null,
            related_course_event_date: t.related_course_event_date || null,
            related_course_event_type: t.related_course_event_type || null,
            exam_date: t.exam_date || null,
            chapter_number: t.chapter_number || null,
            topic_number: t.topic_number || null,
            exercise_number: t.exercise_number || null,
            assignment_number: t.assignment_number || null,
            date_confidence: t.date_confidence || 'none',
            source_text: t.source_text || null
          });
          created.push(record);
        }
      } catch (e) {
        console.error('Pass 2 failed for', course.name, e);
      }

      newTasks[course.id] = created;
      newCoverageStats[course.id].tasksCreated = created.length;
    }

    setTasks(newTasks);
    setCoverageStats(newCoverageStats);
    setExtracted(true);
    setExtracting(false);
    setExtractingCourse('');
    setExtractStep('');
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
    const courseId = Object.keys(tasks).find(cId => tasks[cId].some(t => t.id === taskId));
    if (courseId) {
      setTasks(prev => ({ ...prev, [courseId]: prev[courseId].map(t => t.id === taskId ? { ...t, ...updates } : t) }));
    }
    setEditTask(null);
  };

  const deleteTask = async (taskId) => {
    await base44.entities.StudyTask.delete(taskId);
    const courseId = Object.keys(tasks).find(cId => tasks[cId].some(t => t.id === taskId));
    if (courseId) {
      setTasks(prev => ({ ...prev, [courseId]: prev[courseId].filter(t => t.id !== taskId) }));
    }
  };

  const addTask = async () => {
    const course = courses[activeCourse];
    if (!course || !newTask.title.trim()) return;
    const record = await base44.entities.StudyTask.create({
      plan_id: planId, course_id: course.id, course_name: course.name,
      title: newTask.title, task_type: newTask.task_type,
      deadline: newTask.deadline || null, estimated_hours: Number(newTask.estimated_hours) || 2,
      priority: newTask.priority, status: 'open', confirmed: false, date_confidence: 'none'
    });
    setTasks(prev => ({ ...prev, [course.id]: [...(prev[course.id] || []), record] }));
    setNewTask({ title: '', task_type: 'reading', deadline: '', estimated_hours: 2, priority: 'medium' });
    setShowAddTask(false);
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
  const currentTasks = currentCourse ? (tasks[currentCourse.id] || []) : [];
  const totalHours = Object.values(tasks).flat().reduce((sum, t) => sum + (t.estimated_hours || 0), 0);
  const tasksWithDates = Object.values(tasks).flat().filter(t => t.target_date || t.target_week || t.deadline).length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      <PhaseIndicator currentPhase="courses" currentStep={6} planId={planId} />
      <div className="max-w-4xl mx-auto px-4 py-8">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <StepHeader
            icon={ListChecks}
            title="Task Extraction"
            description="I'll analyze your course materials and extract study tasks with dates and weeks from your syllabus or lecture plan."
          />

          {!extracted && extracting && (
            <div className="bg-white rounded-xl border border-blue-100 p-8 shadow-sm text-center mb-6">
              <Loader2 className="w-10 h-10 animate-spin text-blue-500 mx-auto mb-3" />
              {extractingCourse && (
                <p className="text-xs font-semibold text-blue-500 uppercase tracking-wide mb-1">{extractingCourse}</p>
              )}
              {extractStep === 'source_items' && (
                <>
                  <p className="text-gray-700 font-medium">Step 1/2 — Enumerating source items...</p>
                  <p className="text-sm text-gray-400 mt-1">Reading chapters, sessions, exercises, assignments from the material.</p>
                </>
              )}
              {extractStep === 'tasks' && (
                <>
                  <p className="text-gray-700 font-medium">Step 2/2 — Generating tasks per source item...</p>
                  <p className="text-sm text-gray-400 mt-1">Creating one task per chapter, topic, exercise, and deadline.</p>
                </>
              )}
              {!extractStep && (
                <p className="text-gray-600 font-medium">Starting extraction...</p>
              )}
            </div>
          )}

          {/* Re-extract confirmation dialog */}
          {showReExtractConfirm && (
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
          )}

          {extracted && (
            <>
              <div className="bg-blue-50 rounded-xl p-4 mb-6 flex flex-wrap gap-4 items-center justify-between">
                <div className="flex gap-6">
                  <div className="text-center">
                    <p className="text-2xl font-bold text-blue-700">{Object.values(tasks).flat().length}</p>
                    <p className="text-xs text-blue-500">Total tasks</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-blue-700">{totalHours.toFixed(0)}h</p>
                    <p className="text-xs text-blue-500">Total workload</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-emerald-600">{tasksWithDates}</p>
                    <p className="text-xs text-emerald-600">With extracted dates</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-blue-700">{courses.length}</p>
                    <p className="text-xs text-blue-500">Courses</p>
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={handleReExtract} disabled={extracting}>
                  {extracting ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <RefreshCw className="w-4 h-4 mr-1" />}
                  Re-extract all
                </Button>
              </div>

              {/* Course tabs */}
              <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
                {courses.map((c, i) => (
                  <button
                    key={c.id}
                    onClick={() => setActiveCourse(i)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
                      activeCourse === i ? 'bg-blue-600 text-white shadow-sm' : 'bg-white text-gray-500 hover:bg-gray-50 border border-gray-200'
                    }`}
                  >
                    {c.name} ({(tasks[c.id] || []).length})
                  </button>
                ))}
              </div>

              {/* Coverage stats for active course */}
              {currentCourse && coverageStats[currentCourse.id] && (() => {
                const stats = coverageStats[currentCourse.id];
                const sourceCount = stats.sourceItemCount || 0;
                const taskCount = stats.tasksCreated || currentTasks.length;
                const lowCoverage = sourceCount > 3 && taskCount < sourceCount;
                return (
                  <div className={`rounded-lg px-4 py-3 mb-4 text-xs ${lowCoverage ? 'bg-amber-50 border border-amber-200' : 'bg-gray-50 border border-gray-100'}`}>
                    <div className="flex flex-wrap gap-x-5 gap-y-1 items-center">
                      <span className="font-semibold text-gray-700">Extraction coverage:</span>
                      {sourceCount > 0 && <span className="text-gray-600">{sourceCount} source items detected</span>}
                      {stats.chapters > 0 && <span className="text-blue-600">📖 {stats.chapters} chapters</span>}
                      {stats.topics > 0 && <span className="text-blue-600">📝 {stats.topics} topics</span>}
                      {stats.sessions > 0 && <span className="text-indigo-600">🎓 {stats.sessions} sessions</span>}
                      {stats.exercises > 0 && <span className="text-emerald-600">🔢 {stats.exercises} exercises</span>}
                      {stats.assignments > 0 && <span className="text-orange-600">📋 {stats.assignments} assignments</span>}
                      {stats.quizzes_tests > 0 && <span className="text-red-600">✏️ {stats.quizzes_tests} quizzes/tests</span>}
                      {stats.exams > 0 && <span className="text-red-700">📆 {stats.exams} exams</span>}
                      <span className={`font-semibold ${lowCoverage ? 'text-amber-700' : 'text-gray-700'}`}>→ {taskCount} tasks created</span>
                    </div>
                    {lowCoverage && (
                      <p className="mt-1.5 text-amber-700 flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                        {sourceCount} source items were detected, but only {taskCount} tasks were created. Consider re-extracting or adding tasks manually.
                      </p>
                    )}
                  </div>
                );
              })()}

              {/* Tasks for active course */}
              <div className="space-y-3 mb-6">
                {currentTasks.map((task, i) => (
                  <motion.div
                    key={task.id}
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.03 }}
                    className="bg-white rounded-xl border border-blue-100 p-4 shadow-sm"
                  >
                    {editTask === task.id ? (
                      <TaskEditForm
                        task={task}
                        courseId={currentCourse.id}
                        onSave={updateTask}
                        onCancel={() => setEditTask(null)}
                        setTasks={setTasks}
                      />
                    ) : (
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <h4 className="font-medium text-gray-900">{task.title}</h4>
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                              task.priority === 'high' ? 'bg-red-100 text-red-700' :
                              task.priority === 'medium' ? 'bg-amber-100 text-amber-700' :
                              'bg-green-100 text-green-700'
                            }`}>{task.priority}</span>
                            {task.date_confidence === 'exact' && (
                              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">📅 exact date</span>
                            )}
                            {task.date_confidence === 'estimated' && (
                              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">~ estimated</span>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-2 text-xs text-gray-400">
                            <span className="bg-gray-100 px-2 py-0.5 rounded">{task.task_type?.replace('_', ' ')}</span>
                            <span>⏱ {task.estimated_hours}h</span>
                            {task.deadline && <span className="text-red-500">📅 Due: {task.deadline}</span>}
                            {task.suggested_phase && <span>📍 {task.suggested_phase}</span>}
                          </div>
                          <TaskTemporalBadges task={task} />
                          {task.source_text && (
                            <button
                              onClick={() => setExpandedSource(p => ({ ...p, [task.id]: !p[task.id] }))}
                              className="mt-1.5 flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600"
                            >
                              {expandedSource[task.id] ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                              Source text
                            </button>
                          )}
                          {expandedSource[task.id] && task.source_text && (
                            <p className="mt-1 text-xs text-gray-500 italic border-l-2 border-gray-200 pl-2">"{task.source_text}"</p>
                          )}
                        </div>
                        <div className="flex gap-1 flex-shrink-0">
                          <button onClick={() => setEditTask(task.id)} className="p-1.5 hover:bg-gray-100 rounded-lg"><Edit2 className="w-3.5 h-3.5 text-gray-400" /></button>
                          <button onClick={() => deleteTask(task.id)} className="p-1.5 hover:bg-red-50 rounded-lg"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>
                        </div>
                      </div>
                    )}
                  </motion.div>
                ))}

                {showAddTask ? (
                  <div className="bg-white rounded-xl border border-blue-200 p-4 shadow-sm space-y-3">
                    <Input value={newTask.title} onChange={e => setNewTask(p => ({ ...p, title: e.target.value }))} placeholder="Task title" />
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <Select value={newTask.task_type} onValueChange={v => setNewTask(p => ({ ...p, task_type: v }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{TASK_TYPES.map(tt => <SelectItem key={tt} value={tt}>{tt.replace('_', ' ')}</SelectItem>)}</SelectContent>
                      </Select>
                      <Input type="number" value={newTask.estimated_hours} onChange={e => setNewTask(p => ({ ...p, estimated_hours: e.target.value }))} placeholder="Hours" />
                      <Input type="date" value={newTask.deadline} onChange={e => setNewTask(p => ({ ...p, deadline: e.target.value }))} />
                      <Select value={newTask.priority} onValueChange={v => setNewTask(p => ({ ...p, priority: v }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="low">Low</SelectItem>
                          <SelectItem value="medium">Medium</SelectItem>
                          <SelectItem value="high">High</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={addTask} disabled={!newTask.title.trim()}><Plus className="w-4 h-4 mr-1" /> Add</Button>
                      <Button size="sm" variant="ghost" onClick={() => setShowAddTask(false)}>Cancel</Button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => setShowAddTask(true)} className="w-full py-3 border border-dashed border-blue-200 rounded-xl text-sm text-blue-500 hover:bg-blue-50 transition-colors">
                    <Plus className="w-4 h-4 inline mr-1" /> Add task manually
                  </button>
                )}
              </div>

              <div className="flex justify-between items-center">
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
        "Can I change the deadline?"
      ]} />
    </div>
  );
}