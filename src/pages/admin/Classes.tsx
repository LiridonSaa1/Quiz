import React, { useEffect, useState } from 'react';
import { supabase } from '../../supabase';
import AdminLayout from '../../components/layout/AdminLayout';
import { toast } from 'sonner';
import {
  School, Plus, Search, Filter, Users, BookOpen, CalendarDays,
  MoreHorizontal, ChevronRight, X, Pencil, Trash2, Eye,
  Clock, CheckCircle2, AlertCircle, Archive, GraduationCap,
  TrendingUp, Layers
} from 'lucide-react';
import { cn } from '../../lib/utils';
import StyledSelect from '../../components/ui/StyledSelect';

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
  updated_at: string;
  course?: { title: string } | null;
  teacher?: { display_name: string; email: string } | null;
}

interface Course { id: string; title: string }
interface Teacher { id: string; displayName: string; email: string }

const STATUS_CONFIG: Record<ClassStatus, { label: string; bg: string; text: string; dot: string; icon: React.ElementType }> = {
  active:    { label: 'Active',    bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500', icon: CheckCircle2 },
  upcoming:  { label: 'Upcoming',  bg: 'bg-indigo-50',  text: 'text-indigo-700',  dot: 'bg-indigo-500',  icon: Clock        },
  completed: { label: 'Completed', bg: 'bg-slate-100',  text: 'text-slate-600',   dot: 'bg-slate-400',   icon: Archive      },
  archived:  { label: 'Archived',  bg: 'bg-amber-50',   text: 'text-amber-700',   dot: 'bg-amber-500',   icon: AlertCircle  },
};

const AVATAR_COLORS = [
  'from-indigo-500 to-violet-500',
  'from-violet-500 to-purple-600',
  'from-emerald-500 to-teal-500',
  'from-amber-500 to-orange-500',
  'from-rose-500 to-pink-500',
  'from-blue-500 to-cyan-500',
];
const getAvatar = (name: string) => {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
};

const emptyForm = {
  name: '',
  description: '',
  course_id: '',
  teacher_id: '',
  status: 'active' as ClassStatus,
  start_date: '',
  end_date: '',
  capacity: 30,
};

export default function AdminClasses() {
  const [classes, setClasses] = useState<ClassRecord[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | ClassStatus>('all');
  const [showModal, setShowModal] = useState(false);
  const [editingClass, setEditingClass] = useState<ClassRecord | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [viewClass, setViewClass] = useState<ClassRecord | null>(null);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [classesRes, coursesRes, teachersRes] = await Promise.all([
        supabase.from('classes').select('*').order('created_at', { ascending: false }),
        supabase.from('courses').select('id, title').eq('status', 'published'),
        supabase.from('profiles').select('id, display_name, email').eq('role', 'teacher'),
      ]);
      if (classesRes.error) throw classesRes.error;

      const courseMap: Record<string, { title: string }> = {};
      (coursesRes.data || []).forEach((c: any) => { courseMap[c.id] = { title: c.title }; });

      const teacherMap: Record<string, { display_name: string; email: string }> = {};
      (teachersRes.data || []).forEach((t: any) => { teacherMap[t.id] = { display_name: t.display_name, email: t.email }; });

      const enriched = (classesRes.data || []).map((cls: any) => ({
        ...cls,
        course: cls.course_id ? (courseMap[cls.course_id] || null) : null,
        teacher: cls.teacher_id ? (teacherMap[cls.teacher_id] ? { display_name: teacherMap[cls.teacher_id].display_name, email: teacherMap[cls.teacher_id].email } : null) : null,
      }));

      setClasses(enriched as ClassRecord[]);
      setCourses(coursesRes.data || []);
      setTeachers((teachersRes.data || []).map((t: any) => ({ id: t.id, displayName: t.display_name, email: t.email })));
    } catch (err: any) {
      toast.error('Failed to load classes: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  const openCreate = () => {
    setEditingClass(null);
    setForm(emptyForm);
    setShowModal(true);
  };

  const openEdit = (cls: ClassRecord) => {
    setEditingClass(cls);
    setForm({
      name: cls.name,
      description: cls.description || '',
      course_id: cls.course_id || '',
      teacher_id: cls.teacher_id || '',
      status: cls.status,
      start_date: cls.start_date ? cls.start_date.slice(0, 10) : '',
      end_date: cls.end_date ? cls.end_date.slice(0, 10) : '',
      capacity: cls.capacity,
    });
    setShowModal(true);
    setActiveMenu(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload: any = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        course_id: form.course_id || null,
        teacher_id: form.teacher_id || null,
        status: form.status,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        capacity: Number(form.capacity),
      };

      if (editingClass) {
        const { error } = await supabase.from('classes').update(payload).eq('id', editingClass.id);
        if (error) throw error;
        toast.success('Class updated successfully');
      } else {
        payload.student_ids = [];
        const { error } = await supabase.from('classes').insert(payload);
        if (error) throw error;
        toast.success('Class created successfully');
      }
      setShowModal(false);
      fetchAll();
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
      fetchAll();
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete class');
    }
    setActiveMenu(null);
  };

  const handleStatusChange = async (cls: ClassRecord, status: ClassStatus) => {
    try {
      const { error } = await supabase.from('classes').update({ status }).eq('id', cls.id);
      if (error) throw error;
      toast.success(`Class marked as ${status}`);
      fetchAll();
    } catch (err: any) {
      toast.error(err.message);
    }
    setActiveMenu(null);
  };

  const filtered = classes.filter(cls => {
    const q = searchQuery.toLowerCase();
    const matchSearch = cls.name.toLowerCase().includes(q)
      || (cls.course?.title || '').toLowerCase().includes(q)
      || (cls.teacher?.display_name || '').toLowerCase().includes(q);
    const matchStatus = statusFilter === 'all' || cls.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const stats = {
    total:     classes.length,
    active:    classes.filter(c => c.status === 'active').length,
    students:  classes.reduce((s, c) => s + (c.student_ids?.length || 0), 0),
    completed: classes.filter(c => c.status === 'completed').length,
  };

  const formatDate = (d: string | null) =>
    d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

  return (
    <AdminLayout>
      <div className="space-y-7">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Classes</h1>
            <p className="text-slate-400 text-sm mt-1">Manage all classes, assign teachers and track enrollment.</p>
          </div>
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl font-semibold text-sm hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-500/20 active:scale-[0.98]"
          >
            <Plus className="w-4 h-4" />
            New Class
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Total Classes', value: stats.total, icon: School, gradFrom: '#6366f1', gradTo: '#8b5cf6', light: 'bg-indigo-50', text: 'text-indigo-600', ring: 'ring-indigo-100' },
            { label: 'Active Now', value: stats.active, icon: CheckCircle2, gradFrom: '#10b981', gradTo: '#14b8a6', light: 'bg-emerald-50', text: 'text-emerald-600', ring: 'ring-emerald-100' },
            { label: 'Total Students', value: stats.students, icon: Users, gradFrom: '#8b5cf6', gradTo: '#a855f7', light: 'bg-violet-50', text: 'text-violet-600', ring: 'ring-violet-100' },
            { label: 'Completed', value: stats.completed, icon: TrendingUp, gradFrom: '#f59e0b', gradTo: '#f97316', light: 'bg-amber-50', text: 'text-amber-600', ring: 'ring-amber-100' },
          ].map(stat => (
            <div key={stat.label} className="bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all overflow-hidden">
              <div className="h-0.5" style={{ background: `linear-gradient(to right, ${stat.gradFrom}, ${stat.gradTo})` }} />
              <div className="p-5">
                <div className={`p-2.5 ${stat.light} rounded-xl ring-4 ${stat.ring} inline-flex mb-4`}>
                  <stat.icon className={`w-5 h-5 ${stat.text}`} />
                </div>
                {loading ? (
                  <div className="h-8 w-10 bg-slate-100 rounded-lg animate-pulse" />
                ) : (
                  <div className="text-3xl font-bold text-slate-900 tracking-tight">{stat.value}</div>
                )}
                <div className="text-xs text-slate-400 mt-1 font-medium">{stat.label}</div>
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
                  type="text"
                  placeholder="Search classes..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full sm:w-56 pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-all"
                />
              </div>
              <StyledSelect
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value as any)}
                icon={<Filter className="w-3.5 h-3.5" />}
              >
                <option value="all">All Statuses</option>
                <option value="active">Active</option>
                <option value="upcoming">Upcoming</option>
                <option value="completed">Completed</option>
                <option value="archived">Archived</option>
              </StyledSelect>
            </div>
          </div>

          {/* Desktop Table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-100">
                  {['Class', 'Course', 'Teacher', 'Students', 'Schedule', 'Status', ''].map(h => (
                    <th key={h} className="px-5 py-3.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider">{h}</th>
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
                      {[...Array(5)].map((_, j) => (
                        <td key={j} className="px-5 py-4"><div className="h-3 w-20 bg-slate-100 rounded animate-pulse" /></td>
                      ))}
                    </tr>
                  ))
                ) : filtered.length > 0 ? (
                  filtered.map(cls => {
                    const sc = STATUS_CONFIG[cls.status];
                    const enrolledCount = cls.student_ids?.length || 0;
                    const capacityPct = cls.capacity > 0 ? Math.round((enrolledCount / cls.capacity) * 100) : 0;
                    return (
                      <tr key={cls.id} className="hover:bg-slate-50/80 transition-colors group">
                        {/* Class Name */}
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${getAvatar(cls.name)} flex items-center justify-center text-white font-bold text-sm shrink-0 shadow-sm`}>
                              {cls.name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <div className="text-sm font-semibold text-slate-800">{cls.name}</div>
                              {cls.description && (
                                <div className="text-xs text-slate-400 truncate max-w-[160px]">{cls.description}</div>
                              )}
                            </div>
                          </div>
                        </td>
                        {/* Course */}
                        <td className="px-5 py-4">
                          {cls.course ? (
                            <div className="flex items-center gap-2">
                              <div className="p-1.5 bg-indigo-50 rounded-lg">
                                <BookOpen className="w-3.5 h-3.5 text-indigo-500" />
                              </div>
                              <span className="text-sm text-slate-700 font-medium truncate max-w-[140px]">{cls.course.title}</span>
                            </div>
                          ) : (
                            <span className="text-slate-300 text-sm">—</span>
                          )}
                        </td>
                        {/* Teacher */}
                        <td className="px-5 py-4">
                          {cls.teacher ? (
                            <div className="flex items-center gap-2">
                              <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${getAvatar(cls.teacher.display_name)} flex items-center justify-center text-white text-xs font-bold shrink-0`}>
                                {cls.teacher.display_name.charAt(0).toUpperCase()}
                              </div>
                              <span className="text-sm text-slate-700 font-medium truncate max-w-[120px]">{cls.teacher.display_name}</span>
                            </div>
                          ) : (
                            <span className="text-slate-300 text-sm">Unassigned</span>
                          )}
                        </td>
                        {/* Students */}
                        <td className="px-5 py-4">
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-1.5">
                              <Users className="w-3.5 h-3.5 text-slate-400" />
                              <span className="text-sm font-semibold text-slate-700">{enrolledCount}</span>
                              <span className="text-xs text-slate-400">/ {cls.capacity}</span>
                            </div>
                            <div className="w-24 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                              <div
                                className={cn("h-full rounded-full transition-all", capacityPct >= 90 ? 'bg-red-400' : capacityPct >= 60 ? 'bg-amber-400' : 'bg-emerald-400')}
                                style={{ width: `${Math.min(capacityPct, 100)}%` }}
                              />
                            </div>
                          </div>
                        </td>
                        {/* Schedule */}
                        <td className="px-5 py-4">
                          {cls.start_date ? (
                            <div className="text-xs text-slate-500 space-y-0.5">
                              <div className="flex items-center gap-1 font-medium text-slate-700">
                                <CalendarDays className="w-3.5 h-3.5 text-slate-400" />
                                {formatDate(cls.start_date)}
                              </div>
                              {cls.end_date && <div className="text-slate-400 pl-5">→ {formatDate(cls.end_date)}</div>}
                            </div>
                          ) : (
                            <span className="text-slate-300 text-sm">No schedule</span>
                          )}
                        </td>
                        {/* Status */}
                        <td className="px-5 py-4">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold ${sc.bg} ${sc.text}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />
                            {sc.label}
                          </span>
                        </td>
                        {/* Actions */}
                        <td className="px-5 py-4">
                          <div className="relative flex items-center justify-end">
                            <div className="opacity-0 group-hover:opacity-100 transition-all flex items-center gap-1">
                              <button
                                onClick={() => setViewClass(cls)}
                                className="p-2 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all"
                                title="View details"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => openEdit(cls)}
                                className="p-2 rounded-lg text-slate-400 hover:text-violet-600 hover:bg-violet-50 transition-all"
                                title="Edit"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                              <div className="relative">
                                <button
                                  onClick={() => setActiveMenu(activeMenu === cls.id ? null : cls.id)}
                                  className="p-2 rounded-lg text-slate-300 hover:text-slate-600 hover:bg-slate-100 transition-all"
                                >
                                  <MoreHorizontal className="w-4 h-4" />
                                </button>
                                {activeMenu === cls.id && (
                                  <div className="absolute right-0 top-9 z-20 w-48 bg-white rounded-xl border border-slate-100 shadow-xl py-1">
                                    {(['active', 'upcoming', 'completed', 'archived'] as ClassStatus[])
                                      .filter(s => s !== cls.status)
                                      .map(s => (
                                        <button
                                          key={s}
                                          onClick={() => handleStatusChange(cls, s)}
                                          className="w-full text-left px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 flex items-center gap-2 capitalize"
                                        >
                                          <span className={`w-2 h-2 rounded-full ${STATUS_CONFIG[s].dot}`} />
                                          Mark as {s}
                                        </button>
                                      ))}
                                    <div className="border-t border-slate-100 mt-1 pt-1">
                                      <button
                                        onClick={() => handleDelete(cls)}
                                        className="w-full text-left px-4 py-2 text-sm text-red-500 hover:bg-red-50 flex items-center gap-2"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                        Delete Class
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={7} className="px-6 py-16 text-center">
                      <div className="w-14 h-14 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-3 border border-slate-100">
                        <School className="w-7 h-7 text-slate-300" />
                      </div>
                      <p className="text-slate-500 text-sm font-semibold">No classes found</p>
                      <p className="text-slate-400 text-xs mt-1">
                        {searchQuery || statusFilter !== 'all' ? 'Try adjusting your search or filter' : 'Create your first class to get started'}
                      </p>
                      {!searchQuery && statusFilter === 'all' && (
                        <button
                          onClick={openCreate}
                          className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-all shadow-sm"
                        >
                          <Plus className="w-3.5 h-3.5" /> New Class
                        </button>
                      )}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="md:hidden divide-y divide-slate-50">
            {loading ? (
              <div className="p-6 text-center text-slate-400 text-sm">Loading classes...</div>
            ) : filtered.length > 0 ? (
              filtered.map(cls => {
                const sc = STATUS_CONFIG[cls.status];
                const enrolledCount = cls.student_ids?.length || 0;
                return (
                  <div key={cls.id} className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${getAvatar(cls.name)} flex items-center justify-center text-white font-bold shrink-0`}>
                          {cls.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-slate-800 truncate">{cls.name}</div>
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold mt-1 ${sc.bg} ${sc.text}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />{sc.label}
                          </span>
                        </div>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <button onClick={() => openEdit(cls)} className="p-2 rounded-lg text-slate-400 hover:text-violet-600 hover:bg-violet-50">
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDelete(cls)} className="p-2 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                      {cls.course && <span className="flex items-center gap-1"><BookOpen className="w-3 h-3 text-indigo-400" />{cls.course.title}</span>}
                      {cls.teacher && <span className="flex items-center gap-1"><GraduationCap className="w-3 h-3 text-violet-400" />{cls.teacher.display_name}</span>}
                      <span className="flex items-center gap-1"><Users className="w-3 h-3 text-slate-400" />{enrolledCount} / {cls.capacity}</span>
                    </div>
                    {cls.start_date && (
                      <div className="text-xs text-slate-400 flex items-center gap-1">
                        <CalendarDays className="w-3 h-3" />
                        {formatDate(cls.start_date)}{cls.end_date ? ` → ${formatDate(cls.end_date)}` : ''}
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              <div className="p-8 text-center text-slate-400 text-sm">No classes found</div>
            )}
          </div>
        </div>
      </div>

      {/* Create / Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl border border-slate-100 max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-indigo-50 rounded-xl flex items-center justify-center">
                  <School className="w-4.5 h-4.5 text-indigo-600" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">{editingClass ? 'Edit Class' : 'Create New Class'}</h2>
                  <p className="text-xs text-slate-400 mt-0.5">{editingClass ? 'Update class details' : 'Set up a new class session'}</p>
                </div>
              </div>
              <button onClick={() => setShowModal(false)} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleSubmit} className="overflow-y-auto">
              <div className="px-6 py-5 space-y-4">
                {/* Name */}
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Class Name <span className="text-red-400">*</span></label>
                  <input
                    required
                    type="text"
                    value={form.name}
                    onChange={e => setForm({ ...form, name: e.target.value })}
                    placeholder="e.g. Advanced English – Batch A"
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-all"
                  />
                </div>

                {/* Description */}
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Description</label>
                  <textarea
                    rows={2}
                    value={form.description}
                    onChange={e => setForm({ ...form, description: e.target.value })}
                    placeholder="Optional short description..."
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-all resize-none"
                  />
                </div>

                {/* Course + Teacher */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Course</label>
                    <StyledSelect
                      value={form.course_id}
                      onChange={e => setForm({ ...form, course_id: e.target.value })}
                      wrapperClassName="w-full"
                    >
                      <option value="">None</option>
                      {courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                    </StyledSelect>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Teacher</label>
                    <StyledSelect
                      value={form.teacher_id}
                      onChange={e => setForm({ ...form, teacher_id: e.target.value })}
                      wrapperClassName="w-full"
                    >
                      <option value="">Unassigned</option>
                      {teachers.map(t => <option key={t.id} value={t.id}>{t.displayName}</option>)}
                    </StyledSelect>
                  </div>
                </div>

                {/* Start / End date */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Start Date</label>
                    <input
                      type="date"
                      value={form.start_date}
                      onChange={e => setForm({ ...form, start_date: e.target.value })}
                      className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">End Date</label>
                    <input
                      type="date"
                      value={form.end_date}
                      onChange={e => setForm({ ...form, end_date: e.target.value })}
                      className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-all"
                    />
                  </div>
                </div>

                {/* Capacity + Status */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Capacity</label>
                    <input
                      type="number"
                      min={1}
                      max={500}
                      value={form.capacity}
                      onChange={e => setForm({ ...form, capacity: parseInt(e.target.value) || 1 })}
                      className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Status</label>
                    <StyledSelect
                      value={form.status}
                      onChange={e => setForm({ ...form, status: e.target.value as ClassStatus })}
                      wrapperClassName="w-full"
                    >
                      <option value="upcoming">Upcoming</option>
                      <option value="active">Active</option>
                      <option value="completed">Completed</option>
                      <option value="archived">Archived</option>
                    </StyledSelect>
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="px-6 py-4 border-t border-slate-100 flex gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2.5 bg-slate-100 text-slate-600 rounded-xl font-semibold text-sm hover:bg-slate-200 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 px-4 py-2.5 bg-indigo-600 text-white rounded-xl font-semibold text-sm hover:bg-indigo-700 transition-all disabled:opacity-50 shadow-lg shadow-indigo-500/20"
                >
                  {submitting ? 'Saving...' : editingClass ? 'Save Changes' : 'Create Class'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View Detail Modal */}
      {viewClass && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl border border-slate-100 overflow-hidden">
            <div className={`bg-gradient-to-br ${getAvatar(viewClass.name)} p-6 relative`}>
              <button
                onClick={() => setViewClass(null)}
                className="absolute top-4 right-4 p-1.5 bg-white/20 hover:bg-white/30 rounded-xl transition-colors"
              >
                <X className="w-4 h-4 text-white" />
              </button>
              <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center text-white font-bold text-2xl mb-3">
                {viewClass.name.charAt(0).toUpperCase()}
              </div>
              <h2 className="text-xl font-bold text-white">{viewClass.name}</h2>
              {viewClass.description && <p className="text-white/70 text-sm mt-1">{viewClass.description}</p>}
              <div className="mt-3">
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-white/20 text-white`}>
                  <span className="w-1.5 h-1.5 rounded-full bg-white" />
                  {STATUS_CONFIG[viewClass.status].label}
                </span>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                {[
                  { icon: BookOpen, label: 'Course', value: viewClass.course?.title || 'Not assigned', color: 'text-indigo-500', bg: 'bg-indigo-50' },
                  { icon: GraduationCap, label: 'Teacher', value: viewClass.teacher?.display_name || 'Unassigned', color: 'text-violet-500', bg: 'bg-violet-50' },
                  { icon: Users, label: 'Enrolled', value: `${viewClass.student_ids?.length || 0} / ${viewClass.capacity}`, color: 'text-emerald-500', bg: 'bg-emerald-50' },
                  { icon: CalendarDays, label: 'Start Date', value: formatDate(viewClass.start_date), color: 'text-amber-500', bg: 'bg-amber-50' },
                ].map(item => (
                  <div key={item.label} className={`${item.bg} rounded-xl p-3.5`}>
                    <item.icon className={`w-4 h-4 ${item.color} mb-2`} />
                    <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">{item.label}</div>
                    <div className="text-sm font-semibold text-slate-700 mt-0.5 truncate">{item.value}</div>
                  </div>
                ))}
              </div>
              {viewClass.end_date && (
                <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-50 rounded-xl px-4 py-3">
                  <CalendarDays className="w-4 h-4 text-slate-400 shrink-0" />
                  <span>Ends on <strong className="text-slate-700">{formatDate(viewClass.end_date)}</strong></span>
                </div>
              )}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => { setViewClass(null); openEdit(viewClass); }}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-xl font-semibold text-sm hover:bg-indigo-700 transition-all shadow-md shadow-indigo-200"
                >
                  <Pencil className="w-4 h-4" /> Edit Class
                </button>
                <button
                  onClick={() => setViewClass(null)}
                  className="px-4 py-2.5 bg-slate-100 text-slate-600 rounded-xl font-semibold text-sm hover:bg-slate-200 transition-all"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Close menu on outside click */}
      {activeMenu && (
        <div className="fixed inset-0 z-10" onClick={() => setActiveMenu(null)} />
      )}
    </AdminLayout>
  );
}
