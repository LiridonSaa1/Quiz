import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../supabase';
import AdminLayout from '../../components/layout/AdminLayout';
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
  Clock, CheckCircle2, AlertCircle, Archive, GraduationCap,
  TrendingUp
} from 'lucide-react';
import { cn } from '../../lib/utils';
import StyledSelect from '../../components/ui/StyledSelect';
import { authFetch } from '../../lib/apiUrl';
import { normalizeClassRow, saveClassRow, selectAllClassesOrdered } from '../../lib/classesTable';
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

const STATUS_CONFIG: Record<ClassStatus, { labelKey: string; bg: string; text: string; dot: string; icon: React.ElementType }> = {
  active:    { labelKey: 'common.active',    bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500', icon: CheckCircle2 },
  upcoming:  { labelKey: 'liveSessions.upcoming',  bg: 'bg-indigo-50',  text: 'text-indigo-700',  dot: 'bg-indigo-500',  icon: Clock        },
  completed: { labelKey: 'dashboard.stats.completed', bg: 'bg-slate-100',  text: 'text-slate-600',   dot: 'bg-slate-400',   icon: Archive      },
  archived:  { labelKey: 'common.archived',  bg: 'bg-amber-50',   text: 'text-amber-700',   dot: 'bg-amber-500',   icon: AlertCircle  },
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
  const { t } = useTranslation();
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
      const [classesRes, coursesRes, teachersHttpRes] = await Promise.all([
        selectAllClassesOrdered(supabase),
        supabase.from('courses').select('id, title').eq('status', 'published'),
        authFetch('/api/admin/teachers'),
      ]);
      if (classesRes.error) throw classesRes.error;

      const teachersJson = await teachersHttpRes.json().catch(() => ({}));
      type Row = { id: string; display_name: string; email: string };
      let teacherRows: Row[] = [];
      if (teachersHttpRes.ok && teachersJson.success && Array.isArray(teachersJson.teachers)) {
        teacherRows = teachersJson.teachers.map((t: Record<string, unknown>) => ({
          id: String(t.uid ?? t.id ?? ''),
          display_name: String((t.displayName as string) ?? (t.display_name as string) ?? ''),
          email: String((t.email as string) ?? ''),
        })).filter((r: Row) => r.id);
      } else {
        const fb = await supabase.from('profiles').select('id, display_name, email').eq('role', 'teacher');
        if (fb.error) throw fb.error;
        teacherRows = (fb.data || []).map((t: any) => ({
          id: String(t.id),
          display_name: String(t.display_name || ''),
          email: String(t.email || ''),
        }));
      }

      const courseMap: Record<string, { title: string }> = {};
      (coursesRes.data || []).forEach((c: any) => { courseMap[c.id] = { title: c.title }; });

      const teacherMap: Record<string, { display_name: string; email: string }> = {};
      teacherRows.forEach((t) => {
        teacherMap[t.id] = { display_name: t.display_name, email: t.email };
      });

      const enriched = (classesRes.data || []).map((cls: Record<string, unknown>) => {
        const row = normalizeClassRow(cls) as ClassRecord;
        return {
          ...row,
          course: row.course_id ? (courseMap[String(row.course_id)] || null) : null,
          teacher: row.teacher_id
            ? (teacherMap[String(row.teacher_id)]
                ? { display_name: teacherMap[String(row.teacher_id)].display_name, email: teacherMap[String(row.teacher_id)].email }
                : null)
            : null,
        };
      });

      setClasses(enriched);
      setCourses(coursesRes.data || []);
      setTeachers(teacherRows.map(t => ({
        id: t.id,
        displayName: t.display_name || t.email || 'Teacher',
        email: t.email,
      })));
    } catch (err: any) {
      toast.error(t('errors.loadFailed') + ': ' + err.message);
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
      capacity: cls.capacity ?? 30,
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
        const { error } = await saveClassRow(supabase, { mode: 'update', id: editingClass.id, payload });
        if (error) throw error;
        toast.success(t('success.updated'));
      } else {
        payload.student_ids = [];
        const { error } = await saveClassRow(supabase, { mode: 'insert', payload });
        if (error) throw error;
        toast.success(t('success.created'));
      }
      setShowModal(false);
      fetchAll();
    } catch (err: any) {
      toast.error(err.message || t('errors.saveFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (cls: ClassRecord) => {
    if (!confirm(t('dashboard.deleteClassConfirm', { name: cls.name }))) return;
    try {
      const { error } = await supabase.from('classes').delete().eq('id', cls.id);
      if (error) throw error;
      toast.success(t('success.deleted'));
      fetchAll();
    } catch (err: any) {
      toast.error(err.message || t('errors.deleteFailed'));
    }
    setActiveMenu(null);
  };

  const handleStatusChange = async (cls: ClassRecord, status: ClassStatus) => {
    try {
      const { error } = await supabase.from('classes').update({ status }).eq('id', cls.id);
      if (error) throw error;
      toast.success(t('dashboard.statusUpdated'));
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
    d ? new Date(d).toLocaleDateString(t('language.code') === 'sq' ? 'sq-AL' : 'en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

  const statItems = [
    { label: t('dashboard.totalClasses'), value: stats.total, gradient: 'from-indigo-500 to-indigo-600', shadow: 'shadow-indigo-500/25', icon: School },
    { label: t('dashboard.activeNow'), value: stats.active, gradient: 'from-emerald-500 to-emerald-600', shadow: 'shadow-emerald-500/25', icon: CheckCircle2 },
    { label: t('dashboard.totalStudents'), value: stats.students, gradient: 'from-violet-500 to-violet-600', shadow: 'shadow-violet-500/25', icon: Users },
    { label: t('dashboard.stats.completed'), value: stats.completed, gradient: 'from-amber-500 to-amber-600', shadow: 'shadow-amber-500/25', icon: TrendingUp },
  ];

  return (
    <AdminLayout>
      <AdminListPageShell
        breadcrumbLabel={t('nav.classes')}
        title={t('nav.classes')}
        description={t('dashboard.manageClasses')}
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
            {t('dashboard.newClass')}
          </motion.button>
        }
        stats={statItems}
        filterBar={
          <AdminListFilterBar>
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-indigo-400" />
              <input
                type="text"
                placeholder={t('dashboard.searchClasses')}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className={ADMIN_LIST_SEARCH_INPUT}
              />
            </div>
            <StyledSelect
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as any)}
              icon={<Filter className="w-3.5 h-3.5 text-indigo-400" />}
              className="rounded-full border-indigo-100 bg-white/80 py-2.5 shadow-sm focus:ring-2 focus:ring-violet-400 focus:border-transparent min-w-[160px]"
              wrapperClassName="min-w-[160px]"
            >
              <option value="all">{t('dashboard.allStatuses')}</option>
              <option value="active">{t('common.active')}</option>
              <option value="upcoming">{t('liveSessions.upcoming')}</option>
              <option value="completed">{t('dashboard.stats.completed')}</option>
              <option value="archived">{t('common.archived')}</option>
            </StyledSelect>
          </AdminListFilterBar>
        }
      >
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <h2 className="text-base font-bold text-slate-900">{t('nav.classes')}</h2>
            <p className="text-xs text-slate-400 mt-0.5">{t('dashboard.showingXofY', { count: filtered.length, total: classes.length, items: t('dashboard.items.classes') })}</p>
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
              <p className="text-slate-500 text-sm font-semibold">{t('classes.noClasses')}</p>
              <p className="text-slate-400 text-xs mt-1">
                {searchQuery || statusFilter !== 'all' ? t('dashboard.adjustSearch') : t('dashboard.createFirstClass')}
              </p>
              {!searchQuery && statusFilter === 'all' && (
                <button
                  type="button"
                  onClick={openCreate}
                  className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-all shadow-sm"
                >
                  <Plus className="w-3.5 h-3.5" /> {t('dashboard.newClass')}
                </button>
              )}
            </div>
          ) : (
            <div className={ADMIN_LIST_CARD_GRID}>
              {filtered.map(cls => {
                const sc = STATUS_CONFIG[cls.status];
                const enrolledCount = cls.student_ids?.length || 0;
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
                            {t(sc.labelKey)}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-0.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => setViewClass(cls)}
                          className="p-2 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all"
                          title={t('dashboard.classDetails')}
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => openEdit(cls)}
                          className="p-2 rounded-lg text-slate-400 hover:text-violet-600 hover:bg-violet-50 transition-all"
                          title={t('common.edit')}
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
                                    {t('dashboard.markAs', { status: t(STATUS_CONFIG[s].labelKey) })}
                                  </button>
                                ))}
                              <div className="border-t border-slate-100 mt-1 pt-1">
                                <button
                                  type="button"
                                  onClick={() => handleDelete(cls)}
                                  className="w-full text-left px-4 py-2 text-sm text-red-500 hover:bg-red-50 flex items-center gap-2"
                                >
                                  <Trash2 className="w-4 h-4" />
                                  {t('common.delete')}
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="mt-4 space-y-3 text-xs border-t border-slate-100 pt-4">
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-slate-400 font-semibold uppercase tracking-wider shrink-0">{t('courses.courseTitle')}</span>
                        {cls.course ? (
                          <span className="flex items-center gap-1.5 text-slate-700 font-medium text-right">
                            <BookOpen className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                            <span className="truncate">{cls.course.title}</span>
                          </span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </div>
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-slate-400 font-semibold uppercase tracking-wider shrink-0">{t('dashboard.tableHeaders.teacher')}</span>
                        {cls.teacher ? (
                          <span className="flex items-center gap-1.5 text-slate-700 font-medium text-right">
                            <GraduationCap className="w-3.5 h-3.5 text-violet-500 shrink-0" />
                            <span className="truncate">{cls.teacher.display_name}</span>
                          </span>
                        ) : (
                          <span className="text-slate-400">{t('dashboard.unassigned')}</span>
                        )}
                      </div>
                      <div>
                        <div className="flex items-center justify-between text-slate-600 mb-1">
                          <span className="flex items-center gap-1 font-semibold text-slate-400 uppercase tracking-wider">
                            <Users className="w-3.5 h-3.5" /> {t('dashboard.enrollment')}
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
                        <span className="text-slate-400 font-semibold uppercase tracking-wider shrink-0">{t('dashboard.schedule')}</span>
                        {cls.start_date ? (
                          <span className="text-right text-slate-600">
                            <span className="flex items-center justify-end gap-1 font-medium">
                              <CalendarDays className="w-3.5 h-3.5 text-slate-400" />
                              {formatDate(cls.start_date)}
                            </span>
                            {cls.end_date && <span className="text-slate-400 block">→ {formatDate(cls.end_date)}</span>}
                          </span>
                        ) : (
                          <span className="text-slate-300">{t('dashboard.noSchedule')}</span>
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
                  <h2 className="text-base font-bold text-slate-900">{editingClass ? t('dashboard.editClass') : t('dashboard.newClass')}</h2>
                  <p className="text-xs text-slate-400 mt-0.5">{editingClass ? t('dashboard.updateClassDetails') : t('dashboard.setupNewClass')}</p>
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
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">{t('classes.className')} <span className="text-red-400">*</span></label>
                  <input
                    required
                    type="text"
                    value={form.name}
                    onChange={e => setForm({ ...form, name: e.target.value })}
                    placeholder={t('classes.classNamePlaceholder')}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-all"
                  />
                </div>

                {/* Description */}
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">{t('classes.description')}</label>
                  <textarea
                    rows={2}
                    value={form.description}
                    onChange={e => setForm({ ...form, description: e.target.value })}
                    placeholder={t('classes.descriptionPlaceholder')}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-all resize-none"
                  />
                </div>

                {/* Course + Teacher */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">{t('classes.course')}</label>
                    <StyledSelect
                      value={form.course_id}
                      onChange={e => setForm({ ...form, course_id: e.target.value })}
                      wrapperClassName="w-full"
                    >
                      <option value="">{t('classes.none')}</option>
                      {courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                    </StyledSelect>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">{t('classes.teacher')}</label>
                    <StyledSelect
                      value={form.teacher_id}
                      onChange={e => setForm({ ...form, teacher_id: e.target.value })}
                      wrapperClassName="w-full"
                    >
                      <option value="">{t('classes.unassigned')}</option>
                      {teachers.map(t => <option key={t.id} value={t.id}>{t.displayName}</option>)}
                    </StyledSelect>
                  </div>
                </div>

                {/* Start / End date */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">{t('classes.startDate')}</label>
                    <input
                      type="date"
                      value={form.start_date}
                      onChange={e => setForm({ ...form, start_date: e.target.value })}
                      className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">{t('classes.endDate')}</label>
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
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">{t('classes.capacity')}</label>
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
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">{t('classes.status')}</label>
                    <StyledSelect
                      value={form.status}
                      onChange={e => setForm({ ...form, status: e.target.value as ClassStatus })}
                      wrapperClassName="w-full"
                    >
                      <option value="upcoming">{t('classes.upcoming')}</option>
                      <option value="active">{t('classes.active')}</option>
                      <option value="completed">{t('classes.completed')}</option>
                      <option value="archived">{t('classes.archived')}</option>
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
                  {t('classes.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 px-4 py-2.5 bg-indigo-600 text-white rounded-xl font-semibold text-sm hover:bg-indigo-700 transition-all disabled:opacity-50 shadow-lg shadow-indigo-500/20"
                >
                  {submitting ? t('classes.saving') : editingClass ? t('classes.save') : t('classes.createClass')}
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
                  {t(STATUS_CONFIG[viewClass.status].labelKey)}
                </span>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                {[
                  { icon: BookOpen, labelKey: 'classes.course', value: viewClass.course?.title || t('classes.notAssigned'), color: 'text-indigo-500', bg: 'bg-indigo-50' },
                  { icon: GraduationCap, labelKey: 'classes.teacher', value: viewClass.teacher?.display_name || t('classes.unassigned'), color: 'text-violet-500', bg: 'bg-violet-50' },
                  { icon: Users, labelKey: 'classes.enrolledLabel', value: `${viewClass.student_ids?.length || 0} / ${viewClass.capacity}`, color: 'text-emerald-500', bg: 'bg-emerald-50' },
                  { icon: CalendarDays, labelKey: 'classes.startDateLabel', value: formatDate(viewClass.start_date), color: 'text-amber-500', bg: 'bg-amber-50' },
                ].map(item => (
                  <div key={item.labelKey} className={`${item.bg} rounded-xl p-3.5`}>
                    <item.icon className={`w-4 h-4 ${item.color} mb-2`} />
                    <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">{t(item.labelKey)}</div>
                    <div className="text-sm font-semibold text-slate-700 mt-0.5 truncate">{item.value}</div>
                  </div>
                ))}
              </div>
              {viewClass.end_date && (
                <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-50 rounded-xl px-4 py-3">
                  <CalendarDays className="w-4 h-4 text-slate-400 shrink-0" />
                  <span>{t('classes.endsOn')} <strong className="text-slate-700">{formatDate(viewClass.end_date)}</strong></span>
                </div>
              )}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => { setViewClass(null); openEdit(viewClass); }}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-xl font-semibold text-sm hover:bg-indigo-700 transition-all shadow-md shadow-indigo-200"
                >
                  <Pencil className="w-4 h-4" /> {t('classes.editButton')}
                </button>
                <button
                  onClick={() => setViewClass(null)}
                  className="px-4 py-2.5 bg-slate-100 text-slate-600 rounded-xl font-semibold text-sm hover:bg-slate-200 transition-all"
                >
                  {t('classes.close')}
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
