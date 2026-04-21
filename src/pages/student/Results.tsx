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

        {/* List */}
        {loading ? (
          <div className="space-y-3">
            {[1,2,3,4,5].map(i => <div key={i} className="h-20 bg-white rounded-2xl border border-slate-100 animate-pulse" />)}
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
          <div className="space-y-3">
            <AnimatePresence>
              {filtered.map((attempt, i) => {
                const pct = attempt.total_points > 0 ? Math.round((attempt.score / attempt.total_points) * 100) : 0;
                const passed = pct >= 50;
                const duration = attempt.started_at && attempt.completed_at
                  ? Math.round((new Date(attempt.completed_at).getTime() - new Date(attempt.started_at).getTime()) / 60000)
                  : null;
                return (
                  <motion.div key={attempt.id}
                    initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}
                    transition={{ duration: 0.3, delay: i * 0.04 }}
                    className="bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all group">
                    <Link to={`/student/results/${attempt.id}`} className="flex items-center gap-4 p-4">
                      <div className={cn('w-14 h-14 rounded-2xl flex flex-col items-center justify-center shrink-0 font-black text-lg shadow-sm',
                        passed ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500')}>
                        <span>{pct}</span>
                        <span className="text-[10px] font-bold leading-none">%</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-bold text-slate-900 group-hover:text-emerald-600 transition-colors truncate">
                          {quizMap[attempt.quiz_id] || 'Quiz'}
                        </h3>
                        <div className="flex flex-wrap items-center gap-3 mt-1">
                          <span className={cn('flex items-center gap-1 text-xs font-semibold', passed ? 'text-emerald-600' : 'text-red-500')}>
                            {passed ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                            {passed ? 'Passed' : 'Failed'}
                          </span>
                          <span className="text-xs text-slate-400">
                            {attempt.correct_answers ?? '—'}/{attempt.total_questions ?? '—'} correct
                          </span>
                          {duration != null && (
                            <span className="flex items-center gap-1 text-xs text-slate-400">
                              <Clock className="w-3 h-3" /> {duration}m
                            </span>
                          )}
                          {attempt.completed_at && (
                            <span className="text-xs text-slate-400">
                              {format(new Date(attempt.completed_at), 'MMM d, yyyy')}
                            </span>
                          )}
                        </div>
                        <div className="mt-2 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <motion.div
                            className={cn('h-full rounded-full', passed ? 'bg-emerald-500' : 'bg-red-400')}
                            initial={{ width: 0 }} animate={{ width: `${pct}%` }}
                            transition={{ duration: 0.8, delay: 0.1 + i * 0.04 }} />
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-emerald-500 transition-colors shrink-0" />
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
