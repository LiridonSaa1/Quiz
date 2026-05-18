import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../supabase';
import { authFetch } from '../../lib/apiUrl';
import StudentLayout from '../../components/layout/StudentLayout';
import { BookOpen, Clock, CheckCircle2, Trophy, ArrowRight, Flame, Radio } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Quiz } from '../../types';
import { cn } from '../../lib/utils';
import { fetchAttemptRowsByStudentId, normalizeAttempts } from '../../lib/quizAttempts';
import { selectPublishedQuizzesCompat } from '../../lib/quizzesCompat';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip } from 'recharts';
import { format, subDays } from 'date-fns';
import WelcomeCelebration from '../../components/WelcomeCelebration';
import { hasSeenWelcome, markWelcomeSeen } from '../../components/welcomeStorage';

// Module-level — survives React Strict Mode's unmount/remount so the state
// is available when useState() initializer runs on the second mount.
let pendingCelebration: { userId: string; name: string } | null = null;

interface LiveSessionBanner {
  id: string;
  title: string;
  host: { display_name: string } | null;
}

export default function StudentDashboard() {
  const { t } = useTranslation();
  const [enrolledCourses, setEnrolledCourses] = useState<any[]>([]);
  const [availableQuizzes, setAvailableQuizzes] = useState<Quiz[]>([]);
  const [recentAttempts, setRecentAttempts] = useState<any[]>([]);
  const [liveSessions, setLiveSessions] = useState<LiveSessionBanner[]>([]);
  const [loading, setLoading] = useState(true);
  // Initialise from module-level so Strict Mode's second mount picks up the pending celebration
  const [celebrationUserId, setCelebrationUserId] = useState<string | null>(() => pendingCelebration?.userId ?? null);
  const [celebrationName, setCelebrationName] = useState<string>(() => pendingCelebration?.name ?? '');

  useEffect(() => {
    const fetchData = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const studentId = session.user.id;

      // First-login celebration:
      // - user_metadata.welcomed  → server-side cross-device guard (set fire-and-forget)
      // - hasSeenWelcome          → localStorage guard (prevents show on next page load)
      // - pendingCelebration      → module-level so Strict Mode's 2nd mount picks it up
      // markWelcomeSeen is called here so localStorage is set before WelcomeCelebration
      // mounts, preventing a third render from re-triggering on fast remounts.
      const alreadyWelcomed = session.user.user_metadata?.welcomed === true;
      if (!alreadyWelcomed && !hasSeenWelcome(studentId) && !pendingCelebration) {
        markWelcomeSeen(studentId);
        supabase.auth.updateUser({ data: { welcomed: true } }).catch(() => {});
        const { data: profileRow } = await supabase
          .from('profiles')
          .select('display_name')
          .eq('id', studentId)
          .maybeSingle();
        const name = String(profileRow?.display_name || session.user.email || '').trim();
        pendingCelebration = { userId: studentId, name };
        setCelebrationName(name);
        setCelebrationUserId(studentId);
      }

      try {
        let courses: any[] = [];
        let quizzes: Quiz[] = [];
        let attempts: any[] = [];

        const [enrolledCoursesRes, enrolledClassesRes] = await Promise.all([
          supabase
            .from('courses')
            .select('*')
            .contains('student_ids', [studentId]),
          supabase
            .from('classes')
            .select('course_id,student_ids')
            .contains('student_ids', [studentId]),
        ]);
        if (enrolledCoursesRes.error) throw enrolledCoursesRes.error;
        if (enrolledClassesRes.error) throw enrolledClassesRes.error;

        const directCourses = Array.isArray(enrolledCoursesRes.data) ? enrolledCoursesRes.data : [];
        const classCourseIds = (Array.isArray(enrolledClassesRes.data) ? enrolledClassesRes.data : [])
          .map((row: any) => String(row?.course_id || '').trim())
          .filter(Boolean);

        courses = [...directCourses];
        const missingCourseIds = classCourseIds.filter((cid) => !courses.some((c: any) => String(c?.id || '') === cid));
        if (missingCourseIds.length > 0) {
          const classLinkedCoursesRes = await supabase
            .from('courses')
            .select('*')
            .in('id', missingCourseIds);
          if (!classLinkedCoursesRes.error && Array.isArray(classLinkedCoursesRes.data)) {
            courses = [...courses, ...classLinkedCoursesRes.data];
          }
        }

        const enrolledCourses = courses.filter((c: any) => String(c?.status || '').toLowerCase() === 'published');
        setEnrolledCourses(enrolledCourses);

        if (enrolledCourses.length > 0) {
          const courseIds = enrolledCourses.map((c: any) => c.id);
          const quizRows = await selectPublishedQuizzesCompat(supabase, courseIds, '*');
          quizzes = (quizRows as any) || [];
        }
        setAvailableQuizzes(quizzes);

        const attemptsRows = await fetchAttemptRowsByStudentId(supabase, studentId);
        attempts = normalizeAttempts(attemptsRows).map((a) => ({
          id: a.id,
          quiz_id: a.quiz_id,
          score: a.score,
          total_points: a.total_points,
          score_percent: a.score_percent,
          completed_at: a.completed_at,
          created_at: a.created_at,
          started_at: a.started_at,
          status: a.status,
        }));
        setRecentAttempts(attempts);

        // Fetch live sessions where this student is an invited participant
        try {
          const liveRes = await authFetch('/api/student/live-sessions?status=live');
          const liveJson = await liveRes.json();
          if (liveJson.success) setLiveSessions(liveJson.sessions || []);
        } catch {
          // Non-blocking: live sessions banner is best-effort
        }
      } catch (error) {
        console.error('Error fetching student data:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const stats = {
    courses: enrolledCourses.length,
    quizzes: availableQuizzes.length,
    completed: recentAttempts.length,
    avgScore: recentAttempts.length > 0
      ? Math.round(recentAttempts.reduce((acc, curr) => acc + curr.score_percent, 0) / recentAttempts.length)
      : 0
  };

  const getAttemptPercent = (attempt: any) => {
    const scorePercent = Number(attempt?.score_percent);
    if (Number.isFinite(scorePercent) && scorePercent >= 0) {
      return Math.max(0, Math.min(100, Math.round(scorePercent)));
    }
    const total = Number(attempt?.total_points || 0);
    const score = Number(attempt?.score || 0);
    if (total > 0) return Math.max(0, Math.min(100, Math.round((score / total) * 100)));
    if (score >= 0 && score <= 1) return Math.max(0, Math.min(100, Math.round(score * 100)));
    return Math.max(0, Math.min(100, Math.round(score)));
  };

  const completedAttempts = recentAttempts.filter((a) => {
    const status = String(a?.status || '').toLowerCase();
    return status === 'completed' || Boolean(a?.completed_at || a?.created_at);
  });

  const dashboardTrend = Array.from({ length: 7 }, (_, i) => {
    const day = subDays(new Date(), 6 - i);
    const dayStr = format(day, 'yyyy-MM-dd');
    const dayAttempts = completedAttempts.filter((a) => {
      const key = String(a?.completed_at || a?.created_at || a?.started_at || '').slice(0, 10);
      return key === dayStr;
    });
    const avg = dayAttempts.length > 0
      ? Math.round(dayAttempts.reduce((sum, a) => sum + getAttemptPercent(a), 0) / dayAttempts.length)
      : null;
    return { day: format(day, 'EEE'), score: avg };
  });
  const trendWithValues = dashboardTrend.filter((point) => typeof point.score === 'number');
  const lastScore = trendWithValues.length > 0
    ? Number(trendWithValues[trendWithValues.length - 1].score)
    : null;
  const firstScore = trendWithValues.length > 0
    ? Number(trendWithValues[0].score)
    : null;
  const trendDelta = lastScore !== null && firstScore !== null ? lastScore - firstScore : null;
  const activeDays = trendWithValues.length;

  const statCards = [
    { label: t('dashboard.stats.enrolledCourses'), value: stats.courses, icon: BookOpen, gradient: 'from-indigo-500 to-violet-500', light: 'bg-indigo-50', text: 'text-indigo-600' },
    { label: t('dashboard.stats.availableQuizzes'), value: stats.quizzes, icon: Clock, gradient: 'from-amber-500 to-orange-500', light: 'bg-amber-50', text: 'text-amber-600' },
    { label: t('dashboard.stats.completed'), value: stats.completed, icon: CheckCircle2, gradient: 'from-emerald-500 to-teal-500', light: 'bg-emerald-50', text: 'text-emerald-600' },
    { label: t('dashboard.stats.averageScore'), value: `${stats.avgScore}%`, icon: Trophy, gradient: 'from-violet-500 to-purple-500', light: 'bg-violet-50', text: 'text-violet-600' },
  ];

  return (
    <StudentLayout>
      {celebrationUserId && (
        <WelcomeCelebration
          userId={celebrationUserId}
          displayName={celebrationName}
          onDone={() => { pendingCelebration = null; setCelebrationUserId(null); }}
        />
      )}
      <div className="space-y-6">
        {/* Live Session Banner */}
        {liveSessions.length > 0 && (
          <div className="space-y-2">
            {liveSessions.map(ls => (
              <Link
                key={ls.id}
                to={`/student/live-sessions/${ls.id}`}
                className="flex items-center justify-between gap-4 bg-gradient-to-r from-rose-500 to-pink-600 rounded-2xl p-4 shadow-lg shadow-rose-200 hover:opacity-95 transition-opacity"
              >
                <div className="flex items-center gap-3 text-white min-w-0">
                  <Radio className="w-5 h-5 shrink-0 animate-pulse" />
                  <div className="min-w-0">
                    <p className="font-bold truncate">{ls.title}</p>
                    {ls.host && (
                      <p className="text-rose-100 text-xs">{t('dashboard.hostedBy')} {ls.host.display_name}</p>
                    )}
                  </div>
                </div>
                <span className="shrink-0 flex items-center gap-1.5 px-4 py-2 bg-white text-rose-600 rounded-xl font-bold text-sm">
                  {t('dashboard.joinNow')} <ArrowRight className="w-3.5 h-3.5" />
                </span>
              </Link>
            ))}
          </div>
        )}

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{t('nav.studentPortal')}</h1>
            <p className="text-slate-500 text-sm mt-1">{t('dashboard.stats.greetingMsg')}</p>
          </div>
          <div className="hidden sm:flex items-center gap-1.5 bg-emerald-50 border border-emerald-100 text-emerald-700 text-xs font-semibold px-3 py-1.5 rounded-xl">
            <Flame className="w-3.5 h-3.5" />
            {t('student.dashboard.keepItUp')}
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {statCards.map((stat) => (
            <div key={stat.label} className="bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all overflow-hidden">
              <div className={`h-1 bg-gradient-to-r ${stat.gradient}`} />
              <div className="p-5">
                <div className={`p-2.5 ${stat.light} rounded-xl inline-flex mb-4`}>
                  <stat.icon className={`w-5 h-5 ${stat.text}`} />
                </div>
                <div className="text-2xl font-bold text-slate-900">{stat.value}</div>
                <div className="text-slate-500 text-xs mt-0.5 font-medium">{stat.label}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-3 bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="h-1 bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500" />
            <div className="p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-base font-bold text-slate-900">{t('dashboard.scoreTrend')}</h2>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center rounded-lg bg-indigo-50 px-2 py-1 text-[11px] font-semibold text-indigo-700">
                      {t('student.dashboard.lastScore')}: {lastScore ?? '—'}%
                    </span>
                    <span className={cn(
                      "inline-flex items-center rounded-lg px-2 py-1 text-[11px] font-semibold",
                      trendDelta === null
                        ? "bg-slate-100 text-slate-600"
                        : trendDelta >= 0
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-rose-50 text-rose-700",
                    )}>
                      {trendDelta === null ? t('student.dashboard.noTrend') : t('student.dashboard.trendVsFirstDay', { delta: trendDelta > 0 ? `+${trendDelta}` : trendDelta })}
                    </span>
                    <span className="inline-flex items-center rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600">
                      {t('student.dashboard.activeDays')}: {activeDays}/7
                    </span>
                  </div>
                </div>
                <Link to="/student/progress" className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 flex items-center gap-1">
                  {t('dashboard.openFullAnalytics')} <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={dashboardTrend}>
                  <defs>
                    <linearGradient id="dashboardTrendGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef2ff" vertical={false} />
                  <XAxis dataKey="day" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} />
                  <Tooltip
                    formatter={(v: any) => [`${v ?? '—'}%`, t('dashboard.stats.averageScore')]}
                    labelFormatter={(label: any) => `${label}`}
                    contentStyle={{
                      borderRadius: 12,
                      border: '1px solid #e2e8f0',
                      fontSize: 12,
                      boxShadow: '0 10px 30px rgba(15, 23, 42, 0.08)',
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="score"
                    stroke="#6366f1"
                    strokeWidth={3}
                    fill="url(#dashboardTrendGrad)"
                    connectNulls
                    isAnimationActive
                    animationDuration={1000}
                    animationEasing="ease-out"
                    activeDot={{ r: 5, strokeWidth: 0, fill: '#6366f1' }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Available Quizzes */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900">{t('dashboard.availableQuizzes')}</h2>
              <Link to="/student/quizzes" className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 flex items-center gap-1">
                {t('dashboard.viewAll')} <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {availableQuizzes.length > 0 ? (
                availableQuizzes.slice(0, 4).map((quiz) => (
                  <div key={quiz.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all overflow-hidden group">
                    <div className="h-1 bg-gradient-to-r from-emerald-500 to-teal-500" />
                    <div className="p-5">
                      <div className="flex items-start justify-between mb-3">
                        <div className="p-2.5 bg-emerald-50 rounded-xl group-hover:bg-emerald-100 transition-all">
                          <Clock className="w-4 h-4 text-emerald-600" />
                        </div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50 px-2 py-1 rounded-lg">
                          {t('student.dashboard.mins', { count: quiz.timeLimit })}
                        </span>
                      </div>
                      <h3 className="text-sm font-bold text-slate-900 mb-1.5 line-clamp-1">{quiz.title}</h3>
                      <p className="text-slate-400 text-xs line-clamp-2 mb-4 leading-relaxed">{quiz.description}</p>
                      <Link
                        to={`/student/quiz/${quiz.id}`}
                        className="inline-flex items-center gap-1.5 bg-emerald-600 text-white text-xs font-semibold px-3.5 py-2 rounded-xl hover:bg-emerald-700 transition-all shadow-sm shadow-emerald-200 active:scale-[0.97]"
                      >
                        {t('dashboard.startQuiz')} <ArrowRight className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                  </div>
                ))
              ) : (
                <div className="col-span-full py-16 text-center bg-white rounded-2xl border border-dashed border-slate-200">
                  <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
                    <Clock className="w-6 h-6 text-slate-300" />
                  </div>
                  <p className="text-slate-500 text-sm font-medium">{t('dashboard.noQuizzesAvailable')}</p>
                  <p className="text-slate-400 text-xs mt-1">{t('dashboard.checkBackLater')}</p>
                </div>
              )}
            </div>
          </div>

          {/* Recent Results */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900">{t('dashboard.recentResults')}</h2>
              <Link to="/student/results" className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 flex items-center gap-1">
                {t('dashboard.viewAll')} <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="h-1 bg-gradient-to-r from-violet-500 to-purple-500" />
              <div className="p-5 space-y-3">
                {recentAttempts.length > 0 ? (
                  recentAttempts.slice(0, 5).map((attempt) => {
                    const pct = attempt.score_percent;
                    return (
                      <div
                        key={attempt.id}
                        className="flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 cursor-pointer transition-all"
                        onClick={() => window.location.href = `/student/results/${attempt.id}`}
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-slate-900 truncate">{t('student.dashboard.quizResults')}</div>
                          <div className="text-xs text-slate-400 mt-0.5">
                            {new Date(attempt.completed_at).toLocaleDateString()}
                          </div>
                        </div>
                        <div className={cn(
                          "shrink-0 px-2.5 py-1 rounded-lg text-xs font-bold",
                          pct >= 50 ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"
                        )}>
                          {pct}%
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-center py-10">
                    <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
                      <Trophy className="w-6 h-6 text-slate-300" />
                    </div>
                    <p className="text-slate-400 text-sm font-medium">{t('dashboard.noResultsYet')}</p>
                    <p className="text-slate-300 text-xs mt-1">{t('student.dashboard.takeQuizToSeeResults')}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </StudentLayout>
  );
}
