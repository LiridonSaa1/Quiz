import React, { useEffect, useMemo, useState } from 'react';
import TeacherLayout from '../../components/layout/TeacherLayout';
import { supabase } from '../../supabase';
import { toast } from 'sonner';
import { BarChart3, Search, Users, BookOpen, FileText, TrendingUp, CheckCircle2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import { LayoutPageSkeleton } from '../../components/ui/Skeleton';
import { fetchAttemptRowsByQuizIds, normalizeAttempts } from '../../lib/quizAttempts';

interface StudentProgressRow {
  studentId: string;
  studentName: string;
  studentEmail: string;
  attempts: number;
  passed: number;
  passRate: number;
  avgScore: number;
}

export default function TeacherProgress() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<StudentProgressRow[]>([]);
  const [search, setSearch] = useState('');
  const [coursesCount, setCoursesCount] = useState(0);
  const [quizzesCount, setQuizzesCount] = useState(0);

  const isMissingTeacherIdColumn = (error: any) => {
    const haystack = `${error?.message || ''} ${error?.details || ''}`.toLowerCase();
    return error?.code === 'PGRST204' && haystack.includes('teacher_id');
  };

  const getPassingScore = (quizRow: any) => {
    const raw = quizRow?.settings?.passingScore ?? quizRow?.passing_score ?? quizRow?.pass_mark ?? quizRow?.passMark;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : 50;
  };

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        const teacherId = session.user.id;

        const [studentsRes, coursesRes] = await Promise.all([
          supabase.from('profiles').select('id,display_name,email').eq('role', 'student').eq('teacher_id', teacherId),
          supabase.from('courses').select('id').eq('teacher_id', teacherId),
        ]);

        if (studentsRes.error) throw studentsRes.error;
        if (coursesRes.error) throw coursesRes.error;

        setCoursesCount((coursesRes.data || []).length);
        const teacherCourseIds = (coursesRes.data || []).map((course: any) => course.id);

        const quizzesByTeacherRes = await supabase
          .from('quizzes')
          .select('*')
          .eq('teacher_id', teacherId);

        let quizRows: any[] = [];
        if (!quizzesByTeacherRes.error) {
          quizRows = quizzesByTeacherRes.data || [];
        } else if (isMissingTeacherIdColumn(quizzesByTeacherRes.error)) {
          if (teacherCourseIds.length > 0) {
            const quizzesByCourseRes = await supabase
              .from('quizzes')
              .select('*')
              .in('course_id', teacherCourseIds);
            if (quizzesByCourseRes.error) throw quizzesByCourseRes.error;
            quizRows = quizzesByCourseRes.data || [];
          }
        } else {
          throw quizzesByTeacherRes.error;
        }

        setQuizzesCount(quizRows.length);

        const quizIds = quizRows.map((q: any) => q.id);
        const passingScoreByQuiz = quizRows.reduce((acc: Record<string, number>, q: any) => {
          const value = getPassingScore(q);
          acc[q.id] = Number.isFinite(value) ? value : 50;
          return acc;
        }, {});

        const attemptsRows = await fetchAttemptRowsByQuizIds(supabase, quizIds);
        const attempts = normalizeAttempts(attemptsRows, passingScoreByQuiz);

        const studentMap: Record<string, { id: string; display_name: string; email: string }> = {};
        (studentsRes.data || []).forEach((student: any) => {
          studentMap[student.id] = student;
        });

        const missingStudentIds = [...new Set(attempts.map((a) => a.student_id).filter((sid) => sid && !studentMap[sid]))];
        if (missingStudentIds.length > 0) {
          const extraStudentsRes = await supabase
            .from('profiles')
            .select('id,display_name,email')
            .in('id', missingStudentIds);
          if (!extraStudentsRes.error) {
            (extraStudentsRes.data || []).forEach((student: any) => {
              studentMap[student.id] = student;
            });
          }
        }

        const attemptsByStudent: Record<string, { attempts: number; passed: number; scoreSum: number }> = {};
        attempts.forEach((a) => {
          const sid = a.student_id;
          if (!attemptsByStudent[sid]) attemptsByStudent[sid] = { attempts: 0, passed: 0, scoreSum: 0 };
          attemptsByStudent[sid].attempts += 1;
          if (a.passed) attemptsByStudent[sid].passed += 1;
          attemptsByStudent[sid].scoreSum += a.score_percent;
        });

        const mapped = Object.values(studentMap).map((s: any) => {
          const aggr = attemptsByStudent[s.id] || { attempts: 0, passed: 0, scoreSum: 0 };
          const avgScore = aggr.attempts > 0 ? Math.round(aggr.scoreSum / aggr.attempts) : 0;
          const passRate = aggr.attempts > 0 ? Math.round((aggr.passed / aggr.attempts) * 100) : 0;
          return {
            studentId: s.id,
            studentName: s.display_name || 'Unknown Student',
            studentEmail: s.email || '',
            attempts: aggr.attempts,
            passed: aggr.passed,
            passRate,
            avgScore,
          };
        });

        setRows(mapped);
      } catch (error: any) {
        toast.error(error?.message || 'Failed to load student progress');
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

  const overall = {
    students: rows.length,
    attempts: rows.reduce((acc, r) => acc + r.attempts, 0),
    avgScore: rows.filter((r) => r.attempts > 0).length > 0
      ? Math.round(rows.filter((r) => r.attempts > 0).reduce((acc, r) => acc + r.avgScore, 0) / rows.filter((r) => r.attempts > 0).length)
      : 0,
    passRate: rows.filter((r) => r.attempts > 0).length > 0
      ? Math.round(rows.filter((r) => r.attempts > 0).reduce((acc, r) => acc + r.passRate, 0) / rows.filter((r) => r.attempts > 0).length)
      : 0,
  };

  if (loading) {
    return (
      <TeacherLayout>
        <LayoutPageSkeleton cards={4} rows={7} />
      </TeacherLayout>
    );
  }

  return (
    <TeacherLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Student Progress</h1>
          <p className="text-slate-500 text-sm mt-1">Performance overview across your students and quizzes.</p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Students" value={overall.students} icon={Users} color="text-violet-600" bg="bg-violet-50" />
          <StatCard label="Attempts" value={overall.attempts} icon={FileText} color="text-blue-600" bg="bg-blue-50" />
          <StatCard label="Avg Score" value={overall.avgScore} suffix="%" icon={TrendingUp} color="text-emerald-600" bg="bg-emerald-50" />
          <StatCard label="Pass Rate" value={overall.passRate} suffix="%" icon={CheckCircle2} color="text-amber-600" bg="bg-amber-50" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
            <div className="flex items-center gap-2 text-slate-500 text-sm font-medium">
              <BookOpen className="w-4 h-4 text-violet-500" />
              Courses
            </div>
            <div className="text-2xl font-bold text-slate-900 mt-1">{coursesCount}</div>
          </div>
          <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
            <div className="flex items-center gap-2 text-slate-500 text-sm font-medium">
              <BarChart3 className="w-4 h-4 text-blue-500" />
              Quizzes
            </div>
            <div className="text-2xl font-bold text-slate-900 mt-1">{quizzesCount}</div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search students..."
              className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30"
            />
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          {filtered.length === 0 ? (
            <div className="py-20 text-center text-slate-400">
              <BarChart3 className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p className="font-medium">No progress data found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 text-xs font-bold uppercase tracking-wider">
                    <th className="px-5 py-3.5">Student</th>
                    <th className="px-5 py-3.5">Attempts</th>
                    <th className="px-5 py-3.5">Passed</th>
                    <th className="px-5 py-3.5">Avg Score</th>
                    <th className="px-5 py-3.5">Pass Rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filtered.map((row) => (
                    <tr key={row.studentId} className="hover:bg-slate-50/60 transition-colors">
                      <td className="px-5 py-4">
                        <div className="font-semibold text-slate-800">{row.studentName}</div>
                        <div className="text-xs text-slate-400 mt-0.5">{row.studentEmail}</div>
                      </td>
                      <td className="px-5 py-4 text-slate-700">{row.attempts}</td>
                      <td className="px-5 py-4 text-slate-700">{row.passed}</td>
                      <td className="px-5 py-4">
                        <span className={cn('font-semibold', row.avgScore >= 70 ? 'text-emerald-600' : row.avgScore >= 50 ? 'text-amber-600' : 'text-rose-600')}>
                          {row.avgScore}%
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          <div className="w-24 h-2 rounded-full bg-slate-100 overflow-hidden">
                            <div
                              className={cn('h-full rounded-full', row.passRate >= 70 ? 'bg-emerald-500' : row.passRate >= 50 ? 'bg-amber-500' : 'bg-rose-500')}
                              style={{ width: `${row.passRate}%` }}
                            />
                          </div>
                          <span className="text-xs font-semibold text-slate-600">{row.passRate}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </TeacherLayout>
  );
}

function StatCard({
  label,
  value,
  suffix,
  icon: Icon,
  color,
  bg,
}: {
  label: string;
  value: number;
  suffix?: string;
  icon: React.ElementType;
  color: string;
  bg: string;
}) {
  return (
    <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <div className={cn('p-2 rounded-xl', bg)}>
          <Icon className={cn('w-4 h-4', color)} />
        </div>
      </div>
      <div className={cn('text-2xl font-bold', color)}>
        {value}
        {suffix || ''}
      </div>
      <div className="text-xs text-slate-500 font-medium mt-0.5">{label}</div>
    </div>
  );
}
