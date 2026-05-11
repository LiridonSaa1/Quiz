import React, { useEffect, useState } from 'react';
import { supabase } from '../../supabase';
import TeacherLayout from '../../components/layout/TeacherLayout';
import {
  Plus, Search, Layers, Trash2, Edit2,
  BookOpen, X, Save, PlayCircle, ChevronRight, HelpCircle, AlertTriangle, Calendar
} from 'lucide-react';
import { toast } from 'sonner';
import { Module, Course } from '../../types';
import { cn } from '../../lib/utils';
import { authFetch, readApiError } from '../../lib/apiUrl';
import { resolveTeacherIdCandidates } from '../../lib/teacherScope';
import { motion, AnimatePresence, useMotionValue, useSpring, useTransform } from 'motion/react';
import { useTeacherPermissions } from '../../lib/teacherPermissions';

function AnimatedCount({ value }: { value: number }) {
  const motionVal = useMotionValue(0);
  const spring = useSpring(motionVal, { stiffness: 120, damping: 20 });
  const display = useTransform(spring, (v) => Math.round(v).toString());

  useEffect(() => {
    motionVal.set(value);
  }, [value, motionVal]);

  return <motion.span>{display}</motion.span>;
}

const slugify = (text: string) =>
  text.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').trim();

const emptyForm = { title: '', description: '', order: 1, status: 'active' as 'active' | 'inactive', autoPublish: false, publishAt: '' };

const normalizeModuleStatus = (s: string) => {
  if (s === 'published' || s === 'active') return 'active';
  if (s === 'draft' || s === 'inactive') return 'inactive';
  return s === 'inactive' ? 'inactive' : 'active';
};

const STAT_CONFIG = [
  {
    label: 'Total Modules',
    gradient: 'from-indigo-500 to-indigo-600',
    iconBg: 'bg-white/20',
    shadow: 'shadow-indigo-500/25',
    icon: Layers,
  },
  {
    label: 'Active',
    gradient: 'from-emerald-500 to-emerald-600',
    iconBg: 'bg-white/20',
    shadow: 'shadow-emerald-500/25',
    icon: PlayCircle,
  },
  {
    label: 'Inactive',
    gradient: 'from-amber-500 to-amber-600',
    iconBg: 'bg-white/20',
    shadow: 'shadow-amber-500/25',
    icon: X,
  },
  {
    label: 'Total Lessons',
    gradient: 'from-violet-500 to-violet-600',
    iconBg: 'bg-white/20',
    shadow: 'shadow-violet-500/25',
    icon: BookOpen,
  },
];

function EmptyIllustration() {
  return (
    <svg width="140" height="120" viewBox="0 0 140 120" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect x="20" y="70" width="100" height="40" rx="8" fill="#e0e7ff" />
      <rect x="30" y="52" width="80" height="30" rx="8" fill="#c7d2fe" />
      <rect x="40" y="34" width="60" height="30" rx="8" fill="#a5b4fc" />
      <rect x="50" y="16" width="40" height="30" rx="8" fill="#818cf8" />
      <circle cx="70" cy="31" r="8" fill="#6366f1" />
      <path d="M65 31 L70 26 L75 31" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M70 26 L70 36" stroke="white" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export default function TeacherModules() {
  const [modules, setModules] = useState<Module[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [classes, setClasses] = useState<Array<{ id: string; name: string; course_id: string | null }>>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [courseFilter, setCourseFilter] = useState('all');
  const [classFilter, setClassFilter] = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Module | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [formCourseId, setFormCourseId] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Module | null>(null);
  const [deleting, setDeleting] = useState(false);
  const { can } = useTeacherPermissions();

  const fetchData = async () => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    try {
      let courseRows: any[] = [];
      let classRows: Array<{ id: string; name: string; course_id: string | null }> = [];

      const backendRes = await authFetch(`/api/teacher/courses?userId=${encodeURIComponent(session.user.id)}`);
      if (backendRes.ok) {
        const backendJson = await backendRes.json();
        if (backendJson?.success && Array.isArray(backendJson.courses)) {
          courseRows = backendJson.courses;
        }
      }

      if (courseRows.length === 0) {
        const scopedIds = await resolveTeacherIdCandidates(session.user.id);
        const { data: coursesData, error: coursesError } = await supabase
          .from('courses')
          .select('*')
          .in('teacher_id', scopedIds)
          .order('created_at', { ascending: false });
        if (coursesError && (coursesError as any).code !== 'PGRST116') throw coursesError;
        courseRows = coursesData || [];
      }

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

      const courseList = courseRows.map((c: any) => ({
        ...c,
        id: c.id,
        title: c.title || '',
        name: c.name || c.title,
      }));
      setCourses(courseList as Course[]);
      setClasses(classRows.filter((c) => !!c.course_id && courseList.some((co: any) => co.id === c.course_id)));

      if (courseList.length === 0) {
        setModules([]);
        return;
      }

      let modulesData: any[] | null = null;
      const modulesRes = await authFetch(`/api/teacher/modules?userId=${encodeURIComponent(session.user.id)}`);
      if (modulesRes.ok) {
        const modulesJson = await modulesRes.json();
        if (modulesJson?.success && Array.isArray(modulesJson.modules)) {
          modulesData = modulesJson.modules;
        }
      }

      if (modulesData === null) {
        const courseIds = courseList.map(c => c.id);
        const { data: fallback, error: modulesError } = await supabase
          .from('modules')
          .select('*')
          .in('course_id', courseIds)
          .order('order', { ascending: true });
        if (modulesError) throw modulesError;
        modulesData = fallback || [];
      }

      const normalizedModules = modulesData || [];
      const moduleIds = normalizedModules.map((m: any) => String(m.id)).filter(Boolean);
      const lessonCountByModule: Record<string, number> = {};
      const quizCountByModule: Record<string, number> = {};

      if (moduleIds.length > 0) {
        const { data: lessonRows, error: lessonErr } = await supabase
          .from('lessons')
          .select('id, module_id')
          .in('module_id', moduleIds);
        if (lessonErr) throw lessonErr;

        const lessonIds: string[] = [];
        const moduleByLessonId: Record<string, string> = {};
        (lessonRows || []).forEach((l: any) => {
          const moduleId = String(l?.module_id || '');
          const lessonId = String(l?.id || '');
          if (!moduleId || !lessonId) return;
          lessonCountByModule[moduleId] = (lessonCountByModule[moduleId] || 0) + 1;
          moduleByLessonId[lessonId] = moduleId;
          lessonIds.push(lessonId);
        });

        if (lessonIds.length > 0) {
          const withAvailability = await supabase
            .from('quizzes')
            .select('id, lesson_id, published, status')
            .in('lesson_id', lessonIds);
          let quizRows: any[] = [];
          if (withAvailability.error) {
            const fallback = await supabase
              .from('quizzes')
              .select('id, lesson_id')
              .in('lesson_id', lessonIds);
            if (fallback.error) throw fallback.error;
            quizRows = fallback.data || [];
          } else {
            quizRows = withAvailability.data || [];
          }

          const isAvailable = (q: any) => {
            if (typeof q?.published === 'boolean') return q.published;
            const status = String(q?.status || '').toLowerCase();
            if (status) return status === 'published' || status === 'active';
            return true;
          };

          (quizRows || []).forEach((q: any) => {
            if (!isAvailable(q)) return;
            const lessonId = String(q?.lesson_id || '');
            const moduleId = moduleByLessonId[lessonId];
            if (!moduleId) return;
            quizCountByModule[moduleId] = (quizCountByModule[moduleId] || 0) + 1;
          });
        }
      }

      setModules((normalizedModules || []).map(m => ({
        id: m.id,
        courseId: m.course_id,
        title: m.title,
        slug: m.slug,
        description: m.description,
        order: m.order,
        status: normalizeModuleStatus(m.status),
        totalLessons: lessonCountByModule[String(m.id)] ?? m.total_lessons ?? 0,
        totalQuizzes: quizCountByModule[String(m.id)] ?? m.total_quizzes ?? 0,
        createdAt: m.created_at,
        updatedAt: m.updated_at,
        publishAt: (m.publish_at as string | null | undefined) ?? null,
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
    const hasPublishAt = !!mod.publishAt;
    const publishAtLocal = mod.publishAt
      ? new Date(mod.publishAt).toISOString().slice(0, 16)
      : '';
    setForm({
      title: mod.title,
      description: mod.description || '',
      order: mod.order,
      status: normalizeModuleStatus(mod.status) as 'active' | 'inactive',
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

  const handleSave = async () => {
    if (!form.title.trim()) { toast.error('Title is required'); return; }
    if (!formCourseId) { toast.error('Please select a course'); return; }
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('Not signed in');
        return;
      }

      if (form.autoPublish && !form.publishAt) { toast.error('Please select a date and time for auto-publish'); setSaving(false); return; }
      const status: 'active' | 'inactive' = form.status === 'inactive' ? 'inactive' : 'active';
      const body: Record<string, unknown> = {
        course_id: formCourseId,
        title: form.title.trim(),
        slug: slugify(form.title),
        description: form.description.trim() || null,
        order: Number(form.order) || 1,
        status,
        ...(form.autoPublish && form.publishAt ? { publish_at: new Date(form.publishAt).toISOString() } : { publish_at: null }),
      };

      if (editing) {
        const res = await authFetch(
          `/api/teacher/modules/${encodeURIComponent(editing.id)}?userId=${encodeURIComponent(session.user.id)}`,
          {
            method: 'PATCH',
            body: JSON.stringify(body),
          }
        );
        if (!res.ok) throw new Error(await readApiError(res));
        toast.success('Module updated');
      } else {
        const res = await authFetch('/api/teacher/modules', {
          method: 'POST',
          body: JSON.stringify({ userId: session.user.id, ...body }),
        });
        if (!res.ok) throw new Error(await readApiError(res));
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

  const handleDelete = (mod: Module) => {
    setDeleteTarget(mod);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { toast.error('Not signed in'); return; }
      const res = await authFetch(
        `/api/teacher/modules/${encodeURIComponent(deleteTarget.id)}/delete?userId=${encodeURIComponent(session.user.id)}`,
        { method: 'POST' }
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof json?.error === 'string' ? json.error : 'Failed to delete module');
      toast.success('Module deleted');
      setDeleteTarget(null);
      fetchData();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to delete module');
    } finally {
      setDeleting(false);
    }
  };

  const handleToggleStatus = async (mod: Module) => {
    const cur = normalizeModuleStatus(mod.status);
    const newStatus = cur === 'active' ? 'inactive' : 'active';
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('Not signed in');
        return;
      }
      const res = await authFetch(
        `/api/teacher/modules/${encodeURIComponent(mod.id)}?userId=${encodeURIComponent(session.user.id)}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ status: newStatus }),
        }
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof json?.error === 'string' ? json.error : 'Failed to update status');
      toast.success(`Module ${newStatus === 'active' ? 'activated' : 'deactivated'}`);
      fetchData();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to update status');
    }
  };

  const filtered = modules.filter(m => {
    const matchSearch = m.title.toLowerCase().includes(search.toLowerCase()) ||
      (m.description || '').toLowerCase().includes(search.toLowerCase());
    const matchCourse = courseFilter === 'all' || m.courseId === courseFilter;
    const selectedClass = classes.find((c) => c.id === classFilter);
    const matchClass = classFilter === 'all' || (selectedClass?.course_id ? m.courseId === selectedClass.course_id : false);
    return matchSearch && matchCourse && matchClass;
  });

  const getCourseTitle = (courseId: string) =>
    courses.find(c => c.id === courseId)?.name ||
    courses.find(c => c.id === courseId)?.title || 'Unknown Course';

  const stats = [
    { ...STAT_CONFIG[0], value: modules.length },
    { ...STAT_CONFIG[1], value: modules.filter(m => normalizeModuleStatus(m.status) === 'active').length },
    { ...STAT_CONFIG[2], value: modules.filter(m => normalizeModuleStatus(m.status) === 'inactive').length },
    { ...STAT_CONFIG[3], value: modules.reduce((acc, m) => acc + (m.totalLessons || 0), 0) },
  ];

  return (
    <TeacherLayout>
      <div
        className="min-h-screen -mx-4 sm:-mx-6 lg:-mx-8 -mt-7"
        style={{ fontFamily: "'Inter', 'Poppins', system-ui, sans-serif" }}
      >
        {/* Background depth */}
        <div className="relative overflow-hidden">
          {/* Gradient blobs */}
          <div className="pointer-events-none absolute -top-24 -left-24 w-96 h-96 rounded-full bg-indigo-200/30 blur-3xl" />
          <div className="pointer-events-none absolute -top-12 right-0 w-80 h-80 rounded-full bg-violet-200/25 blur-3xl" />
          <div className="pointer-events-none absolute top-96 left-1/2 w-72 h-72 rounded-full bg-indigo-100/20 blur-3xl" />

          {/* Hero Header */}
          <div className="relative overflow-hidden"
            style={{
              background: 'linear-gradient(135deg, #312e81 0%, #4f46e5 40%, #7c3aed 80%, #6d28d9 100%)',
            }}
          >
            {/* Subtle dot grid overlay */}
            <div
              className="absolute inset-0 opacity-10"
              style={{
                backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)',
                backgroundSize: '24px 24px',
              }}
            />
            {/* Glow blob inside hero */}
            <div className="pointer-events-none absolute -top-16 right-1/4 w-64 h-64 rounded-full bg-violet-400/20 blur-3xl" />

            <div className="relative px-6 sm:px-8 lg:px-10 py-10">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
                <div>
                  <nav className="flex items-center gap-1.5 text-xs font-semibold mb-3" aria-label="Breadcrumb">
                    <span className="text-indigo-400 tracking-wider uppercase">Teacher Portal</span>
                    <ChevronRight className="w-3.5 h-3.5 text-indigo-500/50" />
                    <span className="text-indigo-200 tracking-wider uppercase">Modules</span>
                  </nav>
                  <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight leading-tight">
                    Modules
                  </h1>
                  <p className="text-indigo-200 text-sm mt-2 max-w-md">
                    Organize your courses into structured, sequential modules that guide your students through the material.
                  </p>
                </div>
                {can('actions.teacher.modules.manage') && <motion.button
                  onClick={openCreate}
                  disabled={courses.length === 0}
                  whileHover={{ scale: 1.04, y: -2 }}
                  whileTap={{ scale: 0.97 }}
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl font-bold text-sm text-white shrink-0 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  style={{
                    background: 'linear-gradient(135deg, #818cf8 0%, #a78bfa 100%)',
                    boxShadow: '0 8px 32px rgba(139,92,246,0.45), 0 2px 8px rgba(0,0,0,0.15)',
                  }}
                >
                  <Plus className="w-4 h-4" />
                  Create Module
                </motion.button>}
              </div>
            </div>
          </div>

          {/* Main content */}
          <div className="px-6 sm:px-8 lg:px-10 py-8 space-y-8 bg-slate-50">
            {/* No courses warning */}
            {!loading && courses.length === 0 && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-amber-50 border border-amber-200 rounded-2xl p-5 flex items-start gap-3"
              >
                <BookOpen className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-amber-800">No courses found</p>
                  <p className="text-xs text-amber-600 mt-0.5">Create a course first before adding modules to it.</p>
                </div>
              </motion.div>
            )}

            {/* Premium Stats Cards */}
            <motion.div
              className="grid grid-cols-2 lg:grid-cols-4 gap-4"
              initial="hidden"
              animate="visible"
              variants={{
                hidden: {},
                visible: { transition: { staggerChildren: 0.08 } },
              }}
            >
              {stats.map((stat) => {
                const Icon = stat.icon;
                return (
                  <motion.div
                    key={stat.label}
                    variants={{
                      hidden: { opacity: 0, y: 20 },
                      visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' } },
                    }}
                    className={cn(
                      'relative overflow-hidden rounded-2xl p-5 text-white shadow-lg',
                      `bg-gradient-to-br ${stat.gradient}`,
                      stat.shadow
                    )}
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
                    {/* Decorative circle */}
                    <div className="pointer-events-none absolute -bottom-4 -right-4 w-20 h-20 rounded-full bg-white/10" />
                  </motion.div>
                );
              })}
            </motion.div>

            {/* Glassmorphism Search & Filter Bar */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.4 }}
              className="rounded-2xl border border-white/60 shadow-sm p-4 flex flex-wrap gap-3 items-center"
              style={{
                background: 'rgba(255,255,255,0.75)',
                backdropFilter: 'blur(12px)',
              }}
            >
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mr-1">Filters</p>
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-indigo-400" />
                <input
                  type="text"
                  placeholder="Search modules..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full pl-11 pr-4 py-2.5 rounded-full text-sm border border-indigo-100 bg-white/80 focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent transition-all shadow-sm placeholder-slate-400"
                />
              </div>
              <select
                value={courseFilter}
                onChange={e => setCourseFilter(e.target.value)}
                className="px-4 py-2.5 rounded-full text-sm border border-indigo-100 bg-white/80 focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent transition-all shadow-sm text-slate-700"
              >
                <option value="all">All Courses</option>
                {courses.map(c => (
                  <option key={c.id} value={c.id}>{c.name || c.title}</option>
                ))}
              </select>
              {classes.length > 0 && (
                <select
                  value={classFilter}
                  onChange={e => setClassFilter(e.target.value)}
                  className="px-4 py-2.5 rounded-full text-sm border border-indigo-100 bg-white/80 focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent transition-all shadow-sm text-slate-700"
                >
                  <option value="all">All Classes</option>
                  {classes.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              )}
              {(search || courseFilter !== 'all' || classFilter !== 'all') && (
                <button
                  onClick={() => { setSearch(''); setCourseFilter('all'); setClassFilter('all'); }}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-semibold text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-all"
                >
                  <X className="w-3.5 h-3.5" /> Clear
                </button>
              )}
            </motion.div>

            {/* Module Grid / Empty State */}
            {loading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                {Array(6).fill(0).map((_, i) => (
                  <div key={i} className="bg-white rounded-2xl border border-slate-100 h-52 animate-pulse" />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.4 }}
                className="py-20 flex flex-col items-center justify-center bg-white rounded-2xl border border-dashed border-indigo-200 shadow-sm"
              >
                <EmptyIllustration />
                <h3 className="text-xl font-extrabold text-slate-800 mt-6 mb-2">
                  {search || courseFilter !== 'all' ? 'No results found' : 'No modules yet'}
                </h3>
                <p className="text-slate-400 text-sm mb-8 max-w-xs text-center">
                  {search || courseFilter !== 'all'
                    ? "Try adjusting your search or filter to find what you're looking for."
                    : 'Create your first module to start organizing your course content into structured lessons.'}
                </p>
                {courses.length > 0 && !(search || courseFilter !== 'all') && can('actions.teacher.modules.manage') && (
                  <motion.button
                    onClick={openCreate}
                    whileHover={{ scale: 1.04, y: -2 }}
                    whileTap={{ scale: 0.97 }}
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl font-bold text-sm text-white"
                    style={{
                      background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                      boxShadow: '0 8px 24px rgba(99,102,241,0.35)',
                    }}
                  >
                    <Plus className="w-4 h-4" /> Create Your First Module
                  </motion.button>
                )}
              </motion.div>
            ) : (
              <motion.div
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5"
                initial="hidden"
                animate="visible"
                variants={{
                  hidden: {},
                  visible: { transition: { staggerChildren: 0.07 } },
                }}
              >
                {filtered.map((mod) => {
                  const isActive = normalizeModuleStatus(mod.status) === 'active';
                  return (
                    <motion.div
                      key={mod.id}
                      variants={{
                        hidden: { opacity: 0, y: 20 },
                        visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: 'easeOut' } },
                      }}
                      whileHover={{ y: -4, boxShadow: '0 20px 48px rgba(99,102,241,0.15)' }}
                      className="group relative bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden flex flex-col transition-all duration-200"
                    >
                      {/* Card top accent */}
                      <div
                        className="h-1.5 w-full"
                        style={{
                          background: isActive
                            ? 'linear-gradient(90deg,#6366f1,#8b5cf6)'
                            : 'linear-gradient(90deg,#f59e0b,#fbbf24)',
                        }}
                      />

                      <div className="p-5 flex flex-col flex-1">
                        {/* Icon + Status */}
                        <div className="flex items-start justify-between mb-3">
                          <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                            style={{ background: 'linear-gradient(135deg,#e0e7ff,#ede9fe)' }}
                          >
                            <Layers className="w-5 h-5 text-indigo-500" />
                          </div>
                          {can('actions.teacher.modules.manage') && <button
                            onClick={() => handleToggleStatus(mod)}
                            className={cn(
                              'inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full transition-all',
                              isActive
                                ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                                : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                            )}
                          >
                            <span className={cn('w-1.5 h-1.5 rounded-full', isActive ? 'bg-emerald-500' : 'bg-amber-500')} />
                            {isActive ? 'Active' : 'Inactive'}
                          </button>}
                        </div>

                        {/* Title & Description */}
                        <h3 className="text-sm font-bold text-slate-900 line-clamp-2 mb-1 leading-snug">{mod.title}</h3>
                        {mod.description && (
                          <p className="text-xs text-slate-400 line-clamp-2 mb-3">{mod.description}</p>
                        )}

                        {/* Meta */}
                        <div className="mt-auto space-y-2 pt-3 border-t border-slate-50">
                          <div className="flex items-center justify-between">
                            <span className="inline-flex items-center gap-1.5 px-2 py-1 bg-slate-100 text-slate-600 rounded-lg text-[11px] font-medium max-w-[120px] truncate">
                              <BookOpen className="w-3 h-3 shrink-0" />
                              <span className="truncate">{getCourseTitle(mod.courseId)}</span>
                            </span>
                            <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                              <BookOpen className="w-3.5 h-3.5 text-slate-300" />
                              {mod.totalLessons} lesson{mod.totalLessons !== 1 ? 's' : ''}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] text-slate-400">Available quizzes</span>
                            <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                              <HelpCircle className="w-3.5 h-3.5 text-slate-300" />
                              {mod.totalQuizzes || 0} quiz{(mod.totalQuizzes || 0) !== 1 ? 'zes' : ''}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1">
                              <span className="w-6 h-6 flex items-center justify-center bg-indigo-50 text-indigo-600 rounded-lg text-[11px] font-bold">
                                {mod.order}
                              </span>
                              <span className="text-[11px] text-slate-400">order</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <Calendar className="w-3 h-3 text-slate-300 shrink-0" />
                              <span className="text-[11px] text-slate-400">
                                {mod.createdAt ? new Date(mod.createdAt).toLocaleDateString('sq-AL', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Actions — always visible on mobile touch, hover-revealed on desktop */}
                        <div className="flex items-center gap-2 pt-3 sm:opacity-0 sm:group-hover:opacity-100 opacity-100 transition-all duration-200 sm:translate-y-1 sm:group-hover:translate-y-0">
                          {can('actions.teacher.modules.manage') && <button
                            onClick={() => openEdit(mod)}
                            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 transition-all"
                          >
                            <Edit2 className="w-3.5 h-3.5" /> Edit
                          </button>}
                          {can('actions.teacher.modules.manage') && <button
                            onClick={() => handleDelete(mod)}
                            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold text-red-500 bg-red-50 hover:bg-red-100 transition-all"
                          >
                            <Trash2 className="w-3.5 h-3.5" /> Delete
                          </button>}
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

      {/* Modal */}
      <AnimatePresence>
        {showModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 16 }}
              transition={{ type: 'spring', duration: 0.4 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-lg"
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between p-6 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                    style={{ background: 'linear-gradient(135deg,#e0e7ff,#ede9fe)' }}
                  >
                    <Layers className="w-5 h-5 text-indigo-600" />
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
                      onChange={e => setForm(f => ({ ...f, status: e.target.value as 'active' | 'inactive' }))}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 transition-all"
                    >
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </div>
                </div>

                {/* Auto-publish toggle */}
                <div className={cn(
                  'rounded-xl border transition-all duration-200',
                  form.autoPublish ? 'border-violet-200 bg-violet-50/60' : 'border-slate-200 bg-slate-50/60'
                )}>
                  <label className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none">
                    <div className="relative">
                      <input
                        type="checkbox"
                        checked={form.autoPublish}
                        onChange={e => setForm(f => ({
                          ...f,
                          autoPublish: e.target.checked,
                          status: e.target.checked ? 'active' : f.status,
                          publishAt: e.target.checked ? f.publishAt : '',
                        }))}
                        className="sr-only"
                      />
                      <div className={cn(
                        'w-10 h-5 rounded-full transition-colors duration-200',
                        form.autoPublish ? 'bg-violet-500' : 'bg-slate-300'
                      )}>
                        <div className={cn(
                          'absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200',
                          form.autoPublish ? 'translate-x-5' : 'translate-x-0.5'
                        )} />
                      </div>
                    </div>
                    <div>
                      <span className={cn(
                        'text-sm font-semibold transition-colors',
                        form.autoPublish ? 'text-violet-700' : 'text-slate-600'
                      )}>
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
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
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
              <div className="px-6 pb-6 flex items-center justify-end gap-3">
                {can('actions.teacher.modules.manage') && <button
                  onClick={closeModal}
                  className="px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-all"
                >
                  Cancel
                </button>}
                {can('actions.teacher.modules.manage') && <button
                  onClick={handleSave}
                  disabled={saving}
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-white rounded-xl font-semibold text-sm transition-all disabled:opacity-60"
                  style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}
                >
                  <Save className="w-4 h-4" />
                  {saving ? 'Saving...' : editing ? 'Save Changes' : 'Create Module'}
                </button>}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Delete Confirmation Modal ── */}
      <AnimatePresence>
        {deleteTarget && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4"
            onClick={() => !deleting && setDeleteTarget(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 24 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 24 }}
              transition={{ type: 'spring', stiffness: 300, damping: 28 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              <div className="h-1.5 w-full" style={{ background: 'linear-gradient(90deg,#ef4444,#f97316)' }} />
              <div className="p-6">
                <div className="flex justify-center mb-4">
                  <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
                    style={{ background: 'linear-gradient(135deg,#fee2e2,#fecaca)' }}>
                    <AlertTriangle className="w-8 h-8 text-red-500" />
                  </div>
                </div>
                <h3 className="text-center text-lg font-bold text-slate-900 mb-1">
                  Delete this module?
                </h3>
                <p className="text-center text-sm text-slate-500 mb-1">
                  <span className="font-semibold text-slate-700">"{deleteTarget.title}"</span>
                </p>
                <p className="text-center text-xs text-red-400 font-medium mb-6">
                  This cannot be undone.
                </p>
                <div className="flex gap-3">
                  <button
                    type="button"
                    disabled={deleting}
                    onClick={() => setDeleteTarget(null)}
                    className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={deleting}
                    onClick={() => void confirmDelete()}
                    className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-60 flex items-center justify-center gap-2"
                    style={{ background: 'linear-gradient(135deg,#ef4444,#dc2626)' }}
                  >
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
