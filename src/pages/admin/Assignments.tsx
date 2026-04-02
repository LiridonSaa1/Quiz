import React, { useEffect, useState } from 'react';
import AdminLayout from '../../components/layout/AdminLayout';
import { toast } from 'sonner';
import { supabase } from '../../supabase';
import {
  ClipboardList, Plus, Search, Star,
  X, Pencil, Trash2, CheckCircle2, Archive, FileText
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
  teacher?: { display_name: string } | null;
  class_name?: string | null;
}

interface Course { id: string; title: string }
interface Teacher { id: string; display_name: string }
interface ClassRec { id: string; name: string }

const STATUS_CFG: Record<AssignmentStatus, { label: string; bg: string; text: string; dot: string; icon: React.ElementType }> = {
  draft:     { label: 'Draft',     bg: 'bg-slate-100',   text: 'text-slate-600',  dot: 'bg-slate-400',   icon: FileText     },
  published: { label: 'Published', bg: 'bg-emerald-50',  text: 'text-emerald-700',dot: 'bg-emerald-500', icon: CheckCircle2 },
  closed:    { label: 'Closed',    bg: 'bg-amber-50',    text: 'text-amber-700',  dot: 'bg-amber-500',   icon: Archive      },
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
  'from-amber-500 to-orange-600',
  'from-violet-500 to-purple-600',
  'from-blue-500 to-indigo-600',
  'from-rose-500 to-pink-600',
  'from-teal-500 to-cyan-600',
  'from-emerald-500 to-green-600',
];
const getAvatarColor = (str: string) => {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
};

const emptyForm = {
  title: '', description: '', course_id: '', teacher_id: '', class_id: '',
  type: 'homework' as AssignmentType, due_date: '', max_score: 100, status: 'draft' as AssignmentStatus,
};

export default function AdminAssignments() {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [courseFilter, setCourseFilter] = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [courses, setCourses] = useState<Course[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [classes, setClasses] = useState<ClassRec[]>([]);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [{ data: rawData, error }, { data: c }, { data: t }, { data: cl }] = await Promise.all([
        supabase.from('assignments').select('*').order('created_at', { ascending: false }),
        supabase.from('courses').select('id,title'),
        supabase.from('profiles').select('id,display_name').in('role', ['teacher', 'admin']),
        supabase.from('classes').select('id,name'),
      ]);
      if (error) throw error;

      const courseMap: Record<string, string> = {};
      (c || []).forEach((course: any) => { courseMap[course.id] = course.title; });
      const teacherMap: Record<string, string> = {};
      (t || []).forEach((p: any) => { teacherMap[p.id] = p.display_name; });
      const classMap: Record<string, string> = {};
      (cl || []).forEach((cls: any) => { classMap[cls.id] = cls.name; });

      setAssignments((rawData || []).map((a: any) => ({
        ...a,
        course: a.course_id ? { title: courseMap[a.course_id] } : null,
        teacher: a.teacher_id ? { display_name: teacherMap[a.teacher_id] } : null,
        class_name: a.class_id ? classMap[a.class_id] || null : null,
      })));

      setCourses((c || []).filter((course: any) => course));
      setTeachers(t || []);
      setClasses(cl || []);
    } catch {
      toast.error('Failed to load assignments');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const filtered = assignments.filter(a => {
    const q = search.toLowerCase();
    const matchSearch = a.title.toLowerCase().includes(q) ||
      (a.course?.title || '').toLowerCase().includes(q) ||
      (a.class_name || '').toLowerCase().includes(q);
    const matchStatus = statusFilter === 'all' || a.status === statusFilter;
    const matchType = typeFilter === 'all' || a.type === typeFilter;
    const matchCourse = courseFilter === 'all' || a.course_id === courseFilter;
    return matchSearch && matchStatus && matchType && matchCourse;
  });

  const stats = [
    { label: 'Total', value: assignments.length, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-100' },
    { label: 'Published', value: assignments.filter(a => a.status === 'published').length, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-100' },
    { label: 'Draft', value: assignments.filter(a => a.status === 'draft').length, color: 'text-slate-500', bg: 'bg-slate-50', border: 'border-slate-100' },
    { label: 'Overdue', value: assignments.filter(a => a.due_date && isPast(new Date(a.due_date)) && !isToday(new Date(a.due_date)) && a.status === 'published').length, color: 'text-rose-600', bg: 'bg-rose-50', border: 'border-rose-100' },
  ];

  const openAdd = () => {
    setEditId(null);
    setForm(emptyForm);
    setShowModal(true);
  };

  const openEdit = (a: Assignment) => {
    setEditId(a.id);
    setForm({
      title: a.title, description: a.description || '',
      course_id: a.course_id || '', teacher_id: a.teacher_id || '',
      class_id: a.class_id || '', type: a.type,
      due_date: a.due_date ? a.due_date.substring(0, 10) : '',
      max_score: a.max_score, status: a.status,
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.title.trim()) { toast.error('Title is required'); return; }
    setSaving(true);
    try {
      const payload: any = {
        title: form.title.trim(),
        description: form.description || null,
        course_id: form.course_id || null,
        teacher_id: form.teacher_id || null,
        class_id: form.class_id || null,
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
    } catch { toast.error('Failed to delete'); }
  };

  const getDueBadge = (due: string | null, status: AssignmentStatus) => {
    if (!due) return null;
    const d = new Date(due);
    if (status === 'closed') return null;
    if (isPast(d) && !isToday(d)) return <span className="text-xs text-rose-600 font-medium">Overdue</span>;
    if (isToday(d)) return <span className="text-xs text-amber-600 font-medium">Due today</span>;
    return null;
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Assignments</h1>
            <p className="text-sm text-slate-500 mt-0.5">Create and manage all course assignments</p>
          </div>
          <button
            onClick={openAdd}
            className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold px-4 py-2.5 rounded-xl shadow-lg shadow-amber-200 transition-all"
          >
            <Plus className="w-4 h-4" />
            New Assignment
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {stats.map(s => (
            <div key={s.label} className={cn('rounded-xl border p-4', s.bg, s.border)}>
              <div className={cn('text-2xl font-bold', s.color)}>{s.value}</div>
              <div className="text-xs text-slate-500 mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search assignments..."
              className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/30"
            />
          </div>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/30">
            <option value="all">All Status</option>
            <option value="draft">Draft</option>
            <option value="published">Published</option>
            <option value="closed">Closed</option>
          </select>
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/30">
            <option value="all">All Types</option>
            {Object.entries(TYPE_CFG).map(([v, c]) => <option key={v} value={v}>{c.label}</option>)}
          </select>
          <select value={courseFilter} onChange={e => setCourseFilter(e.target.value)} className="px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/30">
            <option value="all">All Courses</option>
            {courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-20 text-slate-400 text-sm">Loading assignments...</div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-400">
              <ClipboardList className="w-10 h-10 opacity-30" />
              <p className="text-sm">No assignments found</p>
              <button onClick={openAdd} className="text-xs text-amber-600 hover:underline">Create one now</button>
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50">
                      <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Assignment</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Type</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Course / Class</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Due Date</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Score</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {filtered.map(a => {
                      const sc = STATUS_CFG[a.status];
                      const tc = TYPE_CFG[a.type];
                      const initials = a.title.substring(0, 2).toUpperCase();
                      return (
                        <tr key={a.id} className="hover:bg-slate-50/70 group transition-colors">
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-3">
                              <div className={cn('w-9 h-9 rounded-lg bg-gradient-to-br flex items-center justify-center text-white text-xs font-bold shrink-0', getAvatarColor(a.title))}>
                                {initials}
                              </div>
                              <div>
                                <div className="font-semibold text-slate-800 leading-tight">{a.title}</div>
                                {a.description && <div className="text-xs text-slate-400 truncate max-w-[200px]">{a.description}</div>}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3.5">
                            <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium', tc.bg, tc.color)}>
                              {tc.label}
                            </span>
                          </td>
                          <td className="px-4 py-3.5">
                            <div className="text-slate-700">{a.course?.title || <span className="text-slate-300">—</span>}</div>
                            {a.class_name && <div className="text-xs text-slate-400">{a.class_name}</div>}
                          </td>
                          <td className="px-4 py-3.5">
                            {a.due_date ? (
                              <div>
                                <div className="text-slate-700">{format(new Date(a.due_date), 'MMM d, yyyy')}</div>
                                {getDueBadge(a.due_date, a.status)}
                              </div>
                            ) : <span className="text-slate-300">—</span>}
                          </td>
                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-1 text-slate-700">
                              <Star className="w-3.5 h-3.5 text-amber-400" />
                              {a.max_score} pts
                            </div>
                          </td>
                          <td className="px-4 py-3.5">
                            <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium', sc.bg, sc.text)}>
                              <span className={cn('w-1.5 h-1.5 rounded-full', sc.dot)} />
                              {sc.label}
                            </span>
                          </td>
                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button onClick={() => openEdit(a)} className="p-1.5 hover:bg-amber-50 hover:text-amber-600 rounded-lg transition-colors">
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => setDeleteId(a.id)} className="p-1.5 hover:bg-rose-50 hover:text-rose-500 rounded-lg transition-colors">
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
                      <div className={cn('w-10 h-10 rounded-lg bg-gradient-to-br flex items-center justify-center text-white text-xs font-bold shrink-0', getAvatarColor(a.title))}>
                        {a.title.substring(0, 2).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-semibold text-slate-800 text-sm">{a.title}</p>
                          <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium shrink-0', sc.bg, sc.text)}>
                            <span className={cn('w-1.5 h-1.5 rounded-full', sc.dot)} />
                            {sc.label}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-2 mt-1">
                          <span className={cn('text-xs px-2 py-0.5 rounded-full', tc.bg, tc.color)}>{tc.label}</span>
                          {a.course?.title && <span className="text-xs text-slate-500">{a.course.title}</span>}
                          {a.due_date && <span className="text-xs text-slate-400">{format(new Date(a.due_date), 'MMM d')}</span>}
                        </div>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <button onClick={() => openEdit(a)} className="p-1.5 hover:bg-amber-50 rounded-lg"><Pencil className="w-3.5 h-3.5 text-slate-400" /></button>
                        <button onClick={() => setDeleteId(a.id)} className="p-1.5 hover:bg-rose-50 rounded-lg"><Trash2 className="w-3.5 h-3.5 text-slate-400" /></button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
          {!loading && filtered.length > 0 && (
            <div className="px-5 py-3 border-t border-slate-100 text-xs text-slate-400">
              Showing {filtered.length} of {assignments.length} assignments
            </div>
          )}
        </div>
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-800">{editId ? 'Edit Assignment' : 'New Assignment'}</h2>
              <button onClick={() => setShowModal(false)} className="p-2 hover:bg-slate-100 rounded-lg"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Title *</label>
                <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  className="mt-1 w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                  placeholder="Assignment title" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Description</label>
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  rows={3} className="mt-1 w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/30 resize-none"
                  placeholder="Describe the assignment..." />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Type</label>
                  <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as AssignmentType }))}
                    className="mt-1 w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/30">
                    {Object.entries(TYPE_CFG).map(([v, c]) => <option key={v} value={v}>{c.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Status</label>
                  <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as AssignmentStatus }))}
                    className="mt-1 w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/30">
                    <option value="draft">Draft</option>
                    <option value="published">Published</option>
                    <option value="closed">Closed</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Due Date</label>
                  <input type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))}
                    className="mt-1 w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/30" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Max Score</label>
                  <input type="number" min={0} value={form.max_score} onChange={e => setForm(f => ({ ...f, max_score: Number(e.target.value) }))}
                    className="mt-1 w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/30" />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Course</label>
                <select value={form.course_id} onChange={e => setForm(f => ({ ...f, course_id: e.target.value }))}
                  className="mt-1 w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/30">
                  <option value="">No course</option>
                  {courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Class</label>
                <select value={form.class_id} onChange={e => setForm(f => ({ ...f, class_id: e.target.value }))}
                  className="mt-1 w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/30">
                  <option value="">No class</option>
                  {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Teacher</label>
                <select value={form.teacher_id} onChange={e => setForm(f => ({ ...f, teacher_id: e.target.value }))}
                  className="mt-1 w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/30">
                  <option value="">No teacher</option>
                  {teachers.map(t => <option key={t.id} value={t.id}>{t.display_name}</option>)}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-3 p-5 border-t border-slate-100">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">Cancel</button>
              <button onClick={handleSave} disabled={saving}
                className="px-4 py-2 text-sm font-semibold bg-amber-500 hover:bg-amber-600 text-white rounded-lg transition-colors disabled:opacity-50">
                {saving ? 'Saving...' : editId ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      {deleteId && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center">
            <div className="w-12 h-12 bg-rose-50 rounded-full flex items-center justify-center mx-auto mb-3">
              <Trash2 className="w-6 h-6 text-rose-500" />
            </div>
            <h3 className="text-lg font-bold text-slate-800 mb-1">Delete Assignment?</h3>
            <p className="text-sm text-slate-500 mb-5">This action cannot be undone.</p>
            <div className="flex gap-3 justify-center">
              <button onClick={() => setDeleteId(null)} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
              <button onClick={() => handleDelete(deleteId)} className="px-4 py-2 text-sm font-semibold bg-rose-500 hover:bg-rose-600 text-white rounded-lg">Delete</button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
