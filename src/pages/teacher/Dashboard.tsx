import React, { useEffect, useState } from 'react';
import { supabase } from '../../supabase';
import TeacherLayout from '../../components/layout/TeacherLayout';
import { 
  BookOpen, Users, FileText, TrendingUp, 
  CheckCircle2, Clock, ArrowUpRight, ArrowDownRight, Sparkles
} from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { cn } from '../../lib/utils';

const data = [
  { name: 'Mon', attempts: 40 },
  { name: 'Tue', attempts: 30 },
  { name: 'Wed', attempts: 20 },
  { name: 'Thu', attempts: 27 },
  { name: 'Fri', attempts: 18 },
  { name: 'Sat', attempts: 23 },
  { name: 'Sun', attempts: 34 },
];

export default function TeacherDashboard() {
  const [stats, setStats] = useState({ courses: 0, students: 0, quizzes: 0, attempts: 0, avgScore: 0 });
  const [recentAttempts, setRecentAttempts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const teacherId = session.user.id;
      try {
        const [coursesSnap, studentsSnap, quizzesSnap, attemptsSnap] = await Promise.all([
          supabase.from('courses').select('*', { count: 'exact', head: true }).eq('teacher_id', teacherId),
          supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('teacher_id', teacherId),
          supabase.from('quizzes').select('*', { count: 'exact', head: true }).eq('teacher_id', teacherId),
          supabase.from('attempts').select('*').eq('teacher_id', teacherId)
        ]);
        const attempts = attemptsSnap.data || [];
        const avgScore = attempts.length > 0
          ? Math.round(attempts.reduce((acc, curr) => acc + (curr.score / curr.total_points * 100), 0) / attempts.length)
          : 0;
        setStats({ courses: coursesSnap.count || 0, students: studentsSnap.count || 0, quizzes: quizzesSnap.count || 0, attempts: attempts.length, avgScore });
        const { data: recent } = await supabase
          .from('attempts').select('*, profiles(display_name), quizzes(title)')
          .eq('teacher_id', teacherId).order('completed_at', { ascending: false }).limit(5);
        setRecentAttempts((recent || []).map((a: any) => ({
          id: a.id, score: a.score, totalPoints: a.total_points, passed: a.passed,
          completedAt: a.completed_at, studentName: a.profiles?.display_name, quizTitle: a.quizzes?.title
        })));
      } catch (error) {
        console.error('Error fetching stats:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, []);

  const statCards = [
    { label: 'Total Courses', value: stats.courses, icon: BookOpen, gradient: 'from-indigo-500 to-violet-500', light: 'bg-indigo-50', text: 'text-indigo-600', trend: '+12%', up: true },
    { label: 'Total Students', value: stats.students, icon: Users, gradient: 'from-violet-500 to-purple-500', light: 'bg-violet-50', text: 'text-violet-600', trend: '+5%', up: true },
    { label: 'Total Quizzes', value: stats.quizzes, icon: FileText, gradient: 'from-amber-500 to-orange-500', light: 'bg-amber-50', text: 'text-amber-600', trend: '+8%', up: true },
    { label: 'Average Score', value: `${stats.avgScore}%`, icon: TrendingUp, gradient: 'from-emerald-500 to-teal-500', light: 'bg-emerald-50', text: 'text-emerald-600', trend: '-2%', up: false },
  ];

  return (
    <TeacherLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Teacher Dashboard</h1>
            <p className="text-slate-500 text-sm mt-1">Welcome back! Here's what's happening in your courses.</p>
          </div>
          <div className="hidden sm:flex items-center gap-1.5 bg-violet-50 border border-violet-100 text-violet-700 text-xs font-semibold px-3 py-1.5 rounded-xl">
            <Sparkles className="w-3.5 h-3.5" />
            Live Data
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {statCards.map((stat) => (
            <div key={stat.label} className="bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all overflow-hidden">
              <div className={`h-1 bg-gradient-to-r ${stat.gradient}`} />
              <div className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className={`p-2.5 ${stat.light} rounded-xl`}>
                    <stat.icon className={`w-5 h-5 ${stat.text}`} />
                  </div>
                  <div className={cn(
                    "flex items-center gap-0.5 text-xs font-semibold px-2 py-1 rounded-lg",
                    stat.up ? "text-emerald-700 bg-emerald-50" : "text-red-600 bg-red-50"
                  )}>
                    {stat.up ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                    {stat.trend}
                  </div>
                </div>
                <div className="text-2xl font-bold text-slate-900">{stat.value}</div>
                <div className="text-slate-500 text-xs mt-0.5 font-medium">{stat.label}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Chart */}
          <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="h-1 bg-gradient-to-r from-violet-500 to-indigo-500" />
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-base font-bold text-slate-900">Quiz Attempts</h2>
                  <p className="text-xs text-slate-400 mt-0.5">Activity over the last 7 days</p>
                </div>
                <select className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-medium outline-none focus:ring-2 focus:ring-violet-500 text-slate-600">
                  <option>Last 7 days</option>
                  <option>Last 30 days</option>
                </select>
              </div>
              <div className="h-[260px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data}>
                    <defs>
                      <linearGradient id="colorAttempts" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#7c3aed" stopOpacity={0.15}/>
                        <stop offset="95%" stopColor="#7c3aed" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 11}} dy={8} />
                    <YAxis axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 11}} />
                    <Tooltip
                      contentStyle={{backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 10px 25px -5px rgb(0 0 0 / 0.1)', fontSize: '12px'}}
                      cursor={{stroke: '#7c3aed', strokeWidth: 1.5, strokeDasharray: '4 4'}}
                    />
                    <Area type="monotone" dataKey="attempts" stroke="#7c3aed" strokeWidth={2.5} fillOpacity={1} fill="url(#colorAttempts)" dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Recent Activity */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="h-1 bg-gradient-to-r from-amber-500 to-orange-500" />
            <div className="p-6">
              <h2 className="text-base font-bold text-slate-900 mb-1">Recent Attempts</h2>
              <p className="text-xs text-slate-400 mb-5">Latest student activity</p>
              <div className="space-y-4">
                {recentAttempts.length > 0 ? (
                  recentAttempts.map((attempt) => (
                    <div key={attempt.id} className="flex items-start gap-3 p-3 rounded-xl hover:bg-slate-50 transition-all cursor-pointer">
                      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center text-white font-bold text-xs shrink-0 shadow-sm">
                        {attempt.studentName?.[0]?.toUpperCase() || 'S'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-slate-900 truncate">
                          {attempt.studentName || 'Student'}
                        </div>
                        <div className="text-xs text-slate-400 truncate">{attempt.quizTitle || 'Quiz'}</div>
                        <div className="mt-1.5 flex items-center gap-2">
                          <span className={cn(
                            "text-[10px] font-bold px-2 py-0.5 rounded-lg",
                            attempt.passed ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"
                          )}>
                            {Math.round((attempt.score / attempt.totalPoints) * 100)}%
                          </span>
                          <span className="text-[10px] text-slate-400 flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {new Date(attempt.completedAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-10">
                    <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
                      <FileText className="w-6 h-6 text-slate-300" />
                    </div>
                    <p className="text-slate-400 text-sm font-medium">No recent attempts</p>
                    <p className="text-slate-300 text-xs mt-1">Activity will appear here</p>
                  </div>
                )}
              </div>
              {recentAttempts.length > 0 && (
                <button className="w-full mt-4 py-2.5 text-xs font-semibold text-violet-600 hover:text-violet-700 hover:bg-violet-50 rounded-xl transition-all border border-violet-100">
                  View All Activity
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </TeacherLayout>
  );
}
