import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import TeacherLayout from '../../components/layout/TeacherLayout';
import { supabase } from '../../supabase';
import { toast } from 'sonner';
import { authFetch } from '../../lib/apiUrl';
import { cn } from '../../lib/utils';
import GenderAvatar from '../../components/ui/GenderAvatar';
import {
  ArrowLeft, BookOpen, BarChart3, CheckCircle2, XCircle,
  Clock, TrendingUp, Trophy, User, Calendar, Loader2,
  Activity, FileText, Target,
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Cell,
} from 'recharts';
import { format, formatDistanceToNow } from 'date-fns';

interface StudentDetail {
  id: string;
  displayName: string;
  email: string;
  status: string;
  createdAt: string | null;
  teacherId: string | null;
  enrolledCourses: Array<{ id: string; title: string; role: string }>;
  attempts: number;
  passed: number;
  failed: number;
  avgScore: number;
  passRate: number;
  lastAttemptDate: string | null;
  quizHistory: Array<{
    quizId: string;
    quizTitle: string;
    score: number;
    passed: boolean;
    completedAt: string | null;
  }>;
  weeklyActivity: Array<{ day: string; attempts: number; avgScore: number }>;
}

function StatCard({
  icon: Icon, label, value, sub, color,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
  color: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex items-center gap-4">
      <div className={cn('w-11 h-11 rounded-xl flex items-center justify-center shrink-0', color)}>
        <Icon className="w-5 h-5 text-white" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-slate-500 font-medium">{label}</p>
        <p className="text-xl font-extrabold text-slate-900 leading-tight">{value}</p>
        {sub && <p className="text-xs text-slate-400 truncate">{sub}</p>}
      </div>
    </div>
  );
}

const STATUS_CFG: Record<string, { bg: string; text: string; dot: string }> = {
  active:   { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  inactive: { bg: 'bg-slate-100',  text: 'text-slate-600',   dot: 'bg-slate-400'   },
  banned:   { bg: 'bg-red-50',     text: 'text-red-700',     dot: 'bg-red-500'     },
};

function getGrade(avgScore: number, attempts: number): string {
  if (attempts === 0) return '—';
  if (avgScore >= 93) return 'A';
  if (avgScore >= 90) return 'A-';
  if (avgScore >= 87) return 'B+';
  if (avgScore >= 83) return 'B';
  if (avgScore >= 80) return 'B-';
  if (avgScore >= 77) return 'C+';
  if (avgScore >= 73) return 'C';
  if (avgScore >= 70) return 'C-';
  if (avgScore >= 60) return 'D';
  return 'F';
}

export default function StudentProgressDetail() {
  const { studentId } = useParams<{ studentId: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [student, setStudent] = useState<StudentDetail | null>(null);

  useEffect(() => {
    const load = async () => {
      if (!studentId) return;
      setLoading(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user?.id) return;
        const res = await authFetch(
          `/api/teacher/students/${encodeURIComponent(studentId)}/detail?userId=${encodeURIComponent(session.user.id)}`
        );
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json?.success) throw new Error(json?.error || 'Failed to load student details');
        setStudent(json.student);
      } catch (e: any) {
        toast.error(e?.message || 'Failed to load student details');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [studentId]);

  if (loading) {
    return (
      <TeacherLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="w-8 h-8 text-violet-500 animate-spin" />
        </div>
      </TeacherLayout>
    );
  }

  if (!student) {
    return (
      <TeacherLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-slate-400">
          <User className="w-12 h-12 opacity-30" />
          <p className="font-semibold">Student not found</p>
          <button onClick={() => navigate('/teacher/progress')}
            className="text-sm text-violet-600 hover:underline">
            ← Back to Progress
          </button>
        </div>
      </TeacherLayout>
    );
  }

  const sc = STATUS_CFG[student.status] || STATUS_CFG.inactive;
  const grade = getGrade(student.avgScore, student.attempts);
  const joinedDate = student.createdAt ? format(new Date(student.createdAt), 'MMM d, yyyy') : '—';
  const lastSeen = student.lastAttemptDate
    ? formatDistanceToNow(new Date(student.lastAttemptDate), { addSuffix: true })
    : 'Never';

  const hasActivity = student.attempts > 0;
  const scoreColor = (s: number) =>
    s >= 80 ? '#10b981' : s >= 60 ? '#3b82f6' : s >= 40 ? '#f59e0b' : '#ef4444';

  return (
    <TeacherLayout>
      <div className="max-w-4xl mx-auto space-y-6">

        {/* Back + Header */}
        <div>
          <button
            onClick={() => navigate('/teacher/progress')}
            className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-violet-600 transition-colors mb-4"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Progress
          </button>

          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 flex flex-col sm:flex-row items-start sm:items-center gap-5">
            <GenderAvatar name={student.displayName} size="xl" />
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-2xl font-extrabold text-slate-900 leading-tight">
                  {student.displayName}
                </h1>
                <span className={cn(
                  'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold',
                  sc.bg, sc.text,
                )}>
                  <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', sc.dot)} />
                  {student.status.charAt(0).toUpperCase() + student.status.slice(1)}
                </span>
              </div>
              <p className="text-sm text-slate-500 mt-1">{student.email}</p>
              <div className="flex flex-wrap gap-4 mt-3 text-xs text-slate-400">
                <span className="flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5" />
                  Joined {joinedDate}
                </span>
                <span className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" />
                  Last active: {lastSeen}
                </span>
                <span className="flex items-center gap-1.5">
                  <BookOpen className="w-3.5 h-3.5" />
                  {student.enrolledCourses.length} course{student.enrolledCourses.length !== 1 ? 's' : ''} enrolled
                </span>
              </div>
            </div>
            <div className="shrink-0 text-center bg-slate-50 rounded-2xl px-6 py-4 border border-slate-100">
              <div className="text-3xl font-black text-slate-800">{grade}</div>
              <div className="text-xs font-semibold text-slate-400 mt-0.5 uppercase tracking-widest">Grade</div>
            </div>
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard icon={FileText}    label="Total Attempts"  value={student.attempts}  color="bg-indigo-500" />
          <StatCard icon={CheckCircle2} label="Passed"         value={student.passed}    color="bg-emerald-500" />
          <StatCard icon={TrendingUp}   label="Avg Score"      value={hasActivity ? `${student.avgScore}%` : '—'} color="bg-violet-500" />
          <StatCard icon={Trophy}       label="Pass Rate"      value={hasActivity ? `${student.passRate}%` : '—'} color="bg-amber-500" />
        </div>

        {/* Enrolled Courses */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-blue-50 flex items-center justify-center">
              <BookOpen className="w-4 h-4 text-blue-600" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">Enrolled Courses</h2>
              <p className="text-xs text-slate-500">Courses this student is enrolled in</p>
            </div>
          </div>
          <div className="p-6">
            {student.enrolledCourses.length === 0 ? (
              <div className="text-center py-8">
                <BookOpen className="w-10 h-10 text-slate-200 mx-auto mb-2" />
                <p className="text-sm text-slate-400 font-medium">Not enrolled in any courses yet</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {student.enrolledCourses.map((c) => (
                  <div key={c.id} className="flex items-center gap-3 p-3.5 rounded-xl border border-slate-100 bg-slate-50/50 hover:bg-slate-50 transition-colors">
                    <div className="w-9 h-9 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
                      <BookOpen className="w-4 h-4 text-blue-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800 truncate">{c.title}</p>
                      <p className="text-xs text-slate-400 capitalize">{c.role}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Weekly Activity Chart */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-violet-50 flex items-center justify-center">
              <Activity className="w-4 h-4 text-violet-600" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">Weekly Activity</h2>
              <p className="text-xs text-slate-500">Quiz attempts over the last 7 days</p>
            </div>
          </div>
          <div className="p-6">
            {!hasActivity ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2 text-slate-300">
                <BarChart3 className="w-10 h-10" />
                <p className="text-sm font-medium text-slate-400">No quiz activity yet</p>
                <p className="text-xs text-slate-300 text-center max-w-xs">
                  Charts will appear once this student starts taking quizzes.
                </p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={student.weeklyActivity} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
                  <defs>
                    <linearGradient id="scoreGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)', fontSize: 12 }}
                  />
                  <Area type="monotone" dataKey="avgScore" name="Avg Score %" stroke="#8b5cf6" strokeWidth={2} fill="url(#scoreGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Score per Quiz */}
        {student.quizHistory.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-emerald-50 flex items-center justify-center">
                <Target className="w-4 h-4 text-emerald-600" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-900">Score by Quiz</h2>
                <p className="text-xs text-slate-500">Last {Math.min(student.quizHistory.length, 8)} quiz results</p>
              </div>
            </div>
            <div className="p-6">
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={student.quizHistory.slice(0, 8)} margin={{ top: 5, right: 5, bottom: 30, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="quizTitle" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} angle={-25} textAnchor="end" interval={0} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)', fontSize: 12 }}
                    formatter={(v: any) => [`${v}%`, 'Score']}
                  />
                  <Bar dataKey="score" name="Score %" radius={[6, 6, 0, 0]}>
                    {student.quizHistory.slice(0, 8).map((q, i) => (
                      <Cell key={i} fill={scoreColor(q.score)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Quiz Attempt History */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center">
              <BarChart3 className="w-4 h-4 text-slate-500" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">Quiz Attempt History</h2>
              <p className="text-xs text-slate-500">{student.quizHistory.length} attempt{student.quizHistory.length !== 1 ? 's' : ''} recorded</p>
            </div>
          </div>
          {student.quizHistory.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 gap-2 text-slate-300">
              <BarChart3 className="w-10 h-10" />
              <p className="text-sm font-medium text-slate-400">No quiz attempts yet</p>
              <p className="text-xs text-slate-300 text-center max-w-xs">
                This student hasn't taken any quizzes linked to your courses.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-50">
              {student.quizHistory.map((q, i) => (
                <div key={i} className="px-6 py-3.5 flex items-center gap-4 hover:bg-slate-50/50 transition-colors">
                  <div className={cn(
                    'w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-xs font-bold text-white',
                    q.passed ? 'bg-emerald-500' : 'bg-rose-500'
                  )}>
                    {q.passed ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">{q.quizTitle}</p>
                    <p className="text-xs text-slate-400">
                      {q.completedAt ? format(new Date(q.completedAt), 'MMM d, yyyy · h:mm a') : 'Unknown date'}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className={cn('text-sm font-extrabold', q.passed ? 'text-emerald-600' : 'text-rose-500')}>
                      {q.score}%
                    </div>
                    <div className={cn('text-xs font-medium', q.passed ? 'text-emerald-500' : 'text-rose-400')}>
                      {q.passed ? 'Passed' : 'Failed'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </TeacherLayout>
  );
}
