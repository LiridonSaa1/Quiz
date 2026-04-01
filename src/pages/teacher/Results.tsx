import React, { useEffect, useState } from 'react';
import { supabase } from '../../supabase';
import TeacherLayout from '../../components/layout/TeacherLayout';
import { 
  BarChart3, 
  Search, 
  Download, 
  Filter, 
  ChevronRight, 
  CheckCircle2, 
  XCircle, 
  TrendingUp,
  Users,
  FileText
} from 'lucide-react';
import { toast } from 'sonner';
import { QuizAttempt, Quiz, UserProfile } from '../../types';
import { cn } from '../../lib/utils';

export default function TeacherResults() {
  const [attempts, setAttempts] = useState<any[]>([]);
  const [quizzes, setQuizzes] = useState<Record<string, string>>({});
  const [students, setStudents] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    try {
      const [attemptsSnap, quizzesSnap, studentsSnap] = await Promise.all([
        supabase.from('attempts').select('*').eq('teacher_id', session.user.id),
        supabase.from('quizzes').select('id, title').eq('teacher_id', session.user.id),
        supabase.from('profiles').select('id, display_name').eq('teacher_id', session.user.id)
      ]);

      if (attemptsSnap.error) throw attemptsSnap.error;
      if (quizzesSnap.error) throw quizzesSnap.error;
      if (studentsSnap.error) throw studentsSnap.error;

      const quizzesMap: Record<string, string> = {};
      quizzesSnap.data.forEach(d => quizzesMap[d.id] = d.title);
      setQuizzes(quizzesMap);

      const studentsMap: Record<string, string> = {};
      studentsSnap.data.forEach(d => studentsMap[d.id] = d.display_name);
      setStudents(studentsMap);

      setAttempts(attemptsSnap.data.map(d => ({
        id: d.id,
        quizId: d.quiz_id,
        studentId: d.student_id,
        teacherId: d.teacher_id,
        score: d.score,
        totalPoints: d.total_points,
        passed: d.passed,
        startedAt: d.started_at,
        completedAt: d.completed_at,
        answers: d.answers,
        createdAt: d.created_at
      })));
    } catch (error) {
      toast.error('Failed to fetch results');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const stats = {
    totalAttempts: attempts.length,
    avgScore: attempts.length > 0 
      ? Math.round(attempts.reduce((acc, curr) => acc + (curr.score / curr.totalPoints * 100), 0) / attempts.length)
      : 0,
    passRate: attempts.length > 0
      ? Math.round((attempts.filter(a => a.passed).length / attempts.length) * 100)
      : 0
  };

  return (
    <TeacherLayout>
      <div className="space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Results & Analytics</h1>
            <p className="text-slate-500 mt-2">Track student performance and quiz success rates.</p>
          </div>
          <button className="inline-flex items-center gap-2 bg-white border border-slate-200 text-slate-600 px-6 py-3 rounded-xl font-semibold hover:bg-slate-50 transition-all shadow-sm">
            <Download className="w-5 h-5" />
            Export Report
          </button>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                <FileText className="w-5 h-5" />
              </div>
              <span className="text-slate-500 text-sm font-medium">Total Attempts</span>
            </div>
            <div className="text-3xl font-bold text-slate-900">{stats.totalAttempts}</div>
          </div>
          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-green-50 text-green-600 rounded-lg">
                <TrendingUp className="w-5 h-5" />
              </div>
              <span className="text-slate-500 text-sm font-medium">Average Score</span>
            </div>
            <div className="text-3xl font-bold text-slate-900">{stats.avgScore}%</div>
          </div>
          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-purple-50 text-purple-600 rounded-lg">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <span className="text-slate-500 text-sm font-medium">Pass Rate</span>
            </div>
            <div className="text-3xl font-bold text-slate-900">{stats.passRate}%</div>
          </div>
        </div>

        {/* Results Table */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex flex-col sm:flex-row gap-4 justify-between bg-slate-50/50">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type="text"
                placeholder="Search by student or quiz..."
                className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>
            <div className="flex gap-2">
              <button className="p-2 bg-white border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 transition-all">
                <Filter className="w-5 h-5" />
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50 text-slate-500 text-sm font-semibold">
                  <th className="px-6 py-4">Student</th>
                  <th className="px-6 py-4">Quiz</th>
                  <th className="px-6 py-4">Score</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Date</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  Array(5).fill(0).map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      <td colSpan={6} className="px-6 py-4 h-16 bg-slate-50/50" />
                    </tr>
                  ))
                ) : attempts.length > 0 ? (
                  attempts.map((attempt) => (
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
                              style={{ width: `${(attempt.score / attempt.totalPoints) * 100}%` }}
                            />
                          </div>
                          <span className="text-sm font-bold text-slate-900">
                            {Math.round((attempt.score / attempt.totalPoints) * 100)}%
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
                        {new Date(attempt.completedAt).toLocaleDateString()}
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
                      <BarChart3 className="w-16 h-16 text-slate-200 mx-auto mb-4" />
                      <h3 className="text-lg font-bold text-slate-900">No results yet</h3>
                      <p className="text-slate-500">When students complete quizzes, their results will appear here.</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </TeacherLayout>
  );
}
