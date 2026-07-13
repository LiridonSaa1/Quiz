import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../supabase';
import TeacherLayout from '../../components/layout/TeacherLayout';
import { Link } from 'react-router-dom';
import {
  BookOpen, Users, FileText, TrendingUp,
  ArrowUpRight, Plus, ChevronRight,
  Target, Clock, Award, BarChart3, Sparkles, Layers, Trophy, Medal, Euro
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, BarChart, Bar, Cell
} from 'recharts';
import { motion } from 'motion/react';
import { authFetchJsonCached, authFetch, apiUrl } from '../../lib/apiUrl';
import HolidayDashboardBanner from '../../components/HolidayDashboardBanner';

const CHART_DATA = [
  { day: 'Mon', attempts: 0 },
  { day: 'Tue', attempts: 0 },
  { day: 'Wed', attempts: 0 },
  { day: 'Thu', attempts: 0 },
  { day: 'Fri', attempts: 0 },
  { day: 'Sat', attempts: 0 },
  { day: 'Sun', attempts: 0 },
];

const QUICK_ACTIONS = [
  { icon: Plus,      label: 'New Course',   to: '/teacher/courses/new', color: 'from-violet-500 to-indigo-600',  shadow: 'shadow-violet-200' },
  { icon: FileText,  label: 'New Quiz',     to: '/teacher/quizzes/new', color: 'from-indigo-500 to-blue-600',    shadow: 'shadow-blue-200' },
  { icon: Users,     label: 'Add Student',  to: '/teacher/students',    color: 'from-emerald-500 to-teal-600',   shadow: 'shadow-emerald-200' },
  { icon: BarChart3, label: 'View Results', to: '/teacher/results',     color: 'from-amber-500 to-orange-600',   shadow: 'shadow-amber-200' },
];

interface ModuleCompletion {
  course: string;
  published: number;
  total: number;
  pct: number;
}

interface TopStudent {
  id: string;
  name: string;
  avatar: string | null;
  avgScore: number;
  quizzes: number;
  passed: number;
}

interface Stats {
  courses: number;
  students: number;
  quizzes: number;
  avgScore: number;
  passRate: number;
  avgDuration: number;
  certificates: number;
}

function useCountUp(target: number, duration = 900, enabled = true) {
  const [value, setValue] = useState(0);
  const raf = useRef<number>(0);

  useEffect(() => {
    if (!enabled || target === 0) { setValue(target); return; }
    let start: number | null = null;
    const step = (ts: number) => {
      if (!start) start = ts;
      const progress = Math.min((ts - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(eased * target));
      if (progress < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [target, duration, enabled]);

  return value;
}

function StatCard({
  card, index, loading,
}: {
  card: { label: string; value: number | string; icon: any; trend: string; gradient: string; bg: string; text: string; ring: string };
  index: number;
  loading: boolean;
}) {
  const numericTarget = typeof card.value === 'number' ? card.value : 0;
  const animated = useCountUp(numericTarget, 900, !loading);
  const display = typeof card.value === 'string' ? card.value : animated;

  if (loading) {
    return <div className="h-32 bg-white rounded-2xl border border-slate-100 animate-pulse" />;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className="group bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 overflow-hidden cursor-default"
    >
      <div className={`h-0.5 bg-gradient-to-r ${card.gradient}`} />
      <div className="p-5">
        <div className="flex items-start justify-between mb-4">
          <div className={`p-2.5 ${card.bg} ring-4 ${card.ring} rounded-xl transition-transform group-hover:scale-105 duration-300`}>
            <card.icon className={`w-5 h-5 ${card.text}`} />
          </div>
          {card.trend !== 'N/A' && (
            <div className="flex items-center gap-0.5 text-xs font-semibold text-emerald-600 bg-emerald-50 border border-emerald-100 px-2 py-1 rounded-lg">
              <ArrowUpRight className="w-3 h-3" />
              {card.trend}
            </div>
          )}
        </div>
        <div className="text-2xl font-bold text-slate-900 tabular-nums tracking-tight">{display}</div>
        <div className="text-xs text-slate-400 font-medium mt-0.5">{card.label}</div>
      </div>
    </motion.div>
  );
}

function getBarColor(pct: number) {
  if (pct >= 80) return '#7c3aed';
  if (pct >= 50) return '#6366f1';
  return '#a5b4fc';
}

const CustomModuleTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as ModuleCompletion;
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-lg px-3.5 py-2.5 text-xs">
      <p className="font-semibold text-slate-800 mb-1 max-w-[180px] truncate">{d.course}</p>
      <p className="text-slate-500">{d.published} of {d.total} modules published</p>
      <p className="font-bold text-violet-600 mt-0.5">{d.pct}% complete</p>
    </div>
  );
};

export default function TeacherDashboard() {
  const { t } = useTranslation();
  const [stats, setStats]                 = useState<Stats>({ courses: 0, students: 0, quizzes: 0, avgScore: 0, passRate: 0, avgDuration: 0, certificates: 0 });
  const [loading, setLoading]             = useState(true);
  const [displayName, setDisplayName]     = useState('');
  const [chartData, setChartData]         = useState(CHART_DATA);
  const [moduleData, setModuleData]       = useState<ModuleCompletion[]>([]);
  const [topStudents, setTopStudents]     = useState<TopStudent[]>([]);
  const [earnings, setEarnings]           = useState<{ total_hours: number; total_amount: number; month_year: string } | null>(null);

  useEffect(() => {
    let active = true;
    const fetch = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const uid = session.user.id;
      if (active) {
        setDisplayName(session.user.user_metadata?.displayName || session.user.email?.split('@')[0] || 'Teacher');
      }
      // Load earnings in parallel
      authFetch(apiUrl('/api/teacher/earnings'))
        .then(r => r.json())
        .then(j => { if (j?.success && active) setEarnings({ total_hours: j.total_hours, total_amount: j.total_amount, month_year: j.month_year }); })
        .catch(() => {});

      try {
        const json = await authFetchJsonCached<any>(`/api/teacher/dashboard?userId=${encodeURIComponent(uid)}`, { ttlMs: 30000 });
        if (!json?.success) throw new Error(json?.error || 'Failed to load dashboard');

        if (!active) return;
        setStats({
          courses: Number(json?.stats?.courses || 0),
          students: Number(json?.stats?.students || 0),
          quizzes: Number(json?.stats?.quizzes || 0),
          avgScore: Number(json?.stats?.avgScore || 0),
          passRate: Number(json?.stats?.passRate || 0),
          avgDuration: Number(json?.stats?.avgDuration || 0),
          certificates: Number(json?.stats?.certificates || 0),
        });
        setChartData(Array.isArray(json?.trend) && json.trend.length ? json.trend : CHART_DATA);
        setModuleData(Array.isArray(json?.moduleCompletion) ? json.moduleCompletion : []);
        setTopStudents(Array.isArray(json?.topStudents) ? json.topStudents : []);
      } catch (e) {
        console.error('Dashboard fetch error:', e);
      } finally {
        if (active) setLoading(false);
      }
    };
    fetch();
    return () => {
      active = false;
    };
  }, []);

  const STAT_CARDS = useMemo(() => [
    { label: t('dashboard.stats.totalCourses'),  value: stats.courses,  icon: BookOpen,    trend: '+12%', gradient: 'from-violet-500 to-indigo-600',  bg: 'bg-violet-50',  text: 'text-violet-600',  ring: 'ring-violet-100' },
    { label: t('dashboard.stats.myStudents'),    value: stats.students, icon: Users,        trend: '+5%',  gradient: 'from-indigo-500 to-blue-600',    bg: 'bg-indigo-50',  text: 'text-indigo-600',  ring: 'ring-indigo-100' },
    { label: t('dashboard.stats.totalQuizzes'),  value: stats.quizzes,  icon: FileText,     trend: '+8%',  gradient: 'from-amber-500 to-orange-600',   bg: 'bg-amber-50',   text: 'text-amber-600',   ring: 'ring-amber-100'  },
    { label: t('dashboard.stats.avgScore'),     value: `${stats.avgScore}%`, icon: TrendingUp, trend: 'N/A', gradient: 'from-emerald-500 to-teal-600', bg: 'bg-emerald-50', text: 'text-emerald-600', ring: 'ring-emerald-100' },
  ], [stats, t]);

  const hour = new Date().getHours();
  const greetingKey = hour < 12 ? 'dashboard.goodMorning' : hour < 18 ? 'dashboard.goodAfternoon' : 'dashboard.goodEvening';
  const greeting = t(greetingKey);

  const hasModuleData = moduleData.length > 0;
  const chartHeight = Math.max(160, moduleData.length * 44);

  return (
    <TeacherLayout>
      <div className="space-y-7">

        <HolidayDashboardBanner />

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          className="flex flex-col sm:flex-row sm:items-center justify-between gap-4"
        >
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-widest">{t('dashboard.liveDashboard')}</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              {greeting}, <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-600 to-indigo-600">{displayName}</span> 👋
            </h1>
            <p className="text-slate-400 text-sm mt-1">{t('dashboard.greetingMsg')}</p>
          </div>
          <div className="flex items-center gap-2.5">
            <div className="flex items-center gap-1.5 bg-gradient-to-r from-violet-50 to-indigo-50 border border-violet-100 text-violet-700 text-xs font-semibold px-3.5 py-2 rounded-xl shadow-sm shadow-violet-100">
              <Sparkles className="w-3.5 h-3.5" />
              {t('nav.teacherPortal')}
            </div>
          </div>
        </motion.div>

        {/* Stat Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {STAT_CARDS.map((card, i) => (
            <StatCard key={card.label} card={card} index={i} loading={loading} />
          ))}
        </div>

        {/* Earnings Widget */}
        {earnings !== null && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.15 }}
            className="bg-gradient-to-r from-emerald-500 to-teal-600 rounded-2xl p-5 shadow-lg shadow-emerald-100 flex items-center justify-between"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
                <Euro className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-emerald-100 text-sm font-medium">Të ardhurat këtë muaj</p>
                <p className="text-white text-2xl font-bold">€{earnings.total_amount.toFixed(2)}</p>
                <p className="text-emerald-200 text-xs mt-0.5">
                  {earnings.total_hours.toFixed(1)} orë pune · {(() => {
                    const [yr, mo] = earnings.month_year.split('-');
                    return new Date(Number(yr), Number(mo) - 1, 1).toLocaleString('default', { month: 'long', year: 'numeric' });
                  })()}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-white" />
              </span>
              <span className="text-white/80 text-xs font-medium">Live</span>
            </div>
          </motion.div>
        )}

        {/* Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Quiz Activity Chart */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.32, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            className="lg:col-span-2 bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden hover:shadow-md transition-shadow duration-300"
          >
            <div className="h-0.5 bg-gradient-to-r from-violet-500 to-indigo-500" />
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-base font-bold text-slate-900">{t('dashboard.quizActivity')}</h2>
                  <p className="text-xs text-slate-400 mt-0.5">{t('dashboard.attemptsLast7Days')}</p>
                </div>
                <select className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-violet-500 text-slate-600 cursor-pointer">
                  <option>{t('common.last7Days')}</option>
                  <option>{t('common.last30Days')}</option>
                </select>
              </div>
              <div className="h-[240px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ left: -10, right: 0 }}>
                    <defs>
                      <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#7c3aed" stopOpacity={0.15} />
                        <stop offset="95%" stopColor="#7c3aed" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11 }} dy={8} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', boxShadow: '0 10px 25px -5px rgba(0,0,0,.1)', fontSize: 12 }}
                      cursor={{ stroke: '#7c3aed', strokeWidth: 1.5, strokeDasharray: '4 4' }}
                    />
                    <Area type="monotone" dataKey="attempts" stroke="#7c3aed" strokeWidth={2.5} fill="url(#areaGrad)" dot={false} activeDot={{ r: 5, fill: '#7c3aed', stroke: '#fff', strokeWidth: 2 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </motion.div>

          {/* Right Column */}
          <div className="space-y-4">

            {/* Quick Actions */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.36, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
              className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden hover:shadow-md transition-shadow duration-300"
            >
              <div className="h-0.5 bg-gradient-to-r from-indigo-500 to-violet-500" />
              <div className="p-5">
                <h2 className="text-sm font-bold text-slate-900 mb-4">{t('dashboard.quickActions.title')}</h2>
                <div className="grid grid-cols-2 gap-2.5">
                  {QUICK_ACTIONS.map(({ icon: Icon, label, to, color, shadow }) => {
                    const actionLabel = label === 'New Course' ? t('dashboard.quickActions.newCourse') :
                                       label === 'New Quiz' ? t('dashboard.quickActions.newQuiz') :
                                       label === 'Add Student' ? t('dashboard.quickActions.addStudent') :
                                       label === 'View Results' ? t('dashboard.quickActions.viewResults') : label;
                    return (
                      <Link
                        key={label}
                        to={to}
                        className="group flex flex-col items-center gap-2.5 p-3.5 rounded-xl border border-slate-100 hover:border-violet-200 hover:bg-violet-50/40 transition-all duration-200 active:scale-95"
                      >
                        <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center shadow-md ${shadow} group-hover:scale-110 group-hover:shadow-lg transition-all duration-200`}>
                          <Icon className="w-4 h-4 text-white" />
                        </div>
                        <span className="text-xs font-semibold text-slate-600 group-hover:text-violet-700 text-center leading-tight transition-colors">{actionLabel}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            </motion.div>

            {/* At a Glance */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.42, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
              className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 hover:shadow-md transition-shadow duration-300"
            >
              <h2 className="text-sm font-bold text-slate-900 mb-4">{t('dashboard.overview')}</h2>
              <div className="space-y-1">
                {[
                  { icon: Target, label: t('dashboard.passRate'),      value: `${stats.passRate}%`, color: 'text-violet-500',  bg: 'bg-violet-50',  ring: 'ring-violet-100'  },
                  { icon: Clock,  label: t('dashboard.avgTimePerQuiz'), value: `${stats.avgDuration}m`, color: 'text-indigo-500',  bg: 'bg-indigo-50',  ring: 'ring-indigo-100'  },
                  { icon: Award,  label: t('dashboard.certsIssued'),   value: String(stats.certificates), color: 'text-amber-500',   bg: 'bg-amber-50',   ring: 'ring-amber-100'   },
                ].map((row) => (
                  <div key={row.label} className="flex items-center gap-3 py-2.5 border-b border-slate-50 last:border-0 group">
                    <div className={`w-8 h-8 rounded-lg ${row.bg} ring-2 ${row.ring} flex items-center justify-center shrink-0 transition-transform group-hover:scale-105 duration-200`}>
                      <row.icon className={`w-3.5 h-3.5 ${row.color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-slate-400 font-medium">{row.label}</div>
                    </div>
                    <div className="text-sm font-bold text-slate-500">{row.value}</div>
                  </div>
                ))}
              </div>
              <Link
                to="/teacher/results"
                className="mt-4 flex items-center justify-center gap-1.5 text-xs font-semibold text-violet-600 hover:text-violet-700 py-2 hover:bg-violet-50 rounded-xl transition-all duration-200"
              >
                {t('dashboard.viewFullAnalytics')} <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </motion.div>
          </div>
        </div>

        {/* Student Leaderboard */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.48, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden hover:shadow-md transition-shadow duration-300"
        >
          <div className="h-0.5 bg-gradient-to-r from-amber-400 via-orange-500 to-rose-500" />
          <div className="p-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-amber-50 ring-4 ring-amber-100 rounded-xl">
                  <Trophy className="w-5 h-5 text-amber-500" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">Top Students</h2>
                  <p className="text-xs text-slate-400 mt-0.5">Ranked by average quiz score</p>
                </div>
              </div>
              <Link
                to="/teacher/students"
                className="flex items-center gap-1.5 text-xs font-semibold text-amber-600 hover:text-amber-700 bg-amber-50 hover:bg-amber-100 px-3 py-1.5 rounded-xl transition-all duration-200"
              >
                All Students <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            {loading ? (
              <div className="space-y-3">
                {[1,2,3,4,5].map(i => (
                  <div key={i} className="h-12 bg-slate-100 rounded-xl animate-pulse" />
                ))}
              </div>
            ) : topStudents.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <div className="w-12 h-12 rounded-2xl bg-slate-50 ring-4 ring-slate-100 flex items-center justify-center mb-3">
                  <Trophy className="w-5 h-5 text-slate-300" />
                </div>
                <p className="text-sm font-semibold text-slate-400">No quiz results yet</p>
                <p className="text-xs text-slate-300 mt-0.5">Students will appear here once they complete quizzes</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {topStudents.map((student, i) => {
                  const rank = i + 1;
                  const isGold   = rank === 1;
                  const isSilver = rank === 2;
                  const isBronze = rank === 3;
                  const medalColor = isGold ? 'text-amber-400' : isSilver ? 'text-slate-400' : isBronze ? 'text-orange-400' : null;
                  const ringColor  = isGold ? 'ring-amber-200 bg-amber-50' : isSilver ? 'ring-slate-200 bg-slate-50' : isBronze ? 'ring-orange-200 bg-orange-50' : 'ring-slate-100 bg-slate-50';
                  const passRate   = student.quizzes > 0 ? Math.round((student.passed / student.quizzes) * 100) : 0;
                  const initials   = student.name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase();

                  return (
                    <motion.div
                      key={student.id}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.52 + i * 0.04, duration: 0.35 }}
                      className="flex items-center gap-3 p-3.5 rounded-xl border border-slate-100 hover:border-violet-200 hover:bg-violet-50/30 transition-all duration-200 group"
                    >
                      {/* Rank */}
                      <div className={`w-7 h-7 rounded-lg ring-2 ${ringColor} flex items-center justify-center shrink-0`}>
                        {medalColor
                          ? <Medal className={`w-3.5 h-3.5 ${medalColor}`} />
                          : <span className="text-[10px] font-bold text-slate-400">#{rank}</span>
                        }
                      </div>

                      {/* Avatar */}
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-400 to-indigo-500 flex items-center justify-center text-white text-[10px] font-bold shrink-0 overflow-hidden">
                        {student.avatar
                          ? <img src={student.avatar} alt={student.name} className="w-full h-full object-cover" />
                          : initials
                        }
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-slate-800 truncate group-hover:text-violet-700 transition-colors">{student.name}</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">{student.quizzes} quiz{student.quizzes !== 1 ? 'zes' : ''} · {passRate}% pass rate</p>
                      </div>

                      {/* Score badge */}
                      <div className={`shrink-0 text-xs font-bold tabular-nums px-2 py-1 rounded-lg ${
                        student.avgScore >= 80 ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' :
                        student.avgScore >= 60 ? 'bg-indigo-50 text-indigo-600 border border-indigo-100' :
                        'bg-slate-50 text-slate-500 border border-slate-100'
                      }`}>
                        {student.avgScore}%
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>
        </motion.div>

        {/* Module Completion Chart */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden hover:shadow-md transition-shadow duration-300"
        >
          <div className="h-0.5 bg-gradient-to-r from-violet-500 via-indigo-500 to-blue-500" />
          <div className="p-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-violet-50 ring-4 ring-violet-100 rounded-xl">
                  <Layers className="w-5 h-5 text-violet-600" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">Module Completion</h2>
                  <p className="text-xs text-slate-400 mt-0.5">Published modules per course</p>
                </div>
              </div>
              <Link
                to="/teacher/modules"
                className="flex items-center gap-1.5 text-xs font-semibold text-violet-600 hover:text-violet-700 bg-violet-50 hover:bg-violet-100 px-3 py-1.5 rounded-xl transition-all duration-200"
              >
                Manage <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-8 bg-slate-100 rounded-lg animate-pulse" />
                ))}
              </div>
            ) : !hasModuleData ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <div className="w-12 h-12 rounded-2xl bg-slate-50 ring-4 ring-slate-100 flex items-center justify-center mb-3">
                  <Layers className="w-5 h-5 text-slate-300" />
                </div>
                <p className="text-sm font-semibold text-slate-400">No modules yet</p>
                <p className="text-xs text-slate-300 mt-0.5">Create modules in your courses to see completion here</p>
                <Link
                  to="/teacher/modules"
                  className="mt-4 text-xs font-semibold text-violet-600 hover:underline"
                >
                  Go to Modules →
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                {/* Horizontal bar chart */}
                <div style={{ height: chartHeight }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={moduleData}
                      layout="vertical"
                      margin={{ left: 0, right: 40, top: 4, bottom: 4 }}
                      barCategoryGap="28%"
                    >
                      <CartesianGrid horizontal={false} stroke="#f1f5f9" />
                      <XAxis
                        type="number"
                        domain={[0, 100]}
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: '#94a3b8', fontSize: 10 }}
                        tickFormatter={(v) => `${v}%`}
                      />
                      <YAxis
                        type="category"
                        dataKey="course"
                        width={120}
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: '#64748b', fontSize: 11 }}
                        tickFormatter={(v: string) => v.length > 16 ? `${v.slice(0, 16)}…` : v}
                      />
                      <Tooltip content={<CustomModuleTooltip />} cursor={{ fill: '#f8fafc' }} />
                      <Bar dataKey="pct" radius={[0, 6, 6, 0]} maxBarSize={20}>
                        {moduleData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={getBarColor(entry.pct)} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Course list with pill indicators */}
                <div className="space-y-2.5">
                  {moduleData.map((item, i) => (
                    <motion.div
                      key={item.course}
                      initial={{ opacity: 0, x: 12 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.55 + i * 0.05, duration: 0.3 }}
                      className="flex items-center gap-3 group"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-semibold text-slate-700 truncate max-w-[160px]">{item.course}</span>
                          <span className={`text-xs font-bold tabular-nums ml-2 ${item.pct >= 80 ? 'text-violet-600' : item.pct >= 50 ? 'text-indigo-500' : 'text-slate-400'}`}>
                            {item.pct}%
                          </span>
                        </div>
                        <div className="relative h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${item.pct}%` }}
                            transition={{ delay: 0.6 + i * 0.05, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                            className="absolute inset-y-0 left-0 rounded-full"
                            style={{ background: getBarColor(item.pct) }}
                          />
                        </div>
                        <p className="text-[10px] text-slate-400 mt-0.5">{item.published}/{item.total} modules published</p>
                      </div>
                    </motion.div>
                  ))}

                  {/* Legend */}
                  <div className="flex items-center gap-4 pt-3 border-t border-slate-50 mt-1">
                    {[
                      { color: '#7c3aed', label: '≥ 80%' },
                      { color: '#6366f1', label: '50–79%' },
                      { color: '#a5b4fc', label: '< 50%' },
                    ].map(({ color, label }) => (
                      <div key={label} className="flex items-center gap-1.5">
                        <div className="w-2.5 h-2.5 rounded-sm" style={{ background: color }} />
                        <span className="text-[10px] text-slate-400 font-medium">{label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </motion.div>

      </div>
    </TeacherLayout>
  );
}
