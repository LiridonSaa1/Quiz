import React, { useEffect, useState } from 'react';
import { supabase } from '../../supabase';
import TeacherLayout from '../../components/layout/TeacherLayout';
import {
  Plus, Search, Layers, Trash2, Edit2, ChevronUp, ChevronDown,
  BookOpen, X, Save, CheckCircle2, XCircle, GripVertical, PlayCircle
} from 'lucide-react';
import { toast } from 'sonner';
import { Module, Course } from '../../types';
import { cn } from '../../lib/utils';

const slugify = (text: string) =>
  text.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').trim();

const emptyForm = { title: '', description: '', order: 1, status: 'published' };

export default function TeacherModules() {
  const [modules, setModules] = useState<Module[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [courseFilter, setCourseFilter] = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Module | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [formCourseId, setFormCourseId] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    try {
      const { data: coursesData, error: coursesError } = await supabase
        .from('courses')
        .select('*')
        .eq('teacher_id', session.user.id)
        .order('created_at', { ascending: false });
      if (coursesError && (coursesError as any).status !== 400) throw coursesError;

      const courseList = coursesData || [];
      setCourses(courseList.map(c => ({ ...c, id: c.id })) as Course[]);

      if (courseList.length === 0) {
        setModules([]);
        return;
      }

      const courseIds = courseList.map(c => c.id);
      const { data: modulesData, error: modulesError } = await supabase
        .from('modules')
        .select('*')
        .in('course_id', courseIds)
        .order('order', { ascending: true });
      if (modulesError) throw modulesError;

      setModules((modulesData || []).map(m => ({
        id: m.id,
        courseId: m.course_id,
        title: m.title,
        slug: m.slug,
        description: m.description,
        order: m.order,
        status: m.status,
        totalLessons: m.total_lessons || 0,
        createdAt: m.created_at,
        updatedAt: m.updated_at,
      })));
    } catch {
      toast.error('Failed to load modules');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const openCreate = () => {
    setEditing(null);
    setFormCourseId(courses[0]?.id || '');
    const maxOrder = modules.length > 0 ? Math.max(...modules.map(m => m.order)) + 1 : 1;
    setForm({ ...emptyForm, order: maxOrder });
    setShowModal(true);
  };

  const openEdit = (mod: Module) => {
    setEditing(mod);
    setFormCourseId(mod.courseId);
    setForm({
      title: mod.title,
      description: mod.description || '',
      order: mod.order,
      status: mod.status,
    });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditing(null);
    setForm(emptyForm);
  };

  const handleSave = async () => {
    if (!form.title.trim()) { toast.error('Title is required'); return; }
    if (!formCourseId) { toast.error('Please select a course'); return; }
    setSaving(true);
    try {
      const payload = {
        course_id: formCourseId,
        title: form.title.trim(),
        slug: slugify(form.title),
        description: form.description.trim() || null,
        order: Number(form.order) || 1,
        status: form.status,
        total_lessons: editing?.totalLessons || 0,
      };

      if (editing) {
        const { error } = await supabase.from('modules').update(payload).eq('id', editing.id);
        if (error) throw error;
        toast.success('Module updated');
      } else {
        const { error } = await supabase.from('modules').insert(payload);
        if (error) throw error;
        toast.success('Module created');
      }
      closeModal();
      fetchData();
    } catch (err: any) {
      toast.error(err.message || 'Failed to save module');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this module? This cannot be undone.')) return;
    try {
      const { error } = await supabase.from('modules').delete().eq('id', id);
      if (error) throw error;
      toast.success('Module deleted');
      fetchData();
    } catch {
      toast.error('Failed to delete module');
    }
  };

  const handleToggleStatus = async (mod: Module) => {
    const newStatus = mod.status === 'published' ? 'draft' : 'published';
    try {
      const { error } = await supabase.from('modules').update({ status: newStatus }).eq('id', mod.id);
      if (error) throw error;
      toast.success(`Module ${newStatus === 'published' ? 'published' : 'set to draft'}`);
      fetchData();
    } catch {
      toast.error('Failed to update status');
    }
  };

  const filtered = modules.filter(m => {
    const matchSearch = m.title.toLowerCase().includes(search.toLowerCase()) ||
      (m.description || '').toLowerCase().includes(search.toLowerCase());
    const matchCourse = courseFilter === 'all' || m.courseId === courseFilter;
    return matchSearch && matchCourse;
  });

  const getCourseTitle = (courseId: string) =>
    courses.find(c => c.id === courseId)?.name ||
    courses.find(c => c.id === courseId)?.title || 'Unknown Course';

  const stats = [
    { label: 'Total Modules', value: modules.length, color: 'text-violet-600', bg: 'bg-violet-50', border: 'border-violet-100' },
    { label: 'Published', value: modules.filter(m => m.status === 'published').length, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-100' },
    { label: 'Drafts', value: modules.filter(m => m.status !== 'published').length, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-100' },
    { label: 'Total Lessons', value: modules.reduce((acc, m) => acc + (m.totalLessons || 0), 0), color: 'text-indigo-600', bg: 'bg-indigo-50', border: 'border-indigo-100' },
  ];

  return (
    <TeacherLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Modules</h1>
            <p className="text-slate-500 text-sm mt-1">Organize your courses into structured modules.</p>
          </div>
          <button
            onClick={openCreate}
            disabled={courses.length === 0}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-violet-600 text-white rounded-xl font-semibold text-sm hover:bg-violet-700 transition-all shadow-lg shadow-violet-200 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="w-4 h-4" />
            New Module
          </button>
        </div>

        {/* No courses warning */}
        {!loading && courses.length === 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 flex items-start gap-3">
            <BookOpen className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-amber-800">No courses found</p>
              <p className="text-xs text-amber-600 mt-0.5">Create a course first before adding modules to it.</p>
            </div>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map(stat => (
            <div key={stat.label} className={`bg-white border ${stat.border} rounded-2xl p-4 shadow-sm`}>
              <div className={`text-2xl font-bold ${stat.color}`}>{stat.value}</div>
              <div className="text-xs text-slate-500 font-medium mt-0.5">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search modules..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 transition-all"
            />
          </div>
          <select
            value={courseFilter}
            onChange={e => setCourseFilter(e.target.value)}
            className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 transition-all"
          >
            <option value="all">All Courses</option>
            {courses.map(c => (
              <option key={c.id} value={c.id}>{c.name || c.title}</option>
            ))}
          </select>
        </div>

        {/* Module List */}
        {loading ? (
          <div className="space-y-3">
            {Array(5).fill(0).map((_, i) => (
              <div key={i} className="bg-white rounded-2xl border border-slate-100 h-20 animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-24 text-center bg-white rounded-2xl border border-dashed border-slate-200">
            <div className="w-16 h-16 bg-violet-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Layers className="w-8 h-8 text-violet-300" />
            </div>
            <h3 className="text-lg font-bold text-slate-700 mb-1">No modules found</h3>
            <p className="text-slate-400 text-sm mb-6">
              {search || courseFilter !== 'all' ? 'No results match your filter.' : 'Create your first module to organize your course content.'}
            </p>
            {courses.length > 0 && (
              <button
                onClick={openCreate}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-violet-600 text-white rounded-xl font-semibold text-sm hover:bg-violet-700 transition-all"
              >
                <Plus className="w-4 h-4" /> Create Module
              </button>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50 text-xs font-bold text-slate-400 uppercase tracking-wider">
                  <th className="px-5 py-3.5 w-8"></th>
                  <th className="px-5 py-3.5">Module</th>
                  <th className="px-5 py-3.5">Course</th>
                  <th className="px-5 py-3.5">Lessons</th>
                  <th className="px-5 py-3.5">Order</th>
                  <th className="px-5 py-3.5">Status</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map((mod) => (
                  <tr key={mod.id} className="hover:bg-slate-50/60 transition-all group">
                    <td className="pl-5 py-4">
                      <GripVertical className="w-4 h-4 text-slate-300" />
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center shrink-0">
                          <Layers className="w-5 h-5 text-violet-500" />
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-slate-900 line-clamp-1">{mod.title}</div>
                          {mod.description && (
                            <div className="text-xs text-slate-400 line-clamp-1 max-w-xs">{mod.description}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 text-slate-600 rounded-lg text-xs font-medium">
                        <BookOpen className="w-3 h-3" />
                        {getCourseTitle(mod.courseId)}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <span className="inline-flex items-center gap-1.5 text-sm text-slate-500">
                        <PlayCircle className="w-4 h-4 text-slate-300" />
                        {mod.totalLessons}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <span className="w-8 h-8 flex items-center justify-center bg-slate-100 text-slate-600 rounded-lg text-xs font-bold">
                        {mod.order}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <button
                        onClick={() => handleToggleStatus(mod)}
                        className={cn(
                          "inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg transition-all",
                          mod.status === 'published'
                            ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                            : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                        )}
                      >
                        <span className={cn("w-1.5 h-1.5 rounded-full", mod.status === 'published' ? 'bg-emerald-500' : 'bg-amber-500')} />
                        {mod.status === 'published' ? 'Published' : 'Draft'}
                      </button>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-all">
                        <button
                          onClick={() => openEdit(mod)}
                          className="p-2 rounded-lg text-slate-400 hover:text-violet-600 hover:bg-violet-50 transition-all"
                          title="Edit"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(mod.id)}
                          className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-all"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-violet-100 rounded-xl flex items-center justify-center">
                  <Layers className="w-5 h-5 text-violet-600" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">{editing ? 'Edit Module' : 'New Module'}</h2>
                  <p className="text-xs text-slate-400">{editing ? 'Update module details' : 'Add a module to a course'}</p>
                </div>
              </div>
              <button onClick={closeModal} className="p-2 hover:bg-slate-100 rounded-lg transition-all">
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-4">
              {/* Course */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Course <span className="text-red-500">*</span></label>
                <select
                  value={formCourseId}
                  onChange={e => setFormCourseId(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 transition-all"
                >
                  <option value="">Select a course...</option>
                  {courses.map(c => (
                    <option key={c.id} value={c.id}>{c.name || c.title}</option>
                  ))}
                </select>
              </div>

              {/* Title */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Title <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="e.g. Introduction to React Hooks"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 transition-all"
                />
                {form.title && (
                  <p className="text-[10px] text-slate-400 mt-1">Slug: <span className="font-mono">{slugify(form.title)}</span></p>
                )}
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Description</label>
                <textarea
                  rows={3}
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Optional: describe what students will learn in this module..."
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 transition-all resize-none"
                />
              </div>

              {/* Order & Status */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Order</label>
                  <input
                    type="number"
                    min={1}
                    value={form.order}
                    onChange={e => setForm(f => ({ ...f, order: Number(e.target.value) }))}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Status</label>
                  <select
                    value={form.status}
                    onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 transition-all"
                  >
                    <option value="published">Published</option>
                    <option value="draft">Draft</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 pb-6 flex items-center justify-end gap-3">
              <button
                onClick={closeModal}
                className="px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-violet-600 text-white rounded-xl font-semibold text-sm hover:bg-violet-700 transition-all disabled:opacity-60"
              >
                <Save className="w-4 h-4" />
                {saving ? 'Saving...' : editing ? 'Save Changes' : 'Create Module'}
              </button>
            </div>
          </div>
        </div>
      )}
    </TeacherLayout>
  );
}
