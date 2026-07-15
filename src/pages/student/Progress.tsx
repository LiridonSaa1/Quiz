import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../supabase';
import StudentLayout from '../../components/layout/StudentLayout';
import { motion } from 'motion/react';
import { TrendingUp, Target, Trophy, CheckCircle2, BookOpen, Zap, BarChart2, Star } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Cell, LabelList } from 'recharts';
import { cn } from '../../lib/utils';
import { format, subDays } from 'date-fns';
import { fetchAttemptRowsByStudentId, normalizeAttempts } from '../../lib/quizAttempts';
import { authFetch } from '../../lib/apiUrl';

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
  const { t } = useTranslation();
  const [attempts, setAttempts] = useState<any[]>([]);
  const [courses, setCourses] = useState<any[]>([]);
  const [quizMap, setQuizMap] = useState<Record<string, { title: string; courseId: string }>>({});
  const [lessonProgress, setLessonProgress] = useState<any[]>([]);
  const [lessonCourseMap, setLessonCourseMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const uid = session.user.id;

      // Fetch everything in parallel: server progress-data (uses poolQuery, bypasses
      // public.quizzes schema issue), courses API, and lesson_progress from Supabase.
      const [progressRes, coursesRes, lpSnap] = await Promise.all([
        authFetch('/api/student/progress-data').then(r => r.ok ? r.json() : {}).catch(() => ({})),
        authFetch('/api/student/courses/available').then(r => r.ok ? r.json() : { courses: [] }).catch(() => ({ courses: [] })),
        supabase.from('lesson_progress').select('lesson_id, completed').eq('student_id', uid),
      ]);

      // ── Attempts + quiz map come from the server endpoint (poolQuery-backed)
      const rawAttempts = Array.isArray(progressRes?.attempts) ? progressRes.attempts : [];
      const normalizedAttempts = normalizeAttempts(rawAttempts);
      setAttempts(normalizedAttempts);

      const serverQuizMap: Record<string, { title: string; courseId: string }> = progressRes?.quizMap || {};
      const serverCourseMap: Record<string, string> = progressRes?.courseMap || {}; // courseId → title
      setQuizMap(serverQuizMap);

      // ── Merge courses: API list + any courses discovered via server quiz map
      const apiCourses: any[] = coursesRes?.courses || [];
      const apiCourseIdSet = new Set(apiCourses.map((c: any) => String(c.id || '')));

      // Build extra courses from server courseMap that aren't in the API list
      const extraCourses = Object.entries(serverCourseMap)
        .filter(([id]) => id && !apiCourseIdSet.has(id))
        .map(([id, title]) => ({ id, title }));

      const allCourses = [...apiCourses, ...extraCourses];
      setCourses(allCourses);

      const lpRows = lpSnap.data || [];
      setLessonProgress(lpRows);

      // ── Lesson→course map for the lesson completion chart (Supabase direct — lessons table is in public schema)
      const courseIds = allCourses.map((c: any) => String(c.id || '')).filter(Boolean);
      let lCourseMap: Record<string, string> = {};

      if (courseIds.length > 0) {
        const [modulesSnap, lessonsByCourseSnap] = await Promise.all([
          supabase.from('modules').select('id, course_id').in('course_id', courseIds),
          supabase.from('lessons').select('id, course_id, module_id').in('course_id', courseIds),
        ]);
        const moduleToCourse: Record<string, string> = {};
        (modulesSnap.data || []).forEach((m: any) => {
          const mid = String(m?.id || ''); const cid = String(m?.course_id || '');
          if (mid && cid) moduleToCourse[mid] = cid;
        });
        const moduleIds = (modulesSnap.data || []).map((m: any) => String(m?.id || '')).filter(Boolean);
        const lessonsByModuleSnap = moduleIds.length > 0
          ? await supabase.from('lessons').select('id, course_id, module_id').in('module_id', moduleIds)
          : { data: [] as any[] };
        [...(lessonsByCourseSnap.data || []), ...(lessonsByModuleSnap.data || [])].forEach((l: any) => {
          const lid = String(l?.id || '');
          const cid = String(l?.course_id || '') || moduleToCourse[String(l?.module_id || '')] || '';
          if (lid && cid) lCourseMap[lid] = cid;
        });
      } else if (lpRows.length > 0) {
        // No courses at all — derive from lesson_progress entries
        const progressLessonIds = lpRows.map((r: any) => String(r.lesson_id)).filter(Boolean);
        if (progressLessonIds.length > 0) {
          const lessonsSnap = await supabase.from('lessons').select('id, course_id').in('id', progressLessonIds);
          (lessonsSnap.data || []).forEach((l: any) => {
            const lid = String(l?.id || ''); const cid = String(l?.course_id || '');
            if (lid && cid) lCourseMap[lid] = cid;
          });
          const discoveredCourseIds = [...new Set(Object.values(lCourseMap))];
          if (discoveredCourseIds.length > 0 && allCourses.length === 0) {
            const cSnap = await supabase.from('courses').select('id, title').in('id', discoveredCourseIds);
            setCourses(cSnap.data || []);
          }
        }
      }

      setLessonCourseMap(lCourseMap);
      setLoading(false);
    };
    load();
  }, []);

  const getAttemptPercent = (attempt: any) => {
    const total = Number(attempt?.total_points || 0);
    const score = Number(attempt?.score || 0);
    if (total > 0) return Math.max(0, Math.min(100, Math.round((score / total) * 100)));
    if (score >= 0 && score <= 1) return Math.max(0, Math.min(100, Math.round(score * 100)));
    return Math.max(0, Math.min(100, Math.round(score)));
  };

  const completed = attempts.filter((a) => {
    const status = String(a?.status || '').toLowerCase();
    return status === 'completed' || Boolean(a?.completed_at || a?.created_at);
  });
  const avgScore = completed.length > 0
    ? Math.round(completed.reduce((s, a) => s + getAttemptPercent(a), 0) / completed.length)
    : 0;
  const passed = completed.filter((a) => getAttemptPercent(a) >= 50).length;
  const passRate = completed.length > 0 ? Math.round((passed / completed.length) * 100) : 0;
  const best = completed.length > 0 ? Math.round(Math.max(...completed.map((a) => getAttemptPercent(a)))) : 0;

  // Lessons completed count
  const completedLessons = lessonProgress.filter((r: any) => r.completed).length;

  // Last 14 days trend
  const trendData = Array.from({ length: 14 }, (_, i) => {
    const day = subDays(new Date(), 13 - i);
    const dayStr = format(day, 'yyyy-MM-dd');
    const dayAttempts = completed.filter((a) => {
      const dayKey = String(a.completed_at || a.created_at || a.started_at || '').slice(0, 10);
      return dayKey === dayStr;
    });
    const avg = dayAttempts.length > 0
      ? Math.round(dayAttempts.reduce((s, a) => s + getAttemptPercent(a), 0) / dayAttempts.length)
      : null;
    return { date: format(day, 'MMM d'), score: avg, count: dayAttempts.length };
  });

  // Per-course stats: quiz avg score + lesson completion %
  const courseStats = courses.map((c: any, i: number) => {
    const cQuizIds = Object.entries(quizMap).filter(([, v]) => v.courseId === c.id).map(([k]) => k);
    const cAttempts = completed.filter(a => cQuizIds.includes(a.quiz_id));
    const avg = cAttempts.length > 0
      ? Math.round(cAttempts.reduce((s, a) => s + getAttemptPercent(a), 0) / cAttempts.length)
      : 0;

    // Lesson completion for this course
    const courseLessonIds = Object.entries(lessonCourseMap)
      .filter(([, cid]) => cid === c.id)
      .map(([lid]) => lid);
    const completedInCourse = lessonProgress.filter(
      (r: any) => r.completed && courseLessonIds.includes(String(r.lesson_id))
    ).length;
    const lessonPct = courseLessonIds.length > 0
      ? Math.round((completedInCourse / courseLessonIds.length) * 100)
      : 0;

    return {
      name: c.title,
      avg,
      lessonPct,
      attempts: cAttempts.length,
      completedLessons: completedInCourse,
      totalLessons: courseLessonIds.length,
      color: CHART_COLORS[i % CHART_COLORS.length],
    };
  });

  const hasAnyData = completed.length > 0 || completedLessons > 0;

  const statCards = [
    { label: t('student.progress.quizzesTaken'), value: completed.length, suffix: '', icon: Zap, color: 'from-blue-500 to-indigo-500' },
    { label: t('student.progress.averageScore'), value: avgScore, suffix: '%', icon: Target, color: 'from-violet-500 to-purple-500' },
    { label: t('student.progress.passRate'), value: passRate, suffix: '%', icon: CheckCircle2, color: 'from-emerald-500 to-teal-500' },
    { label: t('student.progress.bestScore'), value: best, suffix: '%', icon: Trophy, color: 'from-amber-500 to-orange-500' },
    { label: t('student.progress.coursesEnrolled', 'Courses Enrolled'), value: courses.length, suffix: '', icon: Star, color: 'from-rose-500 to-pink-500' },
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
              <span className="text-white/80 text-xs font-semibold">{t('student.progress.myProgress')}</span>
            </div>
            <h1 className="text-3xl font-black text-white">{t('student.progress.learningProgress')}</h1>
            <p className="text-slate-400 text-sm mt-1">{t('student.progress.trackPerformance')}</p>
          </div>
        </motion.div>

        {/* Stat cards */}
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {[1,2,3,4,5].map(i => <div key={i} className="h-28 bg-white rounded-2xl border border-slate-100 animate-pulse" />)}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
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
                  <h2 className="font-bold text-slate-900">{t('student.progress.lastFourteenDays')}</h2>
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
                    <Tooltip formatter={(v: any) => [`${v ?? '—'}%`, t('student.progress.chartScoreLabel')]} contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }} />
                    <Area type="monotone" dataKey="score" stroke="#6366f1" strokeWidth={2} fill="url(#scoreGrad)" connectNulls />
                  </AreaChart>
                </ResponsiveContainer>
              </motion.div>
            )}

            {/* Per-course charts */}
            {courseStats.length > 0 && (
              <div className="space-y-6">
                {/* Quiz avg score per course — always shown when courses exist */}
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
                  className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6">
                  <div className="flex items-center gap-2 mb-6">
                    <div className="w-8 h-8 bg-emerald-50 rounded-xl flex items-center justify-center"><BarChart2 className="w-4 h-4 text-emerald-600" /></div>
                    <h2 className="font-bold text-slate-900">{t('student.progress.averageScorePerCourse')}</h2>
                  </div>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={courseStats} barCategoryGap="30%" margin={{ top: 20, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} tickFormatter={v => `${v}%`} />
                      <Tooltip formatter={(v: any) => [`${v}%`, t('student.progress.chartAvgScoreLabel')]} contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }} />
                      <Bar dataKey="avg" radius={[6, 6, 0, 0]}>
                        <LabelList dataKey="avg" position="top" formatter={(v: any) => `${v}%`} style={{ fontSize: 11, fontWeight: 600, fill: '#475569' }} />
                        {courseStats.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </motion.div>

                {/* Lesson completion per course */}
                {completedLessons > 0 && (
                  <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45 }}
                    className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6">
                    <div className="flex items-center gap-2 mb-6">
                      <div className="w-8 h-8 bg-sky-50 rounded-xl flex items-center justify-center"><BookOpen className="w-4 h-4 text-sky-600" /></div>
                      <h2 className="font-bold text-slate-900">{t('student.progress.lessonCompletionPerCourse', 'Lesson Completion by Course')}</h2>
                    </div>
                    <div className="space-y-3">
                      {courseStats.map((c, i) => (
                        <div key={i}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-semibold text-slate-700 truncate max-w-[60%]">{c.name}</span>
                            <span className="text-xs text-slate-500 shrink-0 ml-2">
                              {c.completedLessons}/{c.totalLessons > 0 ? c.totalLessons : '?'} {t('student.progress.lessonsLabel')}
                            </span>
                          </div>
                          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                            <motion.div
                              className="h-full rounded-full"
                              style={{ backgroundColor: c.color }}
                              initial={{ width: 0 }}
                              animate={{ width: `${c.lessonPct}%` }}
                              transition={{ duration: 0.8, delay: i * 0.1 }}
                            />
                          </div>
                          <div className="text-right text-[10px] text-slate-400 mt-0.5">{c.lessonPct}%</div>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </div>
            )}

            {/* Empty */}
            {!hasAnyData && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="flex flex-col items-center justify-center py-24 text-center">
                <motion.div animate={{ y: [0, -8, 0] }} transition={{ duration: 3, repeat: Infinity }}
                  className="w-16 h-16 bg-blue-50 rounded-3xl flex items-center justify-center mb-4 shadow-lg">
                  <TrendingUp className="w-8 h-8 text-blue-400" />
                </motion.div>
                <p className="text-slate-600 font-bold">{t('student.progress.noDataYet')}</p>
                <p className="text-slate-400 text-sm mt-1">{t('student.progress.completeQuizzesToSee')}</p>
              </motion.div>
            )}
          </>
        )}
      </div>
    </StudentLayout>
  );
}
