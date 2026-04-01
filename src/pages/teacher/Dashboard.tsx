import React, { useEffect, useState } from 'react';
import { supabase } from '../../supabase';
import TeacherLayout from '../../components/layout/TeacherLayout';
import { 
  BookOpen, 
  Users, 
  FileText, 
  TrendingUp, 
  CheckCircle2, 
  Clock,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area
} from 'recharts';
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
  const [stats, setStats] = useState({
    courses: 0,
    students: 0,
    quizzes: 0,
    attempts: 0,
    avgScore: 0
  });
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

        setStats({
          courses: coursesSnap.count || 0,
          students: studentsSnap.count || 0,
          quizzes: quizzesSnap.count || 0,
          attempts: attemptsSnap.data?.length || 0,
          avgScore
        });

        // Fetch recent attempts
        const { data: recent, error: recentError } = await supabase
          .from('attempts')
          .select('*, profiles(display_name), quizzes(title)')
          .eq('teacher_id', teacherId)
          .order('completed_at', { ascending: false })
          .limit(5);
        
        if (recentError) throw recentError;

        setRecentAttempts(recent.map(a => ({
          id: a.id,
          score: a.score,
          totalPoints: a.total_points,
          passed: a.passed,
          completedAt: a.completed_at,
          studentName: a.profiles?.display_name,
          quizTitle: a.quizzes?.title
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
    { label: 'Total Courses', value: stats.courses, icon: BookOpen, color: 'bg-blue-50 text-blue-600', trend: '+12%', trendUp: true },
    { label: 'Total Students', value: stats.students, icon: Users, color: 'bg-purple-50 text-purple-600', trend: '+5%', trendUp: true },
    { label: 'Total Quizzes', value: stats.quizzes, icon: FileText, color: 'bg-orange-50 text-orange-600', trend: '+8%', trendUp: true },
    { label: 'Average Score', value: `${stats.avgScore}%`, icon: TrendingUp, color: 'bg-green-50 text-green-600', trend: '-2%', trendUp: false },
  ];

  return (
    <TeacherLayout>
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Teacher Dashboard</h1>
          <p className="text-slate-500 mt-2">Welcome back! Here's what's happening in your courses.</p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {statCards.map((stat) => (
            <div key={stat.label} className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all">
              <div className="flex items-center justify-between mb-4">
                <div className={cn("p-3 rounded-xl", stat.color)}>
                  <stat.icon className="w-6 h-6" />
                </div>
                <div className={cn(
                  "flex items-center gap-1 text-sm font-medium px-2 py-1 rounded-lg",
                  stat.trendUp ? "text-green-600 bg-green-50" : "text-red-600 bg-red-50"
                )}>
                  {stat.trendUp ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                  {stat.trend}
                </div>
              </div>
              <div className="text-2xl font-bold text-slate-900">{stat.value}</div>
              <div className="text-slate-500 text-sm mt-1">{stat.label}</div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Chart */}
          <div className="lg:col-span-2 bg-white p-8 rounded-2xl border border-slate-100 shadow-sm">
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-xl font-bold text-slate-900">Quiz Attempts</h2>
              <select className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-slate-900">
                <option>Last 7 days</option>
                <option>Last 30 days</option>
              </select>
            </div>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data}>
                  <defs>
                    <linearGradient id="colorAttempts" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0f172a" stopOpacity={0.1}/>
                      <stop offset="95%" stopColor="#0f172a" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} />
                  <Tooltip 
                    contentStyle={{backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #f1f5f9', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}}
                    cursor={{stroke: '#0f172a', strokeWidth: 2}}
                  />
                  <Area type="monotone" dataKey="attempts" stroke="#0f172a" strokeWidth={3} fillOpacity={1} fill="url(#colorAttempts)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Recent Activity */}
          <div className="bg-white p-8 rounded-2xl border border-slate-100 shadow-sm">
            <h2 className="text-xl font-bold text-slate-900 mb-6">Recent Attempts</h2>
            <div className="space-y-6">
              {recentAttempts.length > 0 ? (
                recentAttempts.map((attempt) => (
                  <div key={attempt.id} className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 font-bold">
                      {attempt.studentName?.[0] || 'S'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-slate-900 truncate">
                        {attempt.studentName || 'Student'}
                      </div>
                      <div className="text-xs text-slate-500 truncate">
                        Completed {attempt.quizTitle || 'Quiz'}
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        <span className={cn(
                          "text-xs font-bold px-2 py-0.5 rounded-full",
                          attempt.passed ? "bg-green-50 text-green-600" : "bg-red-50 text-red-600"
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
                  <FileText className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                  <p className="text-slate-400 text-sm">No recent attempts found</p>
                </div>
              )}
            </div>
            <button className="w-full mt-8 py-3 text-sm font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-xl transition-all">
              View All Activity
            </button>
          </div>
        </div>
      </div>
    </TeacherLayout>
  );
}
