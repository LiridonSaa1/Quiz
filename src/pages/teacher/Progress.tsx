import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import TeacherLayout from '../../components/layout/TeacherLayout';
import { supabase } from '../../supabase';
import { toast } from 'sonner';
import GenderAvatar from '../../components/ui/GenderAvatar';
import {
  AdminListFilterBar,
  AdminListPageShell,
  ADMIN_LIST_SEARCH_INPUT,
  ADMIN_LIST_CARD_GRID,
  ADMIN_LIST_ITEM_CARD,
} from '../../components/admin/AdminListPageShell';
import { BarChart3, Search, Users, BookOpen, FileText, TrendingUp, CheckCircle2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import { authFetch } from '../../lib/apiUrl';
import { useNavigate } from 'react-router-dom';

interface StudentProgressRow {
  studentId: string;
  studentName: string;
  studentEmail: string;
  attempts: number;
  passed: number;
  passRate: number;
  avgScore: number;
  lastAttemptDate: string | null;
  topCourseName: string | null;
}

type ProgressStatus = 'at_risk' | 'falling_behind' | 'good' | 'excellent';

function getStatus(avgScore: number, attempts: number): ProgressStatus {
  if (attempts === 0) return 'at_risk';
  if (avgScore < 50) return 'at_risk';
  if (avgScore < 70) return 'falling_behind';
  if (avgScore < 85) return 'good';
  return 'excellent';
}

const STATUS_CFG: Record<ProgressStatus, { label: string; bg: string; text: string; dot: string; border: string }> = {
  at_risk:        { label: 'At Risk',        bg: 'bg-red-50',    text: 'text-red-600',    dot: 'bg-red-500',    border: '#ef4444' },
  falling_behind: { label: 'Falling Behind', bg: 'bg-orange-50', text: 'text-orange-600', dot: 'bg-orange-400', border: '#f97316' },
  good:           { label: 'Good Standing',  bg: 'bg-emerald-50',text: 'text-emerald-700',dot: 'bg-emerald-500',border: '#10b981' },
  excellent:      { label: 'Excellent',      bg: 'bg-blue-50',   text: 'text-blue-700',   dot: 'bg-blue-500',   border: '#3b82f6' },
};

function getGrade(avgScore: number, attempts: number): string {
  if (attempts === 0) return '—';
  if (avgScore >= 97) return 'A+';
  if (avgScore >= 93) return 'A';
  if (avgScore >= 90) return 'A-';
  if (avgScore >= 87) return 'B+';
  if (avgScore >= 83) return 'B';
  if (avgScore >= 80) return 'B-';
  if (avgScore >= 77) return 'C+';
  if (avgScore >= 73) return 'C';
  if (avgScore >= 70) return 'C-';
  if (avgScore >= 67) return 'D+';
  if (avgScore >= 63) return 'D';
  if (avgScore >= 60) return 'D-';
  return 'F';
}

function formatLastSeen(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return 'Never';
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  const diffWeeks = Math.floor(diffDays / 7);
  if (diffWeeks === 1) return '1 week ago';
  if (diffWeeks < 5) return `${diffWeeks} weeks ago`;
  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths === 1) return '1 month ago';
  return `${diffMonths} months ago`;
}

export default function TeacherProgress() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<StudentProgressRow[]>([]);
  const [search, setSearch] = useState('');
  const [coursesCount, setCoursesCount] = useState(0);
  const [quizzesCount, setQuizzesCount] = useState(0);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user?.id) return;
        const teacherId = session.user.id;

        const progressRes = await authFetch(`/api/teacher/progress?userId=${encodeURIComponent(teacherId)}`);
        const progressJson = await progressRes.json().catch(() => ({}));
        if (!progressRes.ok || !progressJson?.success) {
          throw new Error(progressJson?.error || 'Failed to load student progress');
        }
        setRows(Array.isArray(progressJson.rows) ? progressJson.rows : []);
        setCoursesCount(Number(progressJson.coursesCount || 0));
        setQuizzesCount(Number(progressJson.quizzesCount || 0));
      } catch (error: unknown) {
        toast.error((error as Error)?.message || 'Failed to load student progress');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) =>
      r.studentName.toLowerCase().includes(q) ||
      r.studentEmail.toLowerCase().includes(q),
    );
  }, [rows, search]);

  const overall = useMemo(() => ({
    students: rows.length,
    attempts: rows.reduce((acc, r) => acc + r.attempts, 0),
    avgScore: rows.filter((r) => r.attempts > 0).length > 0
      ? Math.round(rows.filter((r) => r.attempts > 0).reduce((acc, r) => acc + r.avgScore, 0) / rows.filter((r) => r.attempts > 0).length)
      : 0,
    passRate: rows.filter((r) => r.attempts > 0).length > 0
      ? Math.round(rows.filter((r) => r.attempts > 0).reduce((acc, r) => acc + r.passRate, 0) / rows.filter((r) => r.attempts > 0).length)
      : 0,
  }), [rows]);

  const statItems = [
    { label: 'Students',    value: overall.students,  gradient: 'from-indigo-500 to-violet-600', shadow: 'shadow-indigo-500/25', icon: Users },
    { label: 'Attempts',    value: overall.attempts,  gradient: 'from-blue-500 to-cyan-600',     shadow: 'shadow-blue-500/25',   icon: FileText },
    { label: 'Avg score %', value: overall.avgScore,  gradient: 'from-emerald-500 to-teal-600',  shadow: 'shadow-emerald-500/25',icon: TrendingUp },
    { label: 'Pass rate %', value: overall.passRate,  gradient: 'from-amber-500 to-orange-600',  shadow: 'shadow-amber-500/25',  icon: CheckCircle2 },
    { label: 'Courses',     value: coursesCount,       gradient: 'from-violet-500 to-purple-600', shadow: 'shadow-violet-500/25', icon: BookOpen },
    { label: 'Quizzes',     value: quizzesCount,       gradient: 'from-sky-500 to-indigo-600',    shadow: 'shadow-sky-500/25',    icon: BarChart3 },
  ];

  return (
    <TeacherLayout>
      <AdminListPageShell
        breadcrumbPortalLabel="Teacher Portal"
        breadcrumbLabel="Progress"
        title="Student Progress"
        description="Performance overview across your students and quizzes linked to your courses."
        statsGridClassName="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4"
        stats={statItems.map((s) => ({
          label: s.label,
          value: s.value,
          gradient: s.gradient,
          shadow: s.shadow,
          icon: s.icon,
        }))}
        filterBar={
          <AdminListFilterBar>
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-indigo-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search students by name or email..."
                className={ADMIN_LIST_SEARCH_INPUT}
              />
            </div>
          </AdminListFilterBar>
        }
      >
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          {loading ? (
            <div className={ADMIN_LIST_CARD_GRID}>
              {Array(6).fill(0).map((_, i) => (
                <div key={i} className="h-48 rounded-2xl bg-slate-100 animate-pulse" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-2 text-slate-400">
              <BarChart3 className="w-10 h-10 opacity-30" />
              <p className="text-sm font-medium">No progress data found</p>
              <p className="text-xs text-slate-400 max-w-sm text-center">
                {coursesCount === 0
                  ? 'Add courses and quizzes to see student attempts here.'
                  : 'No quiz attempts yet for students assigned to you.'}
              </p>
            </div>
          ) : (
            <>
              <div className={ADMIN_LIST_CARD_GRID}>
                {filtered.map((row) => {
                  const status = getStatus(row.avgScore, row.attempts);
                  const sc = STATUS_CFG[status];
                  const grade = getGrade(row.avgScore, row.attempts);
                  const lastSeen = formatLastSeen(row.lastAttemptDate);
                  const progressPct = row.attempts > 0 ? row.passRate : 0;

                  return (
                    <div
                      key={row.studentId}
                      className={ADMIN_LIST_ITEM_CARD}
                      style={{ borderLeftWidth: '4px', borderLeftColor: sc.border }}
                    >
                      {/* Header: avatar + name + status badge */}
                      <div className="flex items-start gap-3">
                        <GenderAvatar name={row.studentName} size="md" />
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-slate-900 text-sm leading-tight">{row.studentName}</p>
                          <span className={cn(
                            'inline-flex items-center gap-1.5 mt-1.5 px-2 py-0.5 rounded-full text-xs font-semibold',
                            sc.bg, sc.text,
                          )}>
                            <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', sc.dot)} />
                            {sc.label}
                          </span>
                        </div>
                      </div>

                      {/* Course + progress bar */}
                      <div className="mt-4">
                        <div className="flex justify-between items-center mb-1.5">
                          <span className="text-xs text-slate-500 truncate max-w-[70%]">
                            {row.topCourseName || (row.attempts > 0 ? 'Quiz attempts' : 'No activity')}
                          </span>
                          <span className="text-xs font-semibold text-slate-700 shrink-0">{progressPct}%</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-slate-200 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-slate-800 transition-all"
                            style={{ width: `${progressPct}%` }}
                          />
                        </div>
                      </div>

                      {/* Bottom: Grade + Last Seen + Details */}
                      <div className="flex items-center gap-4 mt-4 pt-3 border-t border-slate-100">
                        <div className="shrink-0">
                          <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Grade</div>
                          <div className="text-sm font-bold text-slate-800 mt-0.5">{grade}</div>
                        </div>
                        <div className="shrink-0">
                          <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Last Seen</div>
                          <div className="text-xs font-medium text-slate-600 mt-0.5">{lastSeen}</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => navigate(`/teacher/results?student=${encodeURIComponent(row.studentName)}`)}
                          className="ml-auto shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold text-violet-600 hover:bg-violet-50 hover:text-violet-700 border border-violet-200 transition-colors"
                        >
                          Details
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="px-5 py-3 border-t border-slate-100 text-xs text-slate-400">
                Showing {filtered.length} of {rows.length} students
              </div>
            </>
          )}
        </div>
      </AdminListPageShell>
    </TeacherLayout>
  );
}
