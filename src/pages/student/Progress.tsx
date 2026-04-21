import React, { useEffect, useState } from 'react';
import { supabase } from '../../supabase';
import StudentLayout from '../../components/layout/StudentLayout';
import { motion } from 'motion/react';
import { TrendingUp, Target, Trophy, CheckCircle2, BookOpen, Zap, BarChart2, Star } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Cell } from 'recharts';
import { cn } from '../../lib/utils';
import { format, subDays } from 'date-fns';
import { fetchAttemptRowsByStudentId } from '../../lib/quizAttempts';

function AnimatedCounter({ value, suffix = '' }: { value: number; suffix?: string }) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const duration = 1000;
    const start = Date.now();
    const tick = () => {
      const elapsed = Date.now() - start;
      const p = Math.min(elapsed / duration, 1);
      setCount(Math.round((1 - Math.pow(1 - p, 3)) * value));
      if (p < 1) requestAnimationFrame(tick);
    };
    const id = setTimeout(() => requestAnimationFrame(tick), 200);
    return () => clearTimeout(id);
  }, [value]);
  return <span>{count}{suffix}</span>;
}

const CHART_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

export default function StudentProgress() {
  const [attempts, setAttempts] = useState<any[]>([]);
  const [courses, setCourses] = useState<any[]>([]);
  const [quizMap, setQuizMap] = useState<Record<string, { title: string; courseId: string }>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const uid = session.user.id;

      const [coursesSnap, attemptRows] = await Promise.all([
        supabase.from('courses').select('id, title').contains('student_ids', [uid]),
        fetchAttemptRowsByStudentId(supabase, uid),
      ]);

      const coursesData = coursesSnap.data || [];
      setCourses(coursesData);
      const courseIds = coursesData.map((c: any) => c.id);

      let qMap: Record<string, { title: string; courseId: string }> = {};
      if (courseIds.length > 0) {
        const { data: quizzes } = await supabase.from('quizzes').select('id, title, course_id').in('course_id', courseIds);
        (quizzes || []).forEach((q: any) => { qMap[q.id] = { title: q.title, courseId: q.course_id }; });
      }
      setQuizMap(qMap);
      setAttempts(attemptRows || []);
      setLoading(false);
    };
    load();
  }, []);

  const completed = attempts.filter(a => a.status === 'completed' || a.completed_at);
  const avgScore = completed.length > 0
    ? Math.round(completed.reduce((s, a) => s + (a.total_points > 0 ? (a.score / a.total_points) * 100 : 0), 0) / completed.length)
    : 0;
  const passed = completed.filter(a => a.total_points > 0 && (a.score / a.total_points) >= 0.5).length;
  const passRate = completed.length > 0 ? Math.round((passed / completed.length) * 100) : 0;
  const best = completed.length > 0 ? Math.round(Math.max(...completed.map(a => a.total_points > 0 ? (a.score / a.total_points) * 100 : 0))) : 0;

  // Last 14 days trend
  const trendData = Array.from({ length: 14 }, (_, i) => {
    const day = subDays(new Date(), 13 - i);
    const dayStr = format(day, 'yyyy-MM-dd');
    const dayAttempts = completed.filter(a => a.completed_at?.slice(0, 10) === dayStr);
    const avg = dayAttempts.length > 0
      ? Math.round(dayAttempts.reduce((s, a) => s + (a.total_points > 0 ? (a.score / a.total_points) * 100 : 0), 0) / dayAttempts.length)
      : null;
    return { date: format(day, 'MMM d'), score: avg, count: dayAttempts.length };
  });

  // Per-course stats
  const courseStats = courses.map((c: any, i: number) => {
    const cQuizIds = Object.entries(quizMap).filter(([, v]) => v.courseId === c.id).map(([k]) => k);
    const cAttempts = completed.filter(a => cQuizIds.includes(a.quiz_id));
    const avg = cAttempts.length > 0
      ? Math.round(cAttempts.reduce((s, a) => s + (a.total_points > 0 ? (a.score / a.total_points) * 100 : 0), 0) / cAttempts.length)
      : 0;
    return { name: c.title, avg, attempts: cAttempts.length, color: CHART_COLORS[i % CHART_COLORS.length] };
  });

  const statCards = [
    { label: 'Quizzes Taken', value: completed.length, suffix: '', icon: Zap, color: 'from-blue-500 to-indigo-500' },
    { label: 'Average Score', value: avgScore, suffix: '%', icon: Target, color: 'from-violet-500 to-purple-500' },
    { label: 'Pass Rate', value: passRate, suffix: '%', icon: CheckCircle2, color: 'from-emerald-500 to-teal-500' },
    { label: 'Best Score', value: best, suffix: '%', icon: Trophy, color: 'from-amber-500 to-orange-500' },
  ];

  return (
    <StudentLayout>
      <div className="space-y-8">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
          className="relative rounded-3xl overflow-hidden bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 p-8 shadow-2xl">
          <motion.div className="absolute top-0 right-0 w-80 h-80 bg-blue-500/25 rounded-full blur-3xl pointer-events-none"
            animate={{ scale: [1, 1.1, 1] }} transition={{ duration: 7, repeat: Infinity }} />
          <div className="relative z-10">
            <div className="inline-flex items-center gap-2 bg-white/10 border border-white/20 rounded-full px-3 py-1.5 mb-3">
              <TrendingUp className="w-3.5 h-3.5 text-blue-300" />
              <span className="text-white/80 text-xs font-semibold">My Progress</span>
            </div>
            <h1 className="text-3xl font-black text-white">Learning Progress</h1>
            <p className="text-slate-400 text-sm mt-1">Track your performance across all courses.</p>
          </div>
        </motion.div>

        {/* Stat cards */}
        {loading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[1,2,3,4].map(i => <div key={i} className="h-28 bg-white rounded-2xl border border-slate-100 animate-pulse" />)}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {statCards.map((s, i) => (
                <motion.div key={s.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}
                  className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                  <div className={`h-1 bg-gradient-to-r ${s.color}`} />
                  <div className="p-5">
                    <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${s.color} flex items-center justify-center mb-3 shadow-lg`}>
                      <s.icon className="w-4.5 h-4.5 text-white" />
                    </div>
                    <div className="text-2xl font-black text-slate-900">
                      <AnimatedCounter value={s.value} suffix={s.suffix} />
                    </div>
                    <div className="text-slate-500 text-xs font-semibold mt-0.5">{s.label}</div>
                  </div>
                </motion.div>
              ))}
            </div>

            {/* Score trend chart */}
            {completed.length > 0 && (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
                className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6">
                <div className="flex items-center gap-2 mb-6">
                  <div className="w-8 h-8 bg-blue-50 rounded-xl flex items-center justify-center"><TrendingUp className="w-4 h-4 text-blue-600" /></div>
                  <h2 className="font-bold text-slate-900">Score Trend (Last 14 Days)</h2>
                </div>
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={trendData}>
                    <defs>
                      <linearGradient id="scoreGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} tickFormatter={v => `${v}%`} />
                    <Tooltip formatter={(v: any) => [`${v ?? '—'}%`, 'Score']} contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }} />
                    <Area type="monotone" dataKey="score" stroke="#6366f1" strokeWidth={2} fill="url(#scoreGrad)" connectNulls />
                  </AreaChart>
                </ResponsiveContainer>
              </motion.div>
            )}

            {/* Per-course bar chart */}
            {courseStats.length > 0 && (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
                className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6">
                <div className="flex items-center gap-2 mb-6">
                  <div className="w-8 h-8 bg-emerald-50 rounded-xl flex items-center justify-center"><BarChart2 className="w-4 h-4 text-emerald-600" /></div>
                  <h2 className="font-bold text-slate-900">Average Score per Course</h2>
                </div>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={courseStats} barCategoryGap="30%">
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} tickFormatter={v => `${v}%`} />
                    <Tooltip formatter={(v: any) => [`${v}%`, 'Avg Score']} contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }} />
                    <Bar dataKey="avg" radius={[6, 6, 0, 0]}>
                      {courseStats.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </motion.div>
            )}

            {/* Empty */}
            {completed.length === 0 && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="flex flex-col items-center justify-center py-24 text-center">
                <motion.div animate={{ y: [0, -8, 0] }} transition={{ duration: 3, repeat: Infinity }}
                  className="w-16 h-16 bg-blue-50 rounded-3xl flex items-center justify-center mb-4 shadow-lg">
                  <TrendingUp className="w-8 h-8 text-blue-400" />
                </motion.div>
                <p className="text-slate-600 font-bold">No data yet</p>
                <p className="text-slate-400 text-sm mt-1">Complete some quizzes to see your progress.</p>
              </motion.div>
            )}
          </>
        )}
      </div>
    </StudentLayout>
  );
}
