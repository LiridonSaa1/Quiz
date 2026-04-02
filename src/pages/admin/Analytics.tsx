import React, { useEffect, useState } from 'react';
import AdminLayout from '../../components/layout/AdminLayout';
import { toast } from 'sonner';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import {
  Users, GraduationCap, BookOpen, FileText, Award,
  TrendingUp, CheckCircle2, Target, ClipboardList,
  CalendarCheck, BarChart3, RefreshCw, Layers
} from 'lucide-react';
import { cn } from '../../lib/utils';

interface Overview {
  totalStudents: number; activeStudents: number; totalTeachers: number;
  totalCourses: number; publishedCourses: number; totalQuizzes: number;
  publishedQuizzes: number; totalAttempts: number; completedAttempts: number;
  totalCertificates: number; totalLessons: number; totalAssignments: number;
  passRate: number; avgScore: number; attendanceRate: number; totalAttendance: number;
}

interface AnalyticsData {
  overview: Overview;
  trend: { date: string; signups: number; attempts: number }[];
  courseByCategory: { name: string; value: number }[];
  courseByLevel: { name: string; value: number }[];
  scoreDistribution: { range: string; count: number }[];
}

const PIE_COLORS = ['#6366f1', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#14b8a6'];

const StatCard = ({ icon: Icon, label, value, sub, color, trend }: any) => (
  <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 hover:shadow-md transition-all">
    <div className="flex items-start justify-between">
      <div className={cn('w-11 h-11 rounded-xl flex items-center justify-center shrink-0', color)}>
        <Icon className="w-5 h-5" />
      </div>
      {trend !== undefined && (
        <span className={cn('text-xs font-bold px-2 py-0.5 rounded-full', trend >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600')}>
          {trend >= 0 ? '↑' : '↓'} {Math.abs(trend)}%
        </span>
      )}
    </div>
    <div className="mt-3">
      <p className="text-3xl font-bold text-slate-900">{value}</p>
      <p className="text-sm font-semibold text-slate-700 mt-0.5">{label}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  </div>
);

const ChartCard = ({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) => (
  <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
    <div className="mb-4">
      <h3 className="text-base font-bold text-slate-900">{title}</h3>
      {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
    </div>
    {children}
  </div>
);

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-slate-100 shadow-lg rounded-xl px-3 py-2 text-xs">
      <p className="font-bold text-slate-700 mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.color }} className="font-medium">
          {p.name}: {p.value}
        </p>
      ))}
    </div>
  );
};

export default function AdminAnalytics() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/analytics');
      const json = await res.json();
      if (json.success) setData(json);
      else toast.error(json.error || 'Failed to load analytics');
    } catch { toast.error('Failed to load analytics'); }
    finally { setLoading(false); }
  };

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600" />
        </div>
      </AdminLayout>
    );
  }

  const ov = data?.overview;

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Analytics</h1>
            <p className="text-slate-500 text-sm mt-0.5">Real-time platform performance and engagement insights</p>
          </div>
          <button onClick={fetchData}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl text-sm font-semibold hover:bg-slate-50 transition-all">
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
        </div>

        {/* Stat Cards — Row 1: Users & Courses */}
        <div>
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Users & Content</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            <StatCard icon={GraduationCap} label="Total Students" value={ov?.totalStudents ?? 0}
              sub={`${ov?.activeStudents ?? 0} active`} color="bg-indigo-50 text-indigo-600" />
            <StatCard icon={Users} label="Teachers" value={ov?.totalTeachers ?? 0}
              color="bg-violet-50 text-violet-600" />
            <StatCard icon={BookOpen} label="Courses" value={ov?.totalCourses ?? 0}
              sub={`${ov?.publishedCourses ?? 0} published`} color="bg-blue-50 text-blue-600" />
            <StatCard icon={Layers} label="Lessons" value={ov?.totalLessons ?? 0}
              color="bg-cyan-50 text-cyan-600" />
          </div>
        </div>

        {/* Stat Cards — Row 2: Performance */}
        <div>
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Performance & Results</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            <StatCard icon={FileText} label="Quiz Attempts" value={ov?.totalAttempts ?? 0}
              sub={`${ov?.completedAttempts ?? 0} completed`} color="bg-amber-50 text-amber-600" />
            <StatCard icon={Target} label="Pass Rate" value={`${ov?.passRate ?? 0}%`}
              sub="of completed attempts" color={ov?.passRate && ov.passRate >= 60 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'} />
            <StatCard icon={TrendingUp} label="Avg Score" value={`${ov?.avgScore ?? 0}%`}
              color="bg-teal-50 text-teal-600" />
            <StatCard icon={Award} label="Certificates" value={ov?.totalCertificates ?? 0}
              sub="issued" color="bg-yellow-50 text-yellow-600" />
          </div>
        </div>

        {/* Row 3: Activity */}
        <div>
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Activity</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            <StatCard icon={FileText} label="Quizzes" value={ov?.totalQuizzes ?? 0}
              sub={`${ov?.publishedQuizzes ?? 0} published`} color="bg-rose-50 text-rose-600" />
            <StatCard icon={ClipboardList} label="Assignments" value={ov?.totalAssignments ?? 0}
              color="bg-orange-50 text-orange-600" />
            <StatCard icon={CalendarCheck} label="Attendance Records" value={ov?.totalAttendance ?? 0}
              sub={`${ov?.attendanceRate ?? 0}% present rate`} color="bg-green-50 text-green-600" />
            <StatCard icon={CheckCircle2} label="Attendance Rate" value={`${ov?.attendanceRate ?? 0}%`}
              color={ov?.attendanceRate && ov.attendanceRate >= 75 ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'} />
          </div>
        </div>

        {/* Charts Row 1 */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <ChartCard title="Student Signups & Quiz Attempts" subtitle="Last 30 days">
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={data?.trend || []} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="gSignups" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gAttempts" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false}
                  interval={4} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                <Area type="monotone" dataKey="signups" name="New Students" stroke="#6366f1" strokeWidth={2}
                  fill="url(#gSignups)" dot={false} activeDot={{ r: 4 }} />
                <Area type="monotone" dataKey="attempts" name="Quiz Attempts" stroke="#10b981" strokeWidth={2}
                  fill="url(#gAttempts)" dot={false} activeDot={{ r: 4 }} />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Quiz Score Distribution" subtitle="Across all completed attempts">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={data?.scoreDistribution || []} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="range" tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="count" name="Students" radius={[6, 6, 0, 0]}>
                  {(data?.scoreDistribution || []).map((_, i) => (
                    <Cell key={i} fill={['#ef4444', '#f59e0b', '#eab308', '#06b6d4', '#10b981'][i]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        {/* Charts Row 2 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <ChartCard title="Courses by Category" subtitle="Distribution across all categories">
            {(data?.courseByCategory || []).length === 0 ? (
              <div className="flex items-center justify-center h-52 text-slate-300">
                <div className="text-center">
                  <BarChart3 className="w-10 h-10 mx-auto mb-2 opacity-40" />
                  <p className="text-sm text-slate-400">No courses yet</p>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-4">
                <ResponsiveContainer width="60%" height={220}>
                  <PieChart>
                    <Pie data={data?.courseByCategory || []} cx="50%" cy="50%" innerRadius={55} outerRadius={90}
                      paddingAngle={3} dataKey="value">
                      {(data?.courseByCategory || []).map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-col gap-2">
                  {(data?.courseByCategory || []).map((item, i) => (
                    <div key={item.name} className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                      <span className="text-xs text-slate-600 font-medium">{item.name}</span>
                      <span className="text-xs font-bold text-slate-900 ml-auto">{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </ChartCard>

          <ChartCard title="Courses by Level" subtitle="Beginner, intermediate, advanced">
            {(data?.courseByLevel || []).length === 0 ? (
              <div className="flex items-center justify-center h-52 text-slate-300">
                <div className="text-center">
                  <BarChart3 className="w-10 h-10 mx-auto mb-2 opacity-40" />
                  <p className="text-sm text-slate-400">No courses yet</p>
                </div>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={data?.courseByLevel || []} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8', textTransform: 'capitalize' }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="value" name="Courses" radius={[6, 6, 0, 0]} fill="#8b5cf6" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>
        </div>

        {/* Performance Summary */}
        <div className="bg-gradient-to-br from-indigo-600 to-violet-700 rounded-2xl p-6 text-white shadow-xl shadow-indigo-200">
          <h3 className="text-lg font-bold mb-4">Platform Health Summary</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: 'Quiz Pass Rate', value: `${ov?.passRate ?? 0}%`, good: (ov?.passRate ?? 0) >= 60 },
              { label: 'Avg Quiz Score', value: `${ov?.avgScore ?? 0}%`, good: (ov?.avgScore ?? 0) >= 60 },
              { label: 'Attendance Rate', value: `${ov?.attendanceRate ?? 0}%`, good: (ov?.attendanceRate ?? 0) >= 75 },
              { label: 'Course Publish Rate', value: ov?.totalCourses ? `${Math.round((ov.publishedCourses / ov.totalCourses) * 100)}%` : '0%', good: true },
            ].map(({ label, value, good }) => (
              <div key={label} className="bg-white/10 rounded-xl p-3 backdrop-blur-sm">
                <p className="text-white/60 text-xs font-medium">{label}</p>
                <p className="text-2xl font-bold mt-1">{value}</p>
                <div className={cn('w-full h-1 rounded-full mt-2', good ? 'bg-emerald-400' : 'bg-amber-400')} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
