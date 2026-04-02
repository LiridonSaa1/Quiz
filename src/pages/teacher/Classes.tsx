import React, { useEffect, useState, useMemo } from 'react';
import { supabase } from '../../supabase';
import TeacherLayout from '../../components/layout/TeacherLayout';
import { toast } from 'sonner';
import {
  School, Plus, Search, Users, BookOpen, CalendarDays,
  X, Pencil, Trash2, Eye, Clock, CheckCircle2, AlertCircle,
  Archive, TrendingUp, MoreHorizontal, GraduationCap, Filter
} from 'lucide-react';
import { cn } from '../../lib/utils';

type ClassStatus = 'active' | 'upcoming' | 'completed' | 'archived';

interface ClassRecord {
  id: string;
  name: string;
  description: string | null;
  course_id: string | null;
  teacher_id: string | null;
  student_ids: string[];
  status: ClassStatus;
  start_date: string | null;
  end_date: string | null;
  capacity: number;
  created_at: string;
  course?: { title: string } | null;
}

interface Course { id: string; title: string }

const STATUS_CONFIG: Record<ClassStatus, { label: string; bg: string; text: string; dot: string; icon: React.ElementType; bar: string }> = {
  active:    { label: 'Active',    bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500', icon: CheckCircle2, bar: 'from-emerald-400 to-teal-400' },
  upcoming:  { label: 'Upcoming',  bg: 'bg-violet-50',  text: 'text-violet-700',  dot: 'bg-violet-500',  icon: Clock,        bar: 'from-violet-400 to-purple-400' },
  completed: { label: 'Completed', bg: 'bg-slate-100',  text: 'text-slate-600',   dot: 'bg-slate-400',   icon: Archive,      bar: 'from-slate-300 to-slate-400' },
  archived:  { label: 'Archived',  bg: 'bg-amber-50',   text: 'text-amber-700',   dot: 'bg-amber-500',   icon: AlertCircle,  bar: 'from-amber-400 to-orange-400' },
};

const GRAD_COLORS = [
  'from-violet-500 to-purple-600',
  'from-indigo-500 to-blue-600',
  'from-emerald-500 to-teal-600',
  'from-rose-500 to-pink-600',
  'from-amber-500 to-orange-600',
  'from-cyan-500 to-sky-600',
];
const getGrad = (str: string) => {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h);
  return GRAD_COLORS[Math.abs(h) % GRAD_COLORS.length];
};

const formatDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

const emptyForm = {
  name: '',
  description: '',
  course_id: '',
  status: 'active' as ClassStatus,
  start_date: '',
  end_date: '',
  capacity: 30,
};

const inputCls = 'w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500/25 focus:border-violet-400 transition-all';
const labelCls = 'block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5';

export default function TeacherClasses() {
  const [teacherId, setTeacherId] = useState<string | null>(null);
  const [classes, setClasses] = useState<ClassRecord[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | ClassStatus>('all');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<ClassRecord | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [viewClass, setViewClass] = useState<ClassRecord | null>(null);
  const [activeMenu, setActiveMenu] = useState<string | null>(null);

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        setTeacherId(session.user.id);
        await fetchData(session.user.id);
      }
    };
    init();
  }, []);

  const fetchData = async (tid: string) => {
    setLoading(true);
    try {
      const [classesRes, coursesRes] = await Promise.all([
        supabase.from('classes').select('*').eq('teacher_id', tid).order('created_at', { ascending: false }),
        supabase.from('courses').select('id, title').eq('teacher_id', tid).eq('status', 'published'),
      ]);
      if (classesRes.error) throw classesRes.error;

      const courseMap: Record<string, { title: string }> = {};
      (coursesRes.data || []).forEach((c: any) => { courseMap[c.id] = { title: c.title }; });

      const enriched = (classesRes.data || []).map((cls: any) => ({
        ...cls,
        course: cls.course_id ? (courseMap[cls.course_id] || null) : null,
      }));

      setClasses(enriched);
      setCourses(coursesRes.data || []);
    } catch (err: any) {
      toast.error('Failed to load classes: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setShowModal(true);
  };

  const openEdit = (cls: ClassRecord) => {
    setEditing(cls);
    setForm({
      name: cls.name,
      description: cls.description || '',
      course_id: cls.course_id || '',
      status: cls.status,
      start_date: cls.start_date ? cls.start_date.slice(0, 10) : '',
      end_date: cls.end_date ? cls.end_date.slice(0, 10) : '',
      capacity: cls.capacity,
    });
    setActiveMenu(null);
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teacherId) return;
    if (!form.name.trim()) { toast.error('Class name is required'); return; }
    setSubmitting(true);
    try {
      const payload: any = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        course_id: form.course_id || null,
        teacher_id: teacherId,
        status: form.status,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        capacity: Number(form.capacity),
      };
      if (editing) {
        const { error } = await supabase.from('classes').update(payload).eq('id', editing.id);
        if (error) throw error;
        toast.success('Class updated');
      } else {
        payload.student_ids = [];
        const { error } = await supabase.from('classes').insert(payload);
        if (error) throw error;
        toast.success('Class created');
      }
      setShowModal(false);
      fetchData(teacherId);
    } catch (err: any) {
      toast.error(err.message || 'Failed to save class');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (cls: ClassRecord) => {
    if (!confirm(`Delete "${cls.name}"? This cannot be undone.`)) return;
    try {
      const { error } = await supabase.from('classes').delete().eq('id', cls.id);
      if (error) throw error;
      toast.success('Class deleted');
      if (teacherId) fetchData(teacherId);
    } catch (err: any) {
      toast.error(err.message);
    }
    setActiveMenu(null);
  };

  const handleStatusChange = async (cls: ClassRecord, status: ClassStatus) => {
    try {
      const { error } = await supabase.from('classes').update({ status }).eq('id', cls.id);
      if (error) throw error;
      toast.success(`Marked as ${status}`);
      if (teacherId) fetchData(teacherId);
    } catch (err: any) {
      toast.error(err.message);
    }
    setActiveMenu(null);
  };

  const filtered = useMemo(() => classes.filter(cls => {
    const q = search.toLowerCase();
    const matchSearch = cls.name.toLowerCase().includes(q) || (cls.course?.title || '').toLowerCase().includes(q);
    const matchStatus = statusFilter === 'all' || cls.status === statusFilter;
    return matchSearch && matchStatus;
  }), [classes, search, statusFilter]);

  const stats = useMemo(() => ({
    total:     classes.length,
    active:    classes.filter(c => c.status === 'active').length,
    students:  classes.reduce((s, c) => s + (c.student_ids?.length || 0), 0),
    completed: classes.filter(c => c.status === 'completed').length,
  }), [classes]);

  return (
    <TeacherLayout>
      <div className="space-y-7">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">My Classes</h1>
            <p className="text-slate-400 text-sm mt-1">Manage your classes and track student enrollment.</p>
          </div>
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-violet-600 text-white rounded-xl font-semibold text-sm hover:bg-violet-700 transition-all shadow-lg shadow-violet-500/20 active:scale-[0.98]"
          >
            <Plus className="w-4 h-4" />
            New Class
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Total Classes',   value: stats.total,     icon: School,      grad: 'from-violet-500 to-purple-600', light: 'bg-violet-50',  text: 'text-violet-600',  ring: 'ring-violet-100' },
            { label: 'Active',          value: stats.active,    icon: CheckCircle2,grad: 'from-emerald-500 to-teal-500',  light: 'bg-emerald-50', text: 'text-emerald-600', ring: 'ring-emerald-100' },
            { label: 'Total Students',  value: stats.students,  icon: Users,       grad: 'from-indigo-500 to-blue-500',   light: 'bg-indigo-50',  text: 'text-indigo-600',  ring: 'ring-indigo-100' },
            { label: 'Completed',       value: stats.completed, icon: TrendingUp,  grad: 'from-amber-500 to-orange-500',  light: 'bg-amber-50',   text: 'text-amber-600',   ring: 'ring-amber-100' },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all overflow-hidden">
              <div className={`h-0.5 bg-gradient-to-r ${s.grad}`} />
              <div className="p-5">
                <div className={`p-2.5 ${s.light} rounded-xl ring-4 ${s.ring} inline-flex mb-4`}>
                  <s.icon className={`w-5 h-5 ${s.text}`} />
                </div>
                {loading ? (
                  <div className="h-8 w-10 bg-slate-100 rounded-lg animate-pulse" />
                ) : (
                  <div className="text-3xl font-bold text-slate-900 tracking-tight">{s.value}</div>
                )}
                <div className="text-xs text-slate-400 mt-1 font-medium">{s.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Table Card */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          {/* Toolbar */}
          <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row gap-3 items-start sm:items-center">
            <div>
              <h2 className="text-base font-bold text-slate-900">All Classes</h2>
              <p className="text-xs text-slate-400 mt-0.5">{filtered.length} class{filtered.length !== 1 ? 'es' : ''}</p>
            </div>
            <div className="sm:ml-auto flex flex-wrap gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  placeholder="Search classes..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400 w-52 transition-all"
                />
              </div>
              <div className="relative">
                <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                <select
                  value={statusFilter}
                  onChange={e => setStatusFilter(e.target.value as any)}
                  className="pl-8 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400 appearance-none cursor-pointer text-slate-700"
                >
                  <option value="all">All Statuses</option>
                  <option value="active">Active</option>
                  <option value="upcoming">Upcoming</option>
                  <option value="completed">Completed</option>
                  <option value="archived">Archived</option>
                </select>
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/60">
                  {['Class', 'Course', 'Students', 'Schedule', 'Status', ''].map(h => (
                    <th key={h} className="px-5 py-3.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {loading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i}>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-slate-100 animate-pulse shrink-0" />
                          <div className="space-y-1.5">
                            <div className="h-3 w-28 bg-slate-100 rounded animate-pulse" />
                            <div className="h-2 w-20 bg-slate-100 rounded animate-pulse" />
                          </div>
                        </div>
                      </td>
                      {[...Array(4)].map((_, j) => (
                        <td key={j} className="px-5 py-4"><div className="h-3 w-20 bg-slate-100 rounded animate-pulse" /></td>
                      ))}
                    </tr>
                  ))
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-16 text-center">
                      <div className="w-14 h-14 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-3 border border-slate-100">
                        <School className="w-7 h-7 text-slate-300" />
                      </div>
                      <p className="text-slate-500 text-sm font-semibold">No classes found</p>
                      <p className="text-slate-400 text-xs mt-1">
                        {search || statusFilter !== 'all' ? 'Try adjusting your search or filter' : 'Create your first class to get started'}
                      </p>
                      {!search && statusFilter === 'all' && (
                        <button
                          onClick={openCreate}
                          className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 bg-violet-600 text-white rounded-xl text-sm font-semibold hover:bg-violet-700 transition-all shadow-sm"
                        >
                          <Plus className="w-3.5 h-3.5" /> New Class
                        </button>
                      )}
                    </td>
                  </tr>
                ) : filtered.map(cls => {
                  const sc = STATUS_CONFIG[cls.status];
                  const enrolled = cls.student_ids?.length || 0;
                  const pct = cls.capacity > 0 ? Math.round((enrolled / cls.capacity) * 100) : 0;
                  return (
                    <tr key={cls.id} className="hover:bg-slate-50/70 transition-colors group">
                      {/* Class */}
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className={cn('w-9 h-9 rounded-xl bg-gradient-to-br flex items-center justify-center text-white font-bold text-sm shrink-0 shadow-sm', getGrad(cls.name))}>
                            {cls.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-slate-800 leading-tight">{cls.name}</p>
                            {cls.description && (
                              <p className="text-xs text-slate-400 truncate max-w-[180px] mt-0.5">{cls.description}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      {/* Course */}
                      <td className="px-5 py-4">
                        {cls.course ? (
                          <div className="flex items-center gap-2">
                            <div className="p-1.5 bg-violet-50 rounded-lg shrink-0">
                              <BookOpen className="w-3.5 h-3.5 text-violet-500" />
                            </div>
                            <span className="text-sm text-slate-700 font-medium truncate max-w-[150px]">{cls.course.title}</span>
                          </div>
                        ) : (
                          <span className="text-slate-300 text-sm">—</span>
                        )}
                      </td>
                      {/* Students */}
                      <td className="px-5 py-4">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-1.5">
                            <Users className="w-3.5 h-3.5 text-slate-400" />
                            <span className="text-sm font-semibold text-slate-700">{enrolled}</span>
                            <span className="text-xs text-slate-400">/ {cls.capacity}</span>
                          </div>
                          <div className="w-20 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className={cn('h-full rounded-full transition-all', pct >= 90 ? 'bg-rose-400' : pct >= 60 ? 'bg-amber-400' : 'bg-violet-400')}
                              style={{ width: `${Math.min(pct, 100)}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      {/* Schedule */}
                      <td className="px-5 py-4">
                        {cls.start_date ? (
                          <div className="text-xs space-y-0.5">
                            <div className="flex items-center gap-1 font-medium text-slate-700">
                              <CalendarDays className="w-3.5 h-3.5 text-slate-400" />
                              {formatDate(cls.start_date)}
                            </div>
                            {cls.end_date && <p className="text-slate-400 pl-5">→ {formatDate(cls.end_date)}</p>}
                          </div>
                        ) : (
                          <span className="text-slate-300 text-sm">No schedule</span>
                        )}
                      </td>
                      {/* Status */}
                      <td className="px-5 py-4">
                        <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold', sc.bg, sc.text)}>
                          <span className={cn('w-1.5 h-1.5 rounded-full', sc.dot)} />
                          {sc.label}
                        </span>
                      </td>
                      {/* Actions */}
                      <td className="px-5 py-4">
                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-all">
                          <button onClick={() => setViewClass(cls)} className="p-2 rounded-lg text-slate-400 hover:text-violet-600 hover:bg-violet-50 transition-all" title="View">
                            <Eye className="w-4 h-4" />
                          </button>
                          <button onClick={() => openEdit(cls)} className="p-2 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all" title="Edit">
                            <Pencil className="w-4 h-4" />
                          </button>
                          <div className="relative">
                            <button onClick={() => setActiveMenu(activeMenu === cls.id ? null : cls.id)} className="p-2 rounded-lg text-slate-300 hover:text-slate-600 hover:bg-slate-100 transition-all">
                              <MoreHorizontal className="w-4 h-4" />
                            </button>
                            {activeMenu === cls.id && (
                              <div className="absolute right-0 top-10 z-20 w-48 bg-white rounded-xl border border-slate-100 shadow-xl py-1">
                                {(['active', 'upcoming', 'completed', 'archived'] as ClassStatus[])
                                  .filter(s => s !== cls.status)
                                  .map(s => (
                                    <button key={s} onClick={() => handleStatusChange(cls, s)}
                                      className="w-full text-left px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 flex items-center gap-2 capitalize">
                                      <span className={cn('w-2 h-2 rounded-full', STATUS_CONFIG[s].dot)} />
                                      Mark as {s}
                                    </button>
                                  ))}
                                <div className="border-t border-slate-100 mt-1 pt-1">
                                  <button onClick={() => handleDelete(cls)}
                                    className="w-full text-left px-4 py-2 text-sm text-rose-500 hover:bg-rose-50 flex items-center gap-2">
                                    <Trash2 className="w-4 h-4" /> Delete Class
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {!loading && filtered.length > 0 && (
            <div className="px-5 py-3.5 border-t border-slate-100 bg-slate-50/60 flex items-center justify-between">
              <span className="text-xs text-slate-400">{filtered.length} of {classes.length} classes</span>
              <span className="text-xs font-semibold text-slate-600">
                {stats.students} students total
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Create / Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-violet-100 rounded-xl flex items-center justify-center">
                  <School className="w-4 h-4 text-violet-600" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">{editing ? 'Edit Class' : 'Create New Class'}</h2>
                  <p className="text-xs text-slate-400">{editing ? 'Update class details' : 'Set up a class for your students'}</p>
                </div>
              </div>
              <button onClick={() => setShowModal(false)} className="p-2 hover:bg-slate-100 rounded-xl transition-all text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              {/* Name */}
              <div>
                <label className={labelCls}>Class Name <span className="text-rose-400">*</span></label>
                <input
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Morning English A1"
                  className={inputCls}
                  required
                />
              </div>

              {/* Description */}
              <div>
                <label className={labelCls}>Description</label>
                <textarea
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Optional description..."
                  rows={2}
                  className={cn(inputCls, 'resize-none')}
                />
              </div>

              {/* Course & Status */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Linked Course</label>
                  <select value={form.course_id} onChange={e => setForm(f => ({ ...f, course_id: e.target.value }))} className={inputCls}>
                    <option value="">No course</option>
                    {courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Status</label>
                  <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as ClassStatus }))} className={inputCls}>
                    <option value="active">Active</option>
                    <option value="upcoming">Upcoming</option>
                    <option value="completed">Completed</option>
                    <option value="archived">Archived</option>
                  </select>
                </div>
              </div>

              {/* Dates */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Start Date</label>
                  <input type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>End Date</label>
                  <input type="date" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} className={inputCls} />
                </div>
              </div>

              {/* Capacity */}
              <div>
                <label className={labelCls}>Student Capacity</label>
                <input
                  type="number"
                  min={1}
                  max={500}
                  value={form.capacity}
                  onChange={e => setForm(f => ({ ...f, capacity: Number(e.target.value) }))}
                  className={inputCls}
                />
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-600 rounded-xl text-sm font-semibold hover:bg-slate-50 transition-all">
                  Cancel
                </button>
                <button type="submit" disabled={submitting}
                  className="flex-1 px-4 py-2.5 bg-violet-600 text-white rounded-xl text-sm font-semibold hover:bg-violet-700 transition-all disabled:opacity-60 shadow-md shadow-violet-500/20">
                  {submitting ? 'Saving...' : editing ? 'Save Changes' : 'Create Class'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View / Detail Drawer */}
      {viewClass && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-end" onClick={() => setViewClass(null)}>
          <div className="bg-white h-full w-full max-w-sm shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
            {/* Drawer header */}
            <div className={cn('bg-gradient-to-br p-6 text-white relative', getGrad(viewClass.name))}>
              <button onClick={() => setViewClass(null)} className="absolute top-4 right-4 p-1.5 bg-white/20 hover:bg-white/30 rounded-lg transition-all">
                <X className="w-4 h-4" />
              </button>
              <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center text-2xl font-bold mb-3">
                {viewClass.name.charAt(0).toUpperCase()}
              </div>
              <h2 className="text-lg font-bold leading-tight">{viewClass.name}</h2>
              {viewClass.description && <p className="text-white/70 text-sm mt-1">{viewClass.description}</p>}
              <div className="mt-3">
                <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-white/20 text-white')}>
                  <span className="w-1.5 h-1.5 rounded-full bg-white" />
                  {STATUS_CONFIG[viewClass.status].label}
                </span>
              </div>
            </div>

            {/* Drawer body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {/* Enrollment bar */}
              <div className="bg-slate-50 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Enrollment</span>
                  <span className="text-sm font-bold text-slate-800">
                    {viewClass.student_ids?.length || 0} / {viewClass.capacity}
                  </span>
                </div>
                <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-violet-400 to-purple-500 transition-all"
                    style={{ width: `${Math.min(((viewClass.student_ids?.length || 0) / viewClass.capacity) * 100, 100)}%` }}
                  />
                </div>
              </div>

              {/* Details list */}
              {[
                { icon: BookOpen,     label: 'Course',     value: viewClass.course?.title || '—' },
                { icon: CalendarDays, label: 'Start Date', value: formatDate(viewClass.start_date) },
                { icon: CalendarDays, label: 'End Date',   value: formatDate(viewClass.end_date) },
                { icon: Users,        label: 'Capacity',   value: `${viewClass.capacity} students` },
                { icon: GraduationCap,label: 'Created',    value: formatDate(viewClass.created_at) },
              ].map(({ icon: Icon, label, value }) => (
                <div key={label} className="flex items-start gap-3">
                  <div className="p-2 bg-slate-100 rounded-lg shrink-0">
                    <Icon className="w-4 h-4 text-slate-500" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-400 font-medium">{label}</p>
                    <p className="text-sm font-semibold text-slate-800 mt-0.5">{value}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Drawer actions */}
            <div className="p-4 border-t border-slate-100 flex gap-2">
              <button onClick={() => { setViewClass(null); openEdit(viewClass); }}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-violet-600 text-white rounded-xl text-sm font-semibold hover:bg-violet-700 transition-all">
                <Pencil className="w-4 h-4" /> Edit Class
              </button>
              <button onClick={() => { setViewClass(null); handleDelete(viewClass); }}
                className="px-4 py-2.5 border border-rose-200 text-rose-500 rounded-xl text-sm font-semibold hover:bg-rose-50 transition-all">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </TeacherLayout>
  );
}
