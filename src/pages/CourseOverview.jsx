import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { BookOpen, Plus, Trash2, ArrowRight, ArrowLeft, ChevronDown, ChevronUp, GraduationCap, Upload, Loader2, FileText, Sparkles, AlertCircle } from 'lucide-react';
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

const COURSE_TYPES = ['Lecture', 'Assignment', 'Exercise', 'Project', 'Lab', 'Seminar', 'Other'];

function CourseCard({ course, onDelete, onSave }) {
  const [expanded, setExpanded] = useState(false);
  const [name, setName] = useState(course.name || '');
  const [credits, setCredits] = useState(course.credit_points?.toString() || '');
  const [selectedTypes, setSelectedTypes] = useState(course.course_type || []);
  const [difficulty, setDifficulty] = useState(course.difficulty || 'medium');
  const [familiarity, setFamiliarity] = useState(course.familiarity || 'medium');
  const [priority, setPriority] = useState(course.priority || 'medium');
  const [materialsText, setMaterialsText] = useState(course.materials_text || '');
  const [files, setFiles] = useState(course.material_files || []);
  const [uploading, setUploading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [saving, setSaving] = useState(false);

  const toggleType = (t) => {
    setSelectedTypes((prev) => prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]);
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      const newFiles = [...files, file_url];
      setFiles(newFiles);
      // Auto-extract info after upload
      setExtracting(true);
      try {
        const result = await base44.integrations.Core.InvokeLLM({
          prompt: `Extract course information from this uploaded document. Return a JSON with: course_name (string), credit_points (number or null), course_types (array of: Lecture, Assignment, Exercise, Project, Lab, Seminar, Other), difficulty (easy/medium/difficult), description (string summary).`,
          file_urls: [file_url],
          response_json_schema: {
            type: 'object',
            properties: {
              course_name: { type: 'string' },
              credit_points: { type: 'number' },
              course_types: { type: 'array', items: { type: 'string' } },
              difficulty: { type: 'string' },
              description: { type: 'string' }
            }
          }
        });
        if (result.course_name && result.course_name !== name) setName(result.course_name);
        if (result.credit_points) setCredits(result.credit_points.toString());
        if (result.course_types?.length) setSelectedTypes(result.course_types.filter((t) => COURSE_TYPES.includes(t)));
        if (result.difficulty) setDifficulty(result.difficulty);
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
      course_type: selectedTypes,
      difficulty,
      familiarity,
      priority,
      materials_text: materialsText,
      material_files: files,
      confirmed: true
    });
    setSaving(false);
    setExpanded(false);
  };

  const isComplete = course.confirmed;

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
              <span className="text-green-600">✓ Details added{course.credit_points ? ` · ${course.credit_points} ECTS` : ''}</span> :
              'Tap to add course details'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onDelete(course.id)}
            className="p-2 hover:bg-red-50 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity">
            
            <Trash2 className="w-4 h-4 text-red-400" />
          </button>
          <button
            onClick={() => setExpanded((p) => !p)}
            className="p-2 hover:bg-blue-50 rounded-lg transition-colors">
            
            {expanded ? <ChevronUp className="w-4 h-4 text-blue-500" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
          </button>
        </div>
      </div>

      {/* Expandable detail section */}
      <AnimatePresence>
        {expanded &&
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="overflow-hidden">
          
            <div className="border-t border-blue-50 p-4 space-y-4 bg-blue-50/20">
              {extracting &&
            <div className="flex items-center gap-2 text-sm text-blue-600 bg-blue-50 p-3 rounded-lg">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Extracting course information from your document…
                </div>
            }

              {/* Basic info */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-gray-600">Course name</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 h-8 text-sm" />
                </div>
                <div>
                  <Label className="text-xs text-gray-600">ECTS / Credits</Label>
                  <Input type="number" value={credits} onChange={(e) => setCredits(e.target.value)} placeholder="e.g., 5" className="mt-1 h-8 text-sm" />
                </div>
              </div>

              {/* Course type */}
              <div>
                <Label className="text-xs text-gray-600 mb-2 block">Course type (multi-select)</Label>
                <div className="flex flex-wrap gap-1.5">
                  {COURSE_TYPES.map((t) =>
                <button
                  key={t}
                  onClick={() => toggleType(t)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                  selectedTypes.includes(t) ? 'bg-blue-600 text-white' : 'bg-white text-gray-500 border border-gray-200 hover:border-blue-300'}`
                  }>
                  
                      {t}
                    </button>
                )}
                </div>
              </div>

              {/* Learning characteristics */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
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
                <div>
                  <Label className="text-xs text-gray-600">Familiarity</Label>
                  <Select value={familiarity} onValueChange={setFamiliarity}>
                    <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-gray-600">Priority</Label>
                  <Select value={priority} onValueChange={setPriority}>
                    <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Documents */}
              <div>
                <Label className="text-xs text-gray-600 block mb-2">Upload documents (syllabus, semester plan, etc.)</Label>
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

              {/* Manual description */}
              <div>
                <Label className="text-xs text-gray-600">Course description / notes <span className="text-gray-400">(optional — if no document uploaded)</span></Label>
                <Textarea
                value={materialsText}
                onChange={(e) => setMaterialsText(e.target.value)}
                placeholder="Describe the course content, assignments, key topics…"
                rows={3}
                className="mt-1 text-sm" />
              
              </div>

              <div className="flex justify-end">
                <Button onClick={handleSave} disabled={saving} size="sm" className="bg-blue-600 hover:bg-blue-700">
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Sparkles className="w-3.5 h-3.5 mr-1" />}
                  Save course details
                </Button>
              </div>
            </div>
          </motion.div>
        }
      </AnimatePresence>
    </motion.div>);

}

export default function CourseOverview() {
  const { planId } = useParams();
  const navigate = useNavigate();
  const [courses, setCourses] = useState([]);
  const [newName, setNewName] = useState('');
  const [loading, setLoading] = useState(true);
  const [continueError, setContinueError] = useState('');

  useEffect(() => {
    loadCourses();
  }, [planId]);

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
    if (courses.length === 0) {
      setContinueError('Please add at least one course before continuing.');
      return;
    }
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
      <PhaseIndicator currentPhase="courses" currentStep={4} />
      <div className="max-w-3xl mx-auto px-4 py-8">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <StepHeader
            icon={BookOpen}
            title="Your Courses"
            description="Here are the courses detected from your calendar. Expand each one to add details — the more info you provide, the better your plan." />
          

          {/* Progress */}
          <div className="mb-6">
            <div className="flex justify-between text-xs text-gray-500 mb-1">
              <span>Step 3 of 4 — Course Information</span>
              <span>{completedCount} of {courses.length} courses completed</span>
            </div>
            <Progress value={progressValue} className="h-2" />
          </div>

          {courses.length === 0 &&
          <div className="bg-white rounded-xl border border-blue-100 p-8 text-center mb-6">
              <GraduationCap className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 mb-1">No courses detected yet</p>
              <p className="text-sm text-gray-400">Add your courses manually below.</p>
            </div>
          }

          <div className="space-y-3 mb-6">
            {courses.map((course) =>
            <CourseCard
              key={course.id}
              course={course}
              onDelete={deleteCourse}
              onSave={saveCourse} />

            )}
          </div>

          {/* Add course */}
          <div className="bg-white rounded-xl border border-dashed border-blue-200 p-4 mb-8">
            <div className="flex gap-2 hidden">
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Enter course name…"
                onKeyDown={(e) => e.key === 'Enter' && addCourse()} className="hidden" />
              
              <Button onClick={addCourse} disabled={!newName.trim()} className="bg-blue-600 hover:bg-blue-700">
                <Plus className="w-4 h-4 mr-1" /> Add
              </Button>
            </div>
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
      "Can I skip adding course details?"]
      } />
    </div>);

}