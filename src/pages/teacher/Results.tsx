import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { supabase } from '../../supabase';
import TeacherLayout from '../../components/layout/TeacherLayout';
import GenderAvatar from '../../components/ui/GenderAvatar';
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
  Trophy, Flame, Activity, ClipboardList, Layers,
  Users, GraduationCap, BookOpen,
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { cn } from '../../lib/utils';
import { authFetch } from '../../lib/apiUrl';

type TabFilter = 'all' | 'passed' | 'failed';
type SortField = 'student' | 'quiz' | 'score' | 'date' | 'duration';

interface UiClass {
  id: string;
  name: string;
  studentIds: string[];
}

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

type MainTab = 'quizzes' | 'assignments';

interface UiSubmission {
  id: string;
  assignmentId: string;
  studentId: string;
  grade: number | null;
  status: string;
  submittedAt: string | null;
}

export default function TeacherResults() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const [attempts, setAttempts] = useState<UiAttempt[]>([]);
  const [quizzes, setQuizzes] = useState<Record<string, string>>({});
  const [students, setStudents] = useState<Record<string, { name: string; email: string }>>({});
  const [assignmentSubmissions, setAssignmentSubmissions] = useState<UiSubmission[]>([]);
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [mainTab, setMainTab] = useState<MainTab>('quizzes');
  const [search, setSearch] = useState(() => searchParams.get('student') || '');
  const [tab, setTab] = useState<TabFilter>('all');
  const [selectedQuiz, setSelectedQuiz] = useState('all');
  const [selectedClass, setSelectedClass] = useState('all');
  const [classes, setClasses] = useState<UiClass[]>([]);
  const [sortBy, setSortBy] = useState<SortField>('date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) return;

      const teacherId = session.user.id;
      const res = await authFetch(`/api/teacher/results?userId=${encodeURIComponent(teacherId)}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.success) {
        throw new Error(json?.error || 'Failed to load results');
      }

      setQuizzes((json?.quizzes && typeof json.quizzes === 'object') ? json.quizzes : {});
      setStudents((json?.students && typeof json.students === 'object') ? json.students : {});
      setAttempts(Array.isArray(json?.attempts) ? json.attempts : []);
      setAssignmentSubmissions(Array.isArray(json?.assignmentSubmissions) ? json.assignmentSubmissions : []);
      setAssignments((json?.assignments && typeof json.assignments === 'object') ? json.assignments : {});
      // Auto-switch to assignments tab if no quiz attempts but has submissions
      if (!Array.isArray(json?.attempts) || json.attempts.length === 0) {
        if (Array.isArray(json?.assignmentSubmissions) && json.assignmentSubmissions.length > 0) {
          setMainTab('assignments');
        }
      }
      // Load classes for filter
      const clsRes = await authFetch('/api/teacher/classes');
      if (clsRes.ok) {
        const clsJson = await clsRes.json().catch(() => ({}));
        setClasses((clsJson?.classes || []).map((c: any) => ({
          id: String(c.id),
          name: String(c.name || 'Class'),
          studentIds: Array.isArray(c.student_ids) ? c.student_ids.map(String) : [],
        })));
      }
    } catch (error: any) {
      toast.error(error?.message || 'Failed to load results');
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
    if (selectedClass !== 'all') {
      const cls = classes.find((c) => c.id === selectedClass);
      if (cls) list = list.filter((a) => cls.studentIds.includes(a.studentId));
    }
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
    { label: t('teacher.results.totalAttempts'), value: stats.total, gradient: 'from-indigo-500 to-violet-600', shadow: 'shadow-indigo-500/25', icon: FileText },
    { label: t('teacher.results.completed'), value: stats.completed, gradient: 'from-blue-500 to-cyan-600', shadow: 'shadow-blue-500/25', icon: ClipboardList },
    { label: t('teacher.results.passRate'), value: stats.passRate, gradient: 'from-emerald-500 to-teal-600', shadow: 'shadow-emerald-500/25', icon: Trophy },
    { label: t('teacher.results.avgScore'), value: stats.avgScore, gradient: 'from-violet-500 to-purple-600', shadow: 'shadow-violet-500/25', icon: TrendingUp },
    { label: t('teacher.results.bestScore'), value: stats.highScore, gradient: 'from-amber-500 to-orange-600', shadow: 'shadow-amber-500/25', icon: BarChart3 },
    { label: t('teacher.results.avgTime'), value: stats.avgDuration || 0, gradient: 'from-sky-500 to-indigo-600', shadow: 'shadow-sky-500/25', icon: Clock },
  ];

  // ── Section performance state ─────────────────────────────────────────────
  const [sectionData, setSectionData] = useState<{ sections: any[]; questions: any[] } | null>(null);
  const [sectionDataLoading, setSectionDataLoading] = useState(false);

  // Fetch sections + questions when a specific quiz is selected
  useEffect(() => {
    if (selectedQuiz === 'all') { setSectionData(null); return; }
    let cancelled = false;
    (async () => {
      setSectionDataLoading(true);
      try {
        const [secRes, qRes] = await Promise.all([
          authFetch(`/api/teacher/quizzes/${encodeURIComponent(selectedQuiz)}/sections`),
          authFetch(`/api/teacher/quizzes/${encodeURIComponent(selectedQuiz)}/questions`),
        ]);
        if (cancelled) return;
        const secJson = secRes.ok ? await secRes.json().catch(() => ({})) : {};
        const qJson = qRes.ok ? await qRes.json().catch(() => ({})) : {};
        setSectionData({
          sections: Array.isArray(secJson?.sections) ? secJson.sections : [],
          questions: Array.isArray(qJson?.questions) ? qJson.questions : [],
        });
      } catch { setSectionData(null); }
      finally { if (!cancelled) setSectionDataLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [selectedQuiz]);

  // ── Per-section performance (computed from attempts + section data) ────────
  const sectionReport = useMemo(() => {
    if (!sectionData || sectionData.sections.length === 0) return null;
    const { sections, questions } = sectionData;

    // Grading helpers (mirrors QuizResults.tsx logic)
    const normalizeAns = (value: unknown): string => {
      if (value === null || value === undefined) return '';
      if (typeof value === 'number' || typeof value === 'boolean') return String(value);
      if (Array.isArray(value)) return value.length === 1 ? normalizeAns(value[0]) : value.map(normalizeAns).join('|');
      if (typeof value === 'object') {
        const c = value as Record<string, unknown>;
        if (c.id !== undefined) return normalizeAns(c.id);
        if (c.value !== undefined) return normalizeAns(c.value);
        if (c.answer !== undefined) return normalizeAns(c.answer);
        return JSON.stringify(c);
      }
      const raw = String(value).trim();
      try { const p = JSON.parse(raw); if (p !== raw) return normalizeAns(p); } catch { }
      return raw;
    };

    const GRADABLE = new Set(['multiple-choice', 'true-false', 'image', 'video', 'reading', 'open-text', 'fill-in-the-blank']);

    const isCorrect = (q: any, studentAnswerRaw: unknown): boolean => {
      const qType = String(q.type || '').trim().toLowerCase();
      const student = normalizeAns(studentAnswerRaw);
      const correct = normalizeAns(q.correct_answer);
      if (qType === 'open-text' || qType === 'fill-in-the-blank') {
        return correct.toLowerCase().split(',').map((k: string) => k.trim()).filter(Boolean).some((k: string) => student.toLowerCase().includes(k));
      }
      if (Array.isArray(q.options) && q.options.length > 0) {
        const selOpt = q.options.find((o: any) => normalizeAns(o.id) === student);
        const selText = selOpt ? normalizeAns(selOpt.text) : student;
        const corrOpt = q.options.find((o: any) => normalizeAns(o.id) === correct);
        const corrText = corrOpt ? normalizeAns(corrOpt.text) : correct;
        return student === correct || selText === correct || student === corrText || selText === corrText;
      }
      return student === correct;
    };

    const quizAttempts = attempts.filter(
      (a) => a.quizId === selectedQuiz && a.status === 'completed'
    );

    return sections.map((sec: any) => {
      const secQs = questions.filter((q: any) => q.section_id === sec.id && GRADABLE.has(String(q.type || '').toLowerCase()));
      const totalPts = secQs.reduce((s: number, q: any) => s + (Number(q.points) || 0), 0);

      let totalEarned = 0;
      let totalCorrect = 0;
      let totalPossible = 0;

      quizAttempts.forEach((attempt) => {
        const answers = (attempt as any).answers || {};
        secQs.forEach((q: any) => {
          if (isCorrect(q, answers[q.id])) {
            totalEarned += Number(q.points) || 0;
            totalCorrect++;
          }
          totalPossible += Number(q.points) || 0;
        });
      });

      const totalAnswered = quizAttempts.length * secQs.length;
      const avgPct = totalPossible > 0 ? Math.round((totalEarned / totalPossible) * 100) : null;
      const passRate = totalAnswered > 0 ? Math.round((totalCorrect / totalAnswered) * 100) : null;

      return {
        id: sec.id,
        title: sec.title,
        type: sec.type || 'general',
        instructions: sec.instructions,
        questionCount: secQs.length,
        avgPct,
        passRate,
        totalCorrect,
        totalAnswered,
        attemptCount: quizAttempts.length,
        totalPts,
      };
    });
  }, [sectionData, attempts, selectedQuiz]);

  const [selectedAssignmentClass, setSelectedAssignmentClass] = useState('all');

  /* ── Per-class assignment averages ───────────────────────────────────────── */
  const classAssignmentStats = useMemo(() => {
    if (classes.length === 0) return [];
    return classes.map(cls => {
      const classSubs = cls.studentIds.length > 0
        ? assignmentSubmissions.filter(s => cls.studentIds.includes(s.studentId))
        : assignmentSubmissions; // fallback: show all if class has no studentIds
      const graded = classSubs.filter(s => s.grade != null);
      const avgGrade = graded.length > 0
        ? Math.round(graded.reduce((sum, s) => sum + (s.grade as number), 0) / graded.length)
        : null;
      const submittedStudents = new Set(classSubs.map(s => s.studentId)).size;
      // count unique assignments submitted
      const uniqueAssignments = new Set(classSubs.map(s => s.assignmentId)).size;
      const gradedPct = classSubs.length > 0 ? Math.round((graded.length / classSubs.length) * 100) : 0;
      return {
        id: cls.id,
        name: cls.name,
        studentCount: cls.studentIds.length,
        submittedStudents,
        totalSubmissions: classSubs.length,
        uniqueAssignments,
        gradedCount: graded.length,
        gradedPct,
        avgGrade,
      };
    });
  }, [classes, assignmentSubmissions]);

  const CLASS_ASGN_GRADIENTS = [
    'from-emerald-500 to-teal-600',
    'from-blue-500 to-cyan-600',
    'from-violet-500 to-purple-600',
    'from-amber-500 to-orange-600',
    'from-rose-500 to-pink-600',
    'from-indigo-500 to-blue-600',
    'from-sky-500 to-indigo-500',
    'from-teal-500 to-emerald-600',
  ];

  /* Filtered submissions for the assignment tab table */
  const filteredAssignmentSubs = useMemo(() => {
    let list = [...assignmentSubmissions];
    if (selectedAssignmentClass !== 'all') {
      const cls = classes.find(c => c.id === selectedAssignmentClass);
      if (cls && cls.studentIds.length > 0) {
        list = list.filter(s => cls.studentIds.includes(s.studentId));
      }
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(s => {
        const student = students[s.studentId];
        return (
          (student?.name || '').toLowerCase().includes(q) ||
          (student?.email || '').toLowerCase().includes(q) ||
          (assignments[s.assignmentId] || '').toLowerCase().includes(q)
        );
      });
    }
    return list;
  }, [assignmentSubmissions, selectedAssignmentClass, classes, search, students, assignments]);

  const [exportOpen, setExportOpen] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) setExportOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const getExportRows = () => filtered.map((a) => {
    const st = students[a.studentId];
    const dur = getDuration(a.startedAt, a.completedAt);
    return {
      Student: st?.name || '',
      Email: st?.email || '',
      Quiz: quizzes[a.quizId] || '',
      'Score %': getPct(a),
      Passed: a.passed ? 'Yes' : 'No',
      'Correct / Total': `${a.correctAnswers ?? 0} / ${a.totalQuestions ?? 0}`,
      Duration: dur !== null ? `${dur} min` : '',
      Completed: a.completedAt ? format(new Date(a.completedAt), 'yyyy-MM-dd HH:mm') : '',
    };
  });

  const exportCsv = () => {
    const rows = getExportRows();
    if (!rows.length) { toast.error('No data to export'); return; }
    const headers = Object.keys(rows[0]);
    const lines = rows.map(r => headers.map(h => `"${String((r as any)[h] ?? '').replace(/"/g, '""')}"`).join(','));
    const blob = new Blob([[headers.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `quiz-results-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Exported CSV');
    setExportOpen(false);
  };

  const exportExcel = () => {
    const rows = getExportRows();
    if (!rows.length) { toast.error('No data to export'); return; }
    const ws = XLSX.utils.json_to_sheet(rows);
    const colWidths = Object.keys(rows[0]).map(k => ({ wch: Math.max(k.length, 14) }));
    ws['!cols'] = colWidths;
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Quiz Results');
    XLSX.writeFile(wb, `quiz-results-${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
    toast.success('Exported Excel');
    setExportOpen(false);
  };

  const exportPdf = () => {
    const rows = getExportRows();
    if (!rows.length) { toast.error('No data to export'); return; }
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Quiz Results</title>
      <style>body{font-family:Arial,sans-serif;font-size:12px;padding:20px;}
      h1{font-size:18px;margin-bottom:16px;}
      table{width:100%;border-collapse:collapse;}
      th{background:#4f46e5;color:#fff;padding:8px 10px;text-align:left;font-size:11px;}
      td{padding:7px 10px;border-bottom:1px solid #e2e8f0;}
      tr:nth-child(even) td{background:#f8fafc;}
      .pass{color:#16a34a;font-weight:bold;} .fail{color:#dc2626;font-weight:bold;}
      </style></head><body>
      <h1>Quiz Results — ${format(new Date(), 'yyyy-MM-dd')}</h1>
      <table><thead><tr>${Object.keys(rows[0]).map(h => `<th>${h}</th>`).join('')}</tr></thead>
      <tbody>${rows.map(r => `<tr>${Object.entries(r).map(([k, v]) =>
        `<td${k === 'Passed' ? ` class="${v === 'Yes' ? 'pass' : 'fail'}"` : ''}>${v}</td>`
      ).join('')}</tr>`).join('')}</tbody></table></body></html>`;
    const w = window.open('', '_blank');
    if (w) { w.document.write(html); w.document.close(); w.print(); }
    setExportOpen(false);
  };

  return (
    <TeacherLayout>
      <AdminListPageShell
        breadcrumbPortalLabel={t('nav.teacherPortal')}
        breadcrumbLabel={t('teacher.results.title')}
        title={t('teacher.results.title')}
        description={t('teacher.results.description')}
        statsGridClassName="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4"
        stats={statItems}
        action={
          <div ref={exportRef} className="relative">
            <motion.button
              type="button"
              onClick={() => setExportOpen(v => !v)}
              whileHover={{ scale: 1.04, y: -2 }}
              whileTap={{ scale: 0.97 }}
              className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl font-bold text-sm text-white shrink-0 transition-all"
              style={{ background: 'linear-gradient(135deg, #818cf8 0%, #a78bfa 100%)', boxShadow: '0 8px 32px rgba(139,92,246,0.45), 0 2px 8px rgba(0,0,0,0.15)' }}
            >
              <Download className="w-4 h-4" />
              {t('teacher.results.export')} <ChevronDown className="w-3.5 h-3.5" />
            </motion.button>
            {exportOpen && (
              <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden z-50">
                <button onClick={exportCsv} className="flex items-center gap-2.5 w-full px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition">
                  <FileText className="w-4 h-4 text-emerald-500" /> {t('teacher.results.exportCSV')}
                </button>
                <button onClick={exportExcel} className="flex items-center gap-2.5 w-full px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition border-t border-slate-100">
                  <BarChart3 className="w-4 h-4 text-indigo-500" /> {t('teacher.results.exportExcel')}
                </button>
                <button onClick={exportPdf} className="flex items-center gap-2.5 w-full px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition border-t border-slate-100">
                  <Download className="w-4 h-4 text-red-500" /> {t('teacher.results.exportPDF')}
                </button>
              </div>
            )}
          </div>
        }
        filterBar={
          <AdminListFilterBar>
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-indigo-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('teacher.results.searchPlaceholder')}
                className={ADMIN_LIST_SEARCH_INPUT}
              />
            </div>
            <select
              value={tab}
              onChange={(e) => setTab(e.target.value as TabFilter)}
              className={ADMIN_LIST_SELECT}
            >
              <option value="all">{t('teacher.results.all')} ({attempts.length})</option>
              <option value="passed">{t('teacher.results.passed')} ({attempts.filter((a) => a.passed).length})</option>
              <option value="failed">
                {t('teacher.results.failed')} ({attempts.filter((a) => !a.passed && a.status === 'completed').length})
              </option>
            </select>
            {classes.length > 0 && (
              <select
                value={selectedClass}
                onChange={(e) => setSelectedClass(e.target.value)}
                className={ADMIN_LIST_SELECT}
              >
                <option value="all">{t('teacher.results.allClasses')}</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            )}
            {quizOptions.length > 0 && (
              <select
                value={selectedQuiz}
                onChange={(e) => setSelectedQuiz(e.target.value)}
                className={ADMIN_LIST_SELECT}
              >
                <option value="all">{t('teacher.results.allQuizzes')}</option>
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
              <option value="date:desc">{t('teacher.results.newestFirst')}</option>
              <option value="date:asc">{t('teacher.results.oldestFirst')}</option>
              <option value="score:desc">{t('teacher.results.scoreHighToLow')}</option>
              <option value="score:asc">{t('teacher.results.scoreLowToHigh')}</option>
              <option value="student:asc">{t('teacher.results.studentAZ')}</option>
              <option value="quiz:asc">{t('teacher.results.quizAZ')}</option>
            </select>
          </AdminListFilterBar>
        }
      >
        {/* Main tab switcher: Quizzes vs Assignments */}
        <div className="flex items-center gap-1 mb-6 bg-slate-100 rounded-2xl p-1 w-fit">
          <button
            type="button"
            onClick={() => setMainTab('quizzes')}
            className={cn(
              'px-5 py-2 rounded-xl text-sm font-semibold transition-all',
              mainTab === 'quizzes'
                ? 'bg-white text-indigo-700 shadow-sm'
                : 'text-slate-500 hover:text-slate-700',
            )}
          >
            {t('teacher.results.quizzesTab')} {attempts.length > 0 && <span className="ml-1.5 text-xs text-slate-400">({attempts.length})</span>}
          </button>
          <button
            type="button"
            onClick={() => setMainTab('assignments')}
            className={cn(
              'px-5 py-2 rounded-xl text-sm font-semibold transition-all',
              mainTab === 'assignments'
                ? 'bg-white text-emerald-700 shadow-sm'
                : 'text-slate-500 hover:text-slate-700',
            )}
          >
            {t('teacher.results.assignmentsTab')} {assignmentSubmissions.length > 0 && <span className="ml-1.5 text-xs text-slate-400">({assignmentSubmissions.length})</span>}
          </button>
        </div>

        {/* ── Assignments panel ──────────────────────────────────────────── */}
        {mainTab === 'assignments' && (
          <div className="space-y-6">

            {/* ── Class averages grid ─────────────────────────────────────── */}
            {!loading && classAssignmentStats.length > 0 && (
              <div>
                <h3 className="text-sm font-bold text-slate-700 uppercase tracking-widest mb-3 flex items-center gap-2">
                  <GraduationCap className="w-4 h-4 text-emerald-500" />
                  Average per Class
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {classAssignmentStats.map((cls, i) => {
                    const gradient = CLASS_ASGN_GRADIENTS[i % CLASS_ASGN_GRADIENTS.length];
                    const avgDisplay = cls.avgGrade != null ? `${cls.avgGrade}%` : '—';
                    const isSelected = selectedAssignmentClass === cls.id;
                    return (
                      <motion.div
                        key={cls.id}
                        whileHover={{ y: -3, boxShadow: '0 12px 36px rgba(0,0,0,0.09)' }}
                        onClick={() => setSelectedAssignmentClass(isSelected ? 'all' : cls.id)}
                        className={cn(
                          'rounded-2xl border shadow-sm overflow-hidden cursor-pointer transition-all',
                          isSelected ? 'border-emerald-400 ring-2 ring-emerald-300/50' : 'border-slate-100 bg-white'
                        )}
                      >
                        {/* header */}
                        <div className={`bg-gradient-to-br ${gradient} p-4 relative overflow-hidden`}>
                          <div className="absolute top-0 right-0 w-16 h-16 bg-white/10 rounded-full -translate-y-6 translate-x-6" />
                          <div className="relative z-10 flex items-start justify-between gap-2">
                            <div>
                              <p className="text-white font-black text-base leading-tight">{cls.name}</p>
                              <p className="text-white/70 text-xs mt-0.5 flex items-center gap-1">
                                <Users className="w-3 h-3" />
                                {cls.submittedStudents} / {cls.studentCount || '?'} submitted
                              </p>
                            </div>
                            <div className="text-right shrink-0">
                              <div className="text-2xl font-black text-white">{avgDisplay}</div>
                              <div className="text-[10px] text-white/70 font-semibold uppercase tracking-wide">avg grade</div>
                            </div>
                          </div>
                        </div>

                        {/* body */}
                        <div className="bg-white p-4 space-y-3">
                          {/* avg grade bar */}
                          <div>
                            <div className="flex justify-between text-xs mb-1">
                              <span className="text-slate-500 font-medium">Avg grade</span>
                              <span className="font-bold text-slate-700">{avgDisplay}</span>
                            </div>
                            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                              <motion.div
                                className={`h-full rounded-full bg-gradient-to-r ${gradient}`}
                                initial={{ width: 0 }}
                                animate={{ width: `${cls.avgGrade ?? 0}%` }}
                                transition={{ duration: 0.6, delay: i * 0.05 }}
                              />
                            </div>
                          </div>

                          {/* meta row */}
                          <div className="flex items-center gap-3 text-[11px] text-slate-400 flex-wrap">
                            <span className="flex items-center gap-1">
                              <BookOpen className="w-3 h-3" />
                              <span className="font-semibold text-slate-600">{cls.totalSubmissions}</span> submission{cls.totalSubmissions !== 1 ? 's' : ''}
                            </span>
                            <span className="flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                              <span className="font-semibold text-slate-600">{cls.gradedCount}</span> graded
                            </span>
                          </div>

                          {/* graded progress */}
                          {cls.totalSubmissions > 0 && (
                            <div className="flex items-center gap-2 text-[11px] text-slate-400">
                              <div className="flex-1 h-1 bg-slate-100 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-emerald-400 rounded-full transition-all"
                                  style={{ width: `${cls.gradedPct}%` }}
                                />
                              </div>
                              <span className="shrink-0 font-semibold">{cls.gradedPct}% graded</span>
                            </div>
                          )}

                          {isSelected && (
                            <p className="text-[10px] text-emerald-600 font-semibold">
                              ✓ Filtered to this class — click again to clear
                            </p>
                          )}
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── Submissions table ───────────────────────────────────────── */}
            <div>
              {classAssignmentStats.length > 0 && (
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold text-slate-700 uppercase tracking-widest flex items-center gap-2">
                    <ClipboardList className="w-4 h-4 text-emerald-500" />
                    Submissions
                    {selectedAssignmentClass !== 'all' && (
                      <span className="text-emerald-600 normal-case font-semibold">
                        — {classes.find(c => c.id === selectedAssignmentClass)?.name}
                      </span>
                    )}
                  </h3>
                  {selectedAssignmentClass !== 'all' && (
                    <button
                      type="button"
                      onClick={() => setSelectedAssignmentClass('all')}
                      className="text-xs text-slate-400 hover:text-slate-600 underline"
                    >
                      Show all classes
                    </button>
                  )}
                </div>
              )}

              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="h-1 bg-gradient-to-r from-emerald-400 to-teal-500" />
                {loading ? (
                  <div className="p-8 flex items-center justify-center text-slate-400 text-sm">Loading…</div>
                ) : filteredAssignmentSubs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 gap-2 text-slate-400">
                    <ClipboardList className="w-10 h-10 opacity-30" />
                    <p className="text-sm font-medium">{t('teacher.results.noSubmissionsYet')}</p>
                    <p className="text-xs text-slate-400 max-w-sm text-center">
                      {t('teacher.results.noSubmissionsDesc')}
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-100">
                          <th className="text-left px-5 py-3.5 font-semibold text-slate-500 text-xs uppercase tracking-wide">{t('teacher.results.student')}</th>
                          <th className="text-left px-5 py-3.5 font-semibold text-slate-500 text-xs uppercase tracking-wide">{t('teacher.results.assignmentCol')}</th>
                          <th className="text-left px-5 py-3.5 font-semibold text-slate-500 text-xs uppercase tracking-wide">{t('teacher.results.statusCol')}</th>
                          <th className="text-left px-5 py-3.5 font-semibold text-slate-500 text-xs uppercase tracking-wide">{t('teacher.results.gradeCol')}</th>
                          <th className="text-left px-5 py-3.5 font-semibold text-slate-500 text-xs uppercase tracking-wide">{t('teacher.results.submittedCol')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredAssignmentSubs.map((sub) => {
                          const student = students[sub.studentId];
                          const asgTitle = assignments[sub.assignmentId] || 'Assignment';
                          const statusColor =
                            sub.status === 'graded' ? 'bg-emerald-100 text-emerald-700' :
                            sub.status === 'submitted' ? 'bg-blue-100 text-blue-700' :
                            'bg-amber-100 text-amber-700';
                          return (
                            <tr key={sub.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                              <td className="px-5 py-3.5">
                                <div className="flex items-center gap-2.5">
                                  <GenderAvatar name={student?.name || sub.studentId} size="sm" />
                                  <div>
                                    <div className="font-semibold text-slate-800 text-sm">{student?.name || sub.studentId}</div>
                                    {student?.email && <div className="text-xs text-slate-400">{student.email}</div>}
                                  </div>
                                </div>
                              </td>
                              <td className="px-5 py-3.5 text-slate-700 text-sm">{asgTitle}</td>
                              <td className="px-5 py-3.5">
                                <span className={cn('px-2 py-0.5 rounded-full text-xs font-semibold capitalize', statusColor)}>
                                  {sub.status}
                                </span>
                              </td>
                              <td className="px-5 py-3.5">
                                {sub.grade != null ? (
                                  <div className="flex items-center gap-2">
                                    <span className="font-bold text-slate-800">{sub.grade}%</span>
                                    <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                      <div
                                        className={cn('h-full rounded-full', sub.grade >= 80 ? 'bg-emerald-500' : sub.grade >= 60 ? 'bg-amber-400' : 'bg-rose-400')}
                                        style={{ width: `${sub.grade}%` }}
                                      />
                                    </div>
                                  </div>
                                ) : (
                                  <span className="text-slate-400 text-xs">{t('teacher.results.notGraded')}</span>
                                )}
                              </td>
                              <td className="px-5 py-3.5 text-xs text-slate-500">
                                {sub.submittedAt ? format(new Date(sub.submittedAt), 'MMM d, yyyy') : '—'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    <div className="px-5 py-3 border-t border-slate-100 text-xs text-slate-400">
                      {t('teacher.results.submissionsCount', { count: filteredAssignmentSubs.length })}
                      {selectedAssignmentClass !== 'all' && assignmentSubmissions.length !== filteredAssignmentSubs.length && (
                        <span className="ml-2 text-slate-300">({assignmentSubmissions.length} total)</span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {mainTab === 'quizzes' && !loading && attempts.length > 0 && (
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
                    <h2 className="text-base font-bold text-slate-900">{t('teacher.results.activityTrend')}</h2>
                    <p className="text-xs text-slate-400 mt-0.5">{t('teacher.results.attemptsLast7Days')}</p>
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
                  <h2 className="text-base font-bold text-slate-900">{t('teacher.results.topQuizzes')}</h2>
                </div>
                <p className="text-xs text-slate-400 mb-4">{t('teacher.results.byAttemptVolume')}</p>
                <div className="space-y-3">
                  {quizBreakdown.length === 0 ? (
                    <p className="text-slate-400 text-sm text-center py-6">{t('teacher.results.noBreakdownYet')}</p>
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
                            <span className="text-[10px] text-slate-500 font-medium shrink-0">{q.avgScore}% {t('teacher.results.avg', 'avg')}</span>
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

        {/* ── Section Performance Report ──────────────────────────────────── */}
        {mainTab === 'quizzes' && selectedQuiz !== 'all' && (sectionDataLoading || (sectionReport && sectionReport.length > 0)) && (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden mb-6">
            <div
              className="h-1"
              style={{ background: 'linear-gradient(90deg, #7c3aed, #a78bfa)' }}
            />
            <div className="p-6">
              <div className="flex items-center gap-2 mb-5">
                <div className="w-8 h-8 rounded-xl bg-violet-50 flex items-center justify-center">
                  <Layers className="w-4 h-4 text-violet-600" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">{t('teacher.results.sectionPerformance')}</h2>
                  <p className="text-xs text-slate-400">
                    {t('teacher.results.sectionPerfDesc', {
                      count: attempts.filter(a => a.quizId === selectedQuiz && a.status === 'completed').length,
                      quiz: quizzes[selectedQuiz] || '',
                    })}
                  </p>
                </div>
              </div>

              {sectionDataLoading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {Array(3).fill(0).map((_, i) => (
                    <div key={i} className="h-24 rounded-2xl bg-slate-100 animate-pulse" />
                  ))}
                </div>
              ) : sectionReport && sectionReport.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {sectionReport.map((sec) => {
                    const typeColors: Record<string, { badge: string; bar: string; ring: string }> = {
                      grammar:    { badge: 'bg-violet-100 text-violet-700',  bar: '#7c3aed', ring: 'ring-violet-100' },
                      listening:  { badge: 'bg-amber-100 text-amber-700',    bar: '#d97706', ring: 'ring-amber-100' },
                      reading:    { badge: 'bg-blue-100 text-blue-700',      bar: '#2563eb', ring: 'ring-blue-100' },
                      writing:    { badge: 'bg-emerald-100 text-emerald-700',bar: '#059669', ring: 'ring-emerald-100' },
                      vocabulary: { badge: 'bg-pink-100 text-pink-700',      bar: '#db2777', ring: 'ring-pink-100' },
                      general:    { badge: 'bg-slate-100 text-slate-600',    bar: '#6366f1', ring: 'ring-slate-100' },
                    };
                    const c = typeColors[sec.type] || typeColors.general;
                    const pct = sec.avgPct ?? 0;
                    const barColor = pct >= 70 ? '#10b981' : pct >= 40 ? '#f59e0b' : '#ef4444';

                    return (
                      <motion.div
                        key={sec.id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={cn('rounded-2xl border p-4 space-y-3 ring-2', c.ring)}
                        style={{ borderColor: c.bar + '30' }}
                      >
                        {/* Header */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-bold text-slate-900 truncate">{sec.title}</span>
                              <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full capitalize shrink-0', c.badge)}>
                                {sec.type}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-400 mt-0.5">{sec.questionCount} question{sec.questionCount !== 1 ? 's' : ''}</p>
                          </div>
                          {sec.avgPct !== null && (
                            <div className="text-right shrink-0">
                              <div className="text-xl font-black" style={{ color: barColor }}>
                                {sec.avgPct}%
                              </div>
                              <div className="text-[10px] text-slate-400">{t('teacher.results.classAvg')}</div>
                            </div>
                          )}
                        </div>

                        {/* Progress bar */}
                        {sec.avgPct !== null && (
                          <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${sec.avgPct}%` }}
                              transition={{ duration: 0.7, ease: 'easeOut' }}
                              className="h-full rounded-full"
                              style={{ background: barColor }}
                            />
                          </div>
                        )}

                        {/* Stats row */}
                        <div className="flex items-center gap-3 text-xs text-slate-500">
                          {sec.totalAnswered > 0 ? (
                            <>
                              <span className="flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                                {sec.totalCorrect}/{sec.totalAnswered} {t('teacher.results.correct')}
                              </span>
                              {sec.passRate !== null && (
                                <span className="flex items-center gap-1 ml-auto">
                                  <Trophy className="w-3 h-3 text-amber-500" />
                                  {sec.passRate}% {t('teacher.results.passRateLabel')}
                                </span>
                              )}
                            </>
                          ) : (
                            <span className="text-slate-400 italic">{t('teacher.results.noAttemptsYet')}</span>
                          )}
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              ) : null}
            </div>
          </div>
        )}

        {mainTab === 'quizzes' && <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          {loading ? (
            <div className={ADMIN_LIST_CARD_GRID}>
              {Array(6).fill(0).map((_, i) => (
                <div key={i} className="h-56 rounded-2xl bg-slate-100 animate-pulse" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 px-6 text-slate-400">
              <BarChart3 className="w-12 h-12 mb-3 opacity-30" />
              <p className="font-medium text-slate-600">{t('teacher.results.noResultsFound')}</p>
              <p className="text-sm mt-1 text-center max-w-md">
                {search || tab !== 'all' || selectedQuiz !== 'all' || selectedClass !== 'all'
                  ? t('teacher.results.tryAdjustingFilters')
                  : t('teacher.results.resultsAppearWhen')}
              </p>
            </div>
          ) : (
            <>
              <div className="px-4 sm:px-6 py-3 border-b border-slate-100 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span className="font-semibold uppercase tracking-wider">{t('teacher.results.sortByColumn')}</span>
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
                    {col === 'student' ? t('teacher.results.student') : col === 'quiz' ? t('teacher.results.quiz') : col === 'score' ? t('teacher.results.score') : col === 'duration' ? t('teacher.results.time') : t('teacher.results.date')}
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
                  return (
                    <div key={attempt.id} className={ADMIN_LIST_ITEM_CARD} style={{ borderLeftWidth: '4px', borderLeftColor: attempt.passed ? '#10b981' : attempt.status === 'completed' ? '#f43f5e' : '#f59e0b' }}>
                      <div className="flex items-start gap-3">
                        <GenderAvatar name={studentName} />
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
                          <span className="text-slate-400 font-semibold uppercase tracking-wider w-16 shrink-0">{t('teacher.results.score')}</span>
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
                            {attempt.correctAnswers ?? '—'}/{attempt.totalQuestions} {t('teacher.results.correct')}
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
                            {attempt.passed ? t('teacher.results.passed') : attempt.status === 'completed' ? t('teacher.results.failed') : t('teacher.results.inProgress')}
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
                  {t('teacher.results.showing', { count: filtered.length, total: attempts.length })}
                </span>
                {(tab !== 'all' || selectedQuiz !== 'all' || selectedClass !== 'all' || search.trim()) && (
                  <button
                    type="button"
                    onClick={() => {
                      setTab('all');
                      setSelectedQuiz('all');
                      setSelectedClass('all');
                      setSearch('');
                    }}
                    className="text-indigo-600 font-semibold hover:underline"
                  >
                    {t('teacher.results.clearFilters')}
                  </button>
                )}
              </div>
            </>
          )}
        </div>}
      </AdminListPageShell>
    </TeacherLayout>
  );
}
