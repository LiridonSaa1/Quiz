import React, { useEffect, useState, useMemo } from 'react';
import { supabase } from '../../supabase';
import TeacherLayout from '../../components/layout/TeacherLayout';
import LoadingButton from '../../components/ui/LoadingButton';
import { toast } from 'sonner';
import { motion } from 'motion/react';
import {
  AdminListFilterBar,
  AdminListPageShell,
  ADMIN_LIST_SEARCH_INPUT,
  ADMIN_LIST_CARD_GRID,
  ADMIN_LIST_ITEM_CARD,
} from '../../components/admin/AdminListPageShell';
import {
  School, Plus, Search, Filter, Users, BookOpen, CalendarDays,
  MoreHorizontal, X, Pencil, Trash2, Eye,
  Clock, CheckCircle2, AlertCircle, Archive, TrendingUp,
  Link2, Copy, Check,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import StyledSelect from '../../components/ui/StyledSelect';
import { resolveTeacherIdCandidates } from '../../lib/teacherScope';
import { authFetch, readApiError } from '../../lib/apiUrl';
import { normalizeClassRow } from '../../lib/classesTable';

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
  enrollment_count?: number;
}

interface Course { id: string; title: string; status?: string; student_ids?: string[] }

const STATUS_CONFIG: Record<ClassStatus, { label: string; bg: string; text: string; dot: string; icon: React.ElementType }> = {
  active:    { label: 'Active',    bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500', icon: CheckCircle2 },
  upcoming:  { label: 'Upcoming',  bg: 'bg-indigo-50',  text: 'text-indigo-700',  dot: 'bg-indigo-500',  icon: Clock },
  completed: { label: 'Completed', bg: 'bg-slate-100',  text: 'text-slate-600',   dot: 'bg-slate-400',   icon: Archive },
  archived:  { label: 'Archived',  bg: 'bg-amber-50',   text: 'text-amber-700',   dot: 'bg-amber-500',   icon: AlertCircle },
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

export default function TeacherClasses() {
  const [teacherId, setTeacherId] = useState<string | null>(null);
  const [classes, setClasses] = useState<ClassRecord[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | ClassStatus>('all');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<ClassRecord | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [viewClass, setViewClass] = useState<ClassRecord | null>(null);
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [copiedInvite, setCopiedInvite] = useState<string | null>(null);

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
      const scopedIds = await resolveTeacherIdCandidates(tid);

      const classesHttp = await authFetch('/api/teacher/classes');
      if (!classesHttp.ok) throw new Error(await readApiError(classesHttp));
      const classesJson = await classesHttp.json();
      const classesRows = Array.isArray(classesJson?.classes) ? classesJson.classes : [];

      let allCourses: Course[] = [];
      try {
        const backendRes = await authFetch(`/api/teacher/courses?userId=${encodeURIComponent(tid)}`);
        if (backendRes.ok) {
          const backendJson = await backendRes.json();
          if (backendJson?.success && Array.isArray(backendJson.courses)) {
            allCourses = backendJson.courses.map((c: any) => ({
              id: c.id,
              title: (c.title || c.name || 'Untitled').trim() || 'Untitled',
              status: c.status,
              student_ids: Array.isArray(c.student_ids) ? c.student_ids.map((sid: unknown) => String(sid)) : [],
            }));
          }
        }
      } catch {
        // Keep classes visible even if course title enrichment fails.
      }
      if (allCourses.length === 0) {
        const { data, error } = await supabase
          .from('courses')
          .select('id, title, status, student_ids')
          .in('teacher_id', scopedIds)
          .order('created_at', { ascending: false });
        if (!error || error.code === 'PGRST116') {
          allCourses = (data || []).map((c: any) => ({
            id: c.id,
            title: (c.title || 'Untitled').trim() || 'Untitled',
            status: c.status,
            student_ids: Array.isArray(c.student_ids) ? c.student_ids.map((sid: unknown) => String(sid)) : [],
          }));
        }
      }

      // Dropdown: draft + published (same as other teacher flows); cards still resolve archived titles below.
      const forSelect = allCourses.filter(c => c.status !== 'archived');

      const courseMap: Record<string, { title: string; studentIds: string[] }> = {};
      allCourses.forEach((c: any) => {
        courseMap[c.id] = {
          title: c.title,
          studentIds: Array.isArray(c.student_ids) ? c.student_ids.map((sid: unknown) => String(sid)) : [],
        };
      });

      const classCountPerCourse = classesRows.reduce((acc: Record<string, number>, cls: Record<string, unknown>) => {
        const row = normalizeClassRow(cls) as ClassRecord;
        const courseId = row.course_id ? String(row.course_id) : '';
        if (courseId) acc[courseId] = (acc[courseId] || 0) + 1;
        return acc;
      }, {});

      const enriched = classesRows.map((cls: Record<string, unknown>) => {
        const row = normalizeClassRow(cls) as ClassRecord;
        const classStudentIds = Array.isArray(row.student_ids) ? row.student_ids.map((sid: unknown) => String(sid)) : [];
        const courseStudentIds = row.course_id ? (courseMap[String(row.course_id)]?.studentIds || []) : [];
        const hasSingleClassForCourse = row.course_id ? (classCountPerCourse[String(row.course_id)] || 0) === 1 : false;
        const enrollmentCount =
          classStudentIds.length > 0
            ? classStudentIds.length
            : (hasSingleClassForCourse ? courseStudentIds.length : 0);
        return {
          ...row,
          course: row.course_id ? ({ title: courseMap[String(row.course_id)]?.title || 'Unknown Course' }) : null,
          enrollment_count: enrollmentCount,
        };
      });

      setClasses(enriched);
      setCourses(forSelect);
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
      capacity: cls.capacity ?? 30,
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
        status: form.status || 'upcoming',
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        capacity: Number(form.capacity),
      };
      if (!editing) payload.student_ids = [];

      const res = await authFetch('/api/teacher/classes/save', {
        method: 'POST',
        body: JSON.stringify({
          mode: editing ? 'update' : 'insert',
          id: editing?.id || null,
          payload,
        }),
      });
      if (!res.ok) throw new Error(await readApiError(res));
      toast.success(editing ? 'Class updated' : 'Class created');

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
      toast.success(`Class marked as ${status}`);
      if (teacherId) fetchData(teacherId);
    } catch (err: any) {
      toast.error(err.message);
    }
    setActiveMenu(null);
  };

  const filtered = useMemo(() => classes.filter(cls => {
    const q = searchQuery.toLowerCase();
    const matchSearch = cls.name.toLowerCase().includes(q) || (cls.course?.title || '').toLowerCase().includes(q);
    const matchStatus = statusFilter === 'all' || cls.status === statusFilter;
    return matchSearch && matchStatus;
  }), [classes, searchQuery, statusFilter]);

  const stats = useMemo(() => ({
    total: classes.length,
    active: classes.filter(c => c.status === 'active').length,
    students: classes.reduce((s, c) => s + ((c.enrollment_count ?? c.student_ids?.length) || 0), 0),
    completed: classes.filter(c => c.status === 'completed').length,
  }), [classes]);

  const statItems = [
    { label: 'Total Classes', value: stats.total, gradient: 'from-indigo-500 to-indigo-600', shadow: 'shadow-indigo-500/25', icon: School },
    { label: 'Active Now', value: stats.active, gradient: 'from-emerald-500 to-emerald-600', shadow: 'shadow-emerald-500/25', icon: CheckCircle2 },
    { label: 'Total Students', value: stats.students, gradient: 'from-violet-500 to-violet-600', shadow: 'shadow-violet-500/25', icon: Users },
    { label: 'Completed', value: stats.completed, gradient: 'from-amber-500 to-amber-600', shadow: 'shadow-amber-500/25', icon: TrendingUp },
  ];

  return (
    <TeacherLayout>
      <AdminListPageShell
        breadcrumbPortalLabel="Teacher Portal"
        breadcrumbLabel="Classes"
        title="Classes"
        description="Manage your classes and track enrollment for your courses."
        action={
          <motion.button
            type="button"
            onClick={openCreate}
            whileHover={{ scale: 1.04, y: -2 }}
            whileTap={{ scale: 0.97 }}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl font-bold text-sm text-white shrink-0 transition-all"
            style={{
              background: 'linear-gradient(135deg, #818cf8 0%, #a78bfa 100%)',
              boxShadow: '0 8px 32px rgba(139,92,246,0.45), 0 2px 8px rgba(0,0,0,0.15)',
            }}
          >
            <Plus className="w-4 h-4" />
            New Class
          </motion.button>
        }
        stats={statItems}
        filterBar={
          <AdminListFilterBar>
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-indigo-400" />
              <input
                type="text"
                placeholder="Search classes..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className={ADMIN_LIST_SEARCH_INPUT}
              />
            </div>
            <StyledSelect
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as 'all' | ClassStatus)}
              icon={<Filter className="w-3.5 h-3.5 text-indigo-400" />}
              className="rounded-full border-indigo-100 bg-white/80 py-2.5 shadow-sm focus:ring-2 focus:ring-violet-400 focus:border-transparent min-w-[160px]"
              wrapperClassName="min-w-[160px]"
            >
              <option value="all">All Statuses</option>
              <option value="active">Active</option>
              <option value="upcoming">Upcoming</option>
              <option value="completed">Completed</option>
              <option value="archived">Archived</option>
            </StyledSelect>
          </AdminListFilterBar>
        }
      >
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <h2 className="text-base font-bold text-slate-900">All Classes</h2>
            <p className="text-xs text-slate-400 mt-0.5">{filtered.length} class{filtered.length !== 1 ? 'es' : ''}</p>
          </div>

          {loading ? (
            <div className={ADMIN_LIST_CARD_GRID}>
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-64 rounded-2xl bg-slate-100 animate-pulse" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <div className="w-14 h-14 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-3 border border-slate-100">
                <School className="w-7 h-7 text-slate-300" />
              </div>
              <p className="text-slate-500 text-sm font-semibold">No classes found</p>
              <p className="text-slate-400 text-xs mt-1">
                {searchQuery || statusFilter !== 'all' ? 'Try adjusting your search or filter' : 'Create your first class to get started'}
              </p>
              {!searchQuery && statusFilter === 'all' && (
                <button
                  type="button"
                  onClick={openCreate}
                  className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-all shadow-sm"
                >
                  <Plus className="w-3.5 h-3.5" /> New Class
                </button>
              )}
            </div>
          ) : (
            <div className={ADMIN_LIST_CARD_GRID}>
              {filtered.map(cls => {
                const sc = STATUS_CONFIG[cls.status];
                const enrolledCount = (cls.enrollment_count ?? cls.student_ids?.length) || 0;
                const capacityPct = cls.capacity > 0 ? Math.round((enrolledCount / cls.capacity) * 100) : 0;
                return (
                  <div key={cls.id} className={ADMIN_LIST_ITEM_CARD}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${getAvatar(cls.name)} flex items-center justify-center text-white font-bold text-sm shrink-0 shadow-sm`}>
                          {cls.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <h3 className="text-sm font-semibold text-slate-900 leading-snug">{cls.name}</h3>
                          {cls.description && (
                            <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">{cls.description}</p>
                          )}
                          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-[10px] font-semibold mt-2 ${sc.bg} ${sc.text}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />
                            {sc.label}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-0.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => setViewClass(cls)}
                          className="p-2 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all"
                          title="View details"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              const res = await authFetch(`/api/teacher/classes/${cls.id}/invite-code`);
                              const json = await res.json();
                              if (!res.ok || !json.success) { toast.error('Could not get invite link'); return; }
                              const url = `${window.location.origin}/student/join-class?code=${json.inviteCode}`;
                              await navigator.clipboard.writeText(url);
                              setCopiedInvite(cls.id);
                              toast.success('Invite link copied!');
                              setTimeout(() => setCopiedInvite(null), 2500);
                            } catch { toast.error('Failed to copy link'); }
                          }}
                          className="p-2 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-all"
                          title="Copy invite link"
                        >
                          {copiedInvite === cls.id ? <Check className="w-4 h-4 text-emerald-500" /> : <Link2 className="w-4 h-4" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => openEdit(cls)}
                          className="p-2 rounded-lg text-slate-400 hover:text-violet-600 hover:bg-violet-50 transition-all"
                          title="Edit"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <div className="relative">
                          <button
                            type="button"
                            onClick={() => setActiveMenu(activeMenu === cls.id ? null : cls.id)}
                            className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all"
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
                                    type="button"
                                    onClick={() => handleStatusChange(cls, s)}
                                    className="w-full text-left px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 flex items-center gap-2 capitalize"
                                  >
                                    <span className={`w-2 h-2 rounded-full ${STATUS_CONFIG[s].dot}`} />
                                    Mark as {s}
                                  </button>
                                ))}
                              <div className="border-t border-slate-100 mt-1 pt-1">
                                <button
                                  type="button"
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
                    <div className="mt-4 space-y-3 text-xs border-t border-slate-100 pt-4">
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-slate-400 font-semibold uppercase tracking-wider shrink-0">Course</span>
                        {cls.course ? (
                          <span className="flex items-center gap-1.5 text-slate-700 font-medium text-right">
                            <BookOpen className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                            <span className="truncate">{cls.course.title}</span>
                          </span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </div>
                      <div>
                        <div className="flex items-center justify-between text-slate-600 mb-1">
                          <span className="flex items-center gap-1 font-semibold text-slate-400 uppercase tracking-wider">
                            <Users className="w-3.5 h-3.5" /> Enrollment
                          </span>
                          <span className="font-semibold text-slate-800">{enrolledCount} / {cls.capacity}</span>
                        </div>
                        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className={cn('h-full rounded-full transition-all', capacityPct >= 90 ? 'bg-red-400' : capacityPct >= 60 ? 'bg-amber-400' : 'bg-emerald-400')}
                            style={{ width: `${Math.min(capacityPct, 100)}%` }}
                          />
                        </div>
                      </div>
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-slate-400 font-semibold uppercase tracking-wider shrink-0">Schedule</span>
                        {cls.start_date ? (
                          <span className="text-right text-slate-600">
                            <span className="flex items-center justify-end gap-1 font-medium">
                              <CalendarDays className="w-3.5 h-3.5 text-slate-400" />
                              {formatDate(cls.start_date)}
                            </span>
                            {cls.end_date && <span className="text-slate-400 block">→ {formatDate(cls.end_date)}</span>}
                          </span>
                        ) : (
                          <span className="text-slate-300">No schedule</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </AdminListPageShell>

      {showModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl border border-slate-100 max-h-[90vh] flex flex-col">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-indigo-50 rounded-xl flex items-center justify-center">
                  <School className="w-[18px] h-[18px] text-indigo-600" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">{editing ? 'Edit Class' : 'Create New Class'}</h2>
                  <p className="text-xs text-slate-400 mt-0.5">{editing ? 'Update class details' : 'Set up a new class session'}</p>
                </div>
              </div>
              <button type="button" onClick={() => setShowModal(false)} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="overflow-y-auto">
              <div className="px-6 py-5 space-y-4">
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

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Capacity</label>
                    <input
                      type="number"
                      min={1}
                      max={500}
                      value={form.capacity}
                      onChange={e => setForm({ ...form, capacity: parseInt(e.target.value, 10) || 1 })}
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

              <div className="px-6 py-4 border-t border-slate-100 flex gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2.5 bg-slate-100 text-slate-600 rounded-xl font-semibold text-sm hover:bg-slate-200 transition-all"
                >
                  Cancel
                </button>
                <LoadingButton
                  type="submit"
                  loading={submitting}
                  loadingText={editing ? 'Saving...' : 'Creating...'}
                  fullWidth
                  className="flex-1 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-500/20"
                >
                  {editing ? 'Save Changes' : 'Create Class'}
                </LoadingButton>
              </div>
            </form>
          </div>
        </div>
      )}

      {viewClass && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl border border-slate-100 overflow-hidden">
            <div className={`bg-gradient-to-br ${getAvatar(viewClass.name)} p-6 relative`}>
              <button
                type="button"
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
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-white/20 text-white">
                  <span className="w-1.5 h-1.5 rounded-full bg-white" />
                  {STATUS_CONFIG[viewClass.status].label}
                </span>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                {[
                  { icon: BookOpen, label: 'Course', value: viewClass.course?.title || 'Not assigned', color: 'text-indigo-500', bg: 'bg-indigo-50' },
                  { icon: Users, label: 'Enrolled', value: `${((viewClass.enrollment_count ?? viewClass.student_ids?.length) || 0)} / ${viewClass.capacity}`, color: 'text-emerald-500', bg: 'bg-emerald-50' },
                  { icon: CalendarDays, label: 'Start Date', value: formatDate(viewClass.start_date), color: 'text-amber-500', bg: 'bg-amber-50' },
                  { icon: CalendarDays, label: 'End Date', value: formatDate(viewClass.end_date) || '—', color: 'text-violet-500', bg: 'bg-violet-50' },
                ].map(item => (
                  <div key={item.label} className={`${item.bg} rounded-xl p-3.5`}>
                    <item.icon className={`w-4 h-4 ${item.color} mb-2`} />
                    <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">{item.label}</div>
                    <div className="text-sm font-semibold text-slate-700 mt-0.5 truncate">{item.value}</div>
                  </div>
                ))}
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => { setViewClass(null); openEdit(viewClass); }}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-xl font-semibold text-sm hover:bg-indigo-700 transition-all shadow-md shadow-indigo-200"
                >
                  <Pencil className="w-4 h-4" /> Edit Class
                </button>
                <button
                  type="button"
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

      {activeMenu && (
        <div className="fixed inset-0 z-10" aria-hidden onClick={() => setActiveMenu(null)} />
      )}
    </TeacherLayout>
  );
}
