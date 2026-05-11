import React, { useEffect, useState } from 'react';
import AdminLayout from '../../components/layout/AdminLayout';
import {
  Plus, Search, Layers, Trash2, Edit2,
  BookOpen, X, Save, PlayCircle, ChevronRight, User, Calendar,
} from 'lucide-react';
import { toast } from 'sonner';
import { Module } from '../../types';
import { cn } from '../../lib/utils';
import { motion, AnimatePresence, useMotionValue, useSpring, useTransform } from 'motion/react';

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

const isPublishedStatus = (s: string) => s === 'published' || s === 'active';

const STAT_CONFIG = [
  {
    label: 'Total Modules',
    gradient: 'from-indigo-500 to-indigo-600',
    iconBg: 'bg-white/20',
    shadow: 'shadow-indigo-500/25',
    icon: Layers,
  },
  {
    label: 'Published',
    gradient: 'from-emerald-500 to-emerald-600',
    iconBg: 'bg-white/20',
    shadow: 'shadow-emerald-500/25',
    icon: PlayCircle,
  },
  {
    label: 'Drafts',
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

export default function AdminModules() {
  const [modules, setModules] = useState<Module[]>([]);
  const [courses, setCourses] = useState<Record<string, { title: string; teacher: string }>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [courseFilter, setCourseFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Module | null>(null);
  const [form, setForm] = useState({
    title: '',
    description: '',
    order: 1,
    status: 'published' as 'published' | 'draft',
    autoPublish: false,
    publishAt: '',
  });
  const [formCourseId, setFormCourseId] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/modules');
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to load modules');

      const { modules: modulesData, courses: coursesData, teachers: teachersData, lessons: lessonsData } = json;

      const teacherMap: Record<string, string> = {};
      (teachersData || []).forEach((t: { user_id: string; first_name: string; last_name: string }) => {
        teacherMap[t.user_id] = `${t.first_name} ${t.last_name}`;
      });

      const coursesMap: Record<string, { title: string; teacher: string }> = {};
      (coursesData || []).forEach((c: { id: string; title?: string; teacher_id?: string | null }) => {
        const teacherName = c.teacher_id ? (teacherMap[c.teacher_id] || '—') : '—';
        coursesMap[c.id] = {
          title: c.title || 'Untitled',
          teacher: teacherName,
        };
      });
      setCourses(coursesMap);

      const lessonCountByModule: Record<string, number> = {};
      (lessonsData || []).forEach((l: { module_id?: string }) => {
        if (l.module_id) lessonCountByModule[l.module_id] = (lessonCountByModule[l.module_id] || 0) + 1;
      });

      setModules((modulesData || []).map((m: Record<string, unknown>) => ({
        id: m.id as string,
        courseId: m.course_id as string,
        title: m.title as string,
        slug: m.slug as string,
        description: m.description as string | undefined,
        order: (m.order as number) || 1,
        status: isPublishedStatus(String(m.status)) ? 'published' : 'draft',
        totalLessons: lessonCountByModule[m.id as string] ?? (m.total_lessons as number) ?? 0,
        publishAt: (m.publish_at as string | null | undefined) ?? null,
        createdAt: m.created_at as string,
        updatedAt: m.updated_at as string,
      })));
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Failed to load modules';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const courseOptions = (Object.entries(courses) as [string, { title: string; teacher: string }][]).map(
    ([id, val]) => ({ id, title: val.title }),
  );

  const openCreate = () => {
    setEditing(null);
    setFormCourseId(courseOptions[0]?.id || '');
    const maxOrder = modules.length > 0 ? Math.max(...modules.map(m => m.order)) + 1 : 1;
    setForm({ title: '', description: '', order: maxOrder, status: 'published', autoPublish: false, publishAt: '' });
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
      status: isPublishedStatus(mod.status) ? 'published' : 'draft',
      autoPublish: hasPublishAt,
      publishAt: publishAtLocal,
    });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditing(null);
    setForm({ title: '', description: '', order: 1, status: 'published', autoPublish: false, publishAt: '' });
  };

  const handleSave = async () => {
    if (!form.title.trim()) { toast.error('Title is required'); return; }
    if (!formCourseId) { toast.error('Please select a course'); return; }
    if (form.autoPublish && !form.publishAt) { toast.error('Please select a date and time for auto-publish'); return; }
    setSaving(true);
    try {
      const statusDb = form.status === 'draft' ? 'inactive' : 'active';
      const slug = slugify(form.title);
      const payload: Record<string, unknown> = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        course_id: formCourseId,
        status: statusDb,
        slug,
        order: Number(form.order) || 1,
        ...(form.autoPublish && form.publishAt ? { publish_at: new Date(form.publishAt).toISOString() } : {}),
      };

      if (editing) {
        const res = await fetch(`/api/admin/modules/${encodeURIComponent(editing.id)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.error || 'Failed to update module');
        toast.success('Module updated');
      } else {
        const res = await fetch('/api/admin/modules', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.error || 'Failed to create module');
        toast.success('Module created');
      }
      closeModal();
      fetchData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save module';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this module? This cannot be undone.')) return;
    try {
      const res = await fetch(`/api/admin/modules/${encodeURIComponent(id)}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to delete module');
      toast.success('Module deleted');
      fetchData();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to delete module';
      toast.error(msg);
    }
  };

  const handleToggleStatus = async (mod: Module) => {
    const nextPublished = !isPublishedStatus(mod.status);
    const statusDb = nextPublished ? 'active' : 'inactive';
    try {
      const res = await fetch(`/api/admin/modules/${encodeURIComponent(mod.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: statusDb }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to update status');
      toast.success(`Module ${nextPublished ? 'published' : 'set to draft'}`);
      fetchData();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to update status';
      toast.error(msg);
    }
  };

  const filtered = modules.filter(m => {
    const matchSearch = m.title.toLowerCase().includes(search.toLowerCase()) ||
      (m.description || '').toLowerCase().includes(search.toLowerCase());
    const matchCourse = courseFilter === 'all' || m.courseId === courseFilter;
    const st = isPublishedStatus(m.status) ? 'published' : 'draft';
    const matchStatus = statusFilter === 'all' || st === statusFilter;
    return matchSearch && matchCourse && matchStatus;
  });

  const getCourseTitle = (courseId: string) => courses[courseId]?.title || 'Unknown Course';

  const stats = [
    { ...STAT_CONFIG[0], value: modules.length },
    { ...STAT_CONFIG[1], value: modules.filter(m => isPublishedStatus(m.status)).length },
    { ...STAT_CONFIG[2], value: modules.filter(m => !isPublishedStatus(m.status)).length },
    { ...STAT_CONFIG[3], value: modules.reduce((acc, m) => acc + (m.totalLessons || 0), 0) },
  ];

  const hasActiveFilters = search || courseFilter !== 'all' || statusFilter !== 'all';

  return (
    <AdminLayout>
      <div
        className="min-h-screen -mx-3 sm:-mx-4 md:-mx-6 lg:-mx-8 -mt-6"
        style={{ fontFamily: "'Inter', 'Poppins', system-ui, sans-serif" }}
      >
        <div className="relative overflow-hidden">
          <div className="pointer-events-none absolute -top-24 -left-24 w-96 h-96 rounded-full bg-indigo-200/30 blur-3xl" />
          <div className="pointer-events-none absolute -top-12 right-0 w-80 h-80 rounded-full bg-violet-200/25 blur-3xl" />
          <div className="pointer-events-none absolute top-96 left-1/2 w-72 h-72 rounded-full bg-indigo-100/20 blur-3xl" />

          <div
            className="relative overflow-hidden"
            style={{
              background: 'linear-gradient(135deg, #312e81 0%, #4f46e5 40%, #7c3aed 80%, #6d28d9 100%)',
            }}
          >
            <div
              className="absolute inset-0 opacity-10"
              style={{
                backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)',
                backgroundSize: '24px 24px',
              }}
            />
            <div className="pointer-events-none absolute -top-16 right-1/4 w-64 h-64 rounded-full bg-violet-400/20 blur-3xl" />

            <div className="relative px-6 sm:px-8 lg:px-10 py-10">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
                <div>
                  <nav className="flex items-center gap-1.5 text-xs font-semibold mb-3" aria-label="Breadcrumb">
                    <span className="text-indigo-400 tracking-wider uppercase">Admin Portal</span>
                    <ChevronRight className="w-3.5 h-3.5 text-indigo-500/50" />
                    <span className="text-indigo-200 tracking-wider uppercase">Modules</span>
                  </nav>
                  <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight leading-tight">
                    Modules
                  </h1>
                  <p className="text-indigo-200 text-sm mt-2 max-w-md">
                    Manage modules across all courses and teachers from one place.
                  </p>
                </div>
                <motion.button
                  onClick={openCreate}
                  disabled={courseOptions.length === 0}
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
                </motion.button>
              </div>
            </div>
          </div>

          <div className="px-6 sm:px-8 lg:px-10 py-8 space-y-8 bg-slate-50">
            {!loading && courseOptions.length === 0 && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-amber-50 border border-amber-200 rounded-2xl p-5 flex items-start gap-3"
              >
                <BookOpen className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-amber-800">No courses found</p>
                  <p className="text-xs text-amber-600 mt-0.5">Add a course before creating modules.</p>
                </div>
              </motion.div>
            )}

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
                    <div className="pointer-events-none absolute -bottom-4 -right-4 w-20 h-20 rounded-full bg-white/10" />
                  </motion.div>
                );
              })}
            </motion.div>

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
                {courseOptions.map(c => (
                  <option key={c.id} value={c.id}>{c.title}</option>
                ))}
              </select>
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="px-4 py-2.5 rounded-full text-sm border border-indigo-100 bg-white/80 focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent transition-all shadow-sm text-slate-700"
              >
                <option value="all">All statuses</option>
                <option value="published">Published</option>
                <option value="draft">Draft</option>
              </select>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={() => { setSearch(''); setCourseFilter('all'); setStatusFilter('all'); }}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-semibold text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-all"
                >
                  <X className="w-3.5 h-3.5" /> Clear
                </button>
              )}
            </motion.div>

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
                  {hasActiveFilters ? 'No results found' : 'No modules yet'}
                </h3>
                <p className="text-slate-400 text-sm mb-8 max-w-xs text-center">
                  {hasActiveFilters
                    ? "Try adjusting your search or filters."
                    : 'Create a module to organize course content.'}
                </p>
                {courseOptions.length > 0 && !hasActiveFilters && (
                  <motion.button
                    type="button"
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
                  const published = isPublishedStatus(mod.status);
                  const teacherName = courses[mod.courseId]?.teacher || '—';
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
                      <div
                        className="h-1.5 w-full"
                        style={{
                          background: published
                            ? 'linear-gradient(90deg,#6366f1,#8b5cf6)'
                            : 'linear-gradient(90deg,#f59e0b,#fbbf24)',
                        }}
                      />

                      <div className="p-5 flex flex-col flex-1">
                        <div className="flex items-start justify-between mb-3">
                          <div
                            className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                            style={{ background: 'linear-gradient(135deg,#e0e7ff,#ede9fe)' }}
                          >
                            <Layers className="w-5 h-5 text-indigo-500" />
                          </div>
                          <button
                            type="button"
                            onClick={() => handleToggleStatus(mod)}
                            className={cn(
                              'inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full transition-all',
                              published
                                ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                                : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                            )}
                          >
                            <span className={cn('w-1.5 h-1.5 rounded-full', published ? 'bg-emerald-500' : 'bg-amber-500')} />
                            {published ? 'Published' : 'Draft'}
                          </button>
                        </div>

                        <h3 className="text-sm font-bold text-slate-900 line-clamp-2 mb-1 leading-snug">{mod.title}</h3>
                        {mod.description && (
                          <p className="text-xs text-slate-400 line-clamp-2 mb-3">{mod.description}</p>
                        )}

                        <div className="mt-auto space-y-2 pt-3 border-t border-slate-50">
                          <div className="flex items-center justify-between gap-2">
                            <span className="inline-flex items-center gap-1.5 px-2 py-1 bg-slate-100 text-slate-600 rounded-lg text-[11px] font-medium max-w-[120px] truncate">
                              <BookOpen className="w-3 h-3 shrink-0" />
                              <span className="truncate">{getCourseTitle(mod.courseId)}</span>
                            </span>
                            <span className="inline-flex items-center gap-1 text-xs text-slate-400 shrink-0">
                              <PlayCircle className="w-3.5 h-3.5 text-slate-300" />
                              {mod.totalLessons} lesson{mod.totalLessons !== 1 ? 's' : ''}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <User className="w-3 h-3 text-slate-400 shrink-0" />
                            <span className="text-[11px] text-slate-500 truncate">{teacherName}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="w-6 h-6 flex items-center justify-center bg-indigo-50 text-indigo-600 rounded-lg text-[11px] font-bold">
                              {mod.order}
                            </span>
                            <span className="text-[11px] text-slate-400">order</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 pt-3 sm:opacity-0 sm:group-hover:opacity-100 opacity-100 transition-all duration-200 sm:translate-y-1 sm:group-hover:translate-y-0">
                          <button
                            type="button"
                            onClick={() => openEdit(mod)}
                            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 transition-all"
                          >
                            <Edit2 className="w-3.5 h-3.5" /> Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(mod.id)}
                            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold text-red-500 bg-red-50 hover:bg-red-100 transition-all"
                          >
                            <Trash2 className="w-3.5 h-3.5" /> Delete
                          </button>
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
              <div className="flex items-center justify-between p-6 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center"
                    style={{ background: 'linear-gradient(135deg,#e0e7ff,#ede9fe)' }}
                  >
                    <Layers className="w-5 h-5 text-indigo-600" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-slate-900">{editing ? 'Edit Module' : 'New Module'}</h2>
                    <p className="text-xs text-slate-400">{editing ? 'Update module details' : 'Add a module to a course'}</p>
                  </div>
                </div>
                <button type="button" onClick={closeModal} className="p-2 hover:bg-slate-100 rounded-lg transition-all">
                  <X className="w-5 h-5 text-slate-400" />
                </button>
              </div>

              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Course <span className="text-red-500">*</span></label>
                  <select
                    value={formCourseId}
                    onChange={e => setFormCourseId(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 transition-all"
                  >
                    <option value="">Select a course...</option>
                    {courseOptions.map(c => (
                      <option key={c.id} value={c.id}>{c.title}</option>
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
                    placeholder="Optional: describe what students will learn..."
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
                      onChange={e => setForm(f => ({ ...f, status: e.target.value as 'published' | 'draft' }))}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 transition-all"
                    >
                      <option value="published">Published</option>
                      <option value="draft">Draft</option>
                    </select>
                  </div>
                </div>

                <div className={cn(
                  'rounded-xl border transition-all duration-200',
                  form.autoPublish
                    ? 'border-violet-200 bg-violet-50/60'
                    : 'border-slate-200 bg-slate-50/60'
                )}>
                  <label className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none">
                    <div className="relative">
                      <input
                        type="checkbox"
                        checked={form.autoPublish}
                        onChange={e => setForm(f => ({
                          ...f,
                          autoPublish: e.target.checked,
                          status: e.target.checked ? 'published' : f.status,
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

              <div className="px-6 pb-6 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-all"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleSave()}
                  disabled={saving}
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-white rounded-xl font-semibold text-sm transition-all disabled:opacity-60"
                  style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}
                >
                  <Save className="w-4 h-4" />
                  {saving ? 'Saving...' : editing ? 'Save Changes' : 'Create Module'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </AdminLayout>
  );
}
