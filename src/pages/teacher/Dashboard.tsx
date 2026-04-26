import React, { useEffect, useState, useRef } from 'react';
import { supabase } from '../../supabase';
import TeacherLayout from '../../components/layout/TeacherLayout';
import { Link } from 'react-router-dom';
import {
  BookOpen, Users, FileText, TrendingUp,
  ArrowUpRight, Plus, ChevronRight, Zap,
  Target, Clock, Award, BarChart3, Sparkles
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer
} from 'recharts';
import { motion } from 'motion/react';
import { authFetch } from '../../lib/apiUrl';

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

export default function TeacherDashboard() {
  const [stats, setStats]     = useState<Stats>({ courses: 0, students: 0, quizzes: 0, avgScore: 0, passRate: 0, avgDuration: 0, certificates: 0 });
  const [loading, setLoading] = useState(true);
  const [displayName, setDisplayName] = useState('');
  const [chartData, setChartData] = useState(CHART_DATA);

  useEffect(() => {
    const fetch = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const uid = session.user.id;
      setDisplayName(session.user.user_metadata?.displayName || session.user.email?.split('@')[0] || 'Teacher');
      try {
        const res = await authFetch(`/api/teacher/dashboard?userId=${encodeURIComponent(uid)}`);
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json?.success) throw new Error(json?.error || 'Failed to load dashboard');

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
      } catch (e) {
        console.error('Dashboard fetch error:', e);
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, []);

  const STAT_CARDS = [
    { label: 'Total Courses',  value: stats.courses,  icon: BookOpen,    trend: '+12%', gradient: 'from-violet-500 to-indigo-600',  bg: 'bg-violet-50',  text: 'text-violet-600',  ring: 'ring-violet-100' },
    { label: 'My Students',    value: stats.students, icon: Users,        trend: '+5%',  gradient: 'from-indigo-500 to-blue-600',    bg: 'bg-indigo-50',  text: 'text-indigo-600',  ring: 'ring-indigo-100' },
    { label: 'Total Quizzes',  value: stats.quizzes,  icon: FileText,     trend: '+8%',  gradient: 'from-amber-500 to-orange-600',   bg: 'bg-amber-50',   text: 'text-amber-600',   ring: 'ring-amber-100'  },
    { label: 'Avg. Score',     value: `${stats.avgScore}%`, icon: TrendingUp, trend: 'N/A', gradient: 'from-emerald-500 to-teal-600', bg: 'bg-emerald-50', text: 'text-emerald-600', ring: 'ring-emerald-100' },
  ];

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <TeacherLayout>
      <div className="space-y-7">

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
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Live Dashboard</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              {greeting}, <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-600 to-indigo-600">{displayName}</span> 👋
            </h1>
            <p className="text-slate-400 text-sm mt-1">Here's what's happening in your courses today.</p>
          </div>
          <div className="flex items-center gap-2.5">
            <div className="flex items-center gap-1.5 bg-gradient-to-r from-violet-50 to-indigo-50 border border-violet-100 text-violet-700 text-xs font-semibold px-3.5 py-2 rounded-xl shadow-sm shadow-violet-100">
              <Sparkles className="w-3.5 h-3.5" />
              Teacher Portal
            </div>
          </div>
        </motion.div>

        {/* Stat Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {STAT_CARDS.map((card, i) => (
            <StatCard key={card.label} card={card} index={i} loading={loading} />
          ))}
        </div>

        {/* Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Chart */}
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
                  <h2 className="text-base font-bold text-slate-900">Quiz Activity</h2>
                  <p className="text-xs text-slate-400 mt-0.5">Attempts over the last 7 days</p>
                </div>
                <select className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-violet-500 text-slate-600 cursor-pointer">
                  <option>Last 7 days</option>
                  <option>Last 30 days</option>
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
                <h2 className="text-sm font-bold text-slate-900 mb-4">Quick Actions</h2>
                <div className="grid grid-cols-2 gap-2.5">
                  {QUICK_ACTIONS.map(({ icon: Icon, label, to, color, shadow }) => (
                    <Link
                      key={label}
                      to={to}
                      className="group flex flex-col items-center gap-2.5 p-3.5 rounded-xl border border-slate-100 hover:border-violet-200 hover:bg-violet-50/40 transition-all duration-200 active:scale-95"
                    >
                      <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center shadow-md ${shadow} group-hover:scale-110 group-hover:shadow-lg transition-all duration-200`}>
                        <Icon className="w-4 h-4 text-white" />
                      </div>
                      <span className="text-xs font-semibold text-slate-600 group-hover:text-violet-700 text-center leading-tight transition-colors">{label}</span>
                    </Link>
                  ))}
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
              <h2 className="text-sm font-bold text-slate-900 mb-4">At a Glance</h2>
              <div className="space-y-1">
                {[
                  { icon: Target, label: 'Pass rate',      value: `${stats.passRate}%`, color: 'text-violet-500',  bg: 'bg-violet-50',  ring: 'ring-violet-100'  },
                  { icon: Clock,  label: 'Avg. time/quiz', value: `${stats.avgDuration}m`, color: 'text-indigo-500',  bg: 'bg-indigo-50',  ring: 'ring-indigo-100'  },
                  { icon: Award,  label: 'Certs issued',   value: String(stats.certificates), color: 'text-amber-500',   bg: 'bg-amber-50',   ring: 'ring-amber-100'   },
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
                View full analytics <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </motion.div>
          </div>
        </div>
      </div>
    </TeacherLayout>
  );
}
