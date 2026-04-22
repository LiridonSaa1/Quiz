import React, { useEffect, useState, useMemo } from 'react';
import { supabase } from '../../supabase';
import StudentLayout from '../../components/layout/StudentLayout';
import { Link } from 'react-router-dom';
import { useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import {
  HelpCircle, Search, Clock, Play, CheckCircle2,
  BookOpen, Sparkles, Trophy, Filter, ChevronRight, Zap
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { fetchAttemptRowsByStudentId } from '../../lib/quizAttempts';
import { authFetch } from '../../lib/apiUrl';

interface QuizItem {
  id: string;
  courseId: string;
  title: string;
  description: string;
  timeLimit: number;
  totalMarks: number;
  passMark: number;
  courseTitle: string;
  attempted: boolean;
  bestScore: number | null;
  bestTotal: number | null;
  passed: boolean | null;
  latestAttemptId: string | null;
}

const COURSE_COLORS = [
  'from-indigo-500 to-violet-500',
  'from-emerald-500 to-teal-500',
  'from-amber-500 to-orange-500',
  'from-blue-500 to-cyan-500',
  'from-rose-500 to-pink-500',
  'from-fuchsia-500 to-purple-500',
];

export default function StudentQuizzes() {
  const [quizzes, setQuizzes] = useState<QuizItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'new' | 'attempted' | 'passed'>('all');
  const [searchParams] = useSearchParams();
  const selectedCourseId = (searchParams.get('courseId') || '').trim();

  useEffect(() => {
    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const uid = session.user.id;

      const courseColorMap: Record<string, string> = {};
      const [quizzesRes, attemptsSnap] = await Promise.all([
        authFetch(
          selectedCourseId
            ? `/api/student/quizzes?courseId=${encodeURIComponent(selectedCourseId)}`
            : '/api/student/quizzes'
        ),
        fetchAttemptRowsByStudentId(supabase, uid),
      ]);
      const quizzesJson = quizzesRes.ok ? await quizzesRes.json() : { quizzes: [] };
      const quizRows = Array.isArray(quizzesJson?.quizzes) ? quizzesJson.quizzes : [];
      if (!quizRows.length) { setQuizzes([]); setLoading(false); return; }

      const seenCourseIds: string[] = [];
      quizRows.forEach((q: any) => {
        const cid = String(q?.course_id || '');
        if (cid && !seenCourseIds.includes(cid)) seenCourseIds.push(cid);
      });
      seenCourseIds.forEach((courseId, i) => {
        courseColorMap[courseId] = COURSE_COLORS[i % COURSE_COLORS.length];
      });

      const attemptMap: Record<string, { score: number; total: number; passed: boolean }> = {};
      const latestAttemptMap: Record<string, string> = {};
      (attemptsSnap || []).forEach((a: any) => {
        const prev = attemptMap[a.quiz_id];
        const pct = a.total_points > 0 ? a.score / a.total_points : 0;
        if (!prev || pct > (prev.score / prev.total)) {
          attemptMap[a.quiz_id] = { score: a.score, total: a.total_points, passed: a.passed ?? (pct >= 0.5) };
        }
        if (!latestAttemptMap[a.quiz_id]) {
          latestAttemptMap[a.quiz_id] = String(a.id);
        }
      });

      const mapped: QuizItem[] = (quizRows || []).map((q: any) => {
        const att = attemptMap[q.id];
        return {
          id: q.id,
          title: q.title,
          description: q.description || '',
          timeLimit: q.timeLimit ?? q.time_limit ?? 0,
          totalMarks: q.totalMarks ?? q.total_marks ?? 0,
          passMark: q.passMark ?? q.pass_mark ?? 0,
          courseTitle: q.course_title || 'Course',
          attempted: !!att,
          bestScore: att?.score ?? null,
          bestTotal: att?.total ?? null,
          passed: att?.passed ?? null,
          latestAttemptId: latestAttemptMap[q.id] ?? null,
          courseId: String(q.course_id || ''),
        };
      });

      setQuizzes(mapped);
      setLoading(false);
    };
    load();
  }, [selectedCourseId]);

  const filtered = useMemo(() => {
    let list = quizzes;
    if (search) list = list.filter(q => q.title.toLowerCase().includes(search.toLowerCase()) || q.courseTitle.toLowerCase().includes(search.toLowerCase()));
    if (selectedCourseId) list = list.filter((q: any) => q.courseId === selectedCourseId);
    if (filter === 'new') list = list.filter(q => !q.attempted);
    if (filter === 'attempted') list = list.filter(q => q.attempted);
    if (filter === 'passed') list = list.filter(q => q.passed);
    return list;
  }, [quizzes, search, filter, selectedCourseId]);

  const stats = {
    total: quizzes.length,
    attempted: quizzes.filter(q => q.attempted).length,
    passed: quizzes.filter(q => q.passed).length,
  };
  const hasActiveFilters = search.trim() !== '' || filter !== 'all';

  const FILTERS = [
    { key: 'all', label: 'All' },
    { key: 'new', label: 'New' },
    { key: 'attempted', label: 'Attempted' },
    { key: 'passed', label: 'Passed' },
  ] as const;

  return (
    <StudentLayout>
      <div className="space-y-8">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
          className="relative rounded-3xl overflow-hidden bg-gradient-to-br from-slate-900 via-violet-950 to-slate-900 p-8 shadow-2xl">
          <motion.div className="absolute top-0 right-0 w-80 h-80 bg-violet-600/30 rounded-full blur-3xl pointer-events-none"
            animate={{ scale: [1, 1.1, 1] }} transition={{ duration: 7, repeat: Infinity }} />
          <motion.div className="absolute -bottom-16 -left-16 w-56 h-56 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none"
            animate={{ scale: [1, 1.15, 1] }} transition={{ duration: 5, repeat: Infinity, delay: 1 }} />
          <div className="relative z-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
            <div>
              <div className="inline-flex items-center gap-2 bg-white/10 border border-white/20 rounded-full px-3 py-1.5 mb-3">
                <HelpCircle className="w-3.5 h-3.5 text-violet-300" />
                <span className="text-white/80 text-xs font-semibold">Quizzes</span>
              </div>
              <h1 className="text-3xl font-black text-white">My Quizzes</h1>
              <p className="text-slate-400 text-sm mt-1">Test your knowledge and track your scores.</p>
            </div>
            <div className="flex gap-3">
              {[
                { label: 'Total', value: stats.total, color: 'from-violet-500 to-purple-600', icon: HelpCircle },
                { label: 'Done', value: stats.attempted, color: 'from-blue-500 to-indigo-600', icon: CheckCircle2 },
                { label: 'Passed', value: stats.passed, color: 'from-emerald-500 to-teal-500', icon: Trophy },
              ].map((s, i) => (
                <motion.div key={s.label} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + i * 0.08 }}
                  className="bg-white/8 border border-white/10 rounded-2xl p-3 text-center min-w-[68px]">
                  <div className={`w-7 h-7 rounded-xl bg-gradient-to-br ${s.color} flex items-center justify-center mx-auto mb-1.5`}>
                    <s.icon className="w-3.5 h-3.5 text-white" />
                  </div>
                  <div className="text-xl font-black text-white">{s.value}</div>
                  <div className="text-slate-400 text-[10px] font-semibold">{s.label}</div>
                </motion.div>
              ))}
            </div>
          </div>
        </motion.div>

        {/* Search + Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search quizzes..."
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-2xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400 shadow-sm" />
          </div>
          <div className="flex gap-2 flex-wrap">
            {FILTERS.map(f => (
              <button key={f.key} onClick={() => setFilter(f.key)}
                className={cn('px-4 py-2.5 rounded-2xl text-sm font-semibold transition-all border',
                  filter === f.key ? 'bg-violet-600 text-white border-transparent shadow-lg shadow-violet-200' : 'bg-white border-slate-200 text-slate-600 hover:border-violet-300')}>
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Grid */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {[1,2,3,4,5,6].map(i => (
              <div key={i} className="bg-white rounded-3xl border border-slate-100 overflow-hidden shadow-sm">
                <div className="h-3 bg-slate-200 animate-pulse" />
                <div className="p-5 space-y-3">
                  <div className="h-5 w-3/4 bg-slate-100 rounded-xl animate-pulse" />
                  <div className="h-3 w-full bg-slate-100 rounded animate-pulse" />
                  <div className="h-10 bg-slate-100 rounded-2xl animate-pulse mt-4" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center justify-center py-24 text-center">
            <motion.div animate={{ y: [0, -8, 0] }} transition={{ duration: 3, repeat: Infinity }}
              className="w-16 h-16 bg-violet-50 rounded-3xl flex items-center justify-center mb-4 shadow-lg">
              <HelpCircle className="w-8 h-8 text-violet-400" />
            </motion.div>
            <p className="text-slate-600 font-bold">No quizzes found</p>
            <p className="text-slate-400 text-sm mt-1">
              {hasActiveFilters ? 'No results for current filter.' : 'No enrolled content yet.'}
            </p>
          </motion.div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            <AnimatePresence>
              {filtered.map((quiz, i) => {
                const pct = quiz.bestScore != null && quiz.bestTotal ? Math.round((quiz.bestScore / quiz.bestTotal) * 100) : null;
                const stateLabel = quiz.passed ? 'Passed' : quiz.attempted ? 'Attempted' : 'New';
                return (
                  <motion.div key={quiz.id}
                    initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.35, delay: i * 0.05 }}
                    whileHover={{ y: -4, transition: { duration: 0.2 } }}
                    className="bg-white rounded-3xl border border-slate-100 overflow-hidden shadow-sm hover:shadow-xl hover:shadow-slate-200/80 transition-shadow flex flex-col group">
                    <div className={cn('h-1.5 bg-gradient-to-r', COURSE_COLORS[i % COURSE_COLORS.length])} />
                    <div className="p-5 flex flex-col flex-1">
                      <div className="flex items-start justify-between mb-3">
                        <div className="p-2.5 bg-violet-50 rounded-xl group-hover:bg-violet-100 transition-colors">
                          <HelpCircle className="w-4 h-4 text-violet-600" />
                        </div>
                        {quiz.attempted && pct != null && (
                          <span className={cn('text-xs font-bold px-2.5 py-1 rounded-xl',
                            quiz.passed ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600')}>
                            {pct}%
                          </span>
                        )}
                      </div>
                      <div className="flex-1">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{quiz.courseTitle}</span>
                        <h3 className="text-sm font-black text-slate-900 mt-0.5 mb-2 line-clamp-2 group-hover:text-violet-600 transition-colors">{quiz.title}</h3>
                        <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed mb-4">{quiz.description || 'Test your understanding of this topic.'}</p>
                        <div className="flex gap-2 mb-5">
                          <span className="flex items-center gap-1 bg-slate-50 border border-slate-100 text-slate-500 text-[11px] font-semibold px-2 py-1 rounded-lg">
                            <Clock className="w-3 h-3" /> {quiz.timeLimit} min
                          </span>
                          <span className={cn(
                            'flex items-center gap-1 border text-[11px] font-semibold px-2 py-1 rounded-lg',
                            quiz.passed
                              ? 'bg-emerald-50 border-emerald-100 text-emerald-700'
                              : quiz.attempted
                                ? 'bg-blue-50 border-blue-100 text-blue-700'
                                : 'bg-violet-50 border-violet-100 text-violet-700'
                          )}>
                            {quiz.passed ? <Trophy className="w-3 h-3" /> : quiz.attempted ? <CheckCircle2 className="w-3 h-3" /> : <Sparkles className="w-3 h-3" />}
                            {stateLabel}
                          </span>
                        </div>
                      </div>
                      <Link to={quiz.passed && quiz.latestAttemptId ? `/student/results/${quiz.latestAttemptId}` : `/student/quiz/${quiz.id}`}
                        className={cn('flex items-center justify-center gap-2 w-full py-2.5 rounded-2xl text-sm font-bold transition-all',
                          quiz.attempted
                            ? 'bg-slate-900 text-white hover:bg-slate-800 shadow-lg shadow-slate-200'
                            : 'bg-gradient-to-r from-violet-500 to-purple-500 text-white hover:opacity-90 shadow-lg shadow-violet-200/60')}>
                        {quiz.passed
                          ? <><CheckCircle2 className="w-4 h-4" /> View Result</>
                          : quiz.attempted
                            ? <><Zap className="w-4 h-4" /> Retake</>
                            : <><Play className="w-4 h-4" /> Start Quiz</>}
                        <ChevronRight className="w-4 h-4 ml-auto" />
                      </Link>
                      {quiz.attempted && !quiz.passed && quiz.latestAttemptId && (
                        <Link
                          to={`/student/results/${quiz.latestAttemptId}`}
                          className="mt-2 inline-flex items-center justify-center gap-2 w-full py-2.5 rounded-2xl text-xs font-bold transition-all bg-slate-100 text-slate-600 hover:bg-slate-200"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          View Result
                        </Link>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>
    </StudentLayout>
  );
}
