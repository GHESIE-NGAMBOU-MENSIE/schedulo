import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { BookOpen, ArrowRight, ArrowLeft, Upload, FileText, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import PhaseIndicator from '@/components/schedulo/PhaseIndicator';
import StepHeader from '@/components/schedulo/StepHeader';
import ContextChat from '@/components/schedulo/ContextChat';
import { motion } from 'framer-motion';

const COURSE_TYPES = [
  { key: 'lecture_course',     label: 'Lecture course' },
  { key: 'lecture_exercises',  label: 'Lecture with exercises' },
  { key: 'seminar',            label: 'Seminar' },
  { key: 'project_course',     label: 'Project course' },
  { key: 'lab_course',         label: 'Lab course' },
  { key: 'bachelor_thesis',    label: 'Bachelor Thesis' },
  { key: 'master_thesis',      label: 'Master Thesis' },
  { key: 'other',              label: 'Other' },
];

const STRUCTURE_ELEMENTS = [
  { key: 'lectures',             label: 'Lectures',                group: 'Attendance' },
  { key: 'exercises',            label: 'Exercises / tutorials',   group: 'Attendance' },
  { key: 'lab_work',             label: 'Lab work',                group: 'Attendance' },
  { key: 'supervision_meetings', label: 'Supervision meetings',    group: 'Attendance' },
  { key: 'assignments',          label: 'Assignments / submissions', group: 'Submissions' },
  { key: 'quizzes',              label: 'Quizzes',                 group: 'Submissions' },
  { key: 'testate',              label: 'Tests / Testate',         group: 'Submissions' },
  { key: 'seminar_presentation', label: 'Presentation',            group: 'Submissions' },
  { key: 'paper_essay',          label: 'Paper / essay',           group: 'Submissions' },
  { key: 'project_work',         label: 'Project work',            group: 'Project / Thesis' },
  { key: 'implementation',       label: 'Implementation / dev',    group: 'Project / Thesis' },
  { key: 'thesis_writing',       label: 'Thesis writing',          group: 'Project / Thesis' },
  { key: 'literature_work',      label: 'Literature / research',   group: 'Project / Thesis' },
  { key: 'final_exam',           label: 'Final exam',              group: 'Assessment' },
  { key: 'oral_exam',            label: 'Oral exam',               group: 'Assessment' },
  { key: 'revision_buffer',      label: 'Revision / buffer',       group: 'Other' },
];

const STRUCTURE_GROUPS = ['Attendance', 'Submissions', 'Project / Thesis', 'Assessment', 'Other'];

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
    default:
      return ['lectures', 'assignments', 'final_exam', 'revision_buffer'];
  }
}

export default function CourseDetail() {
  const { planId, courseId } = useParams();
  const navigate = useNavigate();
  const [course, setCourse] = useState(null);
  const [allCourses, setAllCourses] = useState([]);
  const [selectedType, setSelectedType] = useState('');
  const [credits, setCredits] = useState('');
  const [examDate, setExamDate] = useState('');
  const [examType, setExamType] = useState('unknown'); // 'exact' | 'window' | 'none' | 'submission'
  const [examWindowStart, setExamWindowStart] = useState('');
  const [examWindowEnd, setExamWindowEnd] = useState('');
  const [courseStartDate, setCourseStartDate] = useState('');
  const [courseEndDate, setCourseEndDate] = useState('');
  const [description, setDescription] = useState('');
  const [difficulty, setDifficulty] = useState('medium');
  const [familiarity, setFamiliarity] = useState('medium');
  const [priority, setPriority] = useState('medium');
  const [materialsText, setMaterialsText] = useState('');
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [courseStructure, setCourseStructure] = useState([]);
  const [numChapters, setNumChapters] = useState('');
  const [numExercises, setNumExercises] = useState('');
  const [numAssignments, setNumAssignments] = useState('');
  const [numQuizzes, setNumQuizzes] = useState('');

  useEffect(() => {
    const load = async () => {
      const c = await base44.entities.Course.get(courseId);
      setCourse(c);
      setSelectedType(c.course_type?.[0] || '');
      setCredits(c.credit_points?.toString() || '');
      setExamDate(c.exam_date || '');
      // Derive examType from saved data
      if (c.exam_type) {
        setExamType(c.exam_type);
      } else if (c.exam_date) {
        setExamType('exact');
      } else {
        setExamType('unknown');
      }
      setExamWindowStart(c.exam_window_start || '');
      setExamWindowEnd(c.exam_window_end || '');
      setCourseStartDate(c.course_start_date || '');
      setCourseEndDate(c.course_end_date || '');
      setDescription(c.description || '');
      setDifficulty(c.difficulty || 'medium');
      setFamiliarity(c.familiarity || 'medium');
      setPriority(c.priority || 'medium');
      setMaterialsText(c.materials_text || '');
      setFiles(c.material_files || []);
      setNumChapters(c.num_chapters?.toString() || '');
      setNumExercises(c.num_exercises?.toString() || '');
      setNumAssignments(c.num_assignments?.toString() || '');
      setNumQuizzes(c.num_quizzes?.toString() || '');
      if (c.course_structure && c.course_structure.length > 0) {
        setCourseStructure(c.course_structure);
      } else {
        setCourseStructure(suggestStructure(c.course_type?.[0] || ''));
      }
      const all = await base44.entities.Course.filter({ plan_id: planId });
      setAllCourses(all);
      setLoading(false);
    };
    load();
  }, [courseId, planId]);

  const handleTypeChange = (key) => {
    setSelectedType(key);
    if (!course?.course_structure?.length) {
      setCourseStructure(suggestStructure(key));
    }
  };

  const toggleStructure = (key) => {
    setCourseStructure(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setFiles(prev => [...prev, file_url]);
    } catch (err) {
      console.error(err);
    }
    setUploading(false);
  };

  const saveCourse = async () => {
    await base44.entities.Course.update(courseId, {
      course_type: selectedType ? [selectedType] : [],
      course_structure: courseStructure,
      num_chapters: numChapters ? Number(numChapters) : null,
      num_exercises: numExercises ? Number(numExercises) : null,
      num_assignments: numAssignments ? Number(numAssignments) : null,
      num_quizzes: numQuizzes ? Number(numQuizzes) : null,
      credit_points: credits ? Number(credits) : null,
      exam_date: examType === 'exact' ? (examDate || null) : examType === 'submission' ? (examDate || null) : null,
      exam_type: examType,
      exam_window_start: examType === 'window' ? (examWindowStart || null) : null,
      exam_window_end: examType === 'window' ? (examWindowEnd || null) : null,
      course_start_date: courseStartDate || null,
      course_end_date: courseEndDate || null,
      description,
      difficulty,
      familiarity,
      priority,
      materials_text: materialsText,
      material_files: files,
      confirmed: true
    });
  };

  const handleNext = async () => {
    await saveCourse();
    const currentIdx = allCourses.findIndex(c => c.id === courseId);
    if (currentIdx < allCourses.length - 1) {
      navigate(`/plan/${planId}/course/${allCourses[currentIdx + 1].id}`);
    } else {
      navigate(`/plan/${planId}/tasks`);
    }
  };

  const handleBack = () => {
    const currentIdx = allCourses.findIndex(c => c.id === courseId);
    if (currentIdx > 0) {
      navigate(`/plan/${planId}/course/${allCourses[currentIdx - 1].id}`);
    } else {
      navigate(`/plan/${planId}/courses`);
    }
  };

  if (loading || !course) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
      </div>
    );
  }

  const currentIdx = allCourses.findIndex(c => c.id === courseId);
  const isLast = currentIdx === allCourses.length - 1;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      <PhaseIndicator currentPhase="courses" currentStep={5} />
      <div className="max-w-3xl mx-auto px-4 py-8">
        <motion.div key={courseId} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          {/* Course progress */}
          <div className="flex items-center gap-2 mb-4">
            {allCourses.map((c, i) => (
              <div key={c.id} className={`h-1.5 flex-1 rounded-full transition-all ${i <= currentIdx ? 'bg-blue-500' : 'bg-gray-200'}`} />
            ))}
          </div>
          <p className="text-xs text-gray-400 mb-6">Course {currentIdx + 1} of {allCourses.length}</p>

          <StepHeader
            icon={BookOpen}
            title={course.name}
            description="Fill in the details for this course. The more info you provide, the better your study plan will be."
          />

          {/* Course type */}
          <div className="bg-white rounded-xl border border-blue-100 p-6 shadow-sm mb-4">
            <h3 className="font-semibold text-gray-900 mb-1">Course type</h3>
            <p className="text-sm text-gray-400 mb-3">Select the general kind of course.</p>
            <div className="flex flex-wrap gap-2">
              {COURSE_TYPES.map(ct => (
                <button
                  key={ct.key}
                  onClick={() => handleTypeChange(ct.key)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all border ${
                    selectedType === ct.key ? 'bg-blue-600 text-white border-blue-600' : 'bg-gray-100 text-gray-500 border-transparent hover:bg-gray-200'
                  }`}
                >
                  {ct.label}
                </button>
              ))}
            </div>
          </div>

          {/* Course structure */}
          <div className="bg-white rounded-xl border border-blue-100 p-6 shadow-sm mb-4">
            <div className="flex items-start justify-between mb-1">
              <div>
                <h3 className="font-semibold text-gray-900">Course structure / workload elements</h3>
                <p className="text-sm text-gray-400 mb-3">Select everything that applies — only selected elements appear in the workload breakdown.</p>
              </div>
              {selectedType && (
                <button
                  onClick={() => setCourseStructure(suggestStructure(selectedType))}
                  className="text-xs text-blue-500 hover:text-blue-700 whitespace-nowrap ml-4 mt-1"
                >
                  Reset to suggestion
                </button>
              )}
            </div>
            {STRUCTURE_GROUPS.map(group => {
              const items = STRUCTURE_ELEMENTS.filter(e => e.group === group);
              return (
                <div key={group} className="mb-3">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">{group}</p>
                  <div className="flex flex-wrap gap-2">
                    {items.map(el => (
                      <button
                        key={el.key}
                        onClick={() => toggleStructure(el.key)}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all border ${
                          courseStructure.includes(el.key)
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-white text-gray-500 border-gray-200 hover:border-blue-300 hover:text-blue-600'
                        }`}
                      >
                        {el.label}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
            {courseStructure.length === 0 && (
              <p className="text-xs text-amber-600 mt-1">⚠ No structure selected. Please select at least one element so workload categories can be created.</p>
            )}
          </div>

          {/* Course content counts */}
          {(courseStructure.includes('lectures') || courseStructure.includes('exercises') || courseStructure.includes('assignments') || courseStructure.includes('quizzes') || courseStructure.includes('testate')) && (
            <div className="bg-white rounded-xl border border-blue-100 p-6 shadow-sm mb-4">
              <h3 className="font-semibold text-gray-900 mb-1">Course content</h3>
              <p className="text-sm text-gray-400 mb-3">Optional — helps generate more accurate tasks.</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {courseStructure.includes('lectures') && (
                  <div>
                    <Label className="text-sm text-gray-600">Chapters / topics</Label>
                    <Input type="number" min={0} value={numChapters} onChange={e => setNumChapters(e.target.value)} placeholder="e.g. 12" className="mt-1" />
                  </div>
                )}
                {courseStructure.includes('exercises') && (
                  <div>
                    <Label className="text-sm text-gray-600">Exercise sheets</Label>
                    <Input type="number" min={0} value={numExercises} onChange={e => setNumExercises(e.target.value)} placeholder="e.g. 10" className="mt-1" />
                  </div>
                )}
                {courseStructure.includes('assignments') && (
                  <div>
                    <Label className="text-sm text-gray-600">Assignments</Label>
                    <Input type="number" min={0} value={numAssignments} onChange={e => setNumAssignments(e.target.value)} placeholder="e.g. 3" className="mt-1" />
                  </div>
                )}
                {(courseStructure.includes('quizzes') || courseStructure.includes('testate')) && (
                  <div>
                    <Label className="text-sm text-gray-600">Quizzes / Testate</Label>
                    <Input type="number" min={0} value={numQuizzes} onChange={e => setNumQuizzes(e.target.value)} placeholder="e.g. 5" className="mt-1" />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Details grid */}
          <div className="bg-white rounded-xl border border-blue-100 p-6 shadow-sm mb-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label className="text-sm text-gray-600">Credit points</Label>
                <Input type="number" value={credits} onChange={e => setCredits(e.target.value)} placeholder="e.g., 5" className="mt-1" />
              </div>

              {/* Exam / final assessment */}
              <div className="sm:col-span-2">
                <Label className="text-sm text-gray-600 block mb-1">Final assessment</Label>
                <div className="flex flex-wrap gap-2 mb-3">
                  {[
                    { key: 'exact', label: 'Exact exam date' },
                    { key: 'window', label: 'Exam period (approx.)' },
                    { key: 'submission', label: 'Assignment / submission' },
                    { key: 'none', label: 'No exam' },
                    { key: 'unknown', label: 'Not known yet' },
                  ].map(opt => (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setExamType(opt.key)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${examType === opt.key ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                {(examType === 'exact' || examType === 'submission') && (
                  <div>
                    <Label className="text-xs text-gray-500">{examType === 'submission' ? 'Submission deadline' : 'Exam date'}</Label>
                    <Input type="date" value={examDate} onChange={e => setExamDate(e.target.value)} className="mt-1" />
                  </div>
                )}
                {examType === 'window' && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs text-gray-500">Earliest possible date</Label>
                      <Input type="date" value={examWindowStart} onChange={e => setExamWindowStart(e.target.value)} className="mt-1" />
                    </div>
                    <div>
                      <Label className="text-xs text-gray-500">Latest possible date</Label>
                      <Input type="date" value={examWindowEnd} onChange={e => setExamWindowEnd(e.target.value)} className="mt-1" />
                    </div>
                    <p className="col-span-2 text-xs text-amber-600">
                      ⚠ Provisional — exam prep will be planned towards the end of this window. Update when you know the exact date.
                    </p>
                  </div>
                )}
                {examType === 'none' && (
                  <p className="text-xs text-gray-400">No exam preparation tasks will be created for this course.</p>
                )}
                {examType === 'unknown' && (
                  <p className="text-xs text-amber-600">⚠ No exam date provided. A provisional exam preparation phase will be created at the end of the semester. Please update when you know the date.</p>
                )}
              </div>

              {/* Course-specific dates */}
              <div>
                <Label className="text-sm text-gray-600">Course start date <span className="text-gray-400 font-normal">(optional)</span></Label>
                <Input type="date" value={courseStartDate} onChange={e => setCourseStartDate(e.target.value)} className="mt-1" />
                <p className="text-xs text-gray-400 mt-1">Leave blank to use the plan start date.</p>
              </div>
              <div>
                <Label className="text-sm text-gray-600">Course end date <span className="text-gray-400 font-normal">(optional)</span></Label>
                <Input type="date" value={courseEndDate} onChange={e => setCourseEndDate(e.target.value)} className="mt-1" />
              </div>

              <div>
                <Label className="text-sm text-gray-600">Perceived difficulty</Label>
                <Select value={difficulty} onValueChange={setDifficulty}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="easy">Easy</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="difficult">Difficult</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-sm text-gray-600">Familiarity with topic</Label>
                <Select value={familiarity} onValueChange={setFamiliarity}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="high">High — I know the basics</SelectItem>
                    <SelectItem value="medium">Medium — Some knowledge</SelectItem>
                    <SelectItem value="low">Low — Completely new</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="sm:col-span-2">
                <Label className="text-sm text-gray-600">Priority</Label>
                <Select value={priority} onValueChange={setPriority}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="high">High — Must pass</SelectItem>
                    <SelectItem value="medium">Medium — Important</SelectItem>
                    <SelectItem value="low">Low — Nice to do well</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Description */}
          <div className="bg-white rounded-xl border border-blue-100 p-6 shadow-sm mb-4">
            <Label className="text-sm text-gray-600">Course description (optional)</Label>
            <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Brief description of what this course covers..." className="mt-1" rows={3} />
          </div>

          {/* Materials */}
          <div className="bg-white rounded-xl border border-blue-100 p-6 shadow-sm mb-4">
            <h3 className="font-semibold text-gray-900 mb-1">Course materials</h3>
            <p className="text-sm text-gray-400 mb-3">Upload syllabi, assignment sheets, or paste course info. I'll extract tasks and deadlines from these.</p>
            <div className="space-y-3">
              <Textarea
                value={materialsText}
                onChange={e => setMaterialsText(e.target.value)}
                placeholder="Paste syllabus, assignments, deadlines, reading lists, announcements..."
                rows={5}
              />
              <div className="flex items-center gap-3">
                <label className="cursor-pointer">
                  <input type="file" accept=".pdf,.doc,.docx,.txt,.png,.jpg" onChange={handleFileUpload} className="hidden" />
                  <div className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors text-sm font-medium">
                    {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                    Upload file
                  </div>
                </label>
                {files.length > 0 && (
                  <span className="text-sm text-green-600">{files.length} file(s) uploaded</span>
                )}
              </div>
              {files.map((f, i) => (
                <div key={i} className="flex items-center gap-2 text-sm text-gray-500">
                  <FileText className="w-4 h-4" />
                  <span className="truncate max-w-xs">{f.split('/').pop()}</span>
                  <button onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-600 text-xs">Remove</button>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-between items-center">
            <Button variant="ghost" onClick={handleBack}>
              <ArrowLeft className="w-4 h-4 mr-1" /> Back
            </Button>
            <Button onClick={handleNext} className="bg-blue-600 hover:bg-blue-700">
              {isLast ? 'Extract tasks' : 'Next course'} <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        </motion.div>
      </div>
      <ContextChat phase="courseDetail" planId={planId} suggestions={[
        "What are credit points?",
        "What should I upload?",
        "How does difficulty affect my plan?"
      ]} />
    </div>
  );
}