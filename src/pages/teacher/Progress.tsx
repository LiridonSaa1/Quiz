import React, { useEffect, useMemo, useState } from 'react';
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

interface StudentProgressRow {
  studentId: string;
  studentName: string;
  studentEmail: string;
  attempts: number;
  passed: number;
  passRate: number;
  avgScore: number;
}

const AVATAR_COLORS = [
  'from-sky-500 to-blue-600',
  'from-violet-500 to-purple-600',
  'from-emerald-500 to-teal-600',
  'from-amber-500 to-orange-600',
  'from-rose-500 to-pink-600',
  'from-indigo-500 to-blue-600',
];
const getAvatarColor = (str: string) => {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
};

export default function TeacherProgress() {
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
    { label: 'Students', value: overall.students, gradient: 'from-indigo-500 to-violet-600', shadow: 'shadow-indigo-500/25', icon: Users },
    { label: 'Attempts', value: overall.attempts, gradient: 'from-blue-500 to-cyan-600', shadow: 'shadow-blue-500/25', icon: FileText },
    { label: 'Avg score %', value: overall.avgScore, gradient: 'from-emerald-500 to-teal-600', shadow: 'shadow-emerald-500/25', icon: TrendingUp },
    { label: 'Pass rate %', value: overall.passRate, gradient: 'from-amber-500 to-orange-600', shadow: 'shadow-amber-500/25', icon: CheckCircle2 },
    { label: 'Courses', value: coursesCount, gradient: 'from-violet-500 to-purple-600', shadow: 'shadow-violet-500/25', icon: BookOpen },
    { label: 'Quizzes', value: quizzesCount, gradient: 'from-sky-500 to-indigo-600', shadow: 'shadow-sky-500/25', icon: BarChart3 },
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
                  return (
                    <div key={row.studentId} className={ADMIN_LIST_ITEM_CARD} style={{ borderLeftWidth: '4px', borderLeftColor: row.avgScore >= 70 ? '#10b981' : row.avgScore >= 50 ? '#f59e0b' : '#f43f5e' }}>
                      <div className="flex items-start gap-3">
                        <GenderAvatar name={row.studentName} />
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-slate-900 text-sm">{row.studentName}</p>
                          <p className="text-xs text-slate-400 truncate">{row.studentEmail}</p>
                        </div>
                      </div>
                      <div className="mt-4 space-y-2 text-xs text-slate-600 border-t border-slate-100 pt-3">
                        <div className="flex justify-between gap-2">
                          <span className="text-slate-400 font-semibold uppercase tracking-wider">Attempts</span>
                          <span className="font-medium text-slate-800">{row.attempts}</span>
                        </div>
                        <div className="flex justify-between gap-2">
                          <span className="text-slate-400 font-semibold uppercase tracking-wider">Passed</span>
                          <span className="font-medium text-slate-800">{row.passed}</span>
                        </div>
                        <div className="flex justify-between gap-2 items-center">
                          <span className="text-slate-400 font-semibold uppercase tracking-wider">Avg score</span>
                          <span
                            className={cn(
                              'font-bold',
                              row.avgScore >= 70 ? 'text-emerald-600' : row.avgScore >= 50 ? 'text-amber-600' : 'text-rose-600',
                            )}
                          >
                            {row.attempts > 0 ? `${row.avgScore}%` : '—'}
                          </span>
                        </div>
                        <div className="flex flex-col gap-1.5 pt-1">
                          <span className="text-slate-400 font-semibold uppercase tracking-wider">Pass rate</span>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                              <div
                                className={cn(
                                  'h-full rounded-full transition-all',
                                  row.passRate >= 70 ? 'bg-emerald-500' : row.passRate >= 50 ? 'bg-amber-500' : 'bg-rose-500',
                                )}
                                style={{ width: `${row.passRate}%` }}
                              />
                            </div>
                            <span className="text-xs font-bold text-slate-700 w-10 text-right">{row.passRate}%</span>
                          </div>
                        </div>
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
