import React, { useEffect, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import { supabase } from '../../supabase';
import StudentLayout from '../../components/layout/StudentLayout';
import { motion, AnimatePresence, useMotionValue, useSpring, useTransform } from 'motion/react';
import {
  Layers, BookOpen, Search, ChevronRight, ChevronLeft,
  PlayCircle, CheckCircle2, X, HelpCircle,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { authFetch } from '../../lib/apiUrl';

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

const STAT_CONFIG = [
  { key: 'totalModules',    label: 'Total Modules',     gradient: 'from-indigo-500 to-indigo-600',  shadow: 'shadow-indigo-500/25',  icon: Layers },
  { key: 'completed',       label: 'Completed',         gradient: 'from-emerald-500 to-emerald-600', shadow: 'shadow-emerald-500/25', icon: CheckCircle2 },
  { key: 'inProgress',      label: 'In Progress',       gradient: 'from-amber-500 to-amber-600',    shadow: 'shadow-amber-500/25',   icon: PlayCircle },
  { key: 'totalLessons',    label: 'Total Lessons',     gradient: 'from-violet-500 to-violet-600',  shadow: 'shadow-violet-500/25',  icon: BookOpen },
];

interface ModuleItem {
  id: string;
  title: string;
  description: string;
  order: number;
  status: string;
  course_id: string;
  courseTitle: string;
  courseLevel: string;
  lessonCount: number;
  completedCount: number;
  createdAt: string;
}

const ITEMS_PER_PAGE = 12;

export default function StudentModules() {
  const { t } = useTranslation();
  const [modules, setModules] = useState<ModuleItem[]>([]);
  const [courses, setCourses] = useState<{ id: string; title: string; level: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [courseFilter, setCourseFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const pre = searchParams.get('courseId');
    if (pre) setCourseFilter(pre);
  }, []);

  useEffect(() => {
    const load = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { setLoading(false); return; }
        const uid = session.user.id;

        // Fetch enrolled published courses (handle missing student_ids gracefully)
        let courseRows: any[] = [];
        try {
          const { data } = await supabase
            .from('courses')
            .select('id,title,level,status')
            .eq('status', 'published')
            .contains('student_ids', [uid]);
          courseRows = data || [];
        } catch {
          try {
            const { data } = await supabase
              .from('courses')
              .select('id,title,level,status')
              .eq('status', 'published');
            courseRows = data || [];
          } catch { courseRows = []; }
        }

        if (!courseRows.length) { setLoading(false); return; }

        const courseIds = courseRows.map((c) => c.id);
        const courseTitleMap: Record<string, string> = {};
        const courseLevelMap: Record<string, string> = {};
        courseRows.forEach((c) => {
          courseTitleMap[c.id] = c.title || 'Course';
          courseLevelMap[c.id] = c.level || '';
        });

        setCourses(courseRows.map((c) => ({ id: c.id, title: c.title || 'Course', level: c.level || '' })));

        // Fetch modules
        const { data: modRows } = await supabase
          .from('modules')
          .select('id,title,description,order,status,course_id,created_at')
          .in('course_id', courseIds)
          .order('order', { ascending: true });

        if (!modRows?.length) { setLoading(false); return; }

        const moduleIds = modRows.map((m) => m.id);

        // Fetch lesson counts
        const { data: lessonRows } = await supabase
          .from('lessons')
          .select('id,module_id')
          .in('module_id', moduleIds);

        const lessonsByModule: Record<string, string[]> = {};
        (lessonRows || []).forEach((l: any) => {
          if (!lessonsByModule[l.module_id]) lessonsByModule[l.module_id] = [];
          lessonsByModule[l.module_id].push(l.id);
        });

        // Read localStorage progress per course
        const completedByModule: Record<string, number> = {};
        courseIds.forEach((cid) => {
          try {
            const raw = localStorage.getItem(`course_progress:${uid}:${cid}`);
            if (!raw) return;
            const parsed = JSON.parse(raw);
            const completedIds: string[] = Array.isArray(parsed?.completedLessonIds) ? parsed.completedLessonIds : [];
            modRows
              .filter((m) => m.course_id === cid)
              .forEach((m) => {
                const modLessons = lessonsByModule[m.id] || [];
                completedByModule[m.id] = modLessons.filter((lid) => completedIds.includes(lid)).length;
              });
          } catch { /* skip */ }
        });

        setModules(modRows.map((m) => ({
          id: m.id,
          title: m.title || 'Untitled Module',
          description: m.description || '',
          order: m.order ?? 0,
          status: m.status || 'active',
          course_id: m.course_id,
          courseTitle: courseTitleMap[m.course_id] || 'Course',
          courseLevel: courseLevelMap[m.course_id] || '',
          lessonCount: (lessonsByModule[m.id] || []).length,
          completedCount: completedByModule[m.id] || 0,
          createdAt: m.created_at || '',
        })));
      } catch { /* graceful */ } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  useEffect(() => { setCurrentPage(1); }, [search, courseFilter]);

  const filtered = useMemo(() => {
    return modules.filter((m) => {
      if (courseFilter !== 'all' && m.course_id !== courseFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        if (!m.title.toLowerCase().includes(q) && !m.courseTitle.toLowerCase().includes(q) && !m.description.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [modules, search, courseFilter]);

  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
  const paginated = filtered.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  const grouped = useMemo(() => {
    const map = new Map<string, ModuleItem[]>();
    paginated.forEach((m) => {
      if (!map.has(m.course_id)) map.set(m.course_id, []);
      map.get(m.course_id)!.push(m);
    });
    return Array.from(map.entries()).map(([courseId, items]) => ({
      courseId,
      courseTitle: items[0].courseTitle,
      courseLevel: items[0].courseLevel,
      items,
    }));
  }, [paginated]);

  const stats = useMemo(() => {
    const completed = modules.filter((m) => m.lessonCount > 0 && m.completedCount >= m.lessonCount).length;
    const inProgress = modules.filter((m) => m.completedCount > 0 && m.completedCount < m.lessonCount).length;
    const totalLessons = modules.reduce((acc, m) => acc + m.lessonCount, 0);
    return [modules.length, completed, inProgress, totalLessons];
  }, [modules]);

  return (
    <StudentLayout>
      <div
        className="min-h-screen -mx-4 sm:-mx-6 lg:-mx-8 -mt-7"
        style={{ fontFamily: "'Inter', 'Poppins', system-ui, sans-serif" }}
      >
        <div className="relative overflow-hidden">
          {/* Background blobs */}
          <div className="pointer-events-none absolute -top-24 -left-24 w-96 h-96 rounded-full bg-indigo-200/30 blur-3xl" />
          <div className="pointer-events-none absolute -top-12 right-0 w-80 h-80 rounded-full bg-violet-200/25 blur-3xl" />

          {/* Hero Header */}
          <div
            className="relative overflow-hidden"
            style={{ background: 'linear-gradient(135deg, #312e81 0%, #4f46e5 40%, #7c3aed 80%, #6d28d9 100%)' }}
          >
            <div
              className="absolute inset-0 opacity-10"
              style={{ backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)', backgroundSize: '24px 24px' }}
            />
            <div className="pointer-events-none absolute -top-16 right-1/4 w-64 h-64 rounded-full bg-violet-400/20 blur-3xl" />
            <div className="relative px-6 sm:px-8 lg:px-10 py-10">
              <nav className="flex items-center gap-1.5 text-xs font-semibold mb-3" aria-label="Breadcrumb">
                <span className="text-indigo-400 tracking-wider uppercase">{t('nav.studentPortal', 'Student Portal')}</span>
                <ChevronRight className="w-3.5 h-3.5 text-indigo-500/50" />
                <span className="text-indigo-200 tracking-wider uppercase">{t('nav.modules', 'Modules')}</span>
              </nav>
              <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight leading-tight">
                {t('nav.modules', 'Modules')}
              </h1>
              <p className="text-indigo-200 text-sm mt-2 max-w-md">
                {t('modules.modulesDesc', 'Explore course modules and track your learning progress.')}
              </p>
            </div>
          </div>

          {/* Main content */}
          <div className="px-6 sm:px-8 lg:px-10 py-8 space-y-8 bg-slate-50">

            {/* Stats */}
            <motion.div
              className="grid grid-cols-2 lg:grid-cols-4 gap-4"
              initial="hidden"
              animate="visible"
              variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.08 } } }}
            >
              {STAT_CONFIG.map((cfg, i) => {
                const Icon = cfg.icon;
                return (
                  <motion.div
                    key={cfg.key}
                    variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' } } }}
                    className={cn('relative overflow-hidden rounded-2xl p-5 text-white shadow-lg', `bg-gradient-to-br ${cfg.gradient}`, cfg.shadow)}
                    style={{ boxShadow: `0 8px 24px var(--tw-shadow-color, rgba(0,0,0,0.12))` }}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="text-3xl font-extrabold tracking-tight"><AnimatedCount value={stats[i]} /></div>
                        <div className="text-xs font-semibold text-white/75 mt-1">{t(`modules.${cfg.key}`, cfg.label)}</div>
                      </div>
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-white/20">
                        <Icon className="w-5 h-5 text-white" />
                      </div>
                    </div>
                    <div className="pointer-events-none absolute -bottom-4 -right-4 w-20 h-20 rounded-full bg-white/10" />
                  </motion.div>
                );
              })}
            </motion.div>

            {/* Glassmorphism Filter Bar */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.4 }}
              className="rounded-2xl border border-white/60 shadow-sm p-4 flex flex-wrap gap-3 items-center"
              style={{ background: 'rgba(255,255,255,0.75)', backdropFilter: 'blur(12px)' }}
            >
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mr-1">{t('modules.filtersLabel', 'Filters')}</p>
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-indigo-400" />
                <input
                  type="text"
                  placeholder={t('modules.searchPlaceholder', 'Search modules...')}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-11 pr-4 py-2.5 rounded-full text-sm border border-indigo-100 bg-white/80 focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent transition-all shadow-sm placeholder-slate-400"
                />
              </div>
              {courses.length > 1 && (
                <select
                  value={courseFilter}
                  onChange={(e) => setCourseFilter(e.target.value)}
                  className="px-4 py-2.5 rounded-full text-sm border border-indigo-100 bg-white/80 focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent transition-all shadow-sm text-slate-700"
                >
                  <option value="all">{t('modules.allCourses', 'All Courses')}</option>
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>{c.title}</option>
                  ))}
                </select>
              )}
              {(search || courseFilter !== 'all') && (
                <button
                  onClick={() => { setSearch(''); setCourseFilter('all'); }}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-semibold text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-all"
                >
                  <X className="w-3.5 h-3.5" /> {t('common.clear', 'Clear')}
                </button>
              )}
            </motion.div>

            {/* Grid */}
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
                  {search || courseFilter !== 'all' ? t('modules.noModulesFound', 'No modules found') : t('modules.noModulesEmpty', 'No modules yet')}
                </h3>
                <p className="text-slate-400 text-sm mb-8 max-w-xs text-center">
                  {search || courseFilter !== 'all'
                    ? t('modules.tryAdjustingFilters2', 'Try adjusting your search or filters.')
                    : t('modules.addCourse', 'Enroll in a course to see its modules here.')}
                </p>
              </motion.div>
            ) : (
              <div className="space-y-8">
                {grouped.map(({ courseId, courseTitle, courseLevel, items }) => (
                  <div key={courseId} className="space-y-4">
                    {/* Course header */}
                    <div className="flex items-center gap-3 pb-2 border-b border-slate-100">
                      <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shrink-0">
                        <BookOpen className="w-4 h-4 text-white" />
                      </div>
                      <div>
                        <h2 className="text-base font-bold text-slate-900">{courseTitle}</h2>
                        <p className="text-xs text-slate-400">{items.length} module{items.length !== 1 ? 's' : ''}</p>
                      </div>
                      <Link
                        to={`/student/courses/${courseId}`}
                        className="ml-auto flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition-colors"
                      >
                        View Course <ChevronRight className="w-3.5 h-3.5" />
                      </Link>
                    </div>

                    {/* Module cards */}
                    <motion.div
                      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5"
                      initial="hidden"
                      animate="visible"
                      variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.07 } } }}
                    >
                      {items.map((mod) => {
                        const isActive = mod.status === 'active' || mod.status === 'published';
                        const pct = mod.lessonCount > 0 ? Math.round((mod.completedCount / mod.lessonCount) * 100) : 0;
                        const isCompleted = pct === 100 && mod.lessonCount > 0;
                        return (
                          <motion.div
                            key={mod.id}
                            variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: 'easeOut' } } }}
                            whileHover={{ y: -4, boxShadow: '0 20px 48px rgba(99,102,241,0.15)' }}
                            className="group relative bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden flex flex-col transition-all duration-200"
                          >
                            {/* Top accent bar */}
                            <div
                              className="h-1.5 w-full"
                              style={{
                                background: isCompleted
                                  ? 'linear-gradient(90deg,#059669,#10b981)'
                                  : isActive
                                  ? 'linear-gradient(90deg,#6366f1,#8b5cf6)'
                                  : 'linear-gradient(90deg,#f59e0b,#fbbf24)',
                              }}
                            />

                            <div className="p-5 flex flex-col flex-1">
                              {/* Icon + Status badge */}
                              <div className="flex items-start justify-between mb-3">
                                <div
                                  className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                                  style={{ background: 'linear-gradient(135deg,#e0e7ff,#ede9fe)' }}
                                >
                                  <Layers className="w-5 h-5 text-indigo-500" />
                                </div>
                                <span className={cn(
                                  'inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full',
                                  isCompleted
                                    ? 'bg-emerald-50 text-emerald-700'
                                    : isActive
                                    ? 'bg-indigo-50 text-indigo-700'
                                    : 'bg-amber-50 text-amber-700'
                                )}>
                                  <span className={cn('w-1.5 h-1.5 rounded-full', isCompleted ? 'bg-emerald-500' : isActive ? 'bg-indigo-500' : 'bg-amber-500')} />
                                  {isCompleted ? t('modules.completedStatus', 'Completed') : isActive ? t('modules.activeModule', 'Active') : t('modules.inactiveModule', 'Inactive')}
                                </span>
                              </div>

                              {/* Title & Description */}
                              <h3 className="text-sm font-bold text-slate-900 line-clamp-2 mb-1 leading-snug">{mod.title}</h3>
                              {mod.description && (
                                <p className="text-xs text-slate-400 line-clamp-2 mb-3">{mod.description}</p>
                              )}

                              {/* Meta */}
                              <div className="mt-auto space-y-2 pt-3 border-t border-slate-50">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="inline-flex items-center gap-1.5 px-2 py-1 bg-slate-100 text-slate-600 rounded-lg text-[11px] font-medium max-w-[130px] truncate">
                                    <BookOpen className="w-3 h-3 shrink-0" />
                                    <span className="truncate">{mod.courseTitle}</span>
                                  </span>
                                  {mod.courseLevel && (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-700">
                                      {mod.courseLevel}
                                    </span>
                                  )}
                                </div>

                                <div className="flex items-center justify-between">
                                  <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                                    <BookOpen className="w-3.5 h-3.5 text-slate-300" />
                                    {mod.lessonCount} {mod.lessonCount !== 1 ? t('modules.lessons', 'lessons') : t('modules.lesson', 'lesson')}
                                  </span>
                                  <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                                    <HelpCircle className="w-3.5 h-3.5 text-slate-300" />
                                    {pct}%
                                  </span>
                                </div>

                                {/* Progress bar */}
                                {mod.lessonCount > 0 && (
                                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                    <div
                                      className="h-full rounded-full transition-all"
                                      style={{
                                        width: `${pct}%`,
                                        background: isCompleted
                                          ? 'linear-gradient(90deg,#059669,#10b981)'
                                          : 'linear-gradient(90deg,#6366f1,#8b5cf6)',
                                      }}
                                    />
                                  </div>
                                )}

                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-1">
                                    <span className="w-6 h-6 flex items-center justify-center bg-indigo-50 text-indigo-600 rounded-lg text-[11px] font-bold">
                                      {mod.order}
                                    </span>
                                    <span className="text-[11px] text-slate-400">{t('modules.orderText', 'order')}</span>
                                  </div>
                                  {mod.completedCount > 0 && (
                                    <span className="text-[11px] font-semibold text-emerald-600">
                                      {mod.completedCount}/{mod.lessonCount} {t('modules.lessons', 'lessons')}
                                    </span>
                                  )}
                                </div>
                              </div>

                              {/* Action button */}
                              <div className="flex items-center gap-1.5 pt-3 sm:opacity-0 sm:group-hover:opacity-100 opacity-100 transition-all duration-200 sm:translate-y-1 sm:group-hover:translate-y-0">
                                <Link
                                  to={`/student/lessons?courseId=${mod.course_id}`}
                                  className="flex-1 flex items-center justify-center gap-1 py-2 rounded-xl text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-all"
                                >
                                  <PlayCircle className="w-3.5 h-3.5" /> {t('modules.viewLessons', 'View Lessons')}
                                </Link>
                              </div>
                            </div>
                          </motion.div>
                        );
                      })}
                    </motion.div>
                  </div>
                ))}
              </div>
            )}

            {/* Pagination */}
            {!loading && totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 pt-4">
                <button
                  onClick={() => { setCurrentPage((p) => Math.max(1, p - 1)); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                  disabled={currentPage === 1}
                  className="w-9 h-9 flex items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 disabled:opacity-40 transition-all shadow-sm"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                  <button
                    key={page}
                    onClick={() => { setCurrentPage(page); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                    className={cn(
                      'w-9 h-9 flex items-center justify-center rounded-xl text-sm font-semibold transition-all',
                      currentPage === page ? 'bg-indigo-600 text-white shadow-md' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    )}
                  >
                    {page}
                  </button>
                ))}
                <button
                  onClick={() => { setCurrentPage((p) => Math.min(totalPages, p + 1)); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                  disabled={currentPage === totalPages}
                  className="w-9 h-9 flex items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 disabled:opacity-40 transition-all shadow-sm"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </StudentLayout>
  );
}
