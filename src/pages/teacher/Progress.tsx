import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import TeacherLayout from '../../components/layout/TeacherLayout';
import { supabase } from '../../supabase';
import { toast } from 'sonner';
import GenderAvatar from '../../components/ui/GenderAvatar';
import { motion, AnimatePresence } from 'motion/react';
import {
  BarChart3, Search, Users, BookOpen, FileText, TrendingUp,
  CheckCircle2, ChevronRight, ArrowLeft, GraduationCap, Target,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { authFetch } from '../../lib/apiUrl';
import { useNavigate } from 'react-router-dom';
import {
  AdminListPageShell,
  AdminListFilterBar,
  ADMIN_LIST_SEARCH_INPUT,
} from '../../components/admin/AdminListPageShell';

/* ─── Types ─────────────────────────────────────────────────────────────── */
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
  submissionsCount: number;
  assignmentsTotal: number;
  submissionRate: number;
  avgGrade: number;
}

interface UiClass {
  id: string;
  name: string;
  studentIds: string[];
  description?: string;
}

/* ─── Helpers ────────────────────────────────────────────────────────────── */
type ProgressStatus = 'at_risk' | 'falling_behind' | 'good' | 'excellent';

function getStatus(avgScore: number, attempts: number, submissionRate?: number, submissionsCount?: number): ProgressStatus {
  const hasQuizData = attempts > 0;
  const hasAssignmentData = (submissionsCount ?? 0) > 0;
  if (!hasQuizData && !hasAssignmentData) return 'at_risk';
  const score = hasQuizData ? avgScore : (submissionRate ?? 0);
  if (score < 50) return 'at_risk';
  if (score < 70) return 'falling_behind';
  if (score < 85) return 'good';
  return 'excellent';
}

const STATUS_CFG: Record<ProgressStatus, { label: string; bg: string; text: string; dot: string; border: string }> = {
  at_risk:        { label: 'At Risk',        bg: 'bg-red-50',     text: 'text-red-600',    dot: 'bg-red-500',    border: '#ef4444' },
  falling_behind: { label: 'Falling Behind', bg: 'bg-orange-50',  text: 'text-orange-600', dot: 'bg-orange-400', border: '#f97316' },
  good:           { label: 'Good Standing',  bg: 'bg-emerald-50', text: 'text-emerald-700',dot: 'bg-emerald-500',border: '#10b981' },
  excellent:      { label: 'Excellent',      bg: 'bg-blue-50',    text: 'text-blue-700',   dot: 'bg-blue-500',   border: '#3b82f6' },
};

const CLASS_GRADIENTS = [
  'from-indigo-500 to-violet-600',
  'from-blue-500 to-cyan-600',
  'from-emerald-500 to-teal-600',
  'from-amber-500 to-orange-600',
  'from-rose-500 to-pink-600',
  'from-sky-500 to-indigo-600',
  'from-violet-500 to-purple-600',
  'from-teal-500 to-emerald-600',
];

function getGrade(avgScore: number, attempts: number, avgGrade?: number, submissionsCount?: number): string {
  const score = attempts > 0 ? avgScore : ((submissionsCount ?? 0) > 0 && (avgGrade ?? 0) > 0 ? avgGrade! : -1);
  if (score < 0) return '—';
  if (score >= 97) return 'A+';
  if (score >= 93) return 'A';
  if (score >= 90) return 'A-';
  if (score >= 87) return 'B+';
  if (score >= 83) return 'B';
  if (score >= 80) return 'B-';
  if (score >= 77) return 'C+';
  if (score >= 73) return 'C';
  if (score >= 70) return 'C-';
  if (score >= 67) return 'D+';
  if (score >= 63) return 'D';
  if (score >= 60) return 'D-';
  return 'F';
}

function formatLastSeen(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return 'Never';
  const diffMs = Date.now() - date.getTime();
  const diffDays = Math.floor(diffMs / 86_400_000);
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

/* ─── Class stats computed from student rows ─────────────────────────────── */
function computeClassStats(students: StudentProgressRow[]) {
  const withQuiz = students.filter(s => s.attempts > 0);
  const avgScore = withQuiz.length > 0
    ? Math.round(withQuiz.reduce((a, s) => a + s.avgScore, 0) / withQuiz.length)
    : 0;
  const avgPassRate = withQuiz.length > 0
    ? Math.round(withQuiz.reduce((a, s) => a + s.passRate, 0) / withQuiz.length)
    : 0;
  const statusCounts = students.reduce((acc, s) => {
    const st = getStatus(s.avgScore, s.attempts, s.submissionRate, s.submissionsCount);
    acc[st] = (acc[st] || 0) + 1;
    return acc;
  }, {} as Record<ProgressStatus, number>);
  return { avgScore, avgPassRate, statusCounts, withQuiz: withQuiz.length };
}

/* ─── Student card ───────────────────────────────────────────────────────── */
function StudentCard({ row, onDetails }: { row: StudentProgressRow; onDetails: () => void }) {
  const hasQuiz = row.attempts > 0;
  const hasAssignment = (row.submissionsCount ?? 0) > 0;
  const status = getStatus(row.avgScore, row.attempts, row.submissionRate, row.submissionsCount);
  const sc = STATUS_CFG[status];
  const grade = getGrade(row.avgScore, row.attempts, row.avgGrade, row.submissionsCount);
  const progressPct = hasQuiz ? row.passRate : (hasAssignment ? row.submissionRate : 0);
  const progressLabel = hasQuiz
    ? (row.topCourseName || 'Quiz attempts')
    : hasAssignment
      ? `${row.submissionsCount}/${row.assignmentsTotal || '?'} assignments`
      : 'No activity yet';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex flex-col gap-3 cursor-pointer hover:shadow-md transition-shadow"
      style={{ borderLeftWidth: 4, borderLeftColor: sc.border }}
      onClick={onDetails}
    >
      <div className="flex items-start gap-3">
        <GenderAvatar name={row.studentName} size="md" />
        <div className="min-w-0 flex-1">
          <p className="font-bold text-slate-900 text-sm leading-tight truncate">{row.studentName}</p>
          <p className="text-xs text-slate-400 truncate">{row.studentEmail}</p>
          <span className={cn('inline-flex items-center gap-1.5 mt-1.5 px-2 py-0.5 rounded-full text-xs font-semibold', sc.bg, sc.text)}>
            <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', sc.dot)} />
            {sc.label}
          </span>
        </div>
      </div>

      <div>
        <div className="flex justify-between items-center mb-1">
          <span className="text-xs text-slate-500 truncate max-w-[70%]">{progressLabel}</span>
          <span className="text-xs font-semibold text-slate-700">{progressPct}%</span>
        </div>
        <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
          <div className="h-full rounded-full bg-slate-800 transition-all" style={{ width: `${progressPct}%` }} />
        </div>
      </div>

      <div className="flex items-center gap-3 text-[10px] text-slate-400 flex-wrap">
        {hasQuiz && <span><span className="font-bold text-slate-600">{row.attempts}</span> quiz attempt{row.attempts !== 1 ? 's' : ''}</span>}
        {hasAssignment && <span><span className="font-bold text-emerald-600">{row.submissionsCount}</span> assignment{row.submissionsCount !== 1 ? 's' : ''}</span>}
        {!hasQuiz && !hasAssignment && <span className="italic">No submissions yet</span>}
      </div>

      <div className="flex items-center gap-4 pt-3 border-t border-slate-100">
        <div>
          <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Grade</div>
          <div className="text-sm font-bold text-slate-800 mt-0.5">{grade}</div>
        </div>
        <div>
          <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Last Seen</div>
          <div className="text-xs font-medium text-slate-600 mt-0.5">{formatLastSeen(row.lastAttemptDate)}</div>
        </div>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onDetails(); }}
          className="ml-auto shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold text-violet-600 hover:bg-violet-50 border border-violet-200 transition-colors"
        >
          Details
        </button>
      </div>
    </motion.div>
  );
}

/* ─── Main component ─────────────────────────────────────────────────────── */
export default function TeacherProgress() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<StudentProgressRow[]>([]);
  const [classes, setClasses] = useState<UiClass[]>([]);
  const [search, setSearch] = useState('');
  const [selectedClass, setSelectedClass] = useState<UiClass | null>(null);
  const [coursesCount, setCoursesCount] = useState(0);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user?.id) return;
        const teacherId = session.user.id;

        const [progressRes, classesRes] = await Promise.all([
          authFetch(`/api/teacher/progress?userId=${encodeURIComponent(teacherId)}`),
          authFetch('/api/teacher/classes'),
        ]);

        const progressJson = await progressRes.json().catch(() => ({}));
        if (!progressRes.ok || !progressJson?.success) {
          throw new Error(progressJson?.error || 'Failed to load student progress');
        }
        setRows(Array.isArray(progressJson.rows) ? progressJson.rows : []);
        setCoursesCount(Number(progressJson.coursesCount || 0));

        const classesJson = await classesRes.json().catch(() => ({}));
        setClasses(
          (classesJson?.classes || []).map((c: any) => ({
            id: String(c.id),
            name: String(c.name || 'Class'),
            studentIds: Array.isArray(c.student_ids) ? c.student_ids.map(String) : [],
            description: c.description || '',
          }))
        );
      } catch (err: any) {
        toast.error(err?.message || 'Failed to load progress');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  /* Build studentId → row lookup */
  const rowById = useMemo(() => {
    const m: Record<string, StudentProgressRow> = {};
    rows.forEach(r => { m[r.studentId] = r; });
    return m;
  }, [rows]);

  /* Students for the selected class */
  const classStudents = useMemo(() => {
    if (!selectedClass) return [];
    if (selectedClass.studentIds.length > 0) {
      // Map known student IDs to their progress rows; include rows for unknowns as skeleton
      return selectedClass.studentIds
        .map(id => rowById[id])
        .filter(Boolean) as StudentProgressRow[];
    }
    // If class has no studentIds stored, fall back to all teacher's students
    return rows;
  }, [selectedClass, rowById, rows]);

  /* Students filtered by search inside class view */
  const filteredClassStudents = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return classStudents;
    return classStudents.filter(s =>
      s.studentName.toLowerCase().includes(q) ||
      s.studentEmail.toLowerCase().includes(q)
    );
  }, [classStudents, search]);

  /* Class cards with computed stats */
  const classCards = useMemo(() =>
    classes.map((cls, i) => {
      const students = cls.studentIds.length > 0
        ? cls.studentIds.map(id => rowById[id]).filter(Boolean) as StudentProgressRow[]
        : rows;
      const stats = computeClassStats(students);
      return { ...cls, stats, gradient: CLASS_GRADIENTS[i % CLASS_GRADIENTS.length], studentCount: students.length };
    }),
  [classes, rowById, rows]);

  const overallAvg = useMemo(() => {
    const withQuiz = rows.filter(r => r.attempts > 0);
    return withQuiz.length > 0
      ? Math.round(withQuiz.reduce((a, r) => a + r.avgScore, 0) / withQuiz.length)
      : 0;
  }, [rows]);

  const classListStats = [
    { label: 'Classes',   value: classes.length, gradient: 'from-indigo-500 to-violet-600', shadow: 'shadow-indigo-500/25',  icon: GraduationCap },
    { label: 'Students',  value: rows.length,    gradient: 'from-blue-500 to-cyan-600',     shadow: 'shadow-blue-500/25',    icon: Users },
    { label: 'Courses',   value: coursesCount,   gradient: 'from-emerald-500 to-teal-600',  shadow: 'shadow-emerald-500/25', icon: BookOpen },
    { label: 'Avg Score', value: overallAvg,     gradient: 'from-amber-500 to-orange-600',  shadow: 'shadow-amber-500/25',   icon: TrendingUp },
  ];

  /* ── Render: class list ── */
  if (!selectedClass) {
    const noClasses = !loading && classCards.length === 0;

    return (
      <TeacherLayout>
        <AdminListPageShell
          breadcrumbPortalLabel="Teacher Portal"
          breadcrumbLabel="Progress"
          title="Student Progress"
          description="Select a class to view student performance and individual details."
          statsGridClassName="grid grid-cols-2 sm:grid-cols-4 gap-4"
          stats={classListStats}
        >
        {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {Array(6).fill(0).map((_, i) => (
                <div key={i} className="h-56 rounded-3xl bg-slate-100 animate-pulse" />
              ))}
            </div>
          ) : noClasses ? (
            <div className="flex flex-col items-center justify-center py-24 text-center bg-white rounded-3xl border border-slate-100 shadow-sm">
              <div className="w-16 h-16 bg-indigo-50 rounded-3xl flex items-center justify-center mb-4">
                <GraduationCap className="w-8 h-8 text-indigo-400" />
              </div>
              <p className="text-slate-700 font-bold">No classes yet</p>
              <p className="text-slate-400 text-sm mt-1 max-w-xs">
                Create a class and add students to start tracking progress by group.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {classCards.map((cls, i) => {
                const { avgScore, avgPassRate, statusCounts, withQuiz } = cls.stats;
                const atRisk = (statusCounts.at_risk || 0) + (statusCounts.falling_behind || 0);

                return (
                  <motion.div
                    key={cls.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.06 }}
                    whileHover={{ y: -4, boxShadow: '0 16px 48px rgba(0,0,0,0.10)' }}
                    onClick={() => { setSearch(''); setSelectedClass(cls); }}
                    className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden cursor-pointer group transition-all"
                  >
                    {/* Gradient header */}
                    <div className={`bg-gradient-to-br ${cls.gradient} p-5 relative overflow-hidden`}>
                      <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-full -translate-y-8 translate-x-8" />
                      <div className="relative z-10">
                        <div className="flex items-center justify-between mb-3">
                          <div className="w-10 h-10 bg-white/20 rounded-2xl flex items-center justify-center">
                            <GraduationCap className="w-5 h-5 text-white" />
                          </div>
                          <ChevronRight className="w-5 h-5 text-white/60 group-hover:text-white transition-colors" />
                        </div>
                        <h2 className="text-white font-black text-lg leading-tight">{cls.name}</h2>
                        {cls.description && (
                          <p className="text-white/70 text-xs mt-1 line-clamp-1">{cls.description}</p>
                        )}
                      </div>
                    </div>

                    {/* Stats */}
                    <div className="p-5 space-y-4">
                      {/* Student count + avg score */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-slate-500 text-sm">
                          <Users className="w-4 h-4" />
                          <span className="font-semibold">{cls.studentCount}</span>
                          <span>student{cls.studentCount !== 1 ? 's' : ''}</span>
                        </div>
                        <div className="text-right">
                          <div className="text-2xl font-black text-slate-900">{avgScore}<span className="text-sm font-semibold text-slate-400">%</span></div>
                          <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide">avg score</div>
                        </div>
                      </div>

                      {/* Pass rate bar */}
                      <div>
                        <div className="flex justify-between text-xs mb-1.5">
                          <span className="text-slate-500 font-medium">Pass rate</span>
                          <span className="font-bold text-slate-700">{avgPassRate}%</span>
                        </div>
                        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                          <motion.div
                            className={`h-full rounded-full bg-gradient-to-r ${cls.gradient}`}
                            initial={{ width: 0 }}
                            animate={{ width: `${avgPassRate}%` }}
                            transition={{ duration: 0.7, delay: i * 0.06 + 0.2 }}
                          />
                        </div>
                      </div>

                      {/* Status pills */}
                      <div className="flex items-center gap-2 flex-wrap">
                        {(statusCounts.excellent || 0) > 0 && (
                          <span className="flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full text-[10px] font-semibold">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                            {statusCounts.excellent} excellent
                          </span>
                        )}
                        {(statusCounts.good || 0) > 0 && (
                          <span className="flex items-center gap-1 px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-full text-[10px] font-semibold">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                            {statusCounts.good} good
                          </span>
                        )}
                        {atRisk > 0 && (
                          <span className="flex items-center gap-1 px-2 py-0.5 bg-red-50 text-red-600 rounded-full text-[10px] font-semibold">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                            {atRisk} needs help
                          </span>
                        )}
                        {withQuiz === 0 && (
                          <span className="text-[10px] text-slate-400 italic">No quiz data yet</span>
                        )}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </AdminListPageShell>
      </TeacherLayout>
    );
  }

  /* ── Render: student list inside a class ── */
  const cls = selectedClass!;
  const clsStats = computeClassStats(classStudents);
  const clsGradient = classCards.find(c => c.id === cls.id)?.gradient || 'from-indigo-500 to-violet-600';

  const classDetailStats = [
    { label: 'Students',  value: classStudents.length, gradient: 'from-blue-500 to-cyan-600',     shadow: 'shadow-blue-500/25',    icon: Users },
    { label: 'Avg Score', value: clsStats.avgScore,    gradient: 'from-emerald-500 to-teal-600',  shadow: 'shadow-emerald-500/25', icon: TrendingUp },
    { label: 'Pass Rate', value: clsStats.avgPassRate, gradient: 'from-amber-500 to-orange-600',  shadow: 'shadow-amber-500/25',   icon: CheckCircle2 },
    { label: 'Courses',   value: coursesCount,         gradient: 'from-indigo-500 to-violet-600', shadow: 'shadow-indigo-500/25',  icon: BookOpen },
  ];

  return (
    <TeacherLayout>
      <AdminListPageShell
        breadcrumbPortalLabel="Teacher Portal"
        breadcrumbLabel="Progress"
        title={cls.name}
        description={cls.description || 'Student performance for this class.'}
        statsGridClassName="grid grid-cols-2 sm:grid-cols-4 gap-4"
        stats={classDetailStats}
        action={
          <button
            type="button"
            onClick={() => { setSelectedClass(null); setSearch(''); }}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl font-semibold text-sm text-slate-600 hover:text-indigo-600 bg-white border border-slate-200 hover:border-indigo-300 shadow-sm transition-all"
          >
            <ArrowLeft className="w-4 h-4" />
            All Classes
          </button>
        }
        filterBar={
          <div className="relative max-w-xs">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-indigo-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search students…"
              className={ADMIN_LIST_SEARCH_INPUT}
            />
          </div>
        }
      >
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array(6).fill(0).map((_, i) => (
              <div key={i} className="h-48 rounded-2xl bg-slate-100 animate-pulse" />
            ))}
          </div>
        ) : filteredClassStudents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center bg-white rounded-3xl border border-slate-100 shadow-sm">
            <Users className="w-10 h-10 text-slate-200 mb-3" />
            <p className="text-slate-600 font-bold">
              {search ? 'No students match your search' : 'No students in this class yet'}
            </p>
            <p className="text-slate-400 text-sm mt-1">
              {search ? 'Try a different name or email' : 'Add students to this class to see their progress here'}
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredClassStudents.map(row => (
                <StudentCard
                  key={row.studentId}
                  row={row}
                  onDetails={() => navigate(`/teacher/progress/${encodeURIComponent(row.studentId)}`)}
                />
              ))}
            </div>
            <p className="text-xs text-slate-400 px-1">
              Showing {filteredClassStudents.length} of {classStudents.length} student{classStudents.length !== 1 ? 's' : ''}
            </p>
          </>
        )}
      </AdminListPageShell>
    </TeacherLayout>
  );
}
