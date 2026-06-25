import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { ListChecks, ArrowRight, ArrowLeft, Loader2, Edit2, Check, Trash2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import PhaseIndicator from '@/components/schedulo/PhaseIndicator';
import StepHeader from '@/components/schedulo/StepHeader';
import ContextChat from '@/components/schedulo/ContextChat';
import { motion } from 'framer-motion';

const TASK_TYPES = ['reading', 'assignment', 'exercise', 'revision', 'test', 'project_work'];

export default function TaskExtraction() {
  const { planId } = useParams();
  const navigate = useNavigate();
  const [courses, setCourses] = useState([]);
  const [tasks, setTasks] = useState({});
  const [extracting, setExtracting] = useState(false);
  const [extracted, setExtracted] = useState(false);
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
      setExtracted(true);
    }
  };

  const extractTasks = async () => {
    setExtracting(true);
    const newTasks = {};
    const plan = await base44.entities.StudyPlan.get(planId);

    for (const course of courses) {
      const prompt = `You are a study planning assistant. Your job is to extract CONCRETE, SPECIFIC, ACTIONABLE study tasks from the course information below.

PLANNING REFERENCE DATE: 2026-04-01 (treat this as today)
STUDY PERIOD: ${plan.start_date} to ${plan.end_date}

COURSE DETAILS:
- Name: ${course.name}
- Type: ${(course.course_type || []).join(', ')}
- Credit Points: ${course.credit_points || 'unknown'}
- Exam Date: ${course.exam_date || 'unknown'}
- Description: ${course.description || 'No description'}
- Difficulty: ${course.difficulty || 'medium'}
- Familiarity: ${course.familiarity || 'medium'}
- Priority: ${course.priority || 'medium'}
- Course Materials/Syllabus: ${course.materials_text || 'No materials provided'}

## TASK EXTRACTION RULES

DO NOT limit tasks to 5. Return AS MANY tasks as the material reasonably implies.

1. CHAPTERS/TOPICS → create one "Read [chapter/topic name]" reading task each.
2. EXERCISES/EXERCISE SHEETS → create one "Review and practice [exercise name]" exercise task each.
3. ASSIGNMENTS → create "Work on assignment [N]" (assignment type) + optionally "Review assignment [N]" (revision type).
4. QUIZZES/TESTS → create "Prepare for quiz/test on [topic]" (test type).
5. EXAM → create "Revise key concepts for exam" (revision) + "Prepare for final exam" (test).
6. PROJECT MILESTONES/PHASES → create one "project_work" task per milestone.

## PROJECT/RESEARCH TYPE DETECTION

Detect the course type from name, description, and materials:
- SLR / systematic literature review / literature review → literature-review project
- DSR / design science research / artifact / prototype / design requirements / evaluation → design-science project  
- implementation / software prototype / development / application → implementation project
- seminar paper / presentation / academic paper → seminar/writing course

For LITERATURE REVIEW projects, generate tasks such as:
Refine research question, Define search terms, Define inclusion/exclusion criteria, Select databases, Conduct literature search, Screen search results, Read selected papers, Extract relevant data, Synthesize findings, Write literature review section, Revise literature review, Prepare final submission/presentation.

For DESIGN SCIENCE projects, generate tasks such as:
Refine research question, Understand DSR approach, Define problem context, Identify stakeholder needs, Derive design requirements, Design initial artifact concept, Develop prototype, Plan evaluation, Conduct evaluation, Analyze evaluation results, Derive design implications, Write methodology section, Write artifact/design section, Write evaluation section, Revise final report, Prepare final submission/presentation.

For IMPLEMENTATION projects, generate tasks such as:
Define requirements, Design solution concept, Set up development environment, Implement core functionality, Test functionality, Fix issues, Document implementation, Prepare final presentation, Submit final version.

For SEMINAR/WRITING courses, generate tasks such as:
Choose/refine topic, Search literature, Read key sources, Create outline, Write first draft, Revise draft, Prepare presentation, Practice presentation, Submit final version.

## TIME ESTIMATION

Total workload = credit_points × 27 hours
- Difficulty: easy=−20%, medium=0%, difficult=+30%
- Familiarity: high=−20%, medium=0%, low=+25%
Distribute this total across all generated tasks proportionally.

## TASK ORDERING

Order tasks by learning sequence — what must be done first comes first in the list. The order must reflect a logical study progression.

## OUTPUT FORMAT

Return JSON with a "tasks" array. Each task:
- title: specific and action-oriented (e.g. "Read chapter 3 – Decision Trees", not "Study material")
- task_type: one of reading, assignment, exercise, revision, test, project_work
- deadline: YYYY-MM-DD or null (use exam_date for final revision/exam tasks)
- estimated_hours: realistic number
- priority: low / medium / high
- dependencies: array of task titles this depends on (empty array if none)
- suggested_phase: "early semester" | "mid semester" | "before exam" | "throughout"

IMPORTANT: Be specific. Use the actual chapter names, topic names, exercise numbers, and milestone names from the materials. Never generate vague tasks like "Study the material" or "Work on course".`;

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
                    dependencies: { type: "array", items: { type: "string" } },
                    suggested_phase: { type: "string" }
                  }
                }
              }
            }
          }
        });

        const extracted = result.tasks || [];
        const created = [];
        for (const t of extracted) {
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
            confirmed: false
          });
          created.push(record);
        }
        newTasks[course.id] = created;
      } catch (e) {
        console.error(e);
        newTasks[course.id] = [];
      }
    }

    setTasks(newTasks);
    setExtracted(true);
    setExtracting(false);
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
    const allTasks = Object.values(tasks).flat();
    for (const t of allTasks) {
      await base44.entities.StudyTask.update(t.id, { confirmed: true });
    }
    await base44.entities.StudyPlan.update(planId, { phase: 'generation', step: 7 });
    navigate(`/plan/${planId}/feasibility`);
  };

  const currentCourse = courses[activeCourse];
  const currentTasks = currentCourse ? (tasks[currentCourse.id] || []) : [];
  const totalHours = Object.values(tasks).flat().reduce((sum, t) => sum + (t.estimated_hours || 0), 0);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      <PhaseIndicator currentPhase="courses" currentStep={6} planId={planId} />
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
                <div className="space-y-3">
                  <Loader2 className="w-10 h-10 animate-spin text-blue-500 mx-auto" />
                  <p className="text-gray-600 font-medium">Analyzing your courses and extracting tasks...</p>
                  <p className="text-sm text-gray-400">This may take a moment.</p>
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