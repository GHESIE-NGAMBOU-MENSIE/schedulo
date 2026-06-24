import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { BookOpen, Plus, Trash2, ArrowRight, ArrowLeft, Edit2, Check, GraduationCap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import PhaseIndicator from '@/components/schedulo/PhaseIndicator';
import StepHeader from '@/components/schedulo/StepHeader';
import ContextChat from '@/components/schedulo/ContextChat';
import { motion } from 'framer-motion';

export default function CourseOverview() {
  const { planId } = useParams();
  const navigate = useNavigate();
  const [courses, setCourses] = useState([]);
  const [newName, setNewName] = useState('');
  const [editId, setEditId] = useState(null);
  const [editName, setEditName] = useState('');
  const [loading, setLoading] = useState(true);

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

  const saveEdit = async () => {
    if (!editName.trim()) return;
    await base44.entities.Course.update(editId, { name: editName.trim() });
    setEditId(null);
    setEditName('');
    loadCourses();
  };

  const handleNext = () => {
    if (courses.length > 0) {
      navigate(`/plan/${planId}/course/${courses[0].id}`);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      <PhaseIndicator currentPhase="courses" currentStep={4} />
      <div className="max-w-3xl mx-auto px-4 py-8">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <StepHeader
            icon={BookOpen}
            title="Your Courses"
            description="Here are the courses I detected from your calendar. You can edit, remove, or add any missing courses."
          />

          {courses.length === 0 && (
            <div className="bg-white rounded-xl border border-blue-100 p-8 text-center mb-6">
              <GraduationCap className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 mb-1">No courses detected yet</p>
              <p className="text-sm text-gray-400">Add your courses manually below.</p>
            </div>
          )}

          <div className="space-y-3 mb-6">
            {courses.map((course, i) => (
              <motion.div
                key={course.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className="bg-white rounded-xl border border-blue-100 p-4 shadow-sm flex items-center justify-between group hover:border-blue-200 transition-colors"
              >
                {editId === course.id ? (
                  <div className="flex items-center gap-2 flex-1">
                    <Input
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      className="flex-1"
                      autoFocus
                      onKeyDown={e => e.key === 'Enter' && saveEdit()}
                    />
                    <Button size="sm" onClick={saveEdit}><Check className="w-4 h-4" /></Button>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center text-sm font-bold">
                        {course.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{course.name}</p>
                        <p className="text-xs text-gray-400">
                          {course.confirmed ? '✓ Details added' : 'Details needed'}
                          {course.credit_points ? ` · ${course.credit_points} CP` : ''}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => { setEditId(course.id); setEditName(course.name); }} className="p-2 hover:bg-gray-100 rounded-lg">
                        <Edit2 className="w-4 h-4 text-gray-400" />
                      </button>
                      <button onClick={() => deleteCourse(course.id)} className="p-2 hover:bg-red-50 rounded-lg">
                        <Trash2 className="w-4 h-4 text-red-400" />
                      </button>
                    </div>
                  </>
                )}
              </motion.div>
            ))}
          </div>

          {/* Add course */}
          <div className="bg-white rounded-xl border border-dashed border-blue-200 p-4 mb-8">
            <div className="flex gap-2">
              <Input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="Enter course name..."
                onKeyDown={e => e.key === 'Enter' && addCourse()}
              />
              <Button onClick={addCourse} disabled={!newName.trim()} className="bg-blue-600 hover:bg-blue-700">
                <Plus className="w-4 h-4 mr-1" /> Add
              </Button>
            </div>
          </div>

          <div className="flex justify-between items-center">
            <Button variant="ghost" onClick={() => navigate(`/plan/${planId}/preferences`)}>
              <ArrowLeft className="w-4 h-4 mr-1" /> Back
            </Button>
            <Button onClick={handleNext} disabled={courses.length === 0} className="bg-blue-600 hover:bg-blue-700">
              Add course details <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        </motion.div>
      </div>
      <ContextChat phase="courses" planId={planId} suggestions={[
        "How do I add a missing course?",
        "What counts as a course?",
        "Can I change course names later?"
      ]} />
    </div>
  );
}