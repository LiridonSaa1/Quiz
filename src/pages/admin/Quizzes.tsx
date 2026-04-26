import React, { useEffect, useState } from 'react';
import AdminLayout from '../../components/layout/AdminLayout';
import {
  Search, FileText, BookOpen, Clock, HelpCircle, PlayCircle,
  ChevronRight, X, Shuffle, RotateCcw, Target, User,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../../lib/utils';
import { motion, useMotionValue, useSpring, useTransform } from 'motion/react';
import { authFetch } from '../../lib/apiUrl';

function AnimatedCount({ value }: { value: number }) {
  const motionVal = useMotionValue(0);
  const spring = useSpring(motionVal, { stiffness: 120, damping: 20 });
  const display = useTransform(spring, (v) => Math.round(v).toString());

  useEffect(() => {
    motionVal.set(value);
  }, [value, motionVal]);

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

interface QuizRow {
  id: string;
  title: string;
  description?: string;
  courseId: string;
  courseName: string;
  teacherName: string;
  questionCount: number;
  timeLimit: number;
  published: boolean;
  settings?: Record<string, unknown> & { passingScore?: number; shuffleQuestions?: boolean; allowRetry?: boolean };
  createdAt: string;
}

const STAT_CONFIG = [
  { label: 'Total Quizzes', gradient: 'from-indigo-500 to-indigo-600', iconBg: 'bg-white/20', shadow: 'shadow-indigo-500/25', icon: FileText },
  { label: 'Published', gradient: 'from-emerald-500 to-emerald-600', iconBg: 'bg-white/20', shadow: 'shadow-emerald-500/25', icon: PlayCircle },
  { label: 'Drafts', gradient: 'from-amber-500 to-amber-600', iconBg: 'bg-white/20', shadow: 'shadow-amber-500/25', icon: X },
  { label: 'Total Questions', gradient: 'from-violet-500 to-violet-600', iconBg: 'bg-white/20', shadow: 'shadow-violet-500/25', icon: HelpCircle },
];

export default function AdminQuizzes() {
  const [quizzes, setQuizzes] = useState<QuizRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [courseFilter, setCourseFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [courseOptions, setCourseOptions] = useState<{ id: string; name: string }[]>([]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await authFetch('/api/admin/quizzes');
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.success) throw new Error(json?.error || 'Failed to load quizzes');

      setQuizzes(Array.isArray(json.quizzes) ? json.quizzes : []);
      setCourseOptions(Array.isArray(json.courses) ? json.courses : []);
    } catch {
      toast.error('Failed to load quizzes');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const filtered = quizzes.filter(q => {
    const matchSearch =
      q.title.toLowerCase().includes(search.toLowerCase()) ||
      q.teacherName.toLowerCase().includes(search.toLowerCase()) ||
      q.courseName.toLowerCase().includes(search.toLowerCase());
    const matchCourse = courseFilter === 'all' || q.courseId === courseFilter;
    const matchStatus = statusFilter === 'all'
      ? true
      : statusFilter === 'published' ? q.published : !q.published;
    return matchSearch && matchCourse && matchStatus;
  });

  const totalQuestions = quizzes.reduce((a, q) => a + q.questionCount, 0);

  const stats = [
    { ...STAT_CONFIG[0], value: quizzes.length },
    { ...STAT_CONFIG[1], value: quizzes.filter(q => q.published).length },
    { ...STAT_CONFIG[2], value: quizzes.filter(q => !q.published).length },
    { ...STAT_CONFIG[3], value: totalQuestions },
  ];

  const hasActiveFilters = search || courseFilter !== 'all' || statusFilter !== 'all';

  const passLabel = (q: QuizRow) => {
    const s = q.settings?.passingScore;
    if (typeof s === 'number') return `${s}%`;
    return '—';
  };

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
                    <span className="text-indigo-200 tracking-wider uppercase">Quizzes</span>
                  </nav>
                  <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight leading-tight">
                    Quizzes
                  </h1>
                  <p className="text-indigo-200 text-sm mt-2 max-w-md">
                    Overview of all quizzes and assessments across the platform.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="px-6 sm:px-8 lg:px-10 py-8 space-y-8 bg-slate-50">
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
                  placeholder="Search by title, teacher or course..."
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
                {courseOptions.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
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
                  {hasActiveFilters ? 'No results found' : 'No quizzes yet'}
                </h3>
                <p className="text-slate-400 text-sm mb-8 max-w-xs text-center">
                  {hasActiveFilters
                    ? 'Try adjusting your search or filters.'
                    : 'Quizzes created by teachers will appear here.'}
                </p>
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
                {filtered.map((quiz) => {
                  const published = quiz.published;
                  return (
                    <motion.div
                      key={quiz.id}
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
                            <FileText className="w-5 h-5 text-indigo-500" />
                          </div>
                          <span
                            className={cn(
                              'inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full',
                              published
                                ? 'bg-emerald-50 text-emerald-700'
                                : 'bg-amber-50 text-amber-700'
                            )}
                          >
                            <span className={cn('w-1.5 h-1.5 rounded-full', published ? 'bg-emerald-500' : 'bg-amber-500')} />
                            {published ? 'Published' : 'Draft'}
                          </span>
                        </div>

                        <h3 className="text-sm font-bold text-slate-900 line-clamp-2 mb-1 leading-snug">{quiz.title}</h3>
                        {quiz.description && (
                          <p className="text-xs text-slate-400 line-clamp-2 mb-3">{quiz.description}</p>
                        )}

                        {(quiz.settings?.shuffleQuestions || quiz.settings?.allowRetry) && (
                          <div className="flex flex-wrap gap-1.5 mb-2">
                            {quiz.settings?.shuffleQuestions && (
                              <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-600 text-[10px] font-semibold">
                                <Shuffle className="w-3 h-3" /> Shuffle
                              </span>
                            )}
                            {quiz.settings?.allowRetry && (
                              <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md bg-violet-50 text-violet-600 text-[10px] font-semibold">
                                <RotateCcw className="w-3 h-3" /> Retry
                              </span>
                            )}
                          </div>
                        )}

                        <div className="mt-auto space-y-2 pt-3 border-t border-slate-50">
                          <div className="flex items-center justify-between gap-2">
                            <span className="inline-flex items-center gap-1.5 px-2 py-1 bg-slate-100 text-slate-600 rounded-lg text-[11px] font-medium max-w-[130px] truncate">
                              <BookOpen className="w-3 h-3 shrink-0" />
                              <span className="truncate">{quiz.courseName}</span>
                            </span>
                            <span className="inline-flex items-center gap-1 text-xs text-slate-400 shrink-0">
                              <HelpCircle className="w-3.5 h-3.5 text-slate-300" />
                              {quiz.questionCount} Q
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-[11px] text-slate-500">
                            <span className="inline-flex items-center gap-1">
                              <Clock className="w-3.5 h-3.5 text-slate-300" />
                              {quiz.timeLimit} min
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <Target className="w-3.5 h-3.5 text-slate-300" />
                              Pass {passLabel(quiz)}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <User className="w-3 h-3 text-slate-400 shrink-0" />
                            <span className="text-[11px] text-slate-500 truncate">{quiz.teacherName}</span>
                          </div>
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
    </AdminLayout>
  );
}
