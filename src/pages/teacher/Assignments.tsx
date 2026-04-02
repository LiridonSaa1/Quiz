import React, { useEffect, useState } from 'react';
import TeacherLayout from '../../components/layout/TeacherLayout';
import { toast } from 'sonner';
import { supabase } from '../../supabase';
import {
  ClipboardList, Plus, Search, Star,
  X, Pencil, Trash2, CheckCircle2, Archive, FileText,
  AlertCircle, Calendar, BookOpen, School, Filter
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { format, isPast, isToday } from 'date-fns';

type AssignmentStatus = 'draft' | 'published' | 'closed';
type AssignmentType = 'homework' | 'project' | 'essay' | 'quiz' | 'lab' | 'other';

interface Assignment {
  id: string;
  title: string;
  description: string | null;
  course_id: string | null;
  teacher_id: string | null;
  class_id: string | null;
  type: AssignmentType;
  due_date: string | null;
  max_score: number;
  status: AssignmentStatus;
  created_at: string;
  course?: { title: string } | null;
  class_name?: string | null;
}

interface Course { id: string; title: string }
interface ClassRec { id: string; name: string }

const STATUS_CFG: Record<AssignmentStatus, { label: string; bg: string; text: string; dot: string; icon: React.ElementType }> = {
  draft:     { label: 'Draft',     bg: 'bg-slate-100',  text: 'text-slate-600',   dot: 'bg-slate-400',   icon: FileText     },
  published: { label: 'Published', bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500', icon: CheckCircle2 },
  closed:    { label: 'Closed',    bg: 'bg-amber-50',   text: 'text-amber-700',   dot: 'bg-amber-500',   icon: Archive      },
};

const TYPE_CFG: Record<AssignmentType, { label: string; color: string; bg: string }> = {
  homework: { label: 'Homework', color: 'text-blue-700',   bg: 'bg-blue-50'   },
  project:  { label: 'Project',  color: 'text-violet-700', bg: 'bg-violet-50' },
  essay:    { label: 'Essay',    color: 'text-rose-700',   bg: 'bg-rose-50'   },
  quiz:     { label: 'Quiz',     color: 'text-amber-700',  bg: 'bg-amber-50'  },
  lab:      { label: 'Lab',      color: 'text-teal-700',   bg: 'bg-teal-50'   },
  other:    { label: 'Other',    color: 'text-slate-600',  bg: 'bg-slate-100' },
};

const AVATAR_COLORS = [
  'from-violet-500 to-purple-600',
  'from-indigo-500 to-blue-600',
  'from-emerald-500 to-teal-600',
  'from-rose-500 to-pink-600',
  'from-amber-500 to-orange-600',
  'from-cyan-500 to-sky-600',
];
const getAvatarColor = (str: string) => {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
};

const emptyForm = {
  title: '', description: '', course_id: '', class_id: '',
  type: 'homework' as AssignmentType, due_date: '', max_score: 100, status: 'draft' as AssignmentStatus,
};

const inputCls = 'mt-1 w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500/25 focus:border-violet-400 transition-all';
const labelCls = 'block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-0.5';

export default function TeacherAssignments() {
  const [teacherId, setTeacherId] = useState<string | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [classes, setClasses] = useState<ClassRec[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [courseFilter, setCourseFilter] = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) setTeacherId(session.user.id);
    });
  }, []);

  useEffect(() => {
    if (teacherId) fetchData();
  }, [teacherId]);

  const fetchData = async () => {
    if (!teacherId) return;
    setLoading(true);
    try {
      const [{ data: rawData, error }, { data: c }, { data: cl }] = await Promise.all([
        supabase
          .from('assignments')
          .select('*')
          .eq('teacher_id', teacherId)
          .order('created_at', { ascending: false }),
        supabase.from('courses').select('id,title').eq('teacher_id', teacherId),
        supabase.from('classes').select('id,name').eq('teacher_id', teacherId),
      ]);
      if (error) throw error;

      const courseMap: Record<string, string> = {};
      (c || []).forEach((course: any) => { courseMap[course.id] = course.title; });
      const classMap: Record<string, string> = {};
      (cl || []).forEach((cls: any) => { classMap[cls.id] = cls.name; });

      setAssignments((rawData || []).map((a: any) => ({
        ...a,
        course: a.course_id ? { title: courseMap[a.course_id] || 'Unknown course' } : null,
        class_name: a.class_id ? (classMap[a.class_id] || null) : null,
      })));
      setCourses(c || []);
      setClasses(cl || []);
    } catch {
      toast.error('Failed to load assignments');
    } finally {
      setLoading(false);
    }
  };

  const filtered = assignments.filter(a => {
    const q = search.toLowerCase();
    const matchSearch =
      a.title.toLowerCase().includes(q) ||
      (a.course?.title || '').toLowerCase().includes(q) ||
      (a.class_name || '').toLowerCase().includes(q);
    const matchStatus = statusFilter === 'all' || a.status === statusFilter;
    const matchType = typeFilter === 'all' || a.type === typeFilter;
    const matchCourse = courseFilter === 'all' || a.course_id === courseFilter;
    return matchSearch && matchStatus && matchType && matchCourse;
  });

  const stats = [
    { label: 'Total', value: assignments.length, icon: ClipboardList, iconBg: 'bg-violet-100 text-violet-600', grad: 'from-violet-500 to-purple-500', ring: 'ring-violet-100' },
    { label: 'Published', value: assignments.filter(a => a.status === 'published').length, icon: CheckCircle2, iconBg: 'bg-emerald-100 text-emerald-600', grad: 'from-emerald-500 to-teal-500', ring: 'ring-emerald-100' },
    { label: 'Draft', value: assignments.filter(a => a.status === 'draft').length, icon: FileText, iconBg: 'bg-slate-100 text-slate-500', grad: 'from-slate-400 to-slate-500', ring: 'ring-slate-100' },
    { label: 'Overdue', value: assignments.filter(a => a.due_date && isPast(new Date(a.due_date)) && !isToday(new Date(a.due_date)) && a.status === 'published').length, icon: AlertCircle, iconBg: 'bg-rose-100 text-rose-600', grad: 'from-rose-500 to-pink-500', ring: 'ring-rose-100' },
  ];

  const openAdd = () => {
    setEditId(null);
    setForm(emptyForm);
    setShowModal(true);
  };

  const openEdit = (a: Assignment) => {
    setEditId(a.id);
    setForm({
      title: a.title,
      description: a.description || '',
      course_id: a.course_id || '',
      class_id: a.class_id || '',
      type: a.type,
      due_date: a.due_date ? a.due_date.substring(0, 10) : '',
      max_score: a.max_score,
      status: a.status,
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.title.trim()) { toast.error('Title is required'); return; }
    if (!teacherId) return;
    setSaving(true);
    try {
      const payload: any = {
        title: form.title.trim(),
        description: form.description || null,
        course_id: form.course_id || null,
        class_id: form.class_id || null,
        teacher_id: teacherId,
        type: form.type,
        due_date: form.due_date || null,
        max_score: Number(form.max_score),
        status: form.status,
        updated_at: new Date().toISOString(),
      };
      if (editId) {
        const { error } = await supabase.from('assignments').update(payload).eq('id', editId);
        if (error) throw error;
        toast.success('Assignment updated');
      } else {
        payload.created_at = new Date().toISOString();
        const { error } = await supabase.from('assignments').insert(payload);
        if (error) throw error;
        toast.success('Assignment created');
      }
      setShowModal(false);
      fetchData();
    } catch (e: any) {
      toast.error(e.message || 'Failed to save assignment');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase.from('assignments').delete().eq('id', id);
      if (error) throw error;
      toast.success('Assignment deleted');
      setDeleteId(null);
      fetchData();
    } catch { toast.error('Failed to delete assignment'); }
  };

  const getDueBadge = (due: string | null, status: AssignmentStatus) => {
    if (!due || status === 'closed') return null;
    const d = new Date(due);
    if (isPast(d) && !isToday(d)) return <span className="text-xs text-rose-600 font-medium">Overdue</span>;
    if (isToday(d)) return <span className="text-xs text-amber-600 font-medium">Due today</span>;
    return null;
  };

  return (
    <TeacherLayout>
      <div className="space-y-6">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Assignments</h1>
            <p className="text-sm text-slate-500 mt-0.5">Create and manage your course assignments</p>
          </div>
          <button
            onClick={openAdd}
            className="flex items-center gap-2 px-4 py-2.5 bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold rounded-xl shadow-lg shadow-violet-200 transition-all active:scale-[0.98]"
          >
            <Plus className="w-4 h-4" />
            New Assignment
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map(s => (
            <div key={s.label} className="bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all overflow-hidden">
              <div className={cn('h-0.5 bg-gradient-to-r', s.grad)} />
              <div className="p-5">
                <div className={cn('p-2.5 rounded-xl ring-4 inline-flex mb-4', s.iconBg, s.ring)}>
                  <s.icon className="w-5 h-5" />
                </div>
                <p className="text-2xl font-bold text-slate-900 tracking-tight">{s.value}</p>
                <p className="text-sm font-medium text-slate-700 mt-0.5">{s.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search assignments..."
              className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-300 transition-all"
            />
          </div>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-300 transition-all"
          >
            <option value="all">All Status</option>
            <option value="draft">Draft</option>
            <option value="published">Published</option>
            <option value="closed">Closed</option>
          </select>
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
            className="px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-300 transition-all"
          >
            <option value="all">All Types</option>
            {Object.entries(TYPE_CFG).map(([v, c]) => (
              <option key={v} value={v}>{c.label}</option>
            ))}
          </select>
          <select
            value={courseFilter}
            onChange={e => setCourseFilter(e.target.value)}
            className="px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-300 transition-all"
          >
            <option value="all">All Courses</option>
            {courses.map(c => (
              <option key={c.id} value={c.id}>{c.title}</option>
            ))}
          </select>
          {(search || statusFilter !== 'all' || typeFilter !== 'all' || courseFilter !== 'all') && (
            <button
              onClick={() => { setSearch(''); setStatusFilter('all'); setTypeFilter('all'); setCourseFilter('all'); }}
              className="flex items-center gap-1.5 px-3 py-2 text-sm text-slate-500 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
            >
              <Filter className="w-3.5 h-3.5" />
              Clear
            </button>
          )}
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <div className="w-8 h-8 border-2 border-violet-200 border-t-violet-600 rounded-full animate-spin" />
              <p className="text-sm text-slate-400">Loading assignments...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-400">
              <div className="w-14 h-14 bg-violet-50 rounded-2xl flex items-center justify-center">
                <ClipboardList className="w-7 h-7 text-violet-300" />
              </div>
              <p className="text-sm font-medium text-slate-500">No assignments found</p>
              <p className="text-xs text-slate-400">
                {assignments.length === 0 ? 'Create your first assignment to get started.' : 'Try adjusting your search or filters.'}
              </p>
              {assignments.length === 0 && (
                <button
                  onClick={openAdd}
                  className="mt-1 text-xs font-semibold text-violet-600 hover:text-violet-700 hover:underline"
                >
                  + Create assignment
                </button>
              )}
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/70">
                      <th className="text-left px-5 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider">Assignment</th>
                      <th className="text-left px-4 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider">Type</th>
                      <th className="text-left px-4 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider">Course / Class</th>
                      <th className="text-left px-4 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider">Due Date</th>
                      <th className="text-left px-4 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider">Score</th>
                      <th className="text-left px-4 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>
                      <th className="px-4 py-3.5 w-20" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {filtered.map(a => {
                      const sc = STATUS_CFG[a.status];
                      const tc = TYPE_CFG[a.type];
                      return (
                        <tr key={a.id} className="hover:bg-violet-50/30 group transition-colors">
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-3">
                              <div className={cn('w-9 h-9 rounded-xl bg-gradient-to-br flex items-center justify-center text-white text-xs font-bold shrink-0', getAvatarColor(a.title))}>
                                {a.title.substring(0, 2).toUpperCase()}
                              </div>
                              <div className="min-w-0">
                                <div className="font-semibold text-slate-800 leading-tight truncate max-w-[200px]">{a.title}</div>
                                {a.description && (
                                  <div className="text-xs text-slate-400 truncate max-w-[200px] mt-0.5">{a.description}</div>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3.5">
                            <span className={cn('inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold', tc.bg, tc.color)}>
                              {tc.label}
                            </span>
                          </td>
                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-1.5 text-slate-700">
                              {a.course?.title
                                ? <><BookOpen className="w-3.5 h-3.5 text-slate-400 shrink-0" />{a.course.title}</>
                                : <span className="text-slate-300">—</span>
                              }
                            </div>
                            {a.class_name && (
                              <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-0.5">
                                <School className="w-3 h-3 shrink-0" />{a.class_name}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3.5">
                            {a.due_date ? (
                              <div>
                                <div className="flex items-center gap-1.5 text-slate-700">
                                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                                  {format(new Date(a.due_date), 'MMM d, yyyy')}
                                </div>
                                <div className="mt-0.5">{getDueBadge(a.due_date, a.status)}</div>
                              </div>
                            ) : <span className="text-slate-300">—</span>}
                          </td>
                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-1.5 text-slate-700">
                              <Star className="w-3.5 h-3.5 text-amber-400" />
                              <span className="font-medium">{a.max_score}</span>
                              <span className="text-slate-400 text-xs">pts</span>
                            </div>
                          </td>
                          <td className="px-4 py-3.5">
                            <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold', sc.bg, sc.text)}>
                              <span className={cn('w-1.5 h-1.5 rounded-full', sc.dot)} />
                              {sc.label}
                            </span>
                          </td>
                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity justify-end">
                              <button
                                onClick={() => openEdit(a)}
                                title="Edit"
                                className="p-1.5 hover:bg-violet-100 hover:text-violet-600 text-slate-400 rounded-lg transition-colors"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => setDeleteId(a.id)}
                                title="Delete"
                                className="p-1.5 hover:bg-rose-100 hover:text-rose-500 text-slate-400 rounded-lg transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="md:hidden divide-y divide-slate-100">
                {filtered.map(a => {
                  const sc = STATUS_CFG[a.status];
                  const tc = TYPE_CFG[a.type];
                  return (
                    <div key={a.id} className="p-4 flex items-start gap-3">
                      <div className={cn('w-10 h-10 rounded-xl bg-gradient-to-br flex items-center justify-center text-white text-xs font-bold shrink-0', getAvatarColor(a.title))}>
                        {a.title.substring(0, 2).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-semibold text-slate-800 text-sm leading-snug">{a.title}</p>
                          <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold shrink-0', sc.bg, sc.text)}>
                            <span className={cn('w-1.5 h-1.5 rounded-full', sc.dot)} />
                            {sc.label}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-2 mt-1.5">
                          <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', tc.bg, tc.color)}>{tc.label}</span>
                          {a.course?.title && (
                            <span className="text-xs text-slate-500 flex items-center gap-1">
                              <BookOpen className="w-3 h-3" />{a.course.title}
                            </span>
                          )}
                          {a.due_date && (
                            <span className="text-xs text-slate-400 flex items-center gap-1">
                              <Calendar className="w-3 h-3" />{format(new Date(a.due_date), 'MMM d')}
                            </span>
                          )}
                          <span className="text-xs text-slate-400 flex items-center gap-1">
                            <Star className="w-3 h-3 text-amber-400" />{a.max_score} pts
                          </span>
                        </div>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <button onClick={() => openEdit(a)} className="p-1.5 hover:bg-violet-100 rounded-lg">
                          <Pencil className="w-3.5 h-3.5 text-slate-400" />
                        </button>
                        <button onClick={() => setDeleteId(a.id)} className="p-1.5 hover:bg-rose-100 rounded-lg">
                          <Trash2 className="w-3.5 h-3.5 text-slate-400" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Footer */}
              <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between">
                <p className="text-xs text-slate-400">
                  Showing <span className="font-semibold text-slate-600">{filtered.length}</span> of{' '}
                  <span className="font-semibold text-slate-600">{assignments.length}</span> assignments
                </p>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Add / Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>

            {/* Modal header */}
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-violet-100 rounded-xl flex items-center justify-center">
                  <ClipboardList className="w-4 h-4 text-violet-600" />
                </div>
                <h2 className="text-lg font-bold text-slate-800">
                  {editId ? 'Edit Assignment' : 'New Assignment'}
                </h2>
              </div>
              <button onClick={() => setShowModal(false)} className="p-2 hover:bg-slate-100 rounded-xl text-slate-400 hover:text-slate-600 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal body */}
            <div className="p-5 space-y-4">
              <div>
                <label className={labelCls}>Title *</label>
                <input
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="e.g. Week 3 Homework"
                  className={inputCls}
                />
              </div>

              <div>
                <label className={labelCls}>Description</label>
                <textarea
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  rows={3}
                  placeholder="Describe the assignment objectives..."
                  className={cn(inputCls, 'resize-none')}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Type</label>
                  <select
                    value={form.type}
                    onChange={e => setForm(f => ({ ...f, type: e.target.value as AssignmentType }))}
                    className={inputCls}
                  >
                    {Object.entries(TYPE_CFG).map(([v, c]) => (
                      <option key={v} value={v}>{c.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Status</label>
                  <select
                    value={form.status}
                    onChange={e => setForm(f => ({ ...f, status: e.target.value as AssignmentStatus }))}
                    className={inputCls}
                  >
                    <option value="draft">Draft</option>
                    <option value="published">Published</option>
                    <option value="closed">Closed</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Due Date</label>
                  <input
                    type="date"
                    value={form.due_date}
                    onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Max Score</label>
                  <input
                    type="number"
                    min={0}
                    value={form.max_score}
                    onChange={e => setForm(f => ({ ...f, max_score: Number(e.target.value) }))}
                    className={inputCls}
                  />
                </div>
              </div>

              <div>
                <label className={labelCls}>Course</label>
                <select
                  value={form.course_id}
                  onChange={e => setForm(f => ({ ...f, course_id: e.target.value }))}
                  className={inputCls}
                >
                  <option value="">No course</option>
                  {courses.map(c => (
                    <option key={c.id} value={c.id}>{c.title}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className={labelCls}>Class</label>
                <select
                  value={form.class_id}
                  onChange={e => setForm(f => ({ ...f, class_id: e.target.value }))}
                  className={inputCls}
                >
                  <option value="">No class</option>
                  {classes.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Modal footer */}
            <div className="flex justify-end gap-3 p-5 border-t border-slate-100">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-5 py-2.5 text-sm font-semibold bg-violet-600 hover:bg-violet-700 text-white rounded-xl transition-all shadow-lg shadow-violet-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? 'Saving...' : editId ? 'Update Assignment' : 'Create Assignment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      {deleteId && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setDeleteId(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center" onClick={e => e.stopPropagation()}>
            <div className="w-14 h-14 bg-rose-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-7 h-7 text-rose-500" />
            </div>
            <h3 className="text-lg font-bold text-slate-800 mb-1">Delete Assignment?</h3>
            <p className="text-sm text-slate-500 mb-6">This action cannot be undone. All data related to this assignment will be permanently removed.</p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => setDeleteId(null)}
                className="px-5 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteId)}
                className="px-5 py-2.5 text-sm font-semibold bg-rose-500 hover:bg-rose-600 text-white rounded-xl transition-colors shadow-lg shadow-rose-200"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </TeacherLayout>
  );
}
