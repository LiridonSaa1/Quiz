import React, { useEffect, useState, useMemo } from 'react';
import { supabase } from '../../supabase';
import StudentLayout from '../../components/layout/StudentLayout';
import { motion, AnimatePresence } from 'motion/react';
import { BookOpen, Search, Video, FileText, HelpCircle, Clock, Lock, Unlock } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useSearchParams } from 'react-router-dom';
import { authFetch } from '../../lib/apiUrl';
import { Link } from 'react-router-dom';
import { Play, ChevronRight } from 'lucide-react';

const TYPE_CFG: Record<string, { label: string; icon: React.ElementType; color: string; bg: string; border: string }> = {
  video: { label: 'Video', icon: Video, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-100' },
  text:  { label: 'Text',  icon: FileText, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-100' },
  quiz:  { label: 'Quiz',  icon: HelpCircle, color: 'text-violet-600', bg: 'bg-violet-50', border: 'border-violet-100' },
};

const COURSE_GRADIENTS = [
  'from-indigo-500 to-violet-500', 'from-emerald-500 to-teal-500',
  'from-amber-500 to-orange-500',  'from-blue-500 to-cyan-500',
  'from-rose-500 to-pink-500',     'from-fuchsia-500 to-purple-500',
];

interface LessonItem {
  id: string;
  title: string;
  shortDescription: string;
  type: string;
  durationMinutes: number;
  order: number;
  status: string;
  isFreePreview: boolean;
  moduleTitle: string;
  courseTitle: string;
  courseGradient: string;
  progressCompleted?: boolean;
  lastVideoPosition?: number;
}

type LessonProgress = {
  completed: boolean;
  started: boolean;
};

export default function StudentLessons() {
  const [lessons, setLessons] = useState<LessonItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [searchParams] = useSearchParams();
  const selectedCourseId = (searchParams.get('courseId') || '').trim();

  useEffect(() => {
    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const lessonsRes = await authFetch(
        selectedCourseId
          ? `/api/student/lessons?courseId=${encodeURIComponent(selectedCourseId)}`
          : '/api/student/lessons'
      );
      const lessonsJson = lessonsRes.ok ? await lessonsRes.json() : { lessons: [] };
      const rows = Array.isArray(lessonsJson?.lessons) ? lessonsJson.lessons : [];
      if (!rows.length) { setLoading(false); return; }

      const courseTitleSet = Array.from(
        new Set(rows.map((r: any) => String(r.course_title || 'Course')))
      ) as string[];
      const courseGradientMap: Record<string, string> = {};
      courseTitleSet.forEach((title, i) => {
        courseGradientMap[title] = COURSE_GRADIENTS[i % COURSE_GRADIENTS.length];
      });

      const mapped: LessonItem[] = rows.map((l: any) => {
        const courseTitle = String(l.course_title || 'Course');
        return {
          id: l.id,
          title: l.title,
          shortDescription: l.short_description || l.shortDescription || '',
          type: l.type || 'text',
          durationMinutes: l.duration_minutes ?? l.durationMinutes ?? 0,
          order: l.order ?? 0,
          status: l.status,
          isFreePreview: l.is_free_preview ?? l.isFreePreview ?? false,
          moduleTitle: String(l.module_title || ''),
          courseTitle,
          courseGradient: courseGradientMap[courseTitle] || COURSE_GRADIENTS[0],
          progressCompleted: Boolean(l.progress_completed),
          lastVideoPosition: Number(l.last_video_position || 0),
        };
      });

      setLessons(mapped);
      setLoading(false);
    };
    load();
  }, [selectedCourseId]);

  const filtered = useMemo(() => {
    let list = lessons;
    if (search) list = list.filter(l => l.title.toLowerCase().includes(search.toLowerCase()) || l.courseTitle.toLowerCase().includes(search.toLowerCase()));
    if (typeFilter !== 'all') list = list.filter(l => l.type === typeFilter);
    return list;
  }, [lessons, search, typeFilter]);

  const totalMinutes = lessons.reduce((s, l) => s + l.durationMinutes, 0);
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  const hasActiveFilters = search.trim() !== '' || typeFilter !== 'all';
  const lessonProgressById = useMemo(() => {
    const out: Record<string, LessonProgress> = {};
    lessons.forEach((lesson) => {
      out[lesson.id] = {
        completed: Boolean(lesson.progressCompleted),
        started: Number(lesson.lastVideoPosition || 0) > 0,
      };
    });
    return out;
  }, [lessons]);

  return (
    <StudentLayout>
      <div className="min-h-screen -mx-3 sm:-mx-4 md:-mx-6 lg:-mx-8 -mt-6">
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
                  <div className="inline-flex items-center gap-2 bg-white/10 border border-white/20 rounded-full px-3 py-1.5 mb-3">
                    <BookOpen className="w-3.5 h-3.5 text-indigo-200" />
                    <span className="text-white/85 text-xs font-semibold">Student Portal</span>
                  </div>
                  <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight leading-tight">My Lessons</h1>
                  <p className="text-indigo-200 text-sm mt-2 max-w-md">
                    {lessons.length} lessons available · {hours > 0 ? `${hours}h ` : ''}{mins}m total content.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="px-6 sm:px-8 lg:px-10 py-8 space-y-8 bg-slate-50">
            <motion.div className="grid grid-cols-2 lg:grid-cols-4 gap-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              {[
                { label: 'Total Lessons', value: lessons.length, gradient: 'from-indigo-500 to-indigo-600' },
                { label: 'Video', value: lessons.filter(l => l.type === 'video').length, gradient: 'from-blue-500 to-blue-600' },
                { label: 'Text', value: lessons.filter(l => l.type === 'text').length, gradient: 'from-amber-500 to-amber-600' },
                { label: 'Quiz', value: lessons.filter(l => l.type === 'quiz').length, gradient: 'from-violet-500 to-violet-600' },
              ].map((stat) => (
                <div key={stat.label} className={cn('relative overflow-hidden rounded-2xl p-5 text-white shadow-lg', `bg-gradient-to-br ${stat.gradient}`)}>
                  <div className="text-3xl font-extrabold tracking-tight">{stat.value}</div>
                  <div className="text-xs font-semibold text-white/80 mt-1">{stat.label}</div>
                  <div className="pointer-events-none absolute -bottom-4 -right-4 w-20 h-20 rounded-full bg-white/10" />
                </div>
              ))}
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1, duration: 0.35 }}
              className="rounded-2xl border border-white/60 shadow-sm p-4 flex flex-wrap gap-3 items-center"
              style={{ background: 'rgba(255,255,255,0.75)', backdropFilter: 'blur(12px)' }}
            >
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mr-1">Filters</p>
              <div className="relative flex-1 min-w-[180px]">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-indigo-400" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search lessons..."
                  className="w-full pl-11 pr-4 py-2.5 rounded-full text-sm border border-indigo-100 bg-white/80 focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent transition-all shadow-sm placeholder-slate-400"
                />
              </div>
              {['all', 'video', 'text', 'quiz'].map(t => (
                <button
                  key={t}
                  onClick={() => setTypeFilter(t)}
                  className={cn(
                    'px-4 py-2 rounded-full text-xs font-semibold capitalize transition-all border',
                    typeFilter === t
                      ? 'bg-violet-600 text-white border-violet-600 shadow-md'
                      : 'bg-white border-indigo-100 text-slate-600 hover:border-violet-300'
                  )}
                >
                  {t === 'all' ? 'All Types' : t}
                </button>
              ))}
              {hasActiveFilters && (
                <button
                  onClick={() => { setSearch(''); setTypeFilter('all'); }}
                  className="px-3 py-2 rounded-full text-xs font-semibold text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-all"
                >
                  Clear
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
                className="py-20 flex flex-col items-center justify-center bg-white rounded-2xl border border-dashed border-indigo-200 shadow-sm"
              >
                <BookOpen className="w-10 h-10 text-indigo-300" />
                <h3 className="text-xl font-extrabold text-slate-800 mt-4 mb-2">
                  {hasActiveFilters ? 'No results found' : 'No lessons yet'}
                </h3>
                <p className="text-slate-400 text-sm max-w-xs text-center">
                  {hasActiveFilters ? 'Try adjusting your search or lesson type filter.' : 'Enroll in courses to access lessons.'}
                </p>
              </motion.div>
            ) : (
              <motion.div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <AnimatePresence>
                  {filtered.map((lesson) => {
                    const cfg = TYPE_CFG[lesson.type] || TYPE_CFG.text;
                    const Icon = cfg.icon;
                    const locked = lesson.status === 'locked';
                    const isCompleted = Boolean(lessonProgressById[lesson.id]?.completed);
                    const isStarted = Boolean(lessonProgressById[lesson.id]?.started);
                    const primaryLabel = isCompleted ? 'Review' : locked ? 'View details' : isStarted ? 'Continue' : 'Start';
                    return (
                      <motion.div
                        key={lesson.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 12 }}
                        whileHover={{ y: -4, boxShadow: '0 20px 48px rgba(99,102,241,0.15)' }}
                        className="group relative bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden flex flex-col transition-all duration-200"
                      >
                        <div className="h-1.5 w-full" style={{ background: `linear-gradient(90deg, var(--tw-gradient-stops))` }} />
                        <div className={cn('h-1.5 w-full bg-gradient-to-r', lesson.courseGradient)} />

                        <div className="p-5 flex flex-col flex-1">
                          <div className="flex items-start justify-between mb-3">
                            <div className={cn('w-11 h-11 rounded-xl flex items-center justify-center shrink-0', cfg.bg)}>
                              <Icon className={cn('w-5 h-5', cfg.color)} />
                            </div>
                            <span className={cn(
                              'inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full',
                              isCompleted
                                ? 'bg-emerald-50 text-emerald-700'
                                : locked
                                  ? 'bg-rose-50 text-rose-700'
                                  : 'bg-blue-50 text-blue-700'
                            )}>
                              {isCompleted ? <Unlock className="w-3 h-3" /> : locked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                              {isCompleted ? 'Completed' : locked ? 'Locked' : 'Open'}
                            </span>
                          </div>

                          <h3 className="text-sm font-bold text-slate-900 line-clamp-2 mb-1 leading-snug">{lesson.title}</h3>
                          {lesson.shortDescription && (
                            <p className="text-xs text-slate-400 line-clamp-2 mb-2">{lesson.shortDescription}</p>
                          )}

                          <div className="mt-auto space-y-2 pt-3 border-t border-slate-50">
                            <div className="flex items-center justify-between">
                              <span className="inline-flex items-center gap-1.5 px-2 py-1 bg-slate-100 text-slate-600 rounded-lg text-[11px] font-medium max-w-[130px] truncate">
                                <span className="truncate">{lesson.moduleTitle || 'General Module'}</span>
                              </span>
                              <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                                <Clock className="w-3.5 h-3.5 text-slate-300" />
                                {lesson.durationMinutes} min
                              </span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] font-semibold text-slate-400 truncate">{lesson.courseTitle}</span>
                              <span className={cn('text-[10px] font-bold px-2 py-1 rounded-full', cfg.bg, cfg.color)}>{cfg.label}</span>
                            </div>
                            <Link
                              to={`/student/lessons/${encodeURIComponent(lesson.id)}`}
                              className={cn(
                                'mt-2 inline-flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-xs font-bold transition-all',
                                isCompleted
                                  ? 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-md shadow-emerald-200/70'
                                  : locked
                                  ? 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                                  : 'bg-gradient-to-r from-indigo-500 to-violet-500 text-white hover:opacity-90 shadow-md shadow-indigo-200/70'
                              )}
                            >
                              <Play className="w-3.5 h-3.5" />
                              {primaryLabel}
                              <ChevronRight className="w-3.5 h-3.5 ml-auto" />
                            </Link>
                            {!locked && (
                              <Link
                                to={`/student/lessons/${encodeURIComponent(lesson.id)}`}
                                className="inline-flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-xs font-bold transition-all bg-slate-100 text-slate-600 hover:bg-slate-200"
                              >
                                View details
                              <ChevronRight className="w-3.5 h-3.5 ml-auto" />
                              </Link>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </motion.div>
            )}
          </div>
        </div>
      </div>
    </StudentLayout>
  );
}
