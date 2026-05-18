import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../supabase';
import { authFetch, readApiError } from '../../lib/apiUrl';
import LoadingButton from '../../components/ui/LoadingButton';
import { resolveTeacherIdCandidates } from '../../lib/teacherScope';
import TeacherLayout from '../../components/layout/TeacherLayout';
import {
  Plus, Search, PlayCircle, Trash2, Edit2, X, Save,
  BookOpen, Layers, Video, FileText, HelpCircle, Clock,
  Lock, Unlock, ChevronRight, Calendar, AlertTriangle
} from 'lucide-react';
import { toast } from 'sonner';
import { Lesson } from '../../types';
import { cn } from '../../lib/utils';
import { motion, AnimatePresence, useMotionValue, useSpring, useTransform } from 'motion/react';
import { useTeacherPermissions } from '../../lib/teacherPermissions';
import { Link } from 'react-router-dom';

function AnimatedCount({ value }: { value: number }) {
  const motionVal = useMotionValue(0);
  const spring = useSpring(motionVal, { stiffness: 120, damping: 20 });
  const display = useTransform(spring, (v) => Math.round(v).toString());
  useEffect(() => { motionVal.set(value); }, [value, motionVal]);
  return <motion.span>{display}</motion.span>;
}

function EmptyIllustration() {
  return (
    <svg width="140" height="120" viewBox="0 0 140 120" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect x="20" y="75" width="100" height="35" rx="8" fill="#e0e7ff" />
      <rect x="30" y="55" width="80" height="30" rx="8" fill="#c7d2fe" />
      <rect x="40" y="35" width="60" height="30" rx="8" fill="#a5b4fc" />
      <rect x="50" y="15" width="40" height="30" rx="8" fill="#818cf8" />
      <circle cx="70" cy="30" r="8" fill="#6366f1" />
      <path d="M66 30 L70 25 L74 30" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M70 25 L70 35" stroke="white" strokeWidth="2" strokeLinecap="round" />
      <rect x="58" y="60" width="24" height="3" rx="1.5" fill="#818cf8" opacity="0.5" />
      <rect x="54" y="80" width="32" height="3" rx="1.5" fill="#c7d2fe" opacity="0.5" />
    </svg>
  );
}

const slugify = (text: string) =>
  text.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').trim();

const LESSON_TYPES = [
  { value: 'video', label: 'Video', icon: Video, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-100', accentGradient: 'linear-gradient(90deg,#3b82f6,#60a5fa)' },
  { value: 'text', label: 'Text', icon: FileText, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-100', accentGradient: 'linear-gradient(90deg,#f59e0b,#fbbf24)' },
  { value: 'quiz', label: 'Quiz', icon: HelpCircle, color: 'text-violet-600', bg: 'bg-violet-50', border: 'border-violet-100', accentGradient: 'linear-gradient(90deg,#7c3aed,#a78bfa)' },
];

const getLessonType = (type: string) =>
  LESSON_TYPES.find(t => t.value === type) || LESSON_TYPES[0];

const STAT_CONFIG = [
  { label: 'Total Lessons', gradient: 'from-indigo-500 to-indigo-600', iconBg: 'bg-white/20', shadow: 'shadow-indigo-500/25', icon: PlayCircle },
  { label: 'Video', gradient: 'from-blue-500 to-blue-600', iconBg: 'bg-white/20', shadow: 'shadow-blue-500/25', icon: Video },
  { label: 'Text', gradient: 'from-amber-500 to-amber-600', iconBg: 'bg-white/20', shadow: 'shadow-amber-500/25', icon: FileText },
  { label: 'Quiz', gradient: 'from-violet-500 to-violet-600', iconBg: 'bg-white/20', shadow: 'shadow-violet-500/25', icon: HelpCircle },
];

const emptyForm = {
  title: '',
  shortDescription: '',
  type: 'video' as Lesson['type'],
  durationMinutes: 10,
  order: 1,
  status: 'published',
  isFreePreview: false,
  autoPublish: false,
  publishAt: '',
};

export default function TeacherLessons() {
  const { t } = useTranslation();
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [courses, setCourses] = useState<any[]>([]);
  const [modules, setModules] = useState<any[]>([]);
  const [classes, setClasses] = useState<Array<{ id: string; name: string; course_id: string | null }>>([]);
  const [userId, setUserId] = useState('');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [courseFilter, setCourseFilter] = useState('all');
  const [classFilter, setClassFilter] = useState('all');
  const [moduleFilter, setModuleFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Lesson | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [formCourseId, setFormCourseId] = useState('');
  const [formModuleId, setFormModuleId] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Lesson | null>(null);
  const [deleting, setDeleting] = useState(false);
  const { can } = useTeacherPermissions();

  const fetchData = async () => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    setUserId(session.user.id);
    try {
      let courseList: any[] = [];
      let classRows: Array<{ id: string; name: string; course_id: string | null }> = [];
      const backendRes = await authFetch(`/api/teacher/courses?userId=${encodeURIComponent(session.user.id)}`);
      if (backendRes.ok) {
        const backendJson = await backendRes.json();
        if (backendJson?.success && Array.isArray(backendJson.courses)) {
          courseList = backendJson.courses.map((c: any) => ({ id: c.id, title: c.title || c.name || '' }));
        }
      }
      if (courseList.length === 0) {
        const scopedIds = await resolveTeacherIdCandidates(session.user.id);
        const { data: coursesData, error: coursesError } = await supabase
          .from('courses').select('id, title').in('teacher_id', scopedIds).order('created_at', { ascending: false });
        if (coursesError && (coursesError as any).code !== 'PGRST116') throw coursesError;
        courseList = coursesData || [];
      }
      setCourses(courseList);

      const classesRes = await authFetch(`/api/teacher/classes?userId=${encodeURIComponent(session.user.id)}`);
      if (classesRes.ok) {
        const classesJson = await classesRes.json();
        if (classesJson?.success && Array.isArray(classesJson.classes)) {
          classRows = classesJson.classes.map((c: any) => ({
            id: String(c.id),
            name: String(c.name || 'Untitled class'),
            course_id: c.course_id ? String(c.course_id) : null,
          }));
        }
      }
      setClasses(classRows.filter((c) => !!c.course_id && courseList.some((co: any) => co.id === c.course_id)));

      if (courseList.length === 0) {
        setModules([]);
        setLessons([]);
        return;
      }

      const courseIds = courseList.map((c: any) => c.id);

      let modulesData: any[] | null = null;
      const modulesApiRes = await authFetch(`/api/teacher/modules?userId=${encodeURIComponent(session.user.id)}`);
      if (modulesApiRes.ok) {
        const modulesJson = await modulesApiRes.json();
        if (modulesJson?.success && Array.isArray(modulesJson.modules)) {
          modulesData = modulesJson.modules.filter((m: any) => courseIds.includes(m.course_id));
        }
      }
      if (modulesData === null) {
        const modulesSnap = await supabase.from('modules').select('id, course_id, title').in('course_id', courseIds).order('order');
        if (modulesSnap.error) throw modulesSnap.error;
        modulesData = modulesSnap.data || [];
      }

      let lessonsData: any[] = [];
      const lessonsApiRes = await authFetch(`/api/teacher/lessons?userId=${encodeURIComponent(session.user.id)}`);
      if (lessonsApiRes.ok) {
        const lessonsJson = await lessonsApiRes.json();
        if (lessonsJson?.success && Array.isArray(lessonsJson.lessons)) {
          lessonsData = lessonsJson.lessons.filter((l: any) => courseIds.includes(l.course_id));
        }
      } else {
        const lessonsSnap = await supabase.from('lessons').select('*').in('course_id', courseIds).order('order', { ascending: true });
        if (!lessonsSnap.error) lessonsData = lessonsSnap.data || [];
      }

      setModules(modulesData);
      setLessons(lessonsData.map((l: any) => ({
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
        publishAt: (l.publish_at as string | null | undefined) ?? null,
        createdAt: l.created_at,
        updatedAt: l.updated_at,
      })));
    } catch {
      toast.error(t('lessons.failedToLoadLessons'));
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

  const openEdit = (lesson: any) => {
    setEditing(lesson);
    setFormCourseId(lesson.courseId);
    setFormModuleId(lesson.moduleId);
    const hasPublishAt = !!lesson.publishAt;
    const publishAtLocal = lesson.publishAt
      ? new Date(lesson.publishAt).toISOString().slice(0, 16)
      : '';
    setForm({
      title: lesson.title,
      shortDescription: lesson.shortDescription || '',
      type: lesson.type,
      durationMinutes: lesson.durationMinutes,
      order: lesson.order,
      status: lesson.status,
      isFreePreview: lesson.isFreePreview,
      autoPublish: hasPublishAt,
      publishAt: publishAtLocal,
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
    if (!form.title.trim()) { toast.error(t('lessons.titleRequired')); return; }
    if (!formCourseId) { toast.error(t('lessons.selectCourse')); return; }
    if (!formModuleId) { toast.error(t('lessons.selectModule')); return; }
    if (form.autoPublish && !form.publishAt) { toast.error(t('lessons.selectPublishDateTime')); return; }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        userId,
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
        ...(form.autoPublish && form.publishAt
          ? { publish_at: new Date(form.publishAt).toISOString() }
          : { publish_at: null }),
      };

      if (editing) {
        const res = await authFetch(`/api/teacher/lessons/${editing.id}?userId=${encodeURIComponent(userId)}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(await readApiError(res));
        toast.success(t('lessons.lessonUpdated'));
      } else {
        const res = await authFetch('/api/teacher/lessons', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(await readApiError(res));
        toast.success(t('lessons.lessonCreated'));
      }
      closeModal();
      fetchData();
    } catch (err: any) {
      toast.error(err.message || t('lessons.failedToSaveLesson'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (lesson: Lesson) => {
    setDeleteTarget(lesson);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await authFetch(`/api/teacher/lessons/${deleteTarget.id}?userId=${encodeURIComponent(userId)}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(await readApiError(res));
      toast.success(t('lessons.lessonDeleted'));
      setDeleteTarget(null);
      fetchData();
    } catch (err: any) {
      toast.error(err.message || t('lessons.failedToDeleteLesson'));
    } finally {
      setDeleting(false);
    }
  };

  const handleToggleStatus = async (lesson: Lesson) => {
    const newStatus = lesson.status === 'published' ? 'draft' : 'published';
    try {
      const res = await authFetch(`/api/teacher/lessons/${lesson.id}?userId=${encodeURIComponent(userId)}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error(await readApiError(res));
      toast.success(newStatus === 'published' ? t('lessons.lessonPublished') : t('lessons.lessonSetToDraft'));
      fetchData();
    } catch (err: any) { toast.error(err.message || t('lessons.failedToUpdateStatus')); }
  };

  const handleToggleFreePreview = async (lesson: Lesson) => {
    try {
      const res = await authFetch(`/api/teacher/lessons/${lesson.id}?userId=${encodeURIComponent(userId)}`, {
        method: 'PATCH',
        body: JSON.stringify({ is_free_preview: !lesson.isFreePreview }),
      });
      if (!res.ok) throw new Error(await readApiError(res));
      toast.success(lesson.isFreePreview ? t('lessons.freePreviewRemoved') : t('lessons.setAsFreePreview'));
      fetchData();
    } catch (err: any) { toast.error(err.message || t('lessons.failedToUpdateStatus')); }
  };

  const getModuleName = (id: string) =>
    modules.find(m => m.id === id)?.title || 'Unknown';

  const filtered = lessons.filter(l => {
    const matchSearch = l.title.toLowerCase().includes(search.toLowerCase()) ||
      (l.shortDescription || '').toLowerCase().includes(search.toLowerCase());
    const matchCourse = courseFilter === 'all' || l.courseId === courseFilter;
    const selectedClass = classes.find((c) => c.id === classFilter);
    const matchClass = classFilter === 'all' || (selectedClass?.course_id ? l.courseId === selectedClass.course_id : false);
    const matchModule = moduleFilter === 'all' || l.moduleId === moduleFilter;
    const matchType = typeFilter === 'all' || l.type === typeFilter;
    return matchSearch && matchCourse && matchClass && matchModule && matchType;
  });

  const stats = [
    { ...STAT_CONFIG[0], value: lessons.length },
    { ...STAT_CONFIG[1], value: lessons.filter(l => l.type === 'video').length },
    { ...STAT_CONFIG[2], value: lessons.filter(l => l.type === 'text').length },
    { ...STAT_CONFIG[3], value: lessons.filter(l => l.type === 'quiz').length },
  ];

  const hasActiveFilters = search || courseFilter !== 'all' || classFilter !== 'all' || moduleFilter !== 'all' || typeFilter !== 'all';

  return (
    <TeacherLayout>
      <div
        className="min-h-screen -mx-4 sm:-mx-6 lg:-mx-8 -mt-7"
        style={{ fontFamily: "'Inter', 'Poppins', system-ui, sans-serif" }}
      >
        <div className="relative overflow-hidden">
          <div className="pointer-events-none absolute -top-24 -left-24 w-96 h-96 rounded-full bg-indigo-200/30 blur-3xl" />
          <div className="pointer-events-none absolute -top-12 right-0 w-80 h-80 rounded-full bg-violet-200/25 blur-3xl" />
          <div className="pointer-events-none absolute top-96 left-1/2 w-72 h-72 rounded-full bg-indigo-100/20 blur-3xl" />

          {/* Hero Header */}
          <div className="relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #312e81 0%, #4f46e5 40%, #7c3aed 80%, #6d28d9 100%)' }}>
            <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
            <div className="pointer-events-none absolute -top-16 right-1/4 w-64 h-64 rounded-full bg-violet-400/20 blur-3xl" />
            <div className="relative px-6 sm:px-8 lg:px-10 py-10">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
                <div>
                  <nav className="flex items-center gap-1.5 text-xs font-semibold mb-3" aria-label="Breadcrumb">
                    <span className="text-indigo-400 tracking-wider uppercase">{t('lessons.teacherPortal')}</span>
                    <ChevronRight className="w-3.5 h-3.5 text-indigo-500/50" />
                    <span className="text-indigo-200 tracking-wider uppercase">{t('lessons.title')}</span>
                  </nav>
                  <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight leading-tight">{t('lessons.title')}</h1>
                  <p className="text-indigo-200 text-sm mt-2 max-w-md">
                    {t('lessons.createManageContent')}
                  </p>
                </div>
                {can('actions.teacher.lessons.manage') && (
                  <motion.button
                    onClick={openCreate}
                    disabled={courses.length === 0}
                    whileHover={{ scale: 1.04, y: -2 }}
                    whileTap={{ scale: 0.97 }}
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl font-bold text-sm text-white shrink-0 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    style={{ background: 'linear-gradient(135deg, #818cf8 0%, #a78bfa 100%)', boxShadow: '0 8px 32px rgba(139,92,246,0.45), 0 2px 8px rgba(0,0,0,0.15)' }}
                  >
                    <Plus className="w-4 h-4" />
                    {t('lessons.newLesson')}
                  </motion.button>
                )}
              </div>
            </div>
          </div>

          {/* Main Content */}
          <div className="px-6 sm:px-8 lg:px-10 py-8 space-y-8 bg-slate-50">

            {!loading && courses.length === 0 && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="bg-amber-50 border border-amber-200 rounded-2xl p-5 flex items-start gap-3">
                <BookOpen className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-amber-800">{t('lessons.noCoursesFound')}</p>
                  <p className="text-xs text-amber-600 mt-0.5">{t('lessons.needCourseModule')}</p>
                </div>
              </motion.div>
            )}

            {/* Stats */}
            <motion.div className="grid grid-cols-2 lg:grid-cols-4 gap-4" initial="hidden" animate="visible" variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.08 } } }}>
              {stats.map((stat) => {
                const Icon = stat.icon;
                return (
                  <motion.div
                    key={stat.label}
                    variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' } } }}
                    className={cn('relative overflow-hidden rounded-2xl p-5 text-white shadow-lg', `bg-gradient-to-br ${stat.gradient}`, stat.shadow)}
                    style={{ boxShadow: `0 8px 24px var(--tw-shadow-color, rgba(0,0,0,0.12))` }}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="text-3xl font-extrabold tracking-tight"><AnimatedCount value={stat.value} /></div>
                        <div className="text-xs font-semibold text-white/75 mt-1">{stat.label}</div>
                      </div>
                      <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center', stat.iconBg)}>
                        <Icon className="w-5 h-5 text-white" />
                      </div>
                    </div>
                    <div className="pointer-events-none absolute -bottom-4 -right-4 w-20 h-20 rounded-full bg-white/10" />
                  </motion.div>
                );
              })}
            </motion.div>

            {/* Filter Bar */}
            <motion.div
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.4 }}
              className="rounded-2xl border border-white/60 shadow-sm p-4 flex flex-wrap gap-3 items-center"
              style={{ background: 'rgba(255,255,255,0.75)', backdropFilter: 'blur(12px)' }}
            >
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mr-1">{t('lessons.filters')}</p>
              <div className="relative flex-1 min-w-[180px]">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-indigo-400" />
                <input
                  type="text" placeholder={t('lessons.searchLessons')} value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full pl-11 pr-4 py-2.5 rounded-full text-sm border border-indigo-100 bg-white/80 focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent transition-all shadow-sm placeholder-slate-400"
                />
              </div>
              <select value={courseFilter} onChange={e => { setCourseFilter(e.target.value); setClassFilter('all'); setModuleFilter('all'); }}
                className="px-4 py-2.5 rounded-full text-sm border border-indigo-100 bg-white/80 focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent transition-all shadow-sm text-slate-700">
                <option value="all">{t('lessons.allCourses')}</option>
                {courses.map(c => <option key={c.id} value={c.id}>{c.name || c.title}</option>)}
              </select>
              {classes.length > 0 && (
                <select value={classFilter} onChange={e => { setClassFilter(e.target.value); setModuleFilter('all'); }}
                  className="px-4 py-2.5 rounded-full text-sm border border-indigo-100 bg-white/80 focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent transition-all shadow-sm text-slate-700">
                  <option value="all">{t('lessons.allClasses')}</option>
                  {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              )}
              <select value={moduleFilter} onChange={e => setModuleFilter(e.target.value)}
                className="px-4 py-2.5 rounded-full text-sm border border-indigo-100 bg-white/80 focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent transition-all shadow-sm text-slate-700">
                <option value="all">{t('lessons.allModules')}</option>
                {(classFilter !== 'all'
                  ? (() => { const sc = classes.find(c => c.id === classFilter); return sc?.course_id ? modules.filter(m => m.course_id === sc.course_id) : []; })()
                  : courseFilter !== 'all' ? modules.filter(m => m.course_id === courseFilter) : modules
                ).map(m => <option key={m.id} value={m.id}>{m.title}</option>)}
              </select>
              <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
                className="px-4 py-2.5 rounded-full text-sm border border-indigo-100 bg-white/80 focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent transition-all shadow-sm text-slate-700">
                <option value="all">{t('lessons.allTypes')}</option>
                {LESSON_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              {hasActiveFilters && (
                <button onClick={() => { setSearch(''); setCourseFilter('all'); setClassFilter('all'); setModuleFilter('all'); setTypeFilter('all'); }}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-semibold text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-all">
                  <X className="w-3.5 h-3.5" /> Clear
                </button>
              )}
            </motion.div>

            {/* Lessons Grid */}
            {loading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                {Array(6).fill(0).map((_, i) => <div key={i} className="bg-white rounded-2xl border border-slate-100 h-52 animate-pulse" />)}
              </div>
            ) : filtered.length === 0 ? (
              <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.4 }}
                className="py-20 flex flex-col items-center justify-center bg-white rounded-2xl border border-dashed border-indigo-200 shadow-sm">
                <EmptyIllustration />
                <h3 className="text-xl font-extrabold text-slate-800 mt-6 mb-2">{hasActiveFilters ? 'No results found' : 'No lessons yet'}</h3>
                <p className="text-slate-400 text-sm mb-8 max-w-xs text-center">
                  {hasActiveFilters ? "Try adjusting your search or filters." : 'Create your first lesson to start building content inside your modules.'}
                </p>
                {courses.length > 0 && !hasActiveFilters && can('actions.teacher.lessons.manage') && (
                  <motion.button onClick={openCreate} whileHover={{ scale: 1.04, y: -2 }} whileTap={{ scale: 0.97 }}
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl font-bold text-sm text-white"
                    style={{ background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)', boxShadow: '0 8px 24px rgba(99,102,241,0.35)' }}>
                    <Plus className="w-4 h-4" /> Create Your First Lesson
                  </motion.button>
                )}
              </motion.div>
            ) : (
              <motion.div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5"
                initial="hidden" animate="visible" variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.07 } } }}>
                {filtered.map((lesson) => {
                  const lt = getLessonType(lesson.type);
                  const isPublished = lesson.status === 'published';
                  return (
                    <motion.div key={lesson.id}
                      variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: 'easeOut' } } }}
                      whileHover={{ y: -4, boxShadow: '0 20px 48px rgba(99,102,241,0.15)' }}
                      className="group relative bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden flex flex-col transition-all duration-200">
                      <div className="h-1.5 w-full" style={{ background: lt.accentGradient }} />
                      <div className="p-5 flex flex-col flex-1">
                        <div className="flex items-start justify-between mb-3">
                          <div className={cn('w-11 h-11 rounded-xl flex items-center justify-center shrink-0', lt.bg)}>
                            <lt.icon className={cn('w-5 h-5', lt.color)} />
                          </div>
                          {can('actions.teacher.lessons.manage') && (
                            <button onClick={() => handleToggleStatus(lesson)}
                              className={cn('inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full transition-all',
                                isPublished ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : 'bg-amber-50 text-amber-700 hover:bg-amber-100')}>
                              <span className={cn('w-1.5 h-1.5 rounded-full', isPublished ? 'bg-emerald-500' : 'bg-amber-500')} />
                              {isPublished ? 'Published' : 'Draft'}
                            </button>
                          )}
                        </div>
                        <h3 className="text-sm font-bold text-slate-900 line-clamp-2 mb-1 leading-snug">{lesson.title}</h3>
                        {lesson.shortDescription && <p className="text-xs text-slate-400 line-clamp-2 mb-2">{lesson.shortDescription}</p>}
                        <div className="mt-auto space-y-2 pt-3 border-t border-slate-50">
                          <div className="flex items-center justify-between">
                            <span className="inline-flex items-center gap-1.5 px-2 py-1 bg-slate-100 text-slate-600 rounded-lg text-[11px] font-medium max-w-[130px] truncate">
                              <Layers className="w-3 h-3 shrink-0" />
                              <span className="truncate">{getModuleName(lesson.moduleId)}</span>
                            </span>
                            <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                              <Clock className="w-3.5 h-3.5 text-slate-300" />
                              {lesson.durationMinutes} min
                            </span>
                          </div>
                          <div className="flex items-center gap-1">
                            {can('actions.teacher.lessons.manage') && (
                              <button onClick={() => handleToggleFreePreview(lesson)}
                                title={lesson.isFreePreview ? 'Remove free preview' : 'Set as free preview'}
                                className={cn('inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full transition-all',
                                  lesson.isFreePreview ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : 'bg-slate-100 text-slate-400 hover:bg-slate-200')}>
                                {lesson.isFreePreview ? <Unlock className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                                {lesson.isFreePreview ? 'Free Preview' : 'Locked'}
                              </button>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 pt-3 sm:opacity-0 sm:group-hover:opacity-100 opacity-100 transition-all duration-200 sm:translate-y-1 sm:group-hover:translate-y-0">
                          <Link to={`/teacher/lessons/${encodeURIComponent(lesson.id)}/content`}
                            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-all">
                            Manage Content
                          </Link>
                          {can('actions.teacher.lessons.manage') && (
                            <button onClick={() => openEdit(lesson)}
                              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 transition-all">
                              <Edit2 className="w-3.5 h-3.5" /> Edit
                            </button>
                          )}
                          {can('actions.teacher.lessons.manage') && (
                            <button onClick={() => handleDelete(lesson)}
                              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold text-red-500 bg-red-50 hover:bg-red-100 transition-all">
                              <Trash2 className="w-3.5 h-3.5" /> Delete
                            </button>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </motion.div>
            )}
          </div>
        </div>
      </div>

      {/* Edit/Create Modal */}
      <AnimatePresence>
        {showModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 16 }} transition={{ type: 'spring', duration: 0.4 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">

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

                {/* Course + Module */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">Course <span className="text-red-500">*</span></label>
                    <select value={formCourseId} onChange={e => handleCourseChange(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 transition-all">
                      <option value="">Select course...</option>
                      {courses.map(c => <option key={c.id} value={c.id}>{c.name || c.title}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">Module <span className="text-red-500">*</span></label>
                    <select value={formModuleId} onChange={e => setFormModuleId(e.target.value)} disabled={!formCourseId}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 transition-all">
                      <option value="">Select module...</option>
                      {modulesForCourse(formCourseId).map(m => <option key={m.id} value={m.id}>{m.title}</option>)}
                    </select>
                  </div>
                </div>

                {/* Title */}
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Title <span className="text-red-500">*</span></label>
                  <input type="text" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                    placeholder="e.g. Introduction to useState"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 transition-all" />
                  {form.title && <p className="text-[10px] text-slate-400 mt-1">Slug: <span className="font-mono">{slugify(form.title)}</span></p>}
                </div>

                {/* Short Description */}
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Short Description</label>
                  <textarea rows={2} value={form.shortDescription} onChange={e => setForm(f => ({ ...f, shortDescription: e.target.value }))}
                    placeholder="Brief summary of this lesson..."
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 transition-all resize-none" />
                </div>

                {/* Type selector */}
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Lesson Type <span className="text-red-500">*</span></label>
                  <div className="grid grid-cols-3 gap-2">
                    {LESSON_TYPES.map(t => (
                      <button key={t.value} type="button" onClick={() => setForm(f => ({ ...f, type: t.value as Lesson['type'] }))}
                        className={cn('flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl border-2 text-xs font-semibold transition-all',
                          form.type === t.value ? `${t.bg} ${t.color} border-current` : 'bg-slate-50 text-slate-400 border-slate-200 hover:border-slate-300')}>
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
                    <input type="number" min={1} value={form.durationMinutes}
                      onChange={e => setForm(f => ({ ...f, durationMinutes: Number(e.target.value) }))}
                      className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 transition-all" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">Order</label>
                    <input type="number" min={1} value={form.order}
                      onChange={e => setForm(f => ({ ...f, order: Number(e.target.value) }))}
                      className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 transition-all" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">Status</label>
                    <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                      className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 transition-all">
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
                  <button type="button" onClick={() => setForm(f => ({ ...f, isFreePreview: !f.isFreePreview }))}
                    className={cn('relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none',
                      form.isFreePreview ? 'bg-violet-600' : 'bg-slate-300')}>
                    <span className={cn('pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out',
                      form.isFreePreview ? 'translate-x-5' : 'translate-x-0')} />
                  </button>
                </div>

                {/* Auto-publish toggle */}
                <div className={cn('rounded-xl border transition-all duration-200',
                  form.autoPublish ? 'border-violet-200 bg-violet-50/60' : 'border-slate-200 bg-slate-50/60')}>
                  <label className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none">
                    <div className="relative">
                      <input
                        type="checkbox"
                        checked={form.autoPublish}
                        onChange={e => setForm(f => ({
                          ...f,
                          autoPublish: e.target.checked,
                          status: e.target.checked ? 'draft' : f.status,
                          publishAt: e.target.checked ? f.publishAt : '',
                        }))}
                        className="sr-only"
                      />
                      <div className={cn('w-10 h-5 rounded-full transition-colors duration-200', form.autoPublish ? 'bg-violet-500' : 'bg-slate-300')}>
                        <div className={cn('absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200',
                          form.autoPublish ? 'translate-x-5' : 'translate-x-0.5')} />
                      </div>
                    </div>
                    <div>
                      <span className={cn('text-sm font-semibold transition-colors', form.autoPublish ? 'text-violet-700' : 'text-slate-600')}>
                        Auto-publish
                      </span>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Publiko automatikisht në datën dhe orën e zgjedhur
                      </p>
                    </div>
                  </label>

                  <AnimatePresence>
                    {form.autoPublish && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }}
                        className="overflow-hidden">
                        <div className="px-4 pb-4 pt-1">
                          <label className="block text-xs font-semibold text-violet-600 mb-1.5">
                            <Calendar className="inline w-3.5 h-3.5 mr-1 -mt-0.5" />
                            Data dhe ora e publikimit
                          </label>
                          <input
                            type="datetime-local"
                            value={form.publishAt}
                            min={new Date().toISOString().slice(0, 16)}
                            onChange={e => setForm(f => ({ ...f, publishAt: e.target.value }))}
                            className="w-full px-3.5 py-2.5 bg-white border border-violet-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 transition-all text-slate-700"
                          />
                          {form.publishAt && (
                            <p className="text-[11px] text-violet-500 mt-1.5 font-medium">
                              ✓ Do të publikohet: {new Date(form.publishAt).toLocaleString('sq-AL', { dateStyle: 'full', timeStyle: 'short' })}
                            </p>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="px-6 pb-6 flex items-center justify-end gap-3 shrink-0 border-t border-slate-100 pt-4">
                <button onClick={closeModal} className="px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-all">
                  Cancel
                </button>
                {can('actions.teacher.lessons.manage') && (
                  <LoadingButton
                    onClick={handleSave}
                    loading={saving}
                    loadingText={editing ? 'Saving...' : 'Creating...'}
                    icon={<Save className="w-4 h-4" />}
                    className="px-5 py-2.5"
                    style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}
                  >
                    {editing ? 'Save Changes' : 'Create Lesson'}
                  </LoadingButton>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {deleteTarget && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4"
            onClick={() => !deleting && setDeleteTarget(null)}>
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 24 }} animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 24 }} transition={{ type: 'spring', stiffness: 300, damping: 28 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden"
              onClick={e => e.stopPropagation()}>
              <div className="h-1.5 w-full" style={{ background: 'linear-gradient(90deg,#ef4444,#f97316)' }} />
              <div className="p-6">
                <div className="flex justify-center mb-4">
                  <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
                    style={{ background: 'linear-gradient(135deg,#fee2e2,#fecaca)' }}>
                    <AlertTriangle className="w-8 h-8 text-red-500" />
                  </div>
                </div>
                <h3 className="text-center text-lg font-bold text-slate-900 mb-1">Delete this lesson?</h3>
                <p className="text-center text-sm text-slate-500 mb-1">
                  <span className="font-semibold text-slate-700">"{deleteTarget.title}"</span>
                </p>
                <p className="text-center text-xs text-red-400 font-medium mb-6">This cannot be undone.</p>
                <div className="flex gap-3">
                  <button type="button" disabled={deleting} onClick={() => setDeleteTarget(null)}
                    className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all disabled:opacity-50">
                    Cancel
                  </button>
                  <button type="button" disabled={deleting} onClick={() => void confirmDelete()}
                    className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-60 flex items-center justify-center gap-2"
                    style={{ background: 'linear-gradient(135deg,#ef4444,#dc2626)' }}>
                    <Trash2 className="w-4 h-4" />
                    {deleting ? 'Deleting...' : 'Delete'}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </TeacherLayout>
  );
}
