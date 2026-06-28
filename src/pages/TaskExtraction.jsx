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
  const [coverageStats, setCoverageStats] = useState({}); // courseId -> stats
  const [showReExtractConfirm, setShowReExtractConfirm] = useState(false);

  useEffect(() => {loadData();}, [planId]);

  const loadData = async () => {
    const courseList = await base44.entities.Course.filter({ plan_id: planId });
    setCourses(courseList);
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

  // Client-side fallback: parse chapter/topic lines from materials_text
  const buildFallbackTasks = (course) => {
    const material = course.materials_text || '';
    const lines = material.split('\n').map((l) => l.trim()).filter(Boolean);
    const chapterRe = /^(chapter|ch\.?|topic|week|session|lecture|woche|sitzung|einheit|thema)\s*(\d+)[:\s\-–]*(.*)/i;
    const found = lines.map((l) => l.match(chapterRe)).filter(Boolean);

    if (found.length > 0) {
      return found.map((m, i) => ({
        title: `Read ${m[1]} ${m[2]}${m[3] ? ': ' + m[3].trim() : ''}`,
        task_type: 'reading', estimated_hours: 2, priority: 'medium',
        target_week: parseInt(m[2]) || i + 1,
        source_week_label: m[0].trim().slice(0, 80),
        source_text: m[0].trim().slice(0, 200),
        date_confidence: 'none'
      }));
    }
    // Generic fallback
    return [
    { title: `Review course materials: ${course.name}`, task_type: 'reading', estimated_hours: 2, priority: 'medium', date_confidence: 'none' },
    { title: `Read assigned material for ${course.name}`, task_type: 'reading', estimated_hours: 3, priority: 'medium', date_confidence: 'none' },
    { title: `Practice exercises for ${course.name}`, task_type: 'exercise', estimated_hours: 2, priority: 'medium', date_confidence: 'none' },
    { title: `Prepare for final assessment: ${course.name}`, task_type: 'test', estimated_hours: 3, priority: 'high', deadline: course.exam_date || null, exam_date: course.exam_date || null, date_confidence: course.exam_date ? 'exact' : 'none' }];

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

      const prompt = `You are a study task extractor. Read the course material below and create one concrete study task for EVERY chapter, topic, weekly session, exercise, assignment, quiz, test, or exam you find.

TODAY: ${new Date().toISOString().slice(0, 10)}
STUDY PERIOD: ${plan.start_date} to ${plan.end_date}

COURSE: ${course.name}
TYPE: ${(course.course_type || []).join(', ') || 'lecture'}
CREDIT POINTS: ${course.credit_points || 5}
EXAM DATE: ${course.exam_date || 'unknown'}
DIFFICULTY: ${course.difficulty || 'medium'} | FAMILIARITY: ${course.familiarity || 'medium'}
DESCRIPTION: ${course.description || ''}
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

      // Fallback: if AI returned nothing, build tasks client-side
      if (extractedTasks.length === 0) {
        extractedTasks = buildFallbackTasks(course);
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
    const course = courses[activeCourse];
    if (!course || !newTask.title.trim()) return;
    const record = await base44.entities.StudyTask.create({
      plan_id: planId, course_id: course.id, course_name: course.name,
      title: newTask.title, task_type: newTask.task_type,
      deadline: newTask.deadline || null, estimated_hours: Number(newTask.estimated_hours) || 2,
      priority: newTask.priority, status: 'open', confirmed: false, date_confidence: 'none'
    });
    setTasks((prev) => ({ ...prev, [course.id]: [...(prev[course.id] || []), record] }));
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

          {extracted &&
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
                {courses.map((c, i) =>
              <button
                key={c.id}
                onClick={() => setActiveCourse(i)}
                className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
                activeCourse === i ? 'bg-blue-600 text-white shadow-sm' : 'bg-white text-gray-500 hover:bg-gray-50 border border-gray-200'}`
                }>
                
                    {c.name} ({(tasks[c.id] || []).length})
                  </button>
              )}
              </div>

              {/* Coverage stats for active course */}
              {currentCourse && (() => {
              const taskCount = currentTasks.length;
              const withDates = currentTasks.filter((t) => t.target_date || t.target_week || t.deadline).length;
              const lowCount = taskCount > 0 && taskCount < 3;
              return (
                <div className={`rounded-lg px-4 py-3 mb-4 text-xs flex flex-wrap gap-x-5 gap-y-1 items-center ${lowCount ? 'bg-amber-50 border border-amber-200' : 'bg-gray-50 border border-gray-100'}`}>
                    <span className="font-semibold text-gray-700">Coverage:</span>
                    <span className={`font-semibold ${lowCount ? 'text-amber-700' : 'text-gray-700'}`}>{taskCount} tasks created</span>
                    
                    {lowCount &&
                  <span className="text-amber-700 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> Fewer than 3 tasks — add more manually or re-extract.
                      </span>
                  }
                  </div>);

            })()}

              {/* Tasks for active course */}
              <div className="space-y-3 mb-6">
                {currentTasks.map((task, i) =>
              <motion.div
                key={task.id}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                className="bg-white rounded-xl border border-blue-100 p-4 shadow-sm">
                
                    {editTask === task.id ?
                <TaskEditForm
                  task={task}
                  courseId={currentCourse.id}
                  onSave={updateTask}
                  onCancel={() => setEditTask(null)}
                  setTasks={setTasks} /> :


                <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <h4 className="font-medium text-gray-900">{task.title}</h4>
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      task.priority === 'high' ? 'bg-red-100 text-red-700' :
                      task.priority === 'medium' ? 'bg-amber-100 text-amber-700' :
                      'bg-green-100 text-green-700'}`
                      }>{task.priority}</span>
                            {task.date_confidence === 'exact' &&
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">📅 exact date</span>
                      }
                            {task.date_confidence === 'estimated' &&
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">~ estimated</span>
                      }
                          </div>
                          <div className="flex flex-wrap gap-2 text-xs text-gray-400">
                            <span className="bg-gray-100 px-2 py-0.5 rounded">{task.task_type?.replace('_', ' ')}</span>
                            <span>⏱ {task.estimated_hours}h</span>
                            {task.deadline && <span className="text-red-500">📅 Due: {task.deadline}</span>}
                            {task.suggested_phase && <span>📍 {task.suggested_phase}</span>}
                          </div>
                          <TaskTemporalBadges task={task} />
                          {task.source_text &&
                    <button
                      onClick={() => setExpandedSource((p) => ({ ...p, [task.id]: !p[task.id] }))}
                      className="mt-1.5 flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600">
                      
                              {expandedSource[task.id] ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                              Source text
                            </button>
                    }
                          {expandedSource[task.id] && task.source_text &&
                    <p className="mt-1 text-xs text-gray-500 italic border-l-2 border-gray-200 pl-2">"{task.source_text}"</p>
                    }
                        </div>
                        <div className="flex gap-1 flex-shrink-0">
                          <button onClick={() => setEditTask(task.id)} className="p-1.5 hover:bg-gray-100 rounded-lg"><Edit2 className="w-3.5 h-3.5 text-gray-400" /></button>
                          <button onClick={() => deleteTask(task.id)} className="p-1.5 hover:bg-red-50 rounded-lg"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>
                        </div>
                      </div>
                }
                  </motion.div>
              )}

                {showAddTask ?
              <div className="bg-white rounded-xl border border-blue-200 p-4 shadow-sm space-y-3">
                    <Input value={newTask.title} onChange={(e) => setNewTask((p) => ({ ...p, title: e.target.value }))} placeholder="Task title" />
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <Select value={newTask.task_type} onValueChange={(v) => setNewTask((p) => ({ ...p, task_type: v }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{TASK_TYPES.map((tt) => <SelectItem key={tt} value={tt}>{tt.replace('_', ' ')}</SelectItem>)}</SelectContent>
                      </Select>
                      <Input type="number" value={newTask.estimated_hours} onChange={(e) => setNewTask((p) => ({ ...p, estimated_hours: e.target.value }))} placeholder="Hours" />
                      <Input type="date" value={newTask.deadline} onChange={(e) => setNewTask((p) => ({ ...p, deadline: e.target.value }))} />
                      <Select value={newTask.priority} onValueChange={(v) => setNewTask((p) => ({ ...p, priority: v }))}>
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
                  </div> :

              <button onClick={() => setShowAddTask(true)} className="w-full py-3 border border-dashed border-blue-200 rounded-xl text-sm text-blue-500 hover:bg-blue-50 transition-colors">
                    <Plus className="w-4 h-4 inline mr-1" /> Add task manually
                  </button>
              }
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
          }
        </motion.div>
      </div>
      <ContextChat phase="tasks" planId={planId} suggestions={[
      "How are task hours estimated?",
      "Why does a task have a target date?",
      "Can I change the deadline?"]
      } />
    </div>);

}