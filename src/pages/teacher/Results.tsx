import React, { useEffect, useState, useMemo } from 'react';
import { supabase } from '../../supabase';
import TeacherLayout from '../../components/layout/TeacherLayout';
import {
  BarChart3, Search, Download, ChevronDown, ChevronUp,
  CheckCircle2, XCircle, TrendingUp, FileText, Clock,
  Trophy, Flame, Activity, Eye, ChevronRight
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Cell
} from 'recharts';
import { toast } from 'sonner';
import { cn } from '../../lib/utils';
import { fetchAttemptRowsByQuizIds, normalizeAttempts } from '../../lib/quizAttempts';

type TabFilter = 'all' | 'passed' | 'failed';
type SortField = 'student' | 'quiz' | 'score' | 'date' | 'duration';

export default function TeacherResults() {
  const [attempts, setAttempts] = useState<any[]>([]);
  const [quizzes, setQuizzes] = useState<Record<string, string>>({});
  const [students, setStudents] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const isMissingTeacherIdColumn = (error: any) => {
    const haystack = `${error?.message || ''} ${error?.details || ''}`.toLowerCase();
    return error?.code === 'PGRST204' && haystack.includes('teacher_id');
  };

  const getPassingScore = (quizRow: any) => {
    const raw = quizRow?.settings?.passingScore ?? quizRow?.passing_score ?? quizRow?.pass_mark ?? quizRow?.passMark;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : 50;
  };

  const fetchData = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    try {
      let attemptsData: any[] = [];
      let quizzesMap: Record<string, string> = {};
      let studentsMap: Record<string, string> = {};

      const coursesSnap = await supabase
        .from('courses')
        .select('id')
        .eq('teacher_id', session.user.id);
      if (coursesSnap.error) throw coursesSnap.error;
      const teacherCourseIds = (coursesSnap.data || []).map((course: any) => course.id);

      const quizzesByTeacherSnap = await supabase
        .from('quizzes')
        .select('*')
        .eq('teacher_id', session.user.id);

      let quizRows: any[] = [];
      if (!quizzesByTeacherSnap.error) {
        quizRows = quizzesByTeacherSnap.data || [];
      } else if (isMissingTeacherIdColumn(quizzesByTeacherSnap.error)) {
        if (teacherCourseIds.length > 0) {
          const quizzesByCourseSnap = await supabase
            .from('quizzes')
            .select('*')
            .in('course_id', teacherCourseIds);
          if (quizzesByCourseSnap.error) throw quizzesByCourseSnap.error;
          quizRows = quizzesByCourseSnap.data || [];
        }
      } else {
        throw quizzesByTeacherSnap.error;
      }

      const quizIds = quizRows.map((q: any) => q.id);
      const passingScoreByQuiz = quizRows.reduce((acc: Record<string, number>, q: any) => {
        const value = getPassingScore(q);
        acc[q.id] = Number.isFinite(value) ? value : 50;
        return acc;
      }, {});

      quizRows.forEach((d: any) => {
        quizzesMap[d.id] = d.title;
      });

      const attemptsRows = await fetchAttemptRowsByQuizIds(supabase, quizIds);
      const normalizedAttempts = normalizeAttempts(attemptsRows, passingScoreByQuiz);
      attemptsData = normalizedAttempts.map((a) => ({
        id: a.id,
        quizId: a.quiz_id,
        studentId: a.student_id,
        scorePercent: a.score_percent,
        passed: a.passed,
        completedAt: a.completed_at,
      }));

      const studentIds = [...new Set(normalizedAttempts.map((a) => a.student_id).filter(Boolean))];
      if (studentIds.length > 0) {
        const studentsSnap = await supabase
          .from('profiles')
          .select('id, display_name')
          .in('id', studentIds);
        if (!studentsSnap.error) {
          (studentsSnap.data || []).forEach((d: any) => {
            studentsMap[d.id] = d.display_name;
          });
        }
      }

      setQuizzes(quizzesMap);
      setStudents(studentsMap);
      setAttempts(attemptsData);
    } catch (error) {
      toast.error('Failed to fetch results');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      try {
        const [attemptsSnap, quizzesSnap, studentsSnap] = await Promise.all([
          supabase.from('attempts').select('*').eq('teacher_id', session.user.id),
          supabase.from('quizzes').select('id, title').eq('teacher_id', session.user.id),
          supabase.from('profiles').select('id, display_name').eq('teacher_id', session.user.id),
        ]);

        const quizzesMap: Record<string, string> = {};
        (quizzesSnap.data || []).forEach((d: any) => { quizzesMap[d.id] = d.title; });

        const studentsMap: Record<string, string> = {};
        (studentsSnap.data || []).forEach((d: any) => { studentsMap[d.id] = d.display_name; });

        setQuizzes(quizzesMap);
        setStudents(studentsMap);
        setAttempts((attemptsSnap.data || []).map((d: any) => ({
          id: d.id,
          quizId: d.quiz_id,
          studentId: d.student_id,
          score: d.score ?? 0,
          totalPoints: d.total_points ?? 0,
          passed: d.passed ?? false,
          status: d.status ?? 'completed',
          startedAt: d.started_at,
          completedAt: d.completed_at,
          correctAnswers: d.correct_answers ?? 0,
          totalQuestions: d.total_questions ?? 0,
        })));
      } catch {
        toast.error('Failed to fetch results');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const stats = {
    totalAttempts: attempts.length,
    avgScore: attempts.length > 0 
      ? Math.round(attempts.reduce((acc, curr) => acc + curr.scorePercent, 0) / attempts.length)
      : 0,
    passRate: attempts.length > 0
      ? Math.round((attempts.filter(a => a.passed).length / attempts.length) * 100)
      : 0
  };

  const getPct = (a: any) => a.totalPoints > 0 ? Math.round((a.score / a.totalPoints) * 100) : 0;

  const stats = useMemo(() => {
    const completed = attempts.filter(a => a.status === 'completed');
    const passed = completed.filter(a => a.passed);
    const avgScore = completed.length
      ? Math.round(completed.reduce((s, a) => s + getPct(a), 0) / completed.length)
      : 0;
    const highScore = completed.length ? Math.max(...completed.map(getPct)) : 0;
    const avgDuration = completed.filter(a => a.startedAt && a.completedAt).length
      ? Math.round(completed.filter(a => a.startedAt && a.completedAt)
          .reduce((s, a) => s + getDuration(a.startedAt, a.completedAt)!, 0) /
          completed.filter(a => a.startedAt && a.completedAt).length)
      : 0;
    return {
      total: attempts.length,
      completed: completed.length,
      passRate: completed.length ? Math.round((passed.length / completed.length) * 100) : 0,
      avgScore,
      highScore,
      avgDuration,
    };
  }, [attempts]);

  // Quiz performance breakdown
  const quizBreakdown = useMemo(() => {
    const map: Record<string, { title: string; count: number; avgScore: number; passRate: number }> = {};
    attempts.filter(a => a.status === 'completed').forEach(a => {
      const qid = a.quizId;
      if (!map[qid]) map[qid] = { title: quizzes[qid] || 'Unknown Quiz', count: 0, avgScore: 0, passRate: 0 };
      map[qid].count++;
      map[qid].avgScore += getPct(a);
      if (a.passed) map[qid].passRate++;
    });
    return Object.entries(map).map(([id, v]) => ({
      id, title: v.title,
      count: v.count,
      avgScore: v.count ? Math.round(v.avgScore / v.count) : 0,
      passRate: v.count ? Math.round((v.passRate / v.count) * 100) : 0,
    })).sort((a, b) => b.count - a.count).slice(0, 5);
  }, [attempts, quizzes]);

  // Score trend last 7 days
  const trend = useMemo(() => {
    const days: string[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      days.push(d.toISOString().slice(0, 10));
    }
    return days.map(day => {
      const dayAttempts = attempts.filter(a => (a.completedAt || '').slice(0, 10) === day && a.status === 'completed');
      return {
        day: day.slice(5).replace('-', '/'),
        attempts: dayAttempts.length,
        avgScore: dayAttempts.length ? Math.round(dayAttempts.reduce((s, a) => s + getPct(a), 0) / dayAttempts.length) : 0,
      };
    });
  }, [attempts]);

  const quizOptions = useMemo(() => Object.entries(quizzes), [quizzes]);

  const filtered = useMemo(() => {
    let list = [...attempts];
    if (tab === 'passed') list = list.filter(a => a.passed);
    if (tab === 'failed') list = list.filter(a => !a.passed && a.status === 'completed');
    if (selectedQuiz !== 'all') list = list.filter(a => a.quizId === selectedQuiz);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(a =>
        (students[a.studentId] || '').toLowerCase().includes(q) ||
        (quizzes[a.quizId] || '').toLowerCase().includes(q)
      );
    }
    list.sort((a, b) => {
      let aVal: any, bVal: any;
      if (sortBy === 'student') { aVal = students[a.studentId] || ''; bVal = students[b.studentId] || ''; }
      else if (sortBy === 'quiz') { aVal = quizzes[a.quizId] || ''; bVal = quizzes[b.quizId] || ''; }
      else if (sortBy === 'score') { aVal = getPct(a); bVal = getPct(b); }
      else if (sortBy === 'duration') { aVal = getDuration(a.startedAt, a.completedAt) ?? 999; bVal = getDuration(b.startedAt, b.completedAt) ?? 999; }
      else { aVal = a.completedAt || ''; bVal = b.completedAt || ''; }
      if (typeof aVal === 'string') return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
    });
    return list;
  }, [attempts, tab, selectedQuiz, search, sortBy, sortDir, students, quizzes]);

  const toggleSort = (col: SortField) => {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortBy(col); setSortDir('desc'); }
  };

  const SortIcon = ({ col }: { col: SortField }) => (
    sortBy === col
      ? (sortDir === 'desc' ? <ChevronDown className="w-3.5 h-3.5 text-violet-500" /> : <ChevronUp className="w-3.5 h-3.5 text-violet-500" />)
      : <ChevronDown className="w-3.5 h-3.5 text-slate-300" />
  );

  const scoreColor = (pct: number) => pct >= 80 ? 'from-emerald-400 to-emerald-500' : pct >= 65 ? 'from-blue-400 to-indigo-500' : pct >= 45 ? 'from-amber-400 to-orange-500' : 'from-rose-400 to-red-500';

  const statCards = [
    { label: 'Total Attempts', value: stats.total, sub: `${stats.completed} completed`, icon: FileText, gradient: 'from-violet-500 to-purple-600', light: 'bg-violet-50', text: 'text-violet-600' },
    { label: 'Average Score', value: `${stats.avgScore}%`, sub: `Best: ${stats.highScore}%`, icon: TrendingUp, gradient: 'from-blue-500 to-indigo-600', light: 'bg-blue-50', text: 'text-blue-600' },
    { label: 'Pass Rate', value: `${stats.passRate}%`, sub: `${attempts.filter(a => a.passed).length} passed`, icon: Trophy, gradient: 'from-emerald-500 to-teal-600', light: 'bg-emerald-50', text: 'text-emerald-600' },
    { label: 'Avg Duration', value: stats.avgDuration ? `${stats.avgDuration}m` : '—', sub: 'per attempt', icon: Clock, gradient: 'from-amber-500 to-orange-600', light: 'bg-amber-50', text: 'text-amber-600' },
  ];

  return (
    <TeacherLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Quiz Results</h1>
            <p className="text-slate-500 text-sm mt-1">Review all student quiz attempts and performance metrics.</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-1.5 bg-violet-50 border border-violet-100 text-violet-700 text-xs font-semibold px-3 py-1.5 rounded-xl">
              <Activity className="w-3.5 h-3.5" />
              Live Data
            </div>
            <button className="inline-flex items-center gap-2 bg-white border border-slate-200 text-slate-600 px-4 py-2 rounded-xl font-semibold text-sm hover:bg-slate-50 transition-all shadow-sm">
              <Download className="w-4 h-4" />
              Export
            </button>
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
                {loading
                  ? <div className="h-7 w-16 bg-slate-100 rounded-lg animate-pulse mb-1" />
                  : <div className="text-2xl font-bold text-slate-900">{card.value}</div>
                }
                <div className="text-xs text-slate-400 mt-0.5">{card.sub}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Charts Row */}
        {!loading && attempts.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Score Trend */}
            <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="h-1 bg-gradient-to-r from-violet-500 to-indigo-500" />
              <div className="p-6">
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <h2 className="text-base font-bold text-slate-900">Activity Trend</h2>
                    <p className="text-xs text-slate-400 mt-0.5">Attempts & avg score over the last 7 days</p>
                  </div>
                  <Flame className="w-5 h-5 text-orange-400" />
                </div>
                <div className="h-44">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={trend}>
                      <defs>
                        <linearGradient id="grad1" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#7c3aed" stopOpacity={0.15} />
                          <stop offset="95%" stopColor="#7c3aed" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11 }} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11 }} />
                      <Tooltip contentStyle={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '12px' }} cursor={{ stroke: '#7c3aed', strokeWidth: 1.5, strokeDasharray: '4 4' }} />
                      <Area type="monotone" dataKey="attempts" stroke="#7c3aed" strokeWidth={2.5} fillOpacity={1} fill="url(#grad1)" dot={false} name="Attempts" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Quiz Leaderboard */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="h-1 bg-gradient-to-r from-amber-400 to-orange-500" />
              <div className="p-6">
                <h2 className="text-base font-bold text-slate-900 mb-1">Top Quizzes</h2>
                <p className="text-xs text-slate-400 mb-4">By number of attempts</p>
                <div className="space-y-3">
                  {quizBreakdown.length === 0
                    ? <p className="text-slate-400 text-sm text-center py-6">No quiz data yet</p>
                    : quizBreakdown.map((q, i) => (
                      <div key={q.id} className="flex items-center gap-3">
                        <div className={cn(
                          'w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-bold shrink-0',
                          i === 0 ? 'bg-amber-100 text-amber-700' : i === 1 ? 'bg-slate-100 text-slate-600' : 'bg-slate-50 text-slate-500'
                        )}>
                          {i + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-semibold text-slate-800 truncate">{q.title}</div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <div className="flex-1 h-1 bg-slate-100 rounded-full overflow-hidden">
                              <div className="h-full bg-violet-400 rounded-full" style={{ width: `${q.avgScore}%` }} />
                            </div>
                            <span className="text-[10px] text-slate-400 font-medium shrink-0">{q.avgScore}% avg</span>
                          </div>
                        </div>
                        <div className="text-xs font-bold text-slate-500 shrink-0">{q.count}</div>
                      </div>
                    ))
                  }
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Results Table */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="h-1 bg-gradient-to-r from-indigo-500 to-violet-500" />

          {/* Tab Bar */}
          <div className="px-5 pt-4 border-b border-slate-100 flex items-center gap-1">
            {(['all', 'passed', 'failed'] as TabFilter[]).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cn(
                  'px-4 py-2 text-xs font-semibold rounded-t-lg border-b-2 transition-all capitalize',
                  tab === t
                    ? t === 'passed' ? 'text-emerald-700 border-emerald-500 bg-emerald-50' : t === 'failed' ? 'text-red-700 border-red-500 bg-red-50' : 'text-violet-700 border-violet-500 bg-violet-50'
                    : 'text-slate-400 border-transparent hover:text-slate-600'
                )}
              >
                {t === 'all' ? `All (${attempts.length})` : t === 'passed' ? `Passed (${attempts.filter(a => a.passed).length})` : `Failed (${attempts.filter(a => !a.passed && a.status === 'completed').length})`}
              </button>
            ))}
          </div>

          {/* Controls */}
          <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row gap-3 bg-slate-50/50">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search student or quiz..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
            </div>
            {quizOptions.length > 0 && (
              <select
                value={selectedQuiz}
                onChange={e => setSelectedQuiz(e.target.value)}
                className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm font-medium outline-none focus:ring-2 focus:ring-violet-500 text-slate-600"
              >
                <option value="all">All Quizzes</option>
                {quizOptions.map(([id, title]) => (
                  <option key={id} value={id}>{title}</option>
                ))}
              </select>
            )}
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-slate-500 text-xs font-semibold border-b border-slate-100">
                  <th className="px-5 py-3 pl-6">
                    <button onClick={() => toggleSort('student')} className="flex items-center gap-1 hover:text-slate-800 transition-colors">Student <SortIcon col="student" /></button>
                  </th>
                  <th className="px-5 py-3">
                    <button onClick={() => toggleSort('quiz')} className="flex items-center gap-1 hover:text-slate-800 transition-colors">Quiz <SortIcon col="quiz" /></button>
                  </th>
                  <th className="px-5 py-3 min-w-[150px]">
                    <button onClick={() => toggleSort('score')} className="flex items-center gap-1 hover:text-slate-800 transition-colors">Score <SortIcon col="score" /></button>
                  </th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">
                    <button onClick={() => toggleSort('duration')} className="flex items-center gap-1 hover:text-slate-800 transition-colors">Time <SortIcon col="duration" /></button>
                  </th>
                  <th className="px-5 py-3">
                    <button onClick={() => toggleSort('date')} className="flex items-center gap-1 hover:text-slate-800 transition-colors">Date <SortIcon col="date" /></button>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {loading ? (
                  Array(6).fill(0).map((_, i) => (
                    <tr key={i}>
                      {Array(6).fill(0).map((_, j) => (
                        <td key={j} className="px-5 py-4"><div className="h-4 bg-slate-100 rounded animate-pulse" /></td>
                      ))}
                    </tr>
                  ))
                ) : filtered.length > 0 ? (
                  filtered.map((attempt) => (
                    <tr key={attempt.id} className="hover:bg-slate-50 transition-all group">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 font-bold text-xs">
                            {students[attempt.studentId]?.[0] || 'S'}
                          </div>
                          <span className="font-semibold text-slate-900">{students[attempt.studentId] || 'Unknown Student'}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-slate-600 font-medium">{quizzes[attempt.quizId] || 'Unknown Quiz'}</span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 w-16 bg-slate-100 rounded-full overflow-hidden">
                            <div 
                              className={cn(
                                "h-full rounded-full transition-all",
                                attempt.passed ? "bg-green-500" : "bg-red-500"
                              )}
                              style={{ width: `${attempt.scorePercent}%` }}
                            />
                          </div>
                          <span className="text-sm font-bold text-slate-900">
                            {attempt.scorePercent}%
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={cn(
                          "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold",
                          attempt.passed 
                            ? "bg-green-50 text-green-600" 
                            : "bg-red-50 text-red-600"
                        )}>
                          {attempt.passed ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                          {attempt.passed ? 'Passed' : 'Failed'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-slate-500 text-sm">
                        {attempt.completedAt ? new Date(attempt.completedAt).toLocaleDateString() : '--'}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button className="p-2 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-all">
                          <ChevronRight className="w-5 h-5" />
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="px-6 py-20 text-center">
                      <BarChart3 className="w-14 h-14 text-slate-200 mx-auto mb-4" />
                      <h3 className="text-base font-bold text-slate-900">No results found</h3>
                      <p className="text-slate-400 text-sm mt-1">
                        {search || tab !== 'all' ? 'Try adjusting your filters.' : 'Results will appear when students complete quizzes.'}
                      </p>
                    </td>
                  </tr>
                ) : (
                  filtered.map(attempt => {
                    const pct = getPct(attempt);
                    const duration = getDuration(attempt.startedAt, attempt.completedAt);
                    const studentName = students[attempt.studentId] || 'Unknown Student';
                    const quizName = quizzes[attempt.quizId] || 'Unknown Quiz';
                    const initials = studentName.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();
                    return (
                      <tr key={attempt.id} className="hover:bg-slate-50/80 transition-all">
                        <td className="px-5 py-4 pl-6">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-400 to-indigo-500 flex items-center justify-center text-white text-[10px] font-bold shrink-0">
                              {initials}
                            </div>
                            <span className="font-semibold text-slate-900 text-sm">{studentName}</span>
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <span className="inline-flex items-center gap-1.5 bg-slate-50 border border-slate-100 text-slate-700 text-xs font-medium px-2.5 py-1 rounded-lg max-w-[160px] truncate">
                            <FileText className="w-3 h-3 text-slate-400 shrink-0" />
                            {quizName}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 w-20 bg-slate-100 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full bg-gradient-to-r ${scoreColor(pct)}`} style={{ width: `${pct}%` }} />
                            </div>
                            <span className="text-sm font-bold text-slate-900 w-9 text-right">{pct}%</span>
                          </div>
                          {attempt.totalQuestions > 0 && (
                            <div className="text-[10px] text-slate-400 mt-0.5">{attempt.correctAnswers}/{attempt.totalQuestions} correct</div>
                          )}
                        </td>
                        <td className="px-5 py-4">
                          <span className={cn(
                            'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border',
                            attempt.passed
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                              : attempt.status === 'completed'
                                ? 'bg-red-50 text-red-700 border-red-100'
                                : 'bg-amber-50 text-amber-700 border-amber-100'
                          )}>
                            {attempt.passed
                              ? <CheckCircle2 className="w-3 h-3" />
                              : attempt.status === 'completed'
                                ? <XCircle className="w-3 h-3" />
                                : <Clock className="w-3 h-3" />
                            }
                            {attempt.passed ? 'Passed' : attempt.status === 'completed' ? 'Failed' : 'In Progress'}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          {duration !== null
                            ? <span className="flex items-center gap-1 text-slate-500 text-xs"><Clock className="w-3.5 h-3.5 text-slate-300" />{duration}m</span>
                            : <span className="text-slate-300 text-xs">—</span>
                          }
                        </td>
                        <td className="px-5 py-4 text-slate-400 text-xs">
                          {attempt.completedAt ? new Date(attempt.completedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {!loading && filtered.length > 0 && (
            <div className="px-6 py-3 border-t border-slate-100 bg-slate-50/50 text-xs text-slate-400 font-medium flex items-center justify-between">
              <span>Showing {filtered.length} of {attempts.length} attempts</span>
              {tab !== 'all' && (
                <button onClick={() => setTab('all')} className="text-violet-500 hover:text-violet-700 font-semibold">Clear filter</button>
              )}
            </div>
          )}
        </div>
      </div>
    </TeacherLayout>
  );
}
