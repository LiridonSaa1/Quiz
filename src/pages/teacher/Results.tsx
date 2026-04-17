import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { supabase } from '../../supabase';
import TeacherLayout from '../../components/layout/TeacherLayout';
import { motion } from 'motion/react';
import {
  AdminListFilterBar,
  AdminListPageShell,
  ADMIN_LIST_SEARCH_INPUT,
  ADMIN_LIST_SELECT,
  ADMIN_LIST_CARD_GRID,
  ADMIN_LIST_ITEM_CARD,
} from '../../components/admin/AdminListPageShell';
import {
  BarChart3, Search, Download, ChevronDown, ChevronUp,
  CheckCircle2, XCircle, TrendingUp, FileText, Clock,
  Trophy, Flame, Activity, ClipboardList,
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { cn } from '../../lib/utils';
import { fetchAttemptRowsByQuizIds, normalizeAttempts } from '../../lib/quizAttempts';
import { resolveTeacherIdCandidates } from '../../lib/teacherScope';

type TabFilter = 'all' | 'passed' | 'failed';
type SortField = 'student' | 'quiz' | 'score' | 'date' | 'duration';

interface UiAttempt {
  id: string;
  quizId: string;
  studentId: string;
  scorePercent: number;
  passed: boolean;
  status: string;
  startedAt?: string | null;
  completedAt?: string | null;
  score: number;
  totalPoints: number;
  correctAnswers?: number;
  totalQuestions?: number;
}

const AVATAR_COLORS = [
  'from-violet-500 to-purple-600',
  'from-blue-500 to-indigo-600',
  'from-emerald-500 to-teal-600',
  'from-amber-500 to-orange-600',
  'from-rose-500 to-pink-600',
  'from-sky-500 to-cyan-600',
];
const avatarColor = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = s.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
};

export default function TeacherResults() {
  const [attempts, setAttempts] = useState<UiAttempt[]>([]);
  const [quizzes, setQuizzes] = useState<Record<string, string>>({});
  const [students, setStudents] = useState<Record<string, { name: string; email: string }>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<TabFilter>('all');
  const [selectedQuiz, setSelectedQuiz] = useState('all');
  const [sortBy, setSortBy] = useState<SortField>('date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const getPassingScore = (quizRow: Record<string, unknown>) => {
    const raw =
      (quizRow?.settings as { passingScore?: number } | undefined)?.passingScore ??
      quizRow?.passing_score ??
      quizRow?.pass_mark ??
      quizRow?.passMark;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : 50;
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) return;

      const teacherId = session.user.id;
      const scopedIds = await resolveTeacherIdCandidates(teacherId);

      const coursesSnap = await supabase.from('courses').select('id').in('teacher_id', scopedIds);
      if (coursesSnap.error) throw coursesSnap.error;
      const teacherCourseIds = (coursesSnap.data || []).map((c: { id: string }) => c.id);

      let quizRows: Record<string, unknown>[] = [];
      if (teacherCourseIds.length > 0) {
        const qSnap = await supabase.from('quizzes').select('*').in('course_id', teacherCourseIds);
        if (qSnap.error) throw qSnap.error;
        quizRows = qSnap.data || [];
      }

      const quizzesMap: Record<string, string> = {};
      quizRows.forEach((d: Record<string, unknown>) => {
        quizzesMap[String(d.id)] = String(d.title || 'Quiz');
      });

      const quizIds = quizRows.map((q) => String(q.id));
      const passingScoreByQuiz = quizRows.reduce((acc: Record<string, number>, q) => {
        const id = String(q.id);
        acc[id] = getPassingScore(q);
        return acc;
      }, {});

      const attemptsRows = await fetchAttemptRowsByQuizIds(supabase, quizIds);
      const normalized = normalizeAttempts(attemptsRows, passingScoreByQuiz);

      const attemptsData: UiAttempt[] = normalized.map((a) => ({
        id: a.id,
        quizId: a.quiz_id,
        studentId: a.student_id,
        scorePercent: a.score_percent,
        passed: a.passed,
        status: a.status || 'completed',
        startedAt: a.started_at,
        completedAt: a.completed_at,
        score: a.score,
        totalPoints: a.total_points,
        correctAnswers: a.raw?.correct_answers,
        totalQuestions: a.raw?.total_questions,
      }));

      const studentIds = [...new Set(attemptsData.map((x) => x.studentId).filter(Boolean))];
      const studentsMap: Record<string, { name: string; email: string }> = {};

      const { data: roster } = await supabase
        .from('profiles')
        .select('id, display_name, email')
        .eq('role', 'student')
        .eq('teacher_id', teacherId);
      (roster || []).forEach((p: { id: string; display_name: string; email: string }) => {
        studentsMap[p.id] = { name: p.display_name || 'Unknown', email: p.email || '' };
      });

      const missing = studentIds.filter((id) => !studentsMap[id]);
      if (missing.length > 0) {
        const extra = await supabase.from('profiles').select('id, display_name, email').in('id', missing);
        if (!extra.error) {
          (extra.data || []).forEach((p: { id: string; display_name: string; email: string }) => {
            studentsMap[p.id] = { name: p.display_name || 'Unknown', email: p.email || '' };
          });
        }
      }

      setQuizzes(quizzesMap);
      setStudents(studentsMap);
      setAttempts(attemptsData);
    } catch {
      toast.error('Failed to load results');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const getDuration = (startedAt?: string | null, completedAt?: string | null): number | null => {
    if (!startedAt || !completedAt) return null;
    const s = new Date(startedAt).getTime();
    const e = new Date(completedAt).getTime();
    if (!Number.isFinite(s) || !Number.isFinite(e) || e < s) return null;
    return Math.round((e - s) / 60000);
  };

  const getPct = (a: UiAttempt) =>
    typeof a.scorePercent === 'number' && Number.isFinite(a.scorePercent) ? Math.round(a.scorePercent) : 0;

  const stats = useMemo(() => {
    const completed = attempts.filter((a) => a.status === 'completed');
    const passed = completed.filter((a) => a.passed);
    const avgScore = completed.length
      ? Math.round(completed.reduce((s, a) => s + getPct(a), 0) / completed.length)
      : 0;
    const highScore = completed.length ? Math.max(...completed.map(getPct)) : 0;
    const withDur = completed.filter((a) => a.startedAt && a.completedAt);
    const avgDuration = withDur.length
      ? Math.round(
          withDur.reduce((s, a) => s + getDuration(a.startedAt, a.completedAt)!, 0) / withDur.length,
        )
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

  const quizBreakdown = useMemo(() => {
    const map: Record<string, { title: string; count: number; avgScore: number; passRate: number }> = {};
    attempts
      .filter((a) => a.status === 'completed')
      .forEach((a) => {
        const qid = a.quizId;
        if (!map[qid]) map[qid] = { title: quizzes[qid] || 'Unknown Quiz', count: 0, avgScore: 0, passRate: 0 };
        map[qid].count++;
        map[qid].avgScore += getPct(a);
        if (a.passed) map[qid].passRate++;
      });
    return Object.entries(map)
      .map(([id, v]) => ({
        id,
        title: v.title,
        count: v.count,
        avgScore: v.count ? Math.round(v.avgScore / v.count) : 0,
        passRate: v.count ? Math.round((v.passRate / v.count) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [attempts, quizzes]);

  const trend = useMemo(() => {
    const days: string[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      days.push(d.toISOString().slice(0, 10));
    }
    return days.map((day) => {
      const dayAttempts = attempts.filter(
        (a) => (a.completedAt || '').slice(0, 10) === day && a.status === 'completed',
      );
      return {
        day: day.slice(5).replace('-', '/'),
        attempts: dayAttempts.length,
        avgScore: dayAttempts.length
          ? Math.round(dayAttempts.reduce((s, a) => s + getPct(a), 0) / dayAttempts.length)
          : 0,
      };
    });
  }, [attempts]);

  const quizOptions = useMemo(() => Object.entries(quizzes), [quizzes]);

  const filtered = useMemo(() => {
    let list = [...attempts];
    if (tab === 'passed') list = list.filter((a) => a.passed);
    if (tab === 'failed') list = list.filter((a) => !a.passed && a.status === 'completed');
    if (selectedQuiz !== 'all') list = list.filter((a) => a.quizId === selectedQuiz);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((a) => {
        const st = students[a.studentId];
        const name = st?.name || '';
        const email = st?.email || '';
        return (
          name.toLowerCase().includes(q) ||
          email.toLowerCase().includes(q) ||
          (quizzes[a.quizId] || '').toLowerCase().includes(q)
        );
      });
    }
    list.sort((a, b) => {
      let aVal: string | number = '';
      let bVal: string | number = '';
      if (sortBy === 'student') {
        aVal = students[a.studentId]?.name || '';
        bVal = students[b.studentId]?.name || '';
      } else if (sortBy === 'quiz') {
        aVal = quizzes[a.quizId] || '';
        bVal = quizzes[b.quizId] || '';
      } else if (sortBy === 'score') {
        aVal = getPct(a);
        bVal = getPct(b);
      } else if (sortBy === 'duration') {
        aVal = getDuration(a.startedAt, a.completedAt) ?? 999;
        bVal = getDuration(b.startedAt, b.completedAt) ?? 999;
      } else {
        aVal = a.completedAt || '';
        bVal = b.completedAt || '';
      }
      if (typeof aVal === 'string') {
        return sortDir === 'asc' ? aVal.localeCompare(String(bVal)) : String(bVal).localeCompare(aVal);
      }
      return sortDir === 'asc' ? aVal - (bVal as number) : (bVal as number) - aVal;
    });
    return list;
  }, [attempts, tab, selectedQuiz, search, sortBy, sortDir, students, quizzes]);

  const toggleSort = (col: SortField) => {
    if (sortBy === col) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortBy(col);
      setSortDir('desc');
    }
  };

  const SortIcon = ({ col }: { col: SortField }) =>
    sortBy === col ? (
      sortDir === 'desc' ? (
        <ChevronDown className="w-3.5 h-3.5 text-indigo-500" />
      ) : (
        <ChevronUp className="w-3.5 h-3.5 text-indigo-500" />
      )
    ) : (
      <ChevronDown className="w-3.5 h-3.5 text-slate-300" />
    );

  const scoreColor = (pct: number) =>
    pct >= 80
      ? 'from-emerald-400 to-emerald-500'
      : pct >= 65
        ? 'from-blue-400 to-indigo-500'
        : pct >= 45
          ? 'from-amber-400 to-orange-500'
          : 'from-rose-400 to-red-500';

  const statItems = [
    { label: 'Total attempts', value: stats.total, gradient: 'from-indigo-500 to-violet-600', shadow: 'shadow-indigo-500/25', icon: FileText },
    { label: 'Completed', value: stats.completed, gradient: 'from-blue-500 to-cyan-600', shadow: 'shadow-blue-500/25', icon: ClipboardList },
    { label: 'Pass rate %', value: stats.passRate, gradient: 'from-emerald-500 to-teal-600', shadow: 'shadow-emerald-500/25', icon: Trophy },
    { label: 'Avg score %', value: stats.avgScore, gradient: 'from-violet-500 to-purple-600', shadow: 'shadow-violet-500/25', icon: TrendingUp },
    { label: 'Best score %', value: stats.highScore, gradient: 'from-amber-500 to-orange-600', shadow: 'shadow-amber-500/25', icon: BarChart3 },
    { label: 'Avg time (min)', value: stats.avgDuration || 0, gradient: 'from-sky-500 to-indigo-600', shadow: 'shadow-sky-500/25', icon: Clock },
  ];

  const exportCsv = () => {
    const headers = ['Student', 'Email', 'Quiz', 'Score %', 'Passed', 'Completed'];
    const lines = filtered.map((a) => {
      const st = students[a.studentId];
      return [
        `"${(st?.name || '').replace(/"/g, '""')}"`,
        `"${(st?.email || '').replace(/"/g, '""')}"`,
        `"${(quizzes[a.quizId] || '').replace(/"/g, '""')}"`,
        String(getPct(a)),
        a.passed ? 'Yes' : 'No',
        a.completedAt ? format(new Date(a.completedAt), 'yyyy-MM-dd HH:mm') : '',
      ].join(',');
    });
    const blob = new Blob([[headers.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `quiz-results-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Exported CSV');
  };

  return (
    <TeacherLayout>
      <AdminListPageShell
        breadcrumbPortalLabel="Teacher Portal"
        breadcrumbLabel="Results"
        title="Quiz Results"
        description="Review attempts, scores, and trends for quizzes linked to your courses."
        statsGridClassName="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4"
        stats={statItems}
        action={
          <motion.button
            type="button"
            onClick={exportCsv}
            whileHover={{ scale: 1.04, y: -2 }}
            whileTap={{ scale: 0.97 }}
            className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl font-bold text-sm text-white shrink-0 transition-all"
            style={{
              background: 'linear-gradient(135deg, #818cf8 0%, #a78bfa 100%)',
              boxShadow: '0 8px 32px rgba(139,92,246,0.45), 0 2px 8px rgba(0,0,0,0.15)',
            }}
          >
            <Download className="w-4 h-4" />
            Export CSV
          </motion.button>
        }
        filterBar={
          <AdminListFilterBar>
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-indigo-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search student, email, or quiz..."
                className={ADMIN_LIST_SEARCH_INPUT}
              />
            </div>
            <select
              value={tab}
              onChange={(e) => setTab(e.target.value as TabFilter)}
              className={ADMIN_LIST_SELECT}
            >
              <option value="all">All ({attempts.length})</option>
              <option value="passed">Passed ({attempts.filter((a) => a.passed).length})</option>
              <option value="failed">
                Failed ({attempts.filter((a) => !a.passed && a.status === 'completed').length})
              </option>
            </select>
            {quizOptions.length > 0 && (
              <select
                value={selectedQuiz}
                onChange={(e) => setSelectedQuiz(e.target.value)}
                className={ADMIN_LIST_SELECT}
              >
                <option value="all">All quizzes</option>
                {quizOptions.map(([id, title]) => (
                  <option key={id} value={id}>
                    {title}
                  </option>
                ))}
              </select>
            )}
            <select
              value={`${sortBy}:${sortDir}`}
              onChange={(e) => {
                const [f, d] = e.target.value.split(':') as [SortField, 'asc' | 'desc'];
                setSortBy(f);
                setSortDir(d);
              }}
              className={ADMIN_LIST_SELECT}
            >
              <option value="date:desc">Newest first</option>
              <option value="date:asc">Oldest first</option>
              <option value="score:desc">Score high → low</option>
              <option value="score:asc">Score low → high</option>
              <option value="student:asc">Student A–Z</option>
              <option value="quiz:asc">Quiz A–Z</option>
            </select>
          </AdminListFilterBar>
        }
      >
        {!loading && attempts.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
            <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div
                className="h-1"
                style={{
                  background: 'linear-gradient(90deg, #6366f1, #8b5cf6)',
                }}
              />
              <div className="p-6">
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <h2 className="text-base font-bold text-slate-900">Activity trend</h2>
                    <p className="text-xs text-slate-400 mt-0.5">Attempts over the last 7 days</p>
                  </div>
                  <Activity className="w-5 h-5 text-indigo-400" />
                </div>
                <div className="h-44">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={trend}>
                      <defs>
                        <linearGradient id="resultsTrend" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2} />
                          <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11 }} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11 }} allowDecimals={false} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#fff',
                          borderRadius: '12px',
                          border: '1px solid #e2e8f0',
                          fontSize: '12px',
                        }}
                      />
                      <Area
                        type="monotone"
                        dataKey="attempts"
                        stroke="#6366f1"
                        strokeWidth={2}
                        fillOpacity={1}
                        fill="url(#resultsTrend)"
                        name="Attempts"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="h-1 bg-gradient-to-r from-amber-400 to-orange-500" />
              <div className="p-6">
                <div className="flex items-center gap-2 mb-1">
                  <Flame className="w-4 h-4 text-orange-500" />
                  <h2 className="text-base font-bold text-slate-900">Top quizzes</h2>
                </div>
                <p className="text-xs text-slate-400 mb-4">By attempt volume</p>
                <div className="space-y-3">
                  {quizBreakdown.length === 0 ? (
                    <p className="text-slate-400 text-sm text-center py-6">No breakdown yet</p>
                  ) : (
                    quizBreakdown.map((q, i) => (
                      <div key={q.id} className="flex items-center gap-3">
                        <div
                          className={cn(
                            'w-7 h-7 rounded-lg flex items-center justify-center text-[11px] font-bold shrink-0',
                            i === 0
                              ? 'bg-amber-100 text-amber-800'
                              : i === 1
                                ? 'bg-slate-100 text-slate-600'
                                : 'bg-slate-50 text-slate-500',
                          )}
                        >
                          {i + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-semibold text-slate-800 truncate">{q.title}</div>
                          <div className="flex items-center gap-2 mt-1">
                            <div className="flex-1 h-1 bg-slate-100 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-indigo-400 rounded-full"
                                style={{ width: `${Math.min(q.avgScore, 100)}%` }}
                              />
                            </div>
                            <span className="text-[10px] text-slate-500 font-medium shrink-0">{q.avgScore}% avg</span>
                          </div>
                        </div>
                        <span className="text-xs font-bold text-slate-600 shrink-0">{q.count}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          {loading ? (
            <div className={ADMIN_LIST_CARD_GRID}>
              {Array(6).fill(0).map((_, i) => (
                <div key={i} className="h-56 rounded-2xl bg-slate-100 animate-pulse" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 px-6 text-slate-400">
              <BarChart3 className="w-12 h-12 mb-3 opacity-30" />
              <p className="font-medium text-slate-600">No results found</p>
              <p className="text-sm mt-1 text-center max-w-md">
                {search || tab !== 'all' || selectedQuiz !== 'all'
                  ? 'Try adjusting filters or search.'
                  : 'Results appear when students complete quizzes for your courses.'}
              </p>
            </div>
          ) : (
            <>
              <div className="px-4 sm:px-6 py-3 border-b border-slate-100 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span className="font-semibold uppercase tracking-wider">Sort by column</span>
                {(['student', 'quiz', 'score', 'duration', 'date'] as SortField[]).map((col) => (
                  <button
                    key={col}
                    type="button"
                    onClick={() => toggleSort(col)}
                    className={cn(
                      'inline-flex items-center gap-1 px-2.5 py-1 rounded-full border transition-colors',
                      sortBy === col
                        ? 'border-indigo-200 bg-indigo-50 text-indigo-700'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-indigo-100',
                    )}
                  >
                    {col === 'student' ? 'Student' : col === 'quiz' ? 'Quiz' : col === 'score' ? 'Score' : col === 'duration' ? 'Time' : 'Date'}
                    <SortIcon col={col} />
                  </button>
                ))}
              </div>
              <div className={ADMIN_LIST_CARD_GRID}>
                {filtered.map((attempt) => {
                  const pct = getPct(attempt);
                  const duration = getDuration(attempt.startedAt, attempt.completedAt);
                  const st = students[attempt.studentId];
                  const studentName = st?.name || 'Unknown Student';
                  const quizName = quizzes[attempt.quizId] || 'Unknown Quiz';
                  const initials = studentName
                    .split(' ')
                    .map((w) => w[0])
                    .join('')
                    .slice(0, 2)
                    .toUpperCase();
                  return (
                    <div key={attempt.id} className={ADMIN_LIST_ITEM_CARD}>
                      <div className="flex items-start gap-3">
                        <div
                          className={cn(
                            'w-11 h-11 rounded-xl bg-gradient-to-br flex items-center justify-center text-white text-xs font-bold shrink-0 shadow-sm',
                            avatarColor(studentName),
                          )}
                        >
                          {initials}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-slate-900 text-sm truncate">{studentName}</p>
                          {st?.email && <p className="text-xs text-slate-400 truncate">{st.email}</p>}
                          <span className="inline-flex items-center gap-1 mt-2 px-2 py-0.5 rounded-lg bg-slate-50 border border-slate-100 text-slate-700 text-[11px] font-medium max-w-full">
                            <FileText className="w-3 h-3 text-slate-400 shrink-0" />
                            <span className="truncate">{quizName}</span>
                          </span>
                        </div>
                      </div>
                      <div className="mt-4 space-y-3 text-xs border-t border-slate-100 pt-3">
                        <div className="flex items-center gap-2">
                          <span className="text-slate-400 font-semibold uppercase tracking-wider w-16 shrink-0">Score</span>
                          <div className="flex-1 flex items-center gap-2 min-w-0">
                            <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                              <div
                                className={cn('h-full rounded-full bg-gradient-to-r', scoreColor(pct))}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span className="font-bold text-slate-900 w-9 text-right">{pct}%</span>
                          </div>
                        </div>
                        {attempt.totalQuestions != null && attempt.totalQuestions > 0 && (
                          <p className="text-[11px] text-slate-400 pl-16">
                            {attempt.correctAnswers ?? '—'}/{attempt.totalQuestions} correct
                          </p>
                        )}
                        <div className="flex flex-wrap items-center gap-2 justify-between">
                          <span
                            className={cn(
                              'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border',
                              attempt.passed
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                                : attempt.status === 'completed'
                                  ? 'bg-rose-50 text-rose-700 border-rose-100'
                                  : 'bg-amber-50 text-amber-800 border-amber-100',
                            )}
                          >
                            {attempt.passed ? (
                              <CheckCircle2 className="w-3.5 h-3.5" />
                            ) : attempt.status === 'completed' ? (
                              <XCircle className="w-3.5 h-3.5" />
                            ) : (
                              <Clock className="w-3.5 h-3.5" />
                            )}
                            {attempt.passed ? 'Passed' : attempt.status === 'completed' ? 'Failed' : 'In progress'}
                          </span>
                          <div className="flex items-center gap-3 text-slate-500">
                            {duration != null && (
                              <span className="inline-flex items-center gap-1">
                                <Clock className="w-3.5 h-3.5 opacity-60" />
                                {duration}m
                              </span>
                            )}
                            <span>
                              {attempt.completedAt
                                ? format(new Date(attempt.completedAt), 'MMM d, yyyy')
                                : '—'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/60 text-xs text-slate-500 flex flex-wrap items-center justify-between gap-2">
                <span>
                  Showing {filtered.length} of {attempts.length} attempts
                </span>
                {(tab !== 'all' || selectedQuiz !== 'all' || search.trim()) && (
                  <button
                    type="button"
                    onClick={() => {
                      setTab('all');
                      setSelectedQuiz('all');
                      setSearch('');
                    }}
                    className="text-indigo-600 font-semibold hover:underline"
                  >
                    Clear filters
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </AdminListPageShell>
    </TeacherLayout>
  );
}
