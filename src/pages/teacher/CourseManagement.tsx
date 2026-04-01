import React, { useEffect, useState } from 'react';
import { supabase } from '../../supabase';
import TeacherLayout from '../../components/layout/TeacherLayout';
import { 
  Plus, 
  Search, 
  MoreVertical, 
  BookOpen, 
  Users, 
  Trash2, 
  Edit2,
  X,
  Globe
} from 'lucide-react';
import { toast } from 'sonner';
import { Course } from '../../types';
import { cn } from '../../lib/utils';

export default function CourseManagement() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCourse, setEditingCourse] = useState<Course | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    language: 'English'
  });

  const fetchCourses = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    try {
      const { data, error } = await supabase
        .from('courses')
        .select('*')
        .eq('teacher_id', session.user.id);
      
      if (error) throw error;
      setCourses(data.map(d => ({
        id: d.id,
        name: d.name,
        description: d.description,
        language: d.language,
        teacherId: d.teacher_id,
        studentIds: d.student_ids || [],
        createdAt: d.created_at
      } as Course)));
    } catch (error) {
      toast.error('Failed to fetch courses');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCourses();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    try {
      if (editingCourse) {
        const { error } = await supabase
          .from('courses')
          .update({
            name: formData.name,
            description: formData.description,
            language: formData.language
          })
          .eq('id', editingCourse.id);
        
        if (error) throw error;
        toast.success('Course updated successfully');
      } else {
        const { error } = await supabase
          .from('courses')
          .insert({
            ...formData,
            teacher_id: session.user.id,
            student_ids: []
          });
        
        if (error) throw error;
        toast.success('Course created successfully');
      }
      setIsModalOpen(false);
      setEditingCourse(null);
      setFormData({ name: '', description: '', language: 'English' });
      fetchCourses();
    } catch (error) {
      toast.error('Failed to save course');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this course?')) return;
    try {
      const { error } = await supabase
        .from('courses')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
      toast.success('Course deleted successfully');
      fetchCourses();
    } catch (error) {
      toast.error('Failed to delete course');
    }
  };

  return (
    <TeacherLayout>
      <div className="space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Course Management</h1>
            <p className="text-slate-500 mt-2">Create and manage your educational courses.</p>
          </div>
          <button
            onClick={() => {
              setEditingCourse(null);
              setFormData({ name: '', description: '', language: 'English' });
              setIsModalOpen(true);
            }}
            className="inline-flex items-center gap-2 bg-slate-900 text-white px-6 py-3 rounded-xl font-semibold hover:bg-slate-800 transition-all"
          >
            <Plus className="w-5 h-5" />
            Create Course
          </button>
        </div>

        {/* Search and Filters */}
        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              placeholder="Search courses..."
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
          </div>
          <select className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 outline-none focus:ring-2 focus:ring-slate-900">
            <option>All Languages</option>
            <option>English</option>
            <option>Spanish</option>
            <option>French</option>
          </select>
        </div>

        {/* Course Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {loading ? (
            Array(3).fill(0).map((_, i) => (
              <div key={i} className="bg-white h-64 rounded-2xl border border-slate-100 animate-pulse" />
            ))
          ) : courses.length > 0 ? (
            courses.map((course) => (
              <div key={course.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all group overflow-hidden">
                <div className="h-32 bg-slate-900 p-6 flex items-end justify-between">
                  <div className="p-3 bg-white/10 backdrop-blur-md rounded-xl text-white">
                    <BookOpen className="w-6 h-6" />
                  </div>
                  <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-all">
                    <button
                      onClick={() => {
                        setEditingCourse(course);
                        setFormData({
                          name: course.name,
                          description: course.description,
                          language: course.language
                        });
                        setIsModalOpen(true);
                      }}
                      className="p-2 bg-white/10 backdrop-blur-md text-white rounded-lg hover:bg-white/20"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(course.id)}
                      className="p-2 bg-white/10 backdrop-blur-md text-red-400 rounded-lg hover:bg-red-500/20"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <div className="p-6">
                  <h3 className="text-xl font-bold text-slate-900 mb-2">{course.name}</h3>
                  <p className="text-slate-500 text-sm line-clamp-2 mb-6">{course.description}</p>
                  <div className="flex items-center justify-between pt-6 border-t border-slate-50">
                    <div className="flex items-center gap-2 text-slate-500 text-sm">
                      <Users className="w-4 h-4" />
                      {course.studentIds.length} Students
                    </div>
                    <div className="flex items-center gap-2 text-slate-500 text-sm">
                      <Globe className="w-4 h-4" />
                      {course.language}
                    </div>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="col-span-full py-20 text-center bg-white rounded-2xl border border-dashed border-slate-200">
              <BookOpen className="w-16 h-16 text-slate-200 mx-auto mb-4" />
              <h3 className="text-lg font-bold text-slate-900">No courses yet</h3>
              <p className="text-slate-500">Create your first course to get started.</p>
            </div>
          )}
        </div>

        {/* Create/Edit Modal */}
        {isModalOpen && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
              <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                <h2 className="text-xl font-bold text-slate-900">
                  {editingCourse ? 'Edit Course' : 'Create New Course'}
                </h2>
                <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-slate-50 rounded-lg">
                  <X className="w-5 h-5 text-slate-400" />
                </button>
              </div>
              <form onSubmit={handleSubmit} className="p-6 space-y-6">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Course Name</label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                    placeholder="e.g. Advanced Mathematics"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Description</label>
                  <textarea
                    required
                    rows={4}
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 resize-none"
                    placeholder="Describe what students will learn..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Language</label>
                  <select
                    value={formData.language}
                    onChange={(e) => setFormData({ ...formData, language: e.target.value })}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                  >
                    <option>English</option>
                    <option>Spanish</option>
                    <option>French</option>
                    <option>German</option>
                    <option>Italian</option>
                  </select>
                </div>
                <div className="flex gap-4 pt-4">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="flex-1 px-6 py-3 border border-slate-200 text-slate-600 font-semibold rounded-xl hover:bg-slate-50 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 px-6 py-3 bg-slate-900 text-white font-semibold rounded-xl hover:bg-slate-800 transition-all"
                  >
                    {editingCourse ? 'Update Course' : 'Create Course'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </TeacherLayout>
  );
}
