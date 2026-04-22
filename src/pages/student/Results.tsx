import React, { useEffect, useState, useMemo } from 'react';
import { supabase } from '../../supabase';
import StudentLayout from '../../components/layout/StudentLayout';
import { motion, AnimatePresence } from 'motion/react';
import { BarChart3, Search, CheckCircle2, XCircle, Trophy, Clock, ChevronRight, Filter } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '../../lib/utils';
import { format } from 'date-fns';
import { fetchAttemptRowsByStudentId } from '../../lib/quizAttempts';

type TabFilter = 'all' | 'passed' | 'failed';

export default function StudentResults() {
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
    avg: attempts.length > 0
      ? Math.round(attempts.reduce((s, a) => s + (a.total_points > 0 ? (a.score / a.total_points) * 100 : 0), 0) / attempts.length)
      : 0,
  };

  const TABS: { key: TabFilter; label: string }[] = [
    { key: 'all', label: 'All Results' },
    { key: 'passed', label: 'Passed' },
    { key: 'failed', label: 'Failed' },
  ];

  return (
    <StudentLayout>
      <div className="space-y-8">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
          className="relative rounded-3xl overflow-hidden bg-gradient-to-br from-slate-900 via-emerald-950 to-slate-900 p-8 shadow-2xl">
          <motion.div className="absolute top-0 right-0 w-80 h-80 bg-emerald-500/25 rounded-full blur-3xl pointer-events-none"
            animate={{ scale: [1, 1.1, 1] }} transition={{ duration: 7, repeat: Infinity }} />
          <div className="relative z-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
            <div>
              <div className="inline-flex items-center gap-2 bg-white/10 border border-white/20 rounded-full px-3 py-1.5 mb-3">
                <BarChart3 className="w-3.5 h-3.5 text-emerald-300" />
                <span className="text-white/80 text-xs font-semibold">Results</span>
              </div>
              <h1 className="text-3xl font-black text-white">My Results</h1>
              <p className="text-slate-400 text-sm mt-1">All your quiz attempt history in one place.</p>
            </div>
            <div className="flex gap-3">
              {[
                { label: 'Attempts', value: stats.total, color: 'from-blue-500 to-indigo-500' },
                { label: 'Passed', value: stats.passed, color: 'from-emerald-500 to-teal-500' },
                { label: 'Avg Score', value: `${stats.avg}%`, color: 'from-violet-500 to-purple-500' },
              ].map((s, i) => (
                <motion.div key={s.label} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + i * 0.08 }}
                  className="bg-white/8 border border-white/10 rounded-2xl p-3 text-center min-w-[72px]">
                  <div className="text-2xl font-black text-white">{s.value}</div>
                  <div className="text-slate-400 text-[10px] font-semibold">{s.label}</div>
                </motion.div>
              ))}
            </div>
          </div>
        </motion.div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by quiz name..."
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-2xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 shadow-sm" />
          </div>
          <div className="flex gap-2">
            {TABS.map(t => (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={cn('px-4 py-2.5 rounded-2xl text-sm font-semibold transition-all border',
                  tab === t.key ? 'bg-emerald-600 text-white border-transparent shadow-lg shadow-emerald-200' : 'bg-white border-slate-200 text-slate-600 hover:border-emerald-300')}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Cards */}
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
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center py-24 text-center">
            <motion.div animate={{ y: [0, -8, 0] }} transition={{ duration: 3, repeat: Infinity }}
              className="w-16 h-16 bg-emerald-50 rounded-3xl flex items-center justify-center mb-4 shadow-lg">
              <Trophy className="w-8 h-8 text-emerald-400" />
            </motion.div>
            <p className="text-slate-600 font-bold">No results yet</p>
            <p className="text-slate-400 text-sm mt-1">Take some quizzes to see your results here.</p>
          </motion.div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            <AnimatePresence>
              {filtered.map((attempt, i) => {
                const pct = attempt.total_points > 0 ? Math.round((attempt.score / attempt.total_points) * 100) : 0;
                const passed = pct >= 50;
                const duration = attempt.started_at && attempt.completed_at
                  ? Math.round((new Date(attempt.completed_at).getTime() - new Date(attempt.started_at).getTime()) / 60000)
                  : null;
                return (
                  <motion.div key={attempt.id}
                    initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.35, delay: i * 0.05 }}
                    whileHover={{ y: -4, transition: { duration: 0.2 } }}
                    className="bg-white rounded-3xl border border-slate-100 overflow-hidden shadow-sm hover:shadow-xl hover:shadow-slate-200/80 transition-shadow flex flex-col group">
                    <div className={cn('h-1.5 bg-gradient-to-r', passed ? 'from-emerald-500 to-teal-500' : 'from-rose-500 to-red-500')} />
                    <Link to={`/student/results/${attempt.id}`} className="p-5 flex flex-col flex-1">
                      <div className="flex items-start justify-between mb-3">
                        <div className={cn('p-2.5 rounded-xl', passed ? 'bg-emerald-50' : 'bg-red-50')}>
                          {passed ? <Trophy className="w-4 h-4 text-emerald-600" /> : <XCircle className="w-4 h-4 text-red-500" />}
                        </div>
                        <span className={cn('text-xs font-bold px-2.5 py-1 rounded-xl', passed ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600')}>
                          {pct}%
                        </span>
                      </div>
                      <div className="flex-1">
                        <h3 className="text-sm font-black text-slate-900 line-clamp-2 group-hover:text-emerald-600 transition-colors">
                          {quizMap[attempt.quiz_id] || 'Quiz'}
                        </h3>
                        <div className="flex flex-wrap items-center gap-2 mt-2 mb-3">
                          <span className={cn('inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-lg',
                            passed ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600')}>
                            {passed ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                            {passed ? 'Passed' : 'Failed'}
                          </span>
                          {duration != null && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-lg bg-slate-50 text-slate-600">
                              <Clock className="w-3 h-3" /> {duration}m
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-400 mb-2">
                          {attempt.correct_answers ?? '—'}/{attempt.total_questions ?? '—'} correct
                        </div>
                        {attempt.completed_at && (
                          <div className="text-xs text-slate-400 mb-3">
                            {format(new Date(attempt.completed_at), 'MMM d, yyyy')}
                          </div>
                        )}
                        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <motion.div
                            className={cn('h-full rounded-full', passed ? 'bg-emerald-500' : 'bg-red-400')}
                            initial={{ width: 0 }} animate={{ width: `${pct}%` }}
                            transition={{ duration: 0.8, delay: 0.1 + i * 0.04 }}
                          />
                        </div>
                      </div>
                      <div className="mt-4 inline-flex items-center justify-center gap-2 w-full py-2.5 rounded-2xl text-sm font-bold transition-all bg-slate-100 text-slate-700 group-hover:bg-slate-900 group-hover:text-white">
                        View Result
                        <ChevronRight className="w-4 h-4" />
                      </div>
                    </Link>
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
