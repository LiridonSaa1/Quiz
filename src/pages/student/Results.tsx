import React, { useEffect, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../supabase';
import StudentLayout from '../../components/layout/StudentLayout';
import { motion, AnimatePresence } from 'motion/react';
import {
  BarChart3, Search, CheckCircle2, XCircle, Trophy,
  Clock, ChevronRight, Filter, TrendingUp, Target, Zap,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '../../lib/utils';
import { format, formatDistanceToNow } from 'date-fns';
import { fetchAttemptRowsByStudentId } from '../../lib/quizAttempts';

type TabFilter = 'all' | 'passed' | 'failed';

export default function StudentResults() {
  const { t } = useTranslation();
  const [attempts, setAttempts] = useState<any[]>([]);
  const [quizMap, setQuizMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<TabFilter>('all');

  useEffect(() => {
    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const uid = session.user.id;

      const [attemptRows, coursesSnap] = await Promise.all([
        fetchAttemptRowsByStudentId(supabase, uid),
        supabase.from('courses').select('id').contains('student_ids', [uid]),
      ]);

      const courseIds = (coursesSnap.data || []).map((c: any) => c.id);
      if (courseIds.length > 0) {
        const { data: quizzes } = await supabase.from('quizzes').select('id, title').in('course_id', courseIds);
        const m: Record<string, string> = {};
        (quizzes || []).forEach((q: any) => { m[q.id] = q.title; });
        setQuizMap(m);
      }

      setAttempts(attemptRows || []);
      setLoading(false);
    };
    load();
  }, []);

  const filtered = useMemo(() => {
    let list = attempts;
    if (search) list = list.filter(a => (quizMap[a.quiz_id] || '').toLowerCase().includes(search.toLowerCase()));
    if (tab === 'passed') list = list.filter(a => a.total_points > 0 && (a.score / a.total_points) >= 0.5);
    if (tab === 'failed') list = list.filter(a => a.total_points > 0 && (a.score / a.total_points) < 0.5);
    return list;
  }, [attempts, search, tab, quizMap]);

  const stats = {
    total: attempts.length,
    passed: attempts.filter(a => a.total_points > 0 && (a.score / a.total_points) >= 0.5).length,
    failed: attempts.filter(a => a.total_points > 0 && (a.score / a.total_points) < 0.5).length,
    avg: attempts.length > 0
      ? Math.round(attempts.reduce((s, a) => s + (a.total_points > 0 ? (a.score / a.total_points) * 100 : 0), 0) / attempts.length)
      : 0,
  };

  const TABS: { key: TabFilter; label: string; count: number }[] = [
    { key: 'all', label: t('student.quizzes.all'), count: attempts.length },
    { key: 'passed', label: t('student.quizzes.passed'), count: stats.passed },
    { key: 'failed', label: t('student.quizResults.failedTab'), count: stats.failed },
  ];

  return (
    <StudentLayout>
      <div className="space-y-6 max-w-7xl mx-auto">

        {/* Header banner */}
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative rounded-2xl overflow-hidden bg-gradient-to-br from-slate-900 via-emerald-950 to-slate-900 p-6 shadow-xl"
        >
          <div className="absolute top-0 right-0 w-72 h-72 bg-emerald-500/20 rounded-full blur-3xl pointer-events-none" />
          <div className="relative z-10 flex flex-col sm:flex-row sm:items-center gap-6">
            <div className="flex-1">
              <div className="inline-flex items-center gap-2 bg-white/10 border border-white/20 rounded-full px-3 py-1 mb-3">
                <BarChart3 className="w-3.5 h-3.5 text-emerald-300" />
                <span className="text-white/80 text-xs font-semibold">{t('student.results.quizResults')}</span>
              </div>
              <h1 className="text-2xl font-black text-white">{t('student.results.myResults')}</h1>
              <p className="text-slate-400 text-sm mt-0.5">{t('student.results.fullHistory')}</p>
            </div>
            <div className="flex gap-2 shrink-0">
              {[
                { label: t('student.results.attempts'), value: stats.total, icon: Target, color: 'from-blue-500 to-indigo-500' },
                { label: t('student.quizzes.passed'), value: stats.passed, icon: CheckCircle2, color: 'from-emerald-500 to-teal-500' },
                { label: t('student.results.average'), value: `${stats.avg}%`, icon: TrendingUp, color: 'from-violet-500 to-purple-500' },
              ].map((s, i) => (
                <motion.div
                  key={s.label}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.05 + i * 0.06 }}
                  className="bg-white/8 border border-white/10 rounded-xl p-3 text-center min-w-[70px]"
                >
                  <div className="text-xl font-black text-white">{s.value}</div>
                  <div className="text-slate-400 text-[10px] font-semibold mt-0.5">{s.label}</div>
                </motion.div>
              ))}
            </div>
          </div>
        </motion.div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={t('student.results.searchPlaceholder')}
              className="w-full pl-9 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-400/40 focus:border-emerald-400 shadow-sm"
            />
          </div>
          <div className="flex gap-2">
            {TABS.map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={cn(
                  'px-4 py-2.5 rounded-xl text-sm font-semibold transition-all border flex items-center gap-1.5',
                  tab === t.key
                    ? 'bg-emerald-600 text-white border-transparent shadow-md shadow-emerald-200'
                    : 'bg-white border-slate-200 text-slate-600 hover:border-emerald-300',
                )}
              >
                {t.label}
                <span className={cn(
                  'text-xs px-1.5 py-0.5 rounded-full font-bold',
                  tab === t.key ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500',
                )}>
                  {t.count}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Grid */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {Array(8).fill(0).map((_, i) => (
              <div key={i} className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm">
                <div className="h-1.5 bg-slate-200 animate-pulse" />
                <div className="p-4 space-y-3">
                  <div className="h-4 w-3/4 bg-slate-100 rounded-lg animate-pulse" />
                  <div className="h-3 w-full bg-slate-100 rounded animate-pulse" />
                  <div className="h-8 bg-slate-100 rounded-xl animate-pulse mt-3" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center py-24 text-center"
          >
            <motion.div
              animate={{ y: [0, -8, 0] }}
              transition={{ duration: 3, repeat: Infinity }}
              className="w-16 h-16 bg-emerald-50 rounded-2xl flex items-center justify-center mb-4 shadow-lg"
            >
              <Trophy className="w-8 h-8 text-emerald-400" />
            </motion.div>
            <p className="text-slate-600 font-bold text-lg">{t('student.results.noResults')}</p>
            <p className="text-slate-400 text-sm mt-1">
              {search || tab !== 'all'
                ? t('student.results.tryClearingFilters')
                : t('student.results.noQuizzesMessage')}
            </p>
          </motion.div>
        ) : (
          <AnimatePresence mode="popLayout">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {filtered.map((attempt, i) => {
                const pct = attempt.total_points > 0
                  ? Math.round((attempt.score / attempt.total_points) * 100)
                  : 0;
                const passed = pct >= 50;
                const quizTitle = quizMap[attempt.quiz_id] || t('quizzes.title');
                const duration = attempt.started_at && attempt.completed_at
                  ? Math.round((new Date(attempt.completed_at).getTime() - new Date(attempt.started_at).getTime()) / 60000)
                  : null;

                return (
                  <motion.div
                    key={attempt.id}
                    layout
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.25, delay: i * 0.04 }}
                    whileHover={{ y: -3, transition: { duration: 0.15 } }}
                    className="group bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm hover:shadow-lg hover:shadow-slate-200/60 transition-shadow flex flex-col"
                  >
                    {/* Color bar + score header */}
                    <div className={cn(
                      'px-4 pt-4 pb-3 flex items-center justify-between',
                      passed ? 'bg-gradient-to-br from-emerald-50 to-teal-50' : 'bg-gradient-to-br from-red-50 to-rose-50',
                    )}>
                      <div className={cn(
                        'w-10 h-10 rounded-xl flex items-center justify-center shrink-0',
                        passed ? 'bg-emerald-100' : 'bg-red-100',
                      )}>
                        {passed
                          ? <Trophy className="w-5 h-5 text-emerald-600" />
                          : <XCircle className="w-5 h-5 text-red-500" />}
                      </div>
                      <div className="text-right">
                        <div className={cn('text-2xl font-black', passed ? 'text-emerald-600' : 'text-red-500')}>
                          {pct}%
                        </div>
                        <div className={cn(
                          'text-[10px] font-bold uppercase tracking-wider',
                          passed ? 'text-emerald-500' : 'text-red-400',
                        )}>
                          {passed ? t('student.quizzes.passed') : t('student.quizResults.failedStatus')}
                        </div>
                      </div>
                    </div>

                    {/* Progress bar */}
                    <div className="h-1 bg-slate-100">
                      <motion.div
                        className={cn('h-full', passed ? 'bg-emerald-500' : 'bg-red-400')}
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{ duration: 0.7, delay: 0.1 + i * 0.04 }}
                      />
                    </div>

                    {/* Body */}
                    <div className="p-4 flex-1 flex flex-col">
                      <h3 className="text-sm font-bold text-slate-900 line-clamp-2 leading-snug group-hover:text-emerald-700 transition-colors mb-2">
                        {quizTitle}
                      </h3>

                      <div className="flex flex-wrap gap-1.5 mb-3">
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                          <Target className="w-2.5 h-2.5" />
                          {t('student.quizResults.pointsDisplayShort', { score: attempt.score ?? 0, total: attempt.total_points ?? 0 })}
                        </span>
                        {duration != null && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                            <Clock className="w-2.5 h-2.5" />
                            {t('student.results.durationMinutes', { count: duration })}
                          </span>
                        )}
                      </div>

                      {attempt.completed_at && (
                        <p className="text-[10px] text-slate-400 mb-3">
                          {formatDistanceToNow(new Date(attempt.completed_at), { addSuffix: true })}
                        </p>
                      )}

                      <div className="mt-auto">
                        <Link
                          to={`/student/results/${attempt.id}`}
                          className={cn(
                            'flex items-center justify-center gap-1.5 w-full py-2 rounded-xl text-xs font-bold transition-all',
                            passed
                              ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-600 hover:text-white'
                              : 'bg-red-50 text-red-600 hover:bg-red-500 hover:text-white',
                          )}
                        >
                          {t('student.results.viewDetails')}
                          <ChevronRight className="w-3.5 h-3.5" />
                        </Link>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </AnimatePresence>
        )}
      </div>
    </StudentLayout>
  );
}
