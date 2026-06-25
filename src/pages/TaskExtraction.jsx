import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { ListChecks, ArrowRight, ArrowLeft, Loader2, Edit2, Check, Trash2, Plus, ChevronDown, ChevronUp, AlertTriangle, Bug } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import PhaseIndicator from '@/components/schedulo/PhaseIndicator';
import StepHeader from '@/components/schedulo/StepHeader';
import ContextChat from '@/components/schedulo/ContextChat';
import { motion } from 'framer-motion';

const TASK_TYPES = ['reading', 'assignment', 'exercise', 'revision', 'test', 'project_work'];
const IS_DEV = import.meta.env.DEV;

// extraction_mode: 'ai_materials' | 'ai_description' | 'fallback'
function getExtractionMode(course) {
  if (course.materials_text && course.materials_text.trim().length > 20) return 'ai_materials';
  if (course.description && course.description.trim().length > 10) return 'ai_description';
  return 'fallback';
}

function ExtractionModeBadge({ mode }) {
  if (mode === 'ai_materials') return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">
      ✦ Extracted from course material
    </span>
  );
  if (mode === 'ai_description') return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
      ✦ Generated from course description
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
      ⚠ Generated from generic fallback
    </span>
  );
}

function FallbackWarning({ course }) {
  return (
    <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 text-sm text-amber-800">
      <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0 text-amber-500" />
      <span>
        I could not find enough detailed information for <strong>{course.name}</strong>, so I created a basic task structure.
        You can edit, remove, or add tasks before generating your study plan — or <a href="#" onClick={e => { e.preventDefault(); window.history.back(); }} className="underline font-medium">go back and add course material</a> to get more specific tasks.
      </span>
    </div>
  );
}

function DebugPanel({ courses, debugInfo, tasks }) {
  const [open, setOpen] = useState(false);
  if (!IS_DEV) return null;

  return (
    <div className="mb-6 border border-dashed border-purple-300 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-2.5 bg-purple-50 text-purple-700 text-sm font-medium hover:bg-purple-100 transition-colors"
      >
        <span className="flex items-center gap-2"><Bug className="w-4 h-4" /> Extraction Debug</span>
        {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>
      {open && (
        <div className="bg-white divide-y divide-purple-50">
          {courses.map(course => {
            const info = debugInfo[course.id] || {};
            const taskCount = (tasks[course.id] || []).length;
            const hasMaterials = !!(course.materials_text && course.materials_text.trim().length > 20);
            const hasDesc = !!(course.description && course.description.trim().length > 10);
            const modeLabel = info.mode === 'ai_materials' ? 'AI extraction from materials'
              : info.mode === 'ai_description' ? 'AI generation from description'
              : info.mode === 'fallback' ? 'generic fallback'
              : '—';

            return (
              <div key={course.id} className="px-4 py-3 text-xs font-mono space-y-1">
                <p className="font-semibold text-purple-800 text-sm font-sans">{course.name}</p>
                <p><span className="text-gray-500">description:</span> {hasDesc ? <span className="text-green-600">✓ exists</span> : <span className="text-red-500">✗ missing</span>}</p>
                <p><span className="text-gray-500">materials_text:</span> {hasMaterials ? <span className="text-green-600">✓ exists</span> : <span className="text-red-500">✗ missing</span>}</p>
                <p><span className="text-gray-500">materials length:</span> {course.materials_text ? course.materials_text.length : 0} chars</p>
                {course.materials_text && (
                  <p className="text-gray-400 break-all whitespace-pre-wrap">
                    <span className="text-gray-500">preview: </span>"{course.materials_text.slice(0, 300)}{course.materials_text.length > 300 ? '…' : ''}"
                  </p>
                )}
                <p><span className="text-gray-500">extraction mode:</span> <span className="text-purple-700 font-semibold">{modeLabel}</span></p>
                <p><span className="text-gray-500">tasks generated:</span> {taskCount}</p>
                {info.error && (
                  <p className="text-red-600 bg-red-50 rounded p-1"><span className="text-gray-500">error:</span> {info.error}</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function TaskExtraction() {
  const { planId } = useParams();
  const navigate = useNavigate();
  const [courses, setCourses] = useState([]);
  const [tasks, setTasks] = useState({});
  const [extracting, setExtracting] = useState(false);
  const [extracted, setExtracted] = useState(false);
  const [extractProgress, setExtractProgress] = useState(0);
  const [debugInfo, setDebugInfo] = useState({}); // { [courseId]: { mode, error } }
  const [editTask, setEditTask] = useState(null);
  const [activeCourse, setActiveCourse] = useState(0);
  const [showAddTask, setShowAddTask] = useState(false);
  const [newTask, setNewTask] = useState({ title: '', task_type: 'reading', deadline: '', estimated_hours: 2, priority: 'medium' });

  useEffect(() => {
    loadData();
  }, [planId]);

  const loadData = async () => {
    const courseList = await base44.entities.Course.filter({ plan_id: planId });
    setCourses(courseList);
    const existingTasks = await base44.entities.StudyTask.filter({ plan_id: planId });
    if (existingTasks.length > 0) {
      const grouped = {};
      courseList.forEach(c => { grouped[c.id] = []; });
      existingTasks.forEach(t => {
        if (grouped[t.course_id]) grouped[t.course_id].push(t);
      });
      setTasks(grouped);
      // Reconstruct debug info from existing data (mode only, no errors)
      const info = {};
      courseList.forEach(c => { info[c.id] = { mode: getExtractionMode(c) }; });
      setDebugInfo(info);
      setExtracted(true);
    }
  };

  const buildFallbackTasks = (course) => [
    { title: `Review lecture notes — ${course.name}`, task_type: 'reading', estimated_hours: 2, priority: 'medium', suggested_phase: 'early semester' },
    { title: `Read assigned material — ${course.name}`, task_type: 'reading', estimated_hours: 3, priority: 'medium', suggested_phase: 'early semester' },
    { title: `Complete exercises — ${course.name}`, task_type: 'exercise', estimated_hours: 2, priority: 'medium', suggested_phase: 'mid semester' },
    { title: `Practice and revise key concepts — ${course.name}`, task_type: 'revision', estimated_hours: 2, priority: 'high', suggested_phase: 'mid semester' },
    { title: `Revision and exam preparation — ${course.name}`, task_type: 'revision', estimated_hours: 4, priority: 'high', suggested_phase: 'before exam', deadline: course.exam_date || null },
  ];

  const extractTasksForCourses = async (courseList) => {
    setExtracting(true);
    setExtractProgress(0);
    const plan = await base44.entities.StudyPlan.get(planId);
    const newTasks = {};
    const newDebug = {};

    const extractForCourse = async (course) => {
      const mode = getExtractionMode(course);
      newDebug[course.id] = { mode };

      const prompt = `You are a study planning assistant. Extract or generate SPECIFIC, ACTIONABLE study tasks for a student based on the course material below.

Course: ${course.name}
Type: ${(course.course_type || []).join(', ')}
Credit Points: ${course.credit_points || 'unknown'}
Exam Date: ${course.exam_date || 'none'}
Description: ${course.description || 'none'}
Difficulty: ${course.difficulty || 'medium'}
Familiarity: ${course.familiarity || 'medium'}
Study Period: ${plan.start_date} to ${plan.end_date}
Course Material:
${course.materials_text || ''}

## EXTRACTION RULES

TASK COUNT: Do NOT limit tasks to 4–5. Return as many tasks as the material implies. If the material has 10 chapters, return ~20 tasks (one reading + one practice per chapter). Only return 4–5 generic tasks if the material has no chapters, topics, assignments, exercises, deadlines, or milestones at all.

TASK NAMING: Be specific and action-oriented. Never use vague names like "Study course", "Prepare", "Review material". Use names like "Study decision trees", "Read chapter 3", "Review and practice exercise 2".

TASK TYPE MAPPING — apply strictly:
- Each chapter or topic → task_type "reading". Title: "Read chapter X" or "Study [topic name]"
- Each exercise or exercise sheet → task_type "exercise". Title: "Review and practice [exercise/topic] exercises"
- Each assignment → task_type "assignment". Create two tasks: "Work on assignment X" and "Review assignment X before submission"
- Each quiz or test → task_type "test". Title: "Prepare for quiz/test on [topic]"
- Each exam → task_type "revision" + task_type "test". Titles: "Revise key concepts for [topic] exam", "Prepare for final exam"
- Each project milestone or phase → task_type "project_work". Title: specific milestone name

PROJECT/RESEARCH DETECTION — if course name, description, or material mentions any of these keywords, generate the corresponding milestone tasks instead of generic ones:
- "SLR", "systematic literature review", "literature review" → generate SLR milestones: "Refine research question", "Define search terms", "Define inclusion and exclusion criteria", "Select search databases", "Conduct literature search", "Screen search results", "Read selected papers", "Extract relevant data", "Synthesize findings", "Write literature review section", "Revise literature review", "Prepare final submission"
- "DSR", "design science research", "design science", "artifact", "design requirements", "prototype" → generate DSR milestones: "Refine research question", "Understand design science research approach", "Define problem context", "Identify stakeholder needs", "Derive design requirements", "Design initial artifact concept", "Develop prototype", "Plan evaluation", "Conduct evaluation", "Analyze evaluation results", "Write methodology section", "Write artifact/design section", "Write evaluation section", "Revise final report", "Prepare final submission"
- "implementation", "software prototype", "development", "application" → generate implementation milestones: "Define requirements", "Design solution concept", "Set up development environment", "Implement core functionality", "Test functionality", "Fix issues", "Document implementation", "Prepare presentation", "Submit final version"
- "seminar paper", "seminar", "academic paper", "presentation" → generate seminar milestones: "Choose/refine topic", "Search literature", "Read key sources", "Create outline", "Write first draft", "Revise draft", "Prepare presentation", "Practice presentation", "Submit final version"

SCHEDULING — assign suggested_phase based on task type and study period (${plan.start_date} to ${plan.end_date}):
- "early": orientation, first chapters/topics, project setup
- "early-mid": first half of reading/study tasks
- "mid": middle chapters, exercises, assignment work
- "mid-late": later chapters, exercise review, assignment review
- "late": revision, final writing, testing, evaluation
- "before-deadline": anything that must happen just before a deadline/exam
- "throughout": recurring or continuous tasks
Distribute reading tasks evenly across the study period. Schedule exercise tasks AFTER the related reading task. Schedule review/revision tasks near the end.

TIME ESTIMATES: 1 credit ≈ 25h total. Difficulty easy=-20%, difficult=+30%. Familiarity high=-20%, low=+25%. Split total time across all tasks proportionally.

Return a JSON "tasks" array. Each task: title (string), task_type (reading/assignment/exercise/revision/test/project_work), deadline (YYYY-MM-DD or null), estimated_hours (number), priority (low/medium/high), suggested_phase (early/early-mid/mid/mid-late/late/before-deadline/throughout), order (int starting at 1).`;

      if (mode === 'fallback') {
        // Skip LLM entirely for true fallback — no materials or description
        const fallbackData = buildFallbackTasks(course).map(t => ({
          plan_id: planId, course_id: course.id, course_name: course.name,
          title: t.title, task_type: t.task_type, deadline: t.deadline || null,
          estimated_hours: t.estimated_hours, priority: t.priority,
          suggested_phase: t.suggested_phase, status: 'open', confirmed: false, dependencies: []
        }));
        const created = await base44.entities.StudyTask.bulkCreate(fallbackData);
        return { courseId: course.id, tasks: Array.isArray(created) ? created : fallbackData };
      }

      try {
        const result = await base44.integrations.Core.InvokeLLM({
          prompt,
          response_json_schema: {
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
                    order: { type: "number" }
                  }
                }
              }
            }
          },
          model: 'claude_sonnet_4_6'
        });

        const sorted = (result.tasks || []).sort((a, b) => (a.order || 0) - (b.order || 0));
        // If LLM returned nothing, fall back silently but record it
        if (sorted.length === 0) {
          newDebug[course.id] = { mode: 'fallback', error: 'LLM returned 0 tasks — fell back to generic' };
        }
        const taskData = sorted.length > 0 ? sorted : buildFallbackTasks(course);

        const toCreate = taskData.map(t => ({
          plan_id: planId,
          course_id: course.id,
          course_name: course.name,
          title: t.title,
          task_type: TASK_TYPES.includes(t.task_type) ? t.task_type : 'reading',
          deadline: t.deadline || null,
          estimated_hours: t.estimated_hours || 2,
          priority: ['low', 'medium', 'high'].includes(t.priority) ? t.priority : 'medium',
          dependencies: [],
          suggested_phase: t.suggested_phase || '',
          status: 'open',
          confirmed: false
        }));

        const created = await base44.entities.StudyTask.bulkCreate(toCreate);
        return { courseId: course.id, tasks: Array.isArray(created) ? created : toCreate };
      } catch (e) {
        const errorMsg = e?.message || String(e);
        newDebug[course.id] = { mode: 'fallback', error: errorMsg };
        const fallbackData = buildFallbackTasks(course).map(t => ({
          plan_id: planId, course_id: course.id, course_name: course.name,
          title: t.title, task_type: t.task_type, deadline: t.deadline || null,
          estimated_hours: t.estimated_hours, priority: t.priority,
          suggested_phase: t.suggested_phase, status: 'open', confirmed: false, dependencies: []
        }));
        try {
          const created = await base44.entities.StudyTask.bulkCreate(fallbackData);
          return { courseId: course.id, tasks: Array.isArray(created) ? created : fallbackData };
        } catch (_) {
          return { courseId: course.id, tasks: [] };
        }
      }
    };

    let completed = 0;
    const results = await Promise.all(
      courseList.map(course =>
        extractForCourse(course).then(res => {
          completed++;
          setExtractProgress(Math.round((completed / courseList.length) * 100));
          return res;
        })
      )
    );

    results.forEach(({ courseId, tasks: t }) => { newTasks[courseId] = t; });
    setTasks(newTasks);
    setDebugInfo({ ...newDebug });
    setExtracted(true);
    setExtracting(false);
  };

  const extractTasks = async () => {
    setExtracted(false);
    setTasks({});
    setDebugInfo({});
    await base44.entities.StudyTask.deleteMany({ plan_id: planId });
    const freshCourses = await base44.entities.Course.filter({ plan_id: planId });
    setCourses(freshCourses);
    extractTasksForCourses(freshCourses);
  };

  const updateTask = async (taskId, updates) => {
    await base44.entities.StudyTask.update(taskId, updates);
    const courseId = Object.keys(tasks).find(cId => tasks[cId].some(t => t.id === taskId));
    if (courseId) {
      setTasks(prev => ({
        ...prev,
        [courseId]: prev[courseId].map(t => t.id === taskId ? { ...t, ...updates } : t)
      }));
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
      plan_id: planId,
      course_id: course.id,
      course_name: course.name,
      title: newTask.title,
      task_type: newTask.task_type,
      deadline: newTask.deadline || null,
      estimated_hours: Number(newTask.estimated_hours) || 2,
      priority: newTask.priority,
      status: 'open',
      confirmed: false
    });
    setTasks(prev => ({ ...prev, [course.id]: [...(prev[course.id] || []), record] }));
    setNewTask({ title: '', task_type: 'reading', deadline: '', estimated_hours: 2, priority: 'medium' });
    setShowAddTask(false);
  };

  const confirmAll = async () => {
    const allTasks = Object.values(tasks).flat().filter(t => t.id);
    if (allTasks.length > 0) {
      await base44.entities.StudyTask.bulkUpdate(allTasks.map(t => ({ id: t.id, confirmed: true })));
    }
    await base44.entities.StudyPlan.update(planId, { phase: 'generation', step: 7 });
    navigate(`/plan/${planId}/feasibility`);
  };

  const currentCourse = courses[activeCourse];
  const currentTasks = currentCourse ? (tasks[currentCourse.id] || []) : [];
  const currentMode = currentCourse ? (debugInfo[currentCourse.id]?.mode || getExtractionMode(currentCourse)) : null;
  const totalHours = Object.values(tasks).flat().reduce((sum, t) => sum + (t.estimated_hours || 0), 0);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      <PhaseIndicator currentPhase="courses" currentStep={6} />
      <div className="max-w-4xl mx-auto px-4 py-8">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <StepHeader
            icon={ListChecks}
            title="Task Extraction"
            description="I'll analyze your course materials and create specific study tasks with time estimates. Review and adjust them as needed."
          />

          {!extracted && (
            <div className="bg-white rounded-xl border border-blue-100 p-8 shadow-sm text-center mb-6">
              {extracting ? (
                <div className="space-y-4">
                  <Loader2 className="w-10 h-10 animate-spin text-blue-500 mx-auto" />
                  <p className="text-gray-600 font-medium">Analyzing your courses and extracting tasks...</p>
                  <p className="text-sm text-gray-400">All courses are processed in parallel — won't take long!</p>
                  <div className="max-w-xs mx-auto space-y-1">
                    <Progress value={extractProgress} className="h-2" />
                    <p className="text-xs text-gray-400 text-right">{extractProgress}%</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <ListChecks className="w-10 h-10 text-blue-400 mx-auto" />
                  <p className="text-gray-600">Ready to extract study tasks from your {courses.length} course(s).</p>
                  <p className="text-sm text-gray-400">I'll create tasks based on your course information, materials, credit points, and difficulty levels.</p>
                  <Button onClick={extractTasks} className="bg-blue-600 hover:bg-blue-700 mt-2">
                    Extract tasks now
                  </Button>
                </div>
              )}
            </div>
          )}

          {extracted && (
            <>
              {/* Summary bar */}
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
                    <p className="text-2xl font-bold text-blue-700">{courses.length}</p>
                    <p className="text-xs text-blue-500">Courses</p>
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={extractTasks} disabled={extracting}>
                  {extracting ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
                  Re-extract
                </Button>
              </div>

              {/* Debug panel (dev only) */}
              <DebugPanel courses={courses} debugInfo={debugInfo} tasks={tasks} />

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

              {/* Status badge + fallback warning for active course */}
              {currentCourse && (
                <div className="mb-4 space-y-2">
                  <ExtractionModeBadge mode={currentMode} />
                  {currentMode === 'fallback' && <FallbackWarning course={currentCourse} />}
                </div>
              )}

              {/* Tasks for active course */}
              <div className="space-y-3 mb-6">
                {currentTasks.map((task, i) => (
                  <motion.div
                    key={task.id || i}
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.03 }}
                    className="bg-white rounded-xl border border-blue-100 p-4 shadow-sm"
                  >
                    {editTask === task.id ? (
                      <div className="space-y-3">
                        <Input value={task.title} onChange={e => setTasks(prev => ({ ...prev, [currentCourse.id]: prev[currentCourse.id].map(t => t.id === task.id ? { ...t, title: e.target.value } : t) }))} />
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          <Select value={task.task_type} onValueChange={v => setTasks(prev => ({ ...prev, [currentCourse.id]: prev[currentCourse.id].map(t => t.id === task.id ? { ...t, task_type: v } : t) }))}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>{TASK_TYPES.map(tt => <SelectItem key={tt} value={tt}>{tt.replace('_', ' ')}</SelectItem>)}</SelectContent>
                          </Select>
                          <Input type="number" value={task.estimated_hours} onChange={e => setTasks(prev => ({ ...prev, [currentCourse.id]: prev[currentCourse.id].map(t => t.id === task.id ? { ...t, estimated_hours: Number(e.target.value) } : t) }))} placeholder="Hours" />
                          <Input type="date" value={task.deadline || ''} onChange={e => setTasks(prev => ({ ...prev, [currentCourse.id]: prev[currentCourse.id].map(t => t.id === task.id ? { ...t, deadline: e.target.value } : t) }))} />
                          <Select value={task.priority} onValueChange={v => setTasks(prev => ({ ...prev, [currentCourse.id]: prev[currentCourse.id].map(t => t.id === task.id ? { ...t, priority: v } : t) }))}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="low">Low</SelectItem>
                              <SelectItem value="medium">Medium</SelectItem>
                              <SelectItem value="high">High</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => updateTask(task.id, task)}><Check className="w-4 h-4 mr-1" /> Save</Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditTask(null)}>Cancel</Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-medium text-gray-900">{task.title}</h4>
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                              task.priority === 'high' ? 'bg-red-100 text-red-700' :
                              task.priority === 'medium' ? 'bg-amber-100 text-amber-700' :
                              'bg-green-100 text-green-700'
                            }`}>{task.priority}</span>
                          </div>
                          <div className="flex flex-wrap gap-3 text-xs text-gray-400">
                            <span className="bg-gray-100 px-2 py-0.5 rounded">{task.task_type?.replace('_', ' ')}</span>
                            <span>⏱ {task.estimated_hours}h estimated</span>
                            {task.deadline && <span>📅 Due: {task.deadline}</span>}
                            {task.suggested_phase && <span>📍 {task.suggested_phase}</span>}
                          </div>
                        </div>
                        <div className="flex gap-1">
                          <button onClick={() => setEditTask(task.id)} className="p-1.5 hover:bg-gray-100 rounded-lg"><Edit2 className="w-3.5 h-3.5 text-gray-400" /></button>
                          <button onClick={() => deleteTask(task.id)} className="p-1.5 hover:bg-red-50 rounded-lg"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>
                        </div>
                      </div>
                    )}
                  </motion.div>
                ))}

                {/* Add task */}
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
                <Button onClick={confirmAll} className="bg-blue-600 hover:bg-blue-700">
                  Confirm course information <ArrowRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            </>
          )}
        </motion.div>
      </div>
      <ContextChat phase="tasks" planId={planId} suggestions={[
        "How are task hours estimated?",
        "Why is this task scheduled here?",
        "Can I change the time estimate?"
      ]} />
    </div>
  );
}