import React, { useEffect, useState } from 'react';
import { supabase } from '../../supabase';
import TeacherLayout from '../../components/layout/TeacherLayout';
import { Link } from 'react-router-dom';
import {
  BookOpen, Users, FileText, TrendingUp,
  ArrowUpRight, Plus, ChevronRight, Zap,
  Target, Clock, Award, BarChart3
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer
} from 'recharts';

const CHART_DATA = [
  { day: 'Mon', attempts: 40 },
  { day: 'Tue', attempts: 30 },
  { day: 'Wed', attempts: 55 },
  { day: 'Thu', attempts: 27 },
  { day: 'Fri', attempts: 48 },
  { day: 'Sat', attempts: 23 },
  { day: 'Sun', attempts: 62 },
];

const QUICK_ACTIONS = [
  { icon: Plus,      label: 'New Course', to: '/teacher/courses/new', color: 'from-violet-500 to-indigo-600' },
  { icon: FileText,  label: 'New Quiz',   to: '/teacher/quizzes/new', color: 'from-indigo-500 to-blue-600' },
  { icon: Users,     label: 'Add Student',to: '/teacher/students',    color: 'from-emerald-500 to-teal-600' },
  { icon: BarChart3, label: 'View Results',to: '/teacher/results',    color: 'from-amber-500 to-orange-600' },
];

interface Stats {
  courses: number;
  students: number;
  quizzes: number;
  avgScore: number;
}

export default function TeacherDashboard() {
  const [stats, setStats]   = useState<Stats>({ courses: 0, students: 0, quizzes: 0, avgScore: 0 });
  const [loading, setLoading] = useState(true);
  const [displayName, setDisplayName] = useState('');

  useEffect(() => {
    const fetch = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const uid = session.user.id;
      setDisplayName(session.user.user_metadata?.displayName || session.user.email?.split('@')[0] || 'Teacher');

      try {
        const [courses, students, quizzes] = await Promise.all([
          supabase.from('courses').select('*', { count: 'exact', head: true }).eq('teacher_id', uid),
          supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('teacher_id', uid),
          supabase.from('quizzes').select('*', { count: 'exact', head: true }).eq('teacher_id', uid),
        ]);
        setStats({
          courses:  courses.count  || 0,
          students: students.count || 0,
          quizzes:  quizzes.count  || 0,
          avgScore: 0,
        });
      } catch (e) {
        console.error('Dashboard fetch error:', e);
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, []);

  const STAT_CARDS = [
    {
      label: 'Total Courses', value: stats.courses,
      icon: BookOpen, trend: '+12%',
      gradient: 'from-violet-500 to-indigo-600',
      bg: 'bg-violet-50', text: 'text-violet-600',
    },
    {
      label: 'My Students', value: stats.students,
      icon: Users, trend: '+5%',
      gradient: 'from-indigo-500 to-blue-600',
      bg: 'bg-indigo-50', text: 'text-indigo-600',
    },
    {
      label: 'Total Quizzes', value: stats.quizzes,
      icon: FileText, trend: '+8%',
      gradient: 'from-amber-500 to-orange-600',
      bg: 'bg-amber-50', text: 'text-amber-600',
    },
    {
      label: 'Avg. Score', value: `${stats.avgScore}%`,
      icon: TrendingUp, trend: 'N/A',
      gradient: 'from-emerald-500 to-teal-600',
      bg: 'bg-emerald-50', text: 'text-emerald-600',
    },
  ];

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <TeacherLayout>
      <div className="space-y-7">

        {/* ── Header ── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Live</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              {greeting}, {displayName} 👋
            </h1>
            <p className="text-slate-400 text-sm mt-1">Here's what's happening in your courses today.</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 bg-violet-50 border border-violet-100 text-violet-700 text-xs font-semibold px-3 py-1.5 rounded-xl">
              <Zap className="w-3.5 h-3.5" />
              Teacher Portal
            </div>
          </div>
        </div>

        {/* ── Stat Cards ── */}
        {loading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {Array(4).fill(0).map((_, i) => <div key={i} className="h-32 bg-white rounded-2xl border border-slate-100 animate-pulse" />)}
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {STAT_CARDS.map(card => (
              <div key={card.label} className="group bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all overflow-hidden">
                <div className={`h-1 bg-gradient-to-r ${card.gradient}`} />
                <div className="p-5">
                  <div className="flex items-center justify-between mb-4">
                    <div className={`p-2.5 ${card.bg} rounded-xl`}>
                      <card.icon className={`w-5 h-5 ${card.text}`} />
                    </div>
                    {card.trend !== 'N/A' && (
                      <div className="flex items-center gap-0.5 text-xs font-semibold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg">
                        <ArrowUpRight className="w-3 h-3" />
                        {card.trend}
                      </div>
                    )}
                  </div>
                  <div className="text-2xl font-bold text-slate-900 tabular-nums">{card.value}</div>
                  <div className="text-xs text-slate-400 font-medium mt-0.5">{card.label}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Main Grid ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Chart */}
          <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="h-1 bg-gradient-to-r from-violet-500 to-indigo-500" />
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-base font-bold text-slate-900">Quiz Activity</h2>
                  <p className="text-xs text-slate-400 mt-0.5">Attempts over the last 7 days</p>
                </div>
                <select className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-violet-500 text-slate-600">
                  <option>Last 7 days</option>
                  <option>Last 30 days</option>
                </select>
              </div>
              <div className="h-[240px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={CHART_DATA} margin={{ left: -10, right: 0 }}>
                    <defs>
                      <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#7c3aed" stopOpacity={0.12} />
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
                    <Area type="monotone" dataKey="attempts" stroke="#7c3aed" strokeWidth={2.5} fill="url(#areaGrad)" dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Quick Actions + Tips */}
          <div className="space-y-4">

            {/* Quick Actions */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="h-1 bg-gradient-to-r from-indigo-500 to-violet-500" />
              <div className="p-5">
                <h2 className="text-sm font-bold text-slate-900 mb-4">Quick Actions</h2>
                <div className="grid grid-cols-2 gap-2.5">
                  {QUICK_ACTIONS.map(({ icon: Icon, label, to, color }) => (
                    <Link
                      key={label}
                      to={to}
                      className="group flex flex-col items-center gap-2.5 p-3.5 rounded-xl border border-slate-100 hover:border-violet-200 hover:bg-violet-50/50 transition-all"
                    >
                      <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform`}>
                        <Icon className="w-4 h-4 text-white" />
                      </div>
                      <span className="text-xs font-semibold text-slate-600 group-hover:text-violet-700 text-center leading-tight">{label}</span>
                    </Link>
                  ))}
                </div>
              </div>
            </div>

            {/* At-a-glance metrics */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
              <h2 className="text-sm font-bold text-slate-900 mb-4">At a Glance</h2>
              <div className="space-y-3">
                {[
                  { icon: Target, label: 'Pass rate',     value: '—',   color: 'text-violet-500', bg: 'bg-violet-50' },
                  { icon: Clock,  label: 'Avg. time/quiz', value: '—',  color: 'text-indigo-500', bg: 'bg-indigo-50' },
                  { icon: Award,  label: 'Certs issued',  value: '—',   color: 'text-amber-500',  bg: 'bg-amber-50'  },
                ].map(row => (
                  <div key={row.label} className="flex items-center gap-3 py-2.5 border-b border-slate-50 last:border-0">
                    <div className={`w-8 h-8 rounded-lg ${row.bg} flex items-center justify-center shrink-0`}>
                      <row.icon className={`w-3.5 h-3.5 ${row.color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-slate-400 font-medium">{row.label}</div>
                    </div>
                    <div className="text-sm font-bold text-slate-600">{row.value}</div>
                  </div>
                ))}
              </div>
              <Link
                to="/teacher/results"
                className="mt-4 flex items-center justify-center gap-1.5 text-xs font-semibold text-violet-600 hover:text-violet-700 py-2 hover:bg-violet-50 rounded-xl transition-colors"
              >
                View full analytics <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </TeacherLayout>
  );
}
