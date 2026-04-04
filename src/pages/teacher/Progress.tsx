import React, { useEffect, useState, useMemo } from 'react';
import { supabase } from '../../supabase';
import TeacherLayout from '../../components/layout/TeacherLayout';
import {
  Users, TrendingUp, CheckCircle2, AlertTriangle,
  Search, ChevronDown, ChevronUp, BookOpen,
  Target, Award, Activity, BarChart3
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, RadialBarChart, RadialBar, Legend
} from 'recharts';
import { cn } from '../../lib/utils';

interface StudentProgress {
  id: string;
  name: string;
  email: string;
  avatar: string;
  totalAttempts: number;
  completedAttempts: number;
  avgScore: number;
  passRate: number;
  bestScore: number;
  recentScores: number[];
  enrolledCourses: number;
  status: 'excellent' | 'good' | 'average' | 'at-risk';
}

const statusConfig = {
  excellent: { label: 'Excellent', color: 'bg-emerald-50 text-emerald-700 border-emerald-100', dot: 'bg-emerald-500' },
  good: { label: 'Good', color: 'bg-blue-50 text-blue-700 border-blue-100', dot: 'bg-blue-500' },
  average: { label: 'Average', color: 'bg-amber-50 text-amber-700 border-amber-100', dot: 'bg-amber-500' },
  'at-risk': { label: 'At Risk', color: 'bg-red-50 text-red-700 border-red-100', dot: 'bg-red-500' },
};

function getStatus(avgScore: number): StudentProgress['status'] {
  if (avgScore >= 80) return 'excellent';
  if (avgScore >= 65) return 'good';
  if (avgScore >= 45) return 'average';
  return 'at-risk';
}

function MiniSparkline({ scores }: { scores: number[] }) {
  if (!scores.length) return <span className="text-slate-300 text-xs">—</span>;
  const max = Math.max(...scores, 100);
  const h = 28;
  const w = 64;
  const pts = scores.map((s, i) => ({
    x: scores.length === 1 ? w / 2 : (i / (scores.length - 1)) * w,
    y: h - (s / max) * h,
  }));
  const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const last = pts[pts.length - 1];
  const trend = scores.length > 1 ? scores[scores.length - 1] - scores[scores.length - 2] : 0;
  const color = trend >= 0 ? '#10b981' : '#f43f5e';
  return (
    <svg width={w} height={h} className="overflow-visible">
      <path d={path} fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last.x} cy={last.y} r={3} fill={color} />
    </svg>
  );
}

function ScoreBar({ value, max = 100 }: { value: number; max?: number }) {
  const pct = Math.min(100, (value / max) * 100);
  const color = pct >= 80 ? 'from-emerald-400 to-emerald-500' : pct >= 65 ? 'from-blue-400 to-indigo-500' : pct >= 45 ? 'from-amber-400 to-orange-500' : 'from-rose-400 to-red-500';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full bg-gradient-to-r ${color} transition-all duration-500`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-bold text-slate-700 w-8 text-right">{value}%</span>
    </div>
  );
}

export default function TeacherProgress() {
  const [students, setStudents] = useState<StudentProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'avgScore' | 'passRate' | 'attempts'>('avgScore');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    const fetch = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const tid = session.user.id;

      const [profilesRes, attemptsRes, coursesRes] = await Promise.all([
        supabase.from('profiles').select('id, display_name, email').eq('teacher_id', tid).eq('role', 'student'),
        supabase.from('attempts').select('student_id, score, total_points, status, started_at, completed_at').eq('teacher_id', tid),
        supabase.from('courses').select('id, student_ids').eq('teacher_id', tid),
      ]);

      const profiles = profilesRes.data || [];
      const attempts = attemptsRes.data || [];
      const courses = coursesRes.data || [];

      const enrollMap: Record<string, number> = {};
      courses.forEach((c: any) => {
        (c.student_ids || []).forEach((sid: string) => {
          enrollMap[sid] = (enrollMap[sid] || 0) + 1;
        });
      });

      const result: StudentProgress[] = profiles.map((p: any) => {
        const mine = attempts.filter((a: any) => a.student_id === p.id);
        const completed = mine.filter((a: any) => a.status === 'completed' && a.total_points > 0);
        const scores = completed.map((a: any) => Math.round((a.score / a.total_points) * 100));
        const sorted = [...completed].sort((a: any, b: any) => new Date(a.completed_at).getTime() - new Date(b.completed_at).getTime());
        const recentScores = sorted.slice(-5).map((a: any) => Math.round((a.score / a.total_points) * 100));
        const avgScore = scores.length ? Math.round(scores.reduce((s, v) => s + v, 0) / scores.length) : 0;
        const passed = completed.filter((a: any) => a.total_points > 0 && (a.score / a.total_points) >= 0.5).length;
        const passRate = completed.length ? Math.round((passed / completed.length) * 100) : 0;
        const bestScore = scores.length ? Math.max(...scores) : 0;
        const initials = (p.display_name || p.email || 'S').split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();
        return {
          id: p.id,
          name: p.display_name || p.email,
          email: p.email,
          avatar: initials,
          totalAttempts: mine.length,
          completedAttempts: completed.length,
          avgScore,
          passRate,
          bestScore,
          recentScores,
          enrolledCourses: enrollMap[p.id] || 0,
          status: getStatus(avgScore),
        };
      });

      setStudents(result);
      setLoading(false);
    };
    fetch();
  }, []);

  const overview = useMemo(() => {
    if (!students.length) return { total: 0, avgScore: 0, passRate: 0, atRisk: 0 };
    return {
      total: students.length,
      avgScore: Math.round(students.reduce((s, st) => s + st.avgScore, 0) / students.length),
      passRate: Math.round(students.filter(s => s.completedAttempts > 0).reduce((s, st) => s + st.passRate, 0) / Math.max(1, students.filter(s => s.completedAttempts > 0).length)),
      atRisk: students.filter(s => s.status === 'at-risk').length,
    };
  }, [students]);

  const scoreDistribution = useMemo(() => [
    { range: '0–20', count: students.filter(s => s.avgScore <= 20).length, fill: '#f43f5e' },
    { range: '21–40', count: students.filter(s => s.avgScore > 20 && s.avgScore <= 40).length, fill: '#f97316' },
    { range: '41–60', count: students.filter(s => s.avgScore > 40 && s.avgScore <= 60).length, fill: '#f59e0b' },
    { range: '61–80', count: students.filter(s => s.avgScore > 60 && s.avgScore <= 80).length, fill: '#3b82f6' },
    { range: '81–100', count: students.filter(s => s.avgScore > 80).length, fill: '#10b981' },
  ], [students]);

  const statusCounts = useMemo(() => ({
    excellent: students.filter(s => s.status === 'excellent').length,
    good: students.filter(s => s.status === 'good').length,
    average: students.filter(s => s.status === 'average').length,
    'at-risk': students.filter(s => s.status === 'at-risk').length,
  }), [students]);

  const filtered = useMemo(() => {
    let list = [...students];
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(s => s.name.toLowerCase().includes(q) || s.email.toLowerCase().includes(q));
    }
    if (filterStatus !== 'all') list = list.filter(s => s.status === filterStatus);
    list.sort((a, b) => {
      const aVal = a[sortBy as keyof StudentProgress] as number;
      const bVal = b[sortBy as keyof StudentProgress] as number;
      if (sortBy === 'name') {
        return sortDir === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
      }
      return sortDir === 'asc' ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
    });
    return list;
  }, [students, search, filterStatus, sortBy, sortDir]);

  const toggleSort = (col: typeof sortBy) => {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortBy(col); setSortDir('desc'); }
  };

  const SortIcon = ({ col }: { col: typeof sortBy }) => (
    sortBy === col
      ? (sortDir === 'desc' ? <ChevronDown className="w-3.5 h-3.5 text-violet-500" /> : <ChevronUp className="w-3.5 h-3.5 text-violet-500" />)
      : <ChevronDown className="w-3.5 h-3.5 text-slate-300" />
  );

  const statCards = [
    {
      label: 'Total Students',
      value: overview.total,
      icon: Users,
      gradient: 'from-violet-500 to-purple-600',
      light: 'bg-violet-50',
      text: 'text-violet-600',
    },
    {
      label: 'Class Average',
      value: `${overview.avgScore}%`,
      icon: TrendingUp,
      gradient: 'from-blue-500 to-indigo-600',
      light: 'bg-blue-50',
      text: 'text-blue-600',
    },
    {
      label: 'Class Pass Rate',
      value: `${overview.passRate}%`,
      icon: CheckCircle2,
      gradient: 'from-emerald-500 to-teal-600',
      light: 'bg-emerald-50',
      text: 'text-emerald-600',
    },
    {
      label: 'Students At Risk',
      value: overview.atRisk,
      icon: AlertTriangle,
      gradient: 'from-rose-500 to-red-600',
      light: 'bg-rose-50',
      text: 'text-rose-600',
    },
  ];

  return (
    <TeacherLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Student Progress</h1>
            <p className="text-slate-500 text-sm mt-1">Track every student's learning journey and performance.</p>
          </div>
          <div className="hidden sm:flex items-center gap-1.5 bg-violet-50 border border-violet-100 text-violet-700 text-xs font-semibold px-3 py-1.5 rounded-xl">
            <Activity className="w-3.5 h-3.5" />
            Live Data
          </div>
        </div>

        {/* Stat Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {statCards.map(card => (
            <div key={card.label} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
              <div className={`h-1 bg-gradient-to-r ${card.gradient}`} />
              <div className="p-5">
                <div className={`w-10 h-10 ${card.light} rounded-xl flex items-center justify-center mb-3`}>
                  <card.icon className={`w-5 h-5 ${card.text}`} />
                </div>
                <div className="text-2xl font-bold text-slate-900">
                  {loading ? <div className="h-7 w-16 bg-slate-100 rounded-lg animate-pulse" /> : card.value}
                </div>
                <div className="text-xs text-slate-500 font-medium mt-0.5">{card.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Score Distribution Bar Chart */}
          <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="h-1 bg-gradient-to-r from-violet-500 to-indigo-500" />
            <div className="p-6">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h2 className="text-base font-bold text-slate-900">Score Distribution</h2>
                  <p className="text-xs text-slate-400 mt-0.5">Number of students by average score range</p>
                </div>
                <BarChart3 className="w-5 h-5 text-slate-300" />
              </div>
              {loading ? (
                <div className="h-48 flex items-center justify-center">
                  <div className="animate-spin w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full" />
                </div>
              ) : (
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={scoreDistribution} barCategoryGap="30%">
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="range" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11 }} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11 }} allowDecimals={false} />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 10px 25px -5px rgb(0 0 0 / 0.1)', fontSize: '12px' }}
                        formatter={(v: number) => [`${v} students`, 'Count']}
                        cursor={{ fill: '#f8fafc' }}
                      />
                      <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                        {scoreDistribution.map((entry, idx) => (
                          <Cell key={idx} fill={entry.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>

          {/* Status Breakdown */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="h-1 bg-gradient-to-r from-amber-400 to-orange-500" />
            <div className="p-6">
              <h2 className="text-base font-bold text-slate-900 mb-1">Performance Breakdown</h2>
              <p className="text-xs text-slate-400 mb-5">Students by performance tier</p>
              {loading ? (
                <div className="space-y-3">
                  {[1, 2, 3, 4].map(i => <div key={i} className="h-12 bg-slate-50 rounded-xl animate-pulse" />)}
                </div>
              ) : students.length === 0 ? (
                <div className="text-center py-8">
                  <Users className="w-10 h-10 text-slate-200 mx-auto mb-2" />
                  <p className="text-slate-400 text-sm">No students yet</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {(Object.keys(statusConfig) as Array<keyof typeof statusConfig>).map(key => {
                    const count = statusCounts[key];
                    const pct = students.length > 0 ? (count / students.length) * 100 : 0;
                    const cfg = statusConfig[key];
                    return (
                      <button
                        key={key}
                        onClick={() => setFilterStatus(filterStatus === key ? 'all' : key)}
                        className={cn(
                          "w-full flex items-center justify-between p-3 rounded-xl border transition-all text-left",
                          filterStatus === key ? cfg.color + ' border-current' : 'bg-slate-50 border-transparent hover:border-slate-200'
                        )}
                      >
                        <div className="flex items-center gap-2.5">
                          <div className={`w-2.5 h-2.5 rounded-full ${cfg.dot}`} />
                          <span className="text-sm font-semibold text-slate-700">{cfg.label}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-20 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${cfg.dot}`} style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-sm font-bold text-slate-900 w-5 text-right">{count}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Student Progress Table */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="h-1 bg-gradient-to-r from-indigo-500 to-violet-500" />

          {/* Table Controls */}
          <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row gap-3 bg-slate-50/50">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search students..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
            </div>
            <div className="flex gap-2">
              {filterStatus !== 'all' && (
                <button
                  onClick={() => setFilterStatus('all')}
                  className="flex items-center gap-1.5 px-3 py-2 bg-violet-100 text-violet-700 text-xs font-semibold rounded-xl border border-violet-200 hover:bg-violet-200 transition-all"
                >
                  Clear filter ✕
                </button>
              )}
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-slate-500 text-xs font-semibold border-b border-slate-100">
                  <th className="px-5 py-3 pl-6">
                    <button onClick={() => toggleSort('name')} className="flex items-center gap-1 hover:text-slate-800 transition-colors">
                      Student <SortIcon col="name" />
                    </button>
                  </th>
                  <th className="px-5 py-3">
                    <button onClick={() => toggleSort('attempts')} className="flex items-center gap-1 hover:text-slate-800 transition-colors">
                      Attempts <SortIcon col="attempts" />
                    </button>
                  </th>
                  <th className="px-5 py-3 min-w-[160px]">
                    <button onClick={() => toggleSort('avgScore')} className="flex items-center gap-1 hover:text-slate-800 transition-colors">
                      Avg Score <SortIcon col="avgScore" />
                    </button>
                  </th>
                  <th className="px-5 py-3 min-w-[140px]">
                    <button onClick={() => toggleSort('passRate')} className="flex items-center gap-1 hover:text-slate-800 transition-colors">
                      Pass Rate <SortIcon col="passRate" />
                    </button>
                  </th>
                  <th className="px-5 py-3">Trend</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 text-right pr-6">Courses</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {loading ? (
                  Array(5).fill(0).map((_, i) => (
                    <tr key={i}>
                      {Array(7).fill(0).map((_, j) => (
                        <td key={j} className="px-5 py-4">
                          <div className="h-4 bg-slate-100 rounded animate-pulse" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-20 text-center">
                      <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                        <Users className="w-8 h-8 text-slate-300" />
                      </div>
                      <h3 className="text-base font-bold text-slate-900">No students found</h3>
                      <p className="text-slate-400 text-sm mt-1">
                        {search || filterStatus !== 'all' ? 'Try adjusting your filters.' : 'Students assigned to you will appear here.'}
                      </p>
                    </td>
                  </tr>
                ) : (
                  filtered.map(student => {
                    const cfg = statusConfig[student.status];
                    const isExpanded = expandedId === student.id;
                    return (
                      <React.Fragment key={student.id}>
                        <tr
                          className="hover:bg-slate-50/80 transition-all cursor-pointer group"
                          onClick={() => setExpandedId(isExpanded ? null : student.id)}
                        >
                          {/* Student */}
                          <td className="px-5 py-4 pl-6">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-400 to-indigo-500 flex items-center justify-center text-white text-xs font-bold shadow-sm shrink-0">
                                {student.avatar}
                              </div>
                              <div>
                                <div className="font-semibold text-slate-900 text-sm leading-tight">{student.name}</div>
                                <div className="text-slate-400 text-xs truncate max-w-[140px]">{student.email}</div>
                              </div>
                            </div>
                          </td>
                          {/* Attempts */}
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-1.5">
                              <span className="font-semibold text-slate-900 text-sm">{student.completedAttempts}</span>
                              <span className="text-slate-400 text-xs">/ {student.totalAttempts}</span>
                            </div>
                            <div className="text-slate-400 text-[10px] mt-0.5">completed</div>
                          </td>
                          {/* Avg Score */}
                          <td className="px-5 py-4">
                            {student.completedAttempts > 0 ? (
                              <ScoreBar value={student.avgScore} />
                            ) : (
                              <span className="text-slate-300 text-xs">No data</span>
                            )}
                          </td>
                          {/* Pass Rate */}
                          <td className="px-5 py-4">
                            {student.completedAttempts > 0 ? (
                              <ScoreBar value={student.passRate} />
                            ) : (
                              <span className="text-slate-300 text-xs">No data</span>
                            )}
                          </td>
                          {/* Trend */}
                          <td className="px-5 py-4">
                            <MiniSparkline scores={student.recentScores} />
                          </td>
                          {/* Status */}
                          <td className="px-5 py-4">
                            <span className={cn(
                              'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border',
                              cfg.color
                            )}>
                              <div className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                              {cfg.label}
                            </span>
                          </td>
                          {/* Courses */}
                          <td className="px-5 py-4 pr-6 text-right">
                            <div className="inline-flex items-center gap-1.5 text-slate-600 text-sm font-semibold">
                              <BookOpen className="w-4 h-4 text-slate-300" />
                              {student.enrolledCourses}
                            </div>
                          </td>
                        </tr>

                        {/* Expanded Row */}
                        {isExpanded && (
                          <tr>
                            <td colSpan={7} className="bg-slate-50 border-b border-slate-100">
                              <div className="px-6 py-5 grid grid-cols-2 sm:grid-cols-4 gap-4">
                                <div className="bg-white rounded-xl border border-slate-100 p-4 text-center shadow-sm">
                                  <Target className="w-5 h-5 text-violet-500 mx-auto mb-1" />
                                  <div className="text-xl font-bold text-slate-900">{student.bestScore}%</div>
                                  <div className="text-xs text-slate-500 mt-0.5">Best Score</div>
                                </div>
                                <div className="bg-white rounded-xl border border-slate-100 p-4 text-center shadow-sm">
                                  <TrendingUp className="w-5 h-5 text-blue-500 mx-auto mb-1" />
                                  <div className="text-xl font-bold text-slate-900">{student.avgScore}%</div>
                                  <div className="text-xs text-slate-500 mt-0.5">Avg Score</div>
                                </div>
                                <div className="bg-white rounded-xl border border-slate-100 p-4 text-center shadow-sm">
                                  <CheckCircle2 className="w-5 h-5 text-emerald-500 mx-auto mb-1" />
                                  <div className="text-xl font-bold text-slate-900">{student.passRate}%</div>
                                  <div className="text-xs text-slate-500 mt-0.5">Pass Rate</div>
                                </div>
                                <div className="bg-white rounded-xl border border-slate-100 p-4 text-center shadow-sm">
                                  <Award className="w-5 h-5 text-amber-500 mx-auto mb-1" />
                                  <div className="text-xl font-bold text-slate-900">{student.totalAttempts}</div>
                                  <div className="text-xs text-slate-500 mt-0.5">Total Attempts</div>
                                </div>
                              </div>
                              {student.recentScores.length > 0 && (
                                <div className="px-6 pb-5">
                                  <p className="text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wide">Recent Scores</p>
                                  <div className="flex items-end gap-2">
                                    {student.recentScores.map((score, i) => {
                                      const color = score >= 80 ? 'bg-emerald-400' : score >= 65 ? 'bg-blue-400' : score >= 45 ? 'bg-amber-400' : 'bg-rose-400';
                                      return (
                                        <div key={i} className="flex flex-col items-center gap-1">
                                          <span className="text-[10px] font-bold text-slate-600">{score}%</span>
                                          <div
                                            className={`w-8 rounded-t-md ${color} transition-all`}
                                            style={{ height: `${Math.max(8, score * 0.6)}px` }}
                                          />
                                          <span className="text-[9px] text-slate-400">#{i + 1}</span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Footer */}
          {!loading && filtered.length > 0 && (
            <div className="px-6 py-3 border-t border-slate-100 bg-slate-50/50 text-xs text-slate-400 font-medium">
              Showing {filtered.length} of {students.length} students
              {filterStatus !== 'all' && ` · filtered by "${statusConfig[filterStatus as keyof typeof statusConfig]?.label}"`}
            </div>
          )}
        </div>
      </div>
    </TeacherLayout>
  );
}
