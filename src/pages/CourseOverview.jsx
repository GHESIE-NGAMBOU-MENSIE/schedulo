import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { t } from '@/lib/i18n';
import { BookOpen, Plus, Trash2, ArrowRight, ArrowLeft, ChevronDown, ChevronUp, GraduationCap, Upload, Loader2, FileText, Sparkles, AlertCircle, Hash } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import PhaseIndicator from '@/components/schedulo/PhaseIndicator';
import StepHeader from '@/components/schedulo/StepHeader';
import ContextChat from '@/components/schedulo/ContextChat';
import { motion, AnimatePresence } from 'framer-motion';

// ── Course type (general kind of course) ──────────────────────────────────────
const COURSE_TYPES = [
{ key: 'lecture_course', label: 'Lecture course' },
{ key: 'lecture_exercises', label: 'Lecture with exercises' },
{ key: 'seminar', label: 'Seminar' },
{ key: 'project_course', label: 'Project course' },
{ key: 'lab_course', label: 'Lab course' },
{ key: 'bachelor_thesis', label: 'Thesis' },
{ key: 'other', label: 'Other' }];


// ── Course structure elements ─────────────────────────────────────────────────
const STRUCTURE_GROUPS = ['Attendance', 'Submissions', 'Project / Thesis', 'Assessment', 'Other'];
const STRUCTURE_ELEMENTS = [
{ key: 'lectures', label: 'Lectures', group: 'Attendance' },
{ key: 'exercises', label: 'Exercises / tutorials', group: 'Attendance' },
{ key: 'lab_work', label: 'Lab work', group: 'Attendance' },
{ key: 'supervision_meetings', label: 'Supervision meetings', group: 'Attendance' },
{ key: 'assignments', label: 'Assignments / submissions', group: 'Submissions' },
{ key: 'quizzes', label: 'Quizzes', group: 'Submissions' },
{ key: 'testate', label: 'Tests / Testate', group: 'Submissions' },
{ key: 'seminar_presentation', label: 'Presentation', group: 'Submissions' },
{ key: 'paper_essay', label: 'Paper / essay', group: 'Submissions' },
{ key: 'project_work', label: 'Project work', group: 'Project / Thesis' },
{ key: 'implementation', label: 'Implementation / dev', group: 'Project / Thesis' },
{ key: 'thesis_writing', label: 'Thesis writing', group: 'Project / Thesis' },
{ key: 'literature_work', label: 'Literature / research', group: 'Project / Thesis' },
{ key: 'final_exam', label: 'Final exam', group: 'Assessment' },
{ key: 'oral_exam', label: 'Oral exam', group: 'Assessment' },
{ key: 'revision_buffer', label: 'Revision / buffer', group: 'Other' }];


function suggestStructure(courseTypeKey) {
  switch (courseTypeKey) {
    case 'bachelor_thesis':
    case 'master_thesis':
      return ['supervision_meetings', 'literature_work', 'thesis_writing', 'implementation', 'revision_buffer'];
    case 'project_course':
      return ['project_work', 'implementation', 'seminar_presentation', 'revision_buffer'];
    case 'seminar':
      return ['lectures', 'seminar_presentation', 'paper_essay', 'revision_buffer'];
    case 'lab_course':
      return ['lectures', 'lab_work', 'testate', 'final_exam', 'revision_buffer'];
    case 'lecture_exercises':
      return ['lectures', 'exercises', 'assignments', 'final_exam', 'revision_buffer'];
    case 'lecture_course':
    default:
      return ['lectures', 'assignments', 'final_exam', 'revision_buffer'];
  }
}

// ── CourseCard ────────────────────────────────────────────────────────────────
function CourseCard({ course, onDelete, onSave }) {
  const [expanded, setExpanded] = useState(false);
  const [name, setName] = useState(course.name || '');
  const [credits, setCredits] = useState(course.credit_points?.toString() || '');
  const [courseType, setCourseType] = useState(course.course_type?.[0] || '');
  const [structure, setStructure] = useState(course.course_structure || []);
  const [examType, setExamType] = useState(course.exam_type || 'unknown');
  const [examDate, setExamDate] = useState(course.exam_date || '');
  const [examWindowStart, setExamWindowStart] = useState(course.exam_window_start || '');
  const [examWindowEnd, setExamWindowEnd] = useState(course.exam_window_end || '');
  const [difficulty, setDifficulty] = useState(course.difficulty || 'medium');
  const [materialsText, setMaterialsText] = useState(course.materials_text || '');
  const [files, setFiles] = useState(course.material_files || []);
  const [uploading, setUploading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [saving, setSaving] = useState(false);
  // Course content counts
  const [numChapters, setNumChapters] = useState(course.num_chapters?.toString() || '');
  const [numExercises, setNumExercises] = useState(course.num_exercises?.toString() || '');
  const [numAssignments, setNumAssignments] = useState(course.num_assignments?.toString() || '');
  const [numQuizzes, setNumQuizzes] = useState(course.num_quizzes?.toString() || '');

  // When course type changes, suggest structure automatically (if nothing confirmed yet)
  const handleCourseTypeChange = (key) => {
    setCourseType(key);
    if (!course.course_structure?.length) {
      setStructure(suggestStructure(key));
    }
  };

  const toggleStructure = (key) => {
    setStructure((prev) => prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]);
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      const newFiles = [...files, file_url];
      setFiles(newFiles);
      setExtracting(true);
      try {
        const result = await base44.integrations.Core.InvokeLLM({
          prompt: `Extract course information from this document. Return JSON with: course_name (string), credit_points (number or null), course_type_key (one of: lecture_course, lecture_exercises, seminar, project_course, lab_course, bachelor_thesis, master_thesis, other), structure_elements (array of keys from: lectures, exercises, lab_work, supervision_meetings, assignments, quizzes, testate, seminar_presentation, paper_essay, project_work, implementation, thesis_writing, literature_work, final_exam, oral_exam, revision_buffer), difficulty (easy/medium/difficult), num_chapters (number or null), num_exercises (number or null), num_assignments (number or null), num_quizzes (number or null), description (string).`,
          file_urls: [file_url],
          response_json_schema: {
            type: 'object',
            properties: {
              course_name: { type: 'string' },
              credit_points: { type: 'number' },
              course_type_key: { type: 'string' },
              structure_elements: { type: 'array', items: { type: 'string' } },
              difficulty: { type: 'string' },
              num_chapters: { type: 'number' },
              num_exercises: { type: 'number' },
              num_assignments: { type: 'number' },
              num_quizzes: { type: 'number' },
              description: { type: 'string' }
            }
          }
        });
        if (result.course_name) setName(result.course_name);
        if (result.credit_points) setCredits(result.credit_points.toString());
        if (result.course_type_key) {setCourseType(result.course_type_key);}
        if (result.structure_elements?.length) setStructure(result.structure_elements);
        if (result.difficulty) setDifficulty(result.difficulty);
        if (result.num_chapters) setNumChapters(result.num_chapters.toString());
        if (result.num_exercises) setNumExercises(result.num_exercises.toString());
        if (result.num_assignments) setNumAssignments(result.num_assignments.toString());
        if (result.num_quizzes) setNumQuizzes(result.num_quizzes.toString());
        if (result.description) setMaterialsText((prev) => prev || result.description);
      } catch (err) {console.error('Extraction failed', err);}
      setExtracting(false);
    } catch (err) {console.error(err);}
    setUploading(false);
    e.target.value = '';
  };

  const handleSave = async () => {
    setSaving(true);
    await onSave(course.id, {
      name,
      credit_points: credits ? Number(credits) : null,
      course_type: courseType ? [courseType] : [],
      course_structure: structure,
      exam_type: examType,
      exam_date: examType === 'exact' || examType === 'submission' ? examDate || null : null,
      exam_window_start: examType === 'window' ? examWindowStart || null : null,
      exam_window_end: examType === 'window' ? examWindowEnd || null : null,
      difficulty,
      materials_text: materialsText,
      material_files: files,
      num_chapters: numChapters ? Number(numChapters) : null,
      num_exercises: numExercises ? Number(numExercises) : null,
      num_assignments: numAssignments ? Number(numAssignments) : null,
      num_quizzes: numQuizzes ? Number(numQuizzes) : null,
      confirmed: true
    });
    setSaving(false);
    setExpanded(false);
  };

  const isComplete = course.confirmed;
  const typeLabel = COURSE_TYPES.find((ct) => ct.key === (course.course_type?.[0] || ''))?.label;

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      className="bg-white rounded-xl border border-blue-100 shadow-sm overflow-hidden">

      {/* Header row */}
      <div className="flex items-center justify-between p-4 group">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center text-sm font-bold flex-shrink-0">
            {course.name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="font-medium text-gray-900 truncate">{course.name}</p>
            <p className="text-xs text-gray-400">
              {isComplete ?
              <span className="text-green-600">✓ Confirmed{course.credit_points ? ` · ${course.credit_points} CP` : ''}{typeLabel ? ` · ${typeLabel}` : ''}</span> :
              'Tap to fill in course details'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => onDelete(course.id)} className="p-2 hover:bg-red-50 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity">
            <Trash2 className="w-4 h-4 text-red-400" />
          </button>
          <button onClick={() => setExpanded((p) => !p)} className="p-2 hover:bg-blue-50 rounded-lg transition-colors">
            {expanded ? <ChevronUp className="w-4 h-4 text-blue-500" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
          </button>
        </div>
      </div>

      {/* Expandable section */}
      <AnimatePresence>
        {expanded &&
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="overflow-hidden">
            <div className="border-t border-blue-50 p-4 space-y-5 bg-blue-50/20">

              {extracting &&
            <div className="flex items-center gap-2 text-sm text-blue-600 bg-blue-50 p-3 rounded-lg">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Extracting course information from your document…
                </div>
            }

              {/* Basic info */}
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 sm:col-span-1">
                  <Label className="text-xs text-gray-600">Course name</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 h-8 text-sm" />
                </div>
                <div>
                  <Label className="text-xs text-gray-600">ECTS / Credit points</Label>
                  <Input type="number" value={credits} onChange={(e) => setCredits(e.target.value)} placeholder="e.g. 5" className="mt-1 h-8 text-sm" />
                </div>
              </div>

              {/* ── Course type ── */}
              <div>
                <Label className="text-xs text-gray-600 block mb-2">Course type</Label>
                <div className="flex flex-wrap gap-1.5">
                  {COURSE_TYPES.map((ct) =>
                <button
                  key={ct.key}
                  onClick={() => handleCourseTypeChange(ct.key)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all border ${
                  courseType === ct.key ?
                  'bg-blue-600 text-white border-blue-600' :
                  'bg-white text-gray-500 border-gray-200 hover:border-blue-300'}`
                  }>
                      {ct.label}
                    </button>
                )}
                </div>
              </div>

              {/* ── Course structure ── */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <Label className="text-xs text-gray-600">Course structure / workload elements</Label>
                  {courseType &&
                <button onClick={() => setStructure(suggestStructure(courseType))} className="text-xs text-blue-500 hover:text-blue-700">
                      Reset to suggestion
                    </button>
                }
                </div>
                <p className="text-xs text-gray-400 mb-2">Select everything that applies — only selected elements will appear in the workload breakdown.</p>
                {STRUCTURE_GROUPS.map((group) => {
                const items = STRUCTURE_ELEMENTS.filter((e) => e.group === group);
                return (
                  <div key={group} className="mb-2">
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">{group}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {items.map((el) =>
                      <button
                        key={el.key}
                        onClick={() => toggleStructure(el.key)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all border ${
                        structure.includes(el.key) ?
                        'bg-blue-600 text-white border-blue-600' :
                        'bg-white text-gray-500 border-gray-200 hover:border-blue-300'}`
                        }>
                            {el.label}
                          </button>
                      )}
                      </div>
                    </div>);

              })}
              </div>

              {/* ── Exam / assessment ── */}
              <div>
                <Label className="text-xs text-gray-600 block mb-2">Final assessment</Label>
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {[
                { key: 'exact', label: 'Exact exam date' },
                { key: 'window', label: 'Exam period' },
                { key: 'submission', label: 'Submission deadline' },
                { key: 'none', label: 'No exam' },
                { key: 'unknown', label: 'Not known yet' }].
                map((opt) =>
                <button key={opt.key} onClick={() => setExamType(opt.key)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all border ${
                examType === opt.key ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-500 border-gray-200 hover:border-blue-300'}`
                }>
                      {opt.label}
                    </button>
                )}
                </div>
                {(examType === 'exact' || examType === 'submission') &&
              <Input type="date" value={examDate} onChange={(e) => setExamDate(e.target.value)} className="h-8 text-sm max-w-xs" />
              }
                {examType === 'window' &&
              <div className="flex gap-2 items-center">
                    <Input type="date" value={examWindowStart} onChange={(e) => setExamWindowStart(e.target.value)} className="h-8 text-sm" placeholder="From" />
                    <span className="text-gray-400 text-xs">to</span>
                    <Input type="date" value={examWindowEnd} onChange={(e) => setExamWindowEnd(e.target.value)} className="h-8 text-sm" placeholder="To" />
                  </div>
              }
                {examType === 'unknown' &&
              <p className="text-xs text-amber-600">⚠ No exam date — provisional preparation will be placed at the end of the semester.</p>
              }
              </div>

              {/* ── Course content counts ── */}
              <div>
                <Label className="text-xs text-gray-600 block mb-2">Course content <span className="text-gray-400 font-normal">(optional — helps with task extraction)</span></Label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                { label: 'Chapters / topics', value: numChapters, set: setNumChapters, show: structure.includes('lectures') || structure.includes('exercises') },
                { label: 'Exercise sheets', value: numExercises, set: setNumExercises, show: structure.includes('exercises') },
                { label: 'Assignments', value: numAssignments, set: setNumAssignments, show: structure.includes('assignments') },
                { label: 'Quizzes / Testate', value: numQuizzes, set: setNumQuizzes, show: structure.includes('quizzes') || structure.includes('testate') }].
                filter((f) => f.show).map((f) =>
                <div key={f.label}>
                      <Label className="text-xs text-gray-500">{f.label}</Label>
                      <Input type="number" min={0} value={f.value} onChange={(e) => f.set(e.target.value)} placeholder="–" className="mt-1 h-8 text-sm" />
                    </div>
                )}
                </div>
              </div>

              {/* ── Difficulty ── */}
              <div className="max-w-xs">
                <Label className="text-xs text-gray-600">Perceived difficulty</Label>
                <Select value={difficulty} onValueChange={setDifficulty}>
                  <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="easy">Easy</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="difficult">Difficult</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* ── Documents ── */}
              <div>
                <Label className="text-xs text-gray-600 block mb-2">Upload documents <span className="text-gray-400">(syllabus, semester plan, etc.) — AI will extract structure automatically</span></Label>
                <label className="cursor-pointer inline-flex">
                  <input type="file" accept=".pdf,.doc,.docx,.txt,.png,.jpg" onChange={handleFileUpload} className="hidden" />
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors text-xs font-medium">
                    {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                    {uploading ? 'Uploading…' : 'Upload file'}
                  </div>
                </label>
                {files.length > 0 &&
              <div className="mt-2 space-y-1">
                    {files.map((f, i) =>
                <div key={i} className="flex items-center gap-2 text-xs text-gray-500">
                        <FileText className="w-3.5 h-3.5" />
                        <span className="truncate max-w-xs">{f.split('/').pop()}</span>
                        <button onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-600">Remove</button>
                      </div>
                )}
                  </div>
              }
              </div>

              {/* ── Notes ── */}
              <div>
                <Label className="text-xs text-gray-600">Notes / description <span className="text-gray-400">(optional)</span></Label>
                <Textarea value={materialsText} onChange={(e) => setMaterialsText(e.target.value)}
              placeholder="Paste syllabus content, assignment list, deadlines, reading list…"
              rows={3} className="mt-1 text-sm" />
              </div>

              <div className="flex justify-end">
                <Button onClick={handleSave} disabled={saving} size="sm" className="bg-blue-600 hover:bg-blue-700">
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Sparkles className="w-3.5 h-3.5 mr-1" />}
                  Save course
                </Button>
              </div>
            </div>
          </motion.div>
        }
      </AnimatePresence>
    </motion.div>);

}

// ── CourseOverview page ───────────────────────────────────────────────────────
export default function CourseOverview() {
  const { planId } = useParams();
  const navigate = useNavigate();
  const [courses, setCourses] = useState([]);
  const [newName, setNewName] = useState('');
  const [loading, setLoading] = useState(true);
  const [continueError, setContinueError] = useState('');

  useEffect(() => {loadCourses();}, [planId]);

  const loadCourses = async () => {
    setLoading(true);
    const list = await base44.entities.Course.filter({ plan_id: planId });
    setCourses(list);
    setLoading(false);
  };

  const addCourse = async () => {
    if (!newName.trim()) return;
    await base44.entities.Course.create({ plan_id: planId, name: newName.trim(), course_type: [], confirmed: false });
    setNewName('');
    loadCourses();
  };

  const deleteCourse = async (id) => {
    await base44.entities.Course.delete(id);
    loadCourses();
  };

  const saveCourse = async (id, data) => {
    await base44.entities.Course.update(id, data);
    loadCourses();
  };

  const handleNext = () => {
    if (courses.length === 0) {setContinueError('Please add at least one course before continuing.');return;}
    setContinueError('');
    navigate(`/plan/${planId}/tasks`);
  };

  const completedCount = courses.filter((c) => c.confirmed).length;
  const progressValue = courses.length === 0 ? 0 : Math.round(completedCount / courses.length * 100);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
      </div>);

  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      <PhaseIndicator currentPhase="courses" currentStep={4} planId={planId} />
      <div className="max-w-3xl mx-auto px-4 py-8">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <StepHeader
            icon={BookOpen}
            title="Your Courses"
            description="Expand each course to set its type, structure, and exam info. The more you fill in, the more accurate your study plan will be." />

          {/* Progress */}
          <div className="mb-6">
            <div className="flex justify-between text-xs text-gray-500 mb-1">
              <span>{completedCount} of {courses.length} courses confirmed</span>
            </div>
            <Progress value={progressValue} className="h-2" />
          </div>

          {courses.length > 0 &&
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-5 flex items-start gap-2 hidden">
              <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-amber-800">{t('aiWarningCourses')}</p>
            </div>
          }

          {courses.length === 0 &&
          <div className="bg-white rounded-xl border border-blue-100 p-8 text-center mb-6">
              <GraduationCap className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 mb-1">No courses detected yet</p>
              <p className="text-sm text-gray-400">Add your courses manually below.</p>
            </div>
          }

          <div className="space-y-3 mb-6">
            {courses.map((course) =>
            <CourseCard key={course.id} course={course} onDelete={deleteCourse} onSave={saveCourse} />
            )}
          </div>

          {/* Add course */}
          <div className="flex gap-2 mb-6">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addCourse()}
              placeholder="Course name…"
              className="flex-1 h-9" />
            <Button onClick={addCourse} disabled={!newName.trim()} size="sm" variant="outline">
              <Plus className="w-4 h-4 mr-1" /> Add course
            </Button>
          </div>

          {continueError &&
          <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 p-3 rounded-lg mb-4 border border-red-100">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {continueError}
            </div>
          }

          <div className="flex justify-between items-center">
            <Button variant="ghost" onClick={() => navigate(`/plan/${planId}/preferences`)}>
              <ArrowLeft className="w-4 h-4 mr-1" /> Back
            </Button>
            <Button onClick={handleNext} className="bg-blue-600 hover:bg-blue-700">
              Extract tasks <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        </motion.div>
      </div>
      <ContextChat phase="courses" planId={planId} suggestions={[
      "How do I add a missing course?",
      "What should I upload for each course?",
      "How does the course structure affect my plan?"]
      } />
    </div>);

}