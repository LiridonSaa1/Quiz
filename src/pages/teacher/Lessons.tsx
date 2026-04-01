import React, { useEffect, useState } from 'react';
import { supabase } from '../../supabase';
import TeacherLayout from '../../components/layout/TeacherLayout';
import {
  Plus, Search, PlayCircle, Trash2, Edit2, X, Save,
  BookOpen, Layers, Video, FileText, HelpCircle, Clock,
  Eye, GripVertical, Lock, Unlock
} from 'lucide-react';
import { toast } from 'sonner';
import { Lesson } from '../../types';
import { cn } from '../../lib/utils';

const slugify = (text: string) =>
  text.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').trim();

const LESSON_TYPES = [
  { value: 'video', label: 'Video', icon: Video, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-100' },
  { value: 'text', label: 'Text', icon: FileText, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-100' },
  { value: 'quiz', label: 'Quiz', icon: HelpCircle, color: 'text-violet-600', bg: 'bg-violet-50', border: 'border-violet-100' },
];

const getLessonType = (type: string) =>
  LESSON_TYPES.find(t => t.value === type) || LESSON_TYPES[0];

const emptyForm = {
  title: '',
  shortDescription: '',
  type: 'video' as Lesson['type'],
  durationMinutes: 10,
  order: 1,
  status: 'published',
  isFreePreview: false,
};

export default function TeacherLessons() {
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [courses, setCourses] = useState<any[]>([]);
  const [modules, setModules] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [courseFilter, setCourseFilter] = useState('all');
  const [moduleFilter, setModuleFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Lesson | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [formCourseId, setFormCourseId] = useState('');
  const [formModuleId, setFormModuleId] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    try {
      const { data: coursesData, error: coursesError } = await supabase
        .from('courses')
        .select('id, name, title')
        .eq('teacher_id', session.user.id)
        .order('created_at', { ascending: false });
      if (coursesError) throw coursesError;
      const courseList = coursesData || [];
      setCourses(courseList);

      if (courseList.length === 0) {
        setModules([]);
        setLessons([]);
        return;
      }

      const courseIds = courseList.map((c: any) => c.id);

      const [modulesSnap, lessonsSnap] = await Promise.all([
        supabase.from('modules').select('id, course_id, title').in('course_id', courseIds).order('order'),
        supabase.from('lessons').select('*').in('course_id', courseIds).order('order', { ascending: true }),
      ]);

      if (modulesSnap.error) throw modulesSnap.error;
      if (lessonsSnap.error) throw lessonsSnap.error;

      setModules(modulesSnap.data || []);
      setLessons((lessonsSnap.data || []).map(l => ({
        id: l.id,
        courseId: l.course_id,
        moduleId: l.module_id,
        title: l.title,
        slug: l.slug || '',
        shortDescription: l.short_description || '',
        type: l.type || 'video',
        durationMinutes: l.duration_minutes || 0,
        order: l.order || 1,
        status: l.status || 'published',
        isFreePreview: l.is_free_preview || false,
        createdAt: l.created_at,
        updatedAt: l.updated_at,
      })));
    } catch (err: any) {
      toast.error('Failed to load lessons');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const modulesForCourse = (courseId: string) =>
    modules.filter(m => m.course_id === courseId);

  const openCreate = () => {
    setEditing(null);
    const firstCourse = courses[0]?.id || '';
    setFormCourseId(firstCourse);
    const firstModule = modulesForCourse(firstCourse)[0]?.id || '';
    setFormModuleId(firstModule);
    const maxOrder = lessons.length > 0 ? Math.max(...lessons.map(l => l.order)) + 1 : 1;
    setForm({ ...emptyForm, order: maxOrder });
    setShowModal(true);
  };

  const openEdit = (lesson: Lesson) => {
    setEditing(lesson);
    setFormCourseId(lesson.courseId);
    setFormModuleId(lesson.moduleId);
    setForm({
      title: lesson.title,
      shortDescription: lesson.shortDescription || '',
      type: lesson.type,
      durationMinutes: lesson.durationMinutes,
      order: lesson.order,
      status: lesson.status,
      isFreePreview: lesson.isFreePreview,
    });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditing(null);
    setForm(emptyForm);
  };

  const handleCourseChange = (courseId: string) => {
    setFormCourseId(courseId);
    const firstMod = modulesForCourse(courseId)[0]?.id || '';
    setFormModuleId(firstMod);
  };

  const handleSave = async () => {
    if (!form.title.trim()) { toast.error('Title is required'); return; }
    if (!formCourseId) { toast.error('Please select a course'); return; }
    if (!formModuleId) { toast.error('Please select a module'); return; }
    setSaving(true);
    try {
      const payload = {
        course_id: formCourseId,
        module_id: formModuleId,
        title: form.title.trim(),
        slug: slugify(form.title),
        short_description: form.shortDescription.trim() || null,
        type: form.type,
        duration_minutes: Number(form.durationMinutes) || 0,
        order: Number(form.order) || 1,
        status: form.status,
        is_free_preview: form.isFreePreview,
      };

      if (editing) {
        const { error } = await supabase.from('lessons').update(payload).eq('id', editing.id);
        if (error) throw error;
        toast.success('Lesson updated');
      } else {
        const { error } = await supabase.from('lessons').insert(payload);
        if (error) throw error;
        toast.success('Lesson created');
      }
      closeModal();
      fetchData();
    } catch (err: any) {
      toast.error(err.message || 'Failed to save lesson');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this lesson? This cannot be undone.')) return;
    try {
      const { error } = await supabase.from('lessons').delete().eq('id', id);
      if (error) throw error;
      toast.success('Lesson deleted');
      fetchData();
    } catch { toast.error('Failed to delete lesson'); }
  };

  const handleToggleStatus = async (lesson: Lesson) => {
    const newStatus = lesson.status === 'published' ? 'draft' : 'published';
    try {
      const { error } = await supabase.from('lessons').update({ status: newStatus }).eq('id', lesson.id);
      if (error) throw error;
      toast.success(`Lesson ${newStatus === 'published' ? 'published' : 'set to draft'}`);
      fetchData();
    } catch { toast.error('Failed to update status'); }
  };

  const handleToggleFreePreview = async (lesson: Lesson) => {
    try {
      const { error } = await supabase.from('lessons').update({ is_free_preview: !lesson.isFreePreview }).eq('id', lesson.id);
      if (error) throw error;
      toast.success(lesson.isFreePreview ? 'Free preview removed' : 'Set as free preview');
      fetchData();
    } catch { toast.error('Failed to update'); }
  };

  const getCourseName = (id: string) => {
    const c = courses.find(c => c.id === id);
    return c?.name || c?.title || 'Unknown';
  };
  const getModuleName = (id: string) =>
    modules.find(m => m.id === id)?.title || 'Unknown';

  const filteredModules = moduleFilter !== 'all'
    ? modules.filter(m => m.id === moduleFilter)
    : courseFilter !== 'all'
    ? modules.filter(m => m.course_id === courseFilter)
    : modules;

  const filtered = lessons.filter(l => {
    const matchSearch = l.title.toLowerCase().includes(search.toLowerCase()) ||
      (l.shortDescription || '').toLowerCase().includes(search.toLowerCase());
    const matchCourse = courseFilter === 'all' || l.courseId === courseFilter;
    const matchModule = moduleFilter === 'all' || l.moduleId === moduleFilter;
    const matchType = typeFilter === 'all' || l.type === typeFilter;
    return matchSearch && matchCourse && matchModule && matchType;
  });

  const stats = [
    { label: 'Total Lessons', value: lessons.length, color: 'text-violet-600', bg: 'bg-violet-50', border: 'border-violet-100' },
    { label: 'Video', value: lessons.filter(l => l.type === 'video').length, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-100' },
    { label: 'Text', value: lessons.filter(l => l.type === 'text').length, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-100' },
    { label: 'Quiz', value: lessons.filter(l => l.type === 'quiz').length, color: 'text-fuchsia-600', bg: 'bg-fuchsia-50', border: 'border-fuchsia-100' },
  ];

  return (
    <TeacherLayout>
      <div className="space-y-6">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Lessons</h1>
            <p className="text-slate-500 text-sm mt-1">Create and manage lesson content inside your modules.</p>
          </div>
          <button
            onClick={openCreate}
            disabled={courses.length === 0}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-violet-600 text-white rounded-xl font-semibold text-sm hover:bg-violet-700 transition-all shadow-lg shadow-violet-200 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="w-4 h-4" />
            New Lesson
          </button>
        </div>

        {/* No courses warning */}
        {!loading && courses.length === 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 flex items-start gap-3">
            <BookOpen className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-amber-800">No courses found</p>
              <p className="text-xs text-amber-600 mt-0.5">You need at least one course and module before adding lessons.</p>
            </div>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map(s => (
            <div key={s.label} className={`bg-white border ${s.border} rounded-2xl p-4 shadow-sm`}>
              <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
              <div className="text-xs text-slate-500 font-medium mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search lessons..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 transition-all"
            />
          </div>
          <select
            value={courseFilter}
            onChange={e => { setCourseFilter(e.target.value); setModuleFilter('all'); }}
            className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 transition-all"
          >
            <option value="all">All Courses</option>
            {courses.map(c => <option key={c.id} value={c.id}>{c.name || c.title}</option>)}
          </select>
          <select
            value={moduleFilter}
            onChange={e => setModuleFilter(e.target.value)}
            className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 transition-all"
          >
            <option value="all">All Modules</option>
            {(courseFilter !== 'all' ? modules.filter(m => m.course_id === courseFilter) : modules)
              .map(m => <option key={m.id} value={m.id}>{m.title}</option>)}
          </select>
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
            className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 transition-all"
          >
            <option value="all">All Types</option>
            {LESSON_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>

        {/* Lesson List */}
        {loading ? (
          <div className="space-y-3">
            {Array(6).fill(0).map((_, i) => (
              <div key={i} className="bg-white rounded-2xl border border-slate-100 h-20 animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-24 text-center bg-white rounded-2xl border border-dashed border-slate-200">
            <div className="w-16 h-16 bg-violet-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <PlayCircle className="w-8 h-8 text-violet-300" />
            </div>
            <h3 className="text-lg font-bold text-slate-700 mb-1">No lessons found</h3>
            <p className="text-slate-400 text-sm mb-6">
              {search || courseFilter !== 'all' || moduleFilter !== 'all' || typeFilter !== 'all'
                ? 'No results match your filters.'
                : 'Create your first lesson to start building course content.'}
            </p>
            {courses.length > 0 && (
              <button
                onClick={openCreate}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-violet-600 text-white rounded-xl font-semibold text-sm hover:bg-violet-700 transition-all"
              >
                <Plus className="w-4 h-4" /> Create Lesson
              </button>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-50 text-xs font-bold text-slate-400 uppercase tracking-wider">
                    <th className="px-5 py-3.5 w-8"></th>
                    <th className="px-5 py-3.5">Lesson</th>
                    <th className="px-5 py-3.5">Module</th>
                    <th className="px-5 py-3.5">Type</th>
                    <th className="px-5 py-3.5">Duration</th>
                    <th className="px-5 py-3.5">Order</th>
                    <th className="px-5 py-3.5">Preview</th>
                    <th className="px-5 py-3.5">Status</th>
                    <th className="px-5 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filtered.map(lesson => {
                    const lt = getLessonType(lesson.type);
                    return (
                      <tr key={lesson.id} className="hover:bg-slate-50/60 transition-all group">
                        <td className="pl-5 py-4">
                          <GripVertical className="w-4 h-4 text-slate-300" />
                        </td>
                        <td className="px-5 py-4 min-w-[200px]">
                          <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-xl ${lt.bg} flex items-center justify-center shrink-0`}>
                              <lt.icon className={`w-5 h-5 ${lt.color}`} />
                            </div>
                            <div>
                              <div className="text-sm font-semibold text-slate-900 line-clamp-1">{lesson.title}</div>
                              {lesson.shortDescription && (
                                <div className="text-xs text-slate-400 line-clamp-1 max-w-xs">{lesson.shortDescription}</div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 text-slate-600 rounded-lg text-xs font-medium whitespace-nowrap">
                            <Layers className="w-3 h-3" />
                            {getModuleName(lesson.moduleId)}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold', lt.bg, lt.color)}>
                            <lt.icon className="w-3 h-3" />
                            {lt.label}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <span className="inline-flex items-center gap-1.5 text-sm text-slate-500 whitespace-nowrap">
                            <Clock className="w-3.5 h-3.5 text-slate-300" />
                            {lesson.durationMinutes} min
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <span className="w-8 h-8 flex items-center justify-center bg-slate-100 text-slate-600 rounded-lg text-xs font-bold">
                            {lesson.order}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <button
                            onClick={() => handleToggleFreePreview(lesson)}
                            title={lesson.isFreePreview ? 'Remove free preview' : 'Set as free preview'}
                            className={cn(
                              'inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg transition-all',
                              lesson.isFreePreview
                                ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                                : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                            )}
                          >
                            {lesson.isFreePreview ? <Unlock className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                            {lesson.isFreePreview ? 'Free' : 'Locked'}
                          </button>
                        </td>
                        <td className="px-5 py-4">
                          <button
                            onClick={() => handleToggleStatus(lesson)}
                            className={cn(
                              'inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg transition-all',
                              lesson.status === 'published'
                                ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                                : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                            )}
                          >
                            <span className={cn('w-1.5 h-1.5 rounded-full', lesson.status === 'published' ? 'bg-emerald-500' : 'bg-amber-500')} />
                            {lesson.status === 'published' ? 'Published' : 'Draft'}
                          </button>
                        </td>
                        <td className="px-5 py-4 text-right">
                          <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-all">
                            <button
                              onClick={() => openEdit(lesson)}
                              className="p-2 rounded-lg text-slate-400 hover:text-violet-600 hover:bg-violet-50 transition-all"
                              title="Edit"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(lesson.id)}
                              className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-all"
                              title="Delete"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">

            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-violet-100 rounded-xl flex items-center justify-center">
                  <PlayCircle className="w-5 h-5 text-violet-600" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">{editing ? 'Edit Lesson' : 'New Lesson'}</h2>
                  <p className="text-xs text-slate-400">{editing ? 'Update lesson details' : 'Add a lesson to a module'}</p>
                </div>
              </div>
              <button onClick={closeModal} className="p-2 hover:bg-slate-100 rounded-lg transition-all">
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-4 overflow-y-auto flex-1">

              {/* Course + Module row */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Course <span className="text-red-500">*</span></label>
                  <select
                    value={formCourseId}
                    onChange={e => handleCourseChange(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 transition-all"
                  >
                    <option value="">Select course...</option>
                    {courses.map(c => <option key={c.id} value={c.id}>{c.name || c.title}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Module <span className="text-red-500">*</span></label>
                  <select
                    value={formModuleId}
                    onChange={e => setFormModuleId(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 transition-all"
                    disabled={!formCourseId}
                  >
                    <option value="">Select module...</option>
                    {modulesForCourse(formCourseId).map(m => <option key={m.id} value={m.id}>{m.title}</option>)}
                  </select>
                </div>
              </div>

              {/* Title */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Title <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="e.g. Introduction to useState"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 transition-all"
                />
                {form.title && (
                  <p className="text-[10px] text-slate-400 mt-1">Slug: <span className="font-mono">{slugify(form.title)}</span></p>
                )}
              </div>

              {/* Short Description */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Short Description</label>
                <textarea
                  rows={2}
                  value={form.shortDescription}
                  onChange={e => setForm(f => ({ ...f, shortDescription: e.target.value }))}
                  placeholder="Brief summary of this lesson..."
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 transition-all resize-none"
                />
              </div>

              {/* Type selector */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Lesson Type <span className="text-red-500">*</span></label>
                <div className="grid grid-cols-3 gap-2">
                  {LESSON_TYPES.map(t => (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setForm(f => ({ ...f, type: t.value as Lesson['type'] }))}
                      className={cn(
                        'flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl border-2 text-xs font-semibold transition-all',
                        form.type === t.value
                          ? `${t.bg} ${t.color} border-current`
                          : 'bg-slate-50 text-slate-400 border-slate-200 hover:border-slate-300'
                      )}
                    >
                      <t.icon className="w-5 h-5" />
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Duration + Order + Status */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Duration (min)</label>
                  <input
                    type="number"
                    min={1}
                    value={form.durationMinutes}
                    onChange={e => setForm(f => ({ ...f, durationMinutes: Number(e.target.value) }))}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Order</label>
                  <input
                    type="number"
                    min={1}
                    value={form.order}
                    onChange={e => setForm(f => ({ ...f, order: Number(e.target.value) }))}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Status</label>
                  <select
                    value={form.status}
                    onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 transition-all"
                  >
                    <option value="published">Published</option>
                    <option value="draft">Draft</option>
                  </select>
                </div>
              </div>

              {/* Free Preview toggle */}
              <div className="flex items-center justify-between p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                <div>
                  <p className="text-sm font-semibold text-slate-700">Free Preview</p>
                  <p className="text-xs text-slate-400">Allow non-enrolled students to view this lesson</p>
                </div>
                <button
                  type="button"
                  onClick={() => setForm(f => ({ ...f, isFreePreview: !f.isFreePreview }))}
                  className={cn(
                    'relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none',
                    form.isFreePreview ? 'bg-violet-600' : 'bg-slate-300'
                  )}
                >
                  <span className={cn(
                    'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out',
                    form.isFreePreview ? 'translate-x-5' : 'translate-x-0'
                  )} />
                </button>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 pb-6 flex items-center justify-end gap-3 shrink-0 border-t border-slate-100 pt-4">
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
                {saving ? 'Saving...' : editing ? 'Save Changes' : 'Create Lesson'}
              </button>
            </div>
          </div>
        </div>
      )}
    </TeacherLayout>
  );
}
