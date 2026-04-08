import React, { useEffect, useState } from 'react';
import { supabase } from '../../supabase';
import StudentLayout from '../../components/layout/StudentLayout';
import { BookOpen, Clock, CheckCircle2, Trophy, ArrowRight, Flame } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Quiz } from '../../types';
import { cn } from '../../lib/utils';
import { fetchAttemptRowsByStudentId, normalizeAttempts } from '../../lib/quizAttempts';

export default function StudentDashboard() {
  const [enrolledCourses, setEnrolledCourses] = useState<any[]>([]);
  const [availableQuizzes, setAvailableQuizzes] = useState<Quiz[]>([]);
  const [recentAttempts, setRecentAttempts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const studentId = session.user.id;
      try {
        let courses: any[] = [];
        let quizzes: Quiz[] = [];
        let attempts: any[] = [];

        const coursesSnap = await supabase
          .from('courses')
          .select('*')
          .contains('student_ids', [studentId]);
        if (!coursesSnap.error) {
          courses = coursesSnap.data || [];
        }
        setEnrolledCourses(courses);

        if (courses.length > 0) {
          const courseIds = courses.map((c: any) => c.id);
          const quizzesSnap = await supabase
            .from('quizzes')
            .select('*')
            .in('course_id', courseIds)
            .eq('published', true);
          if (!quizzesSnap.error) {
            quizzes = (quizzesSnap.data as any) || [];
          }
        }
        setAvailableQuizzes(quizzes);

        const attemptsRows = await fetchAttemptRowsByStudentId(supabase, studentId);
        attempts = normalizeAttempts(attemptsRows).map((a) => ({
          id: a.id,
          quiz_id: a.quiz_id,
          score: a.score,
          total_points: a.total_points,
          score_percent: a.score_percent,
          completed_at: a.completed_at,
        }));
        setRecentAttempts(attempts);
      } catch (error) {
        console.error('Error fetching student data:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const stats = {
    courses: enrolledCourses.length,
    quizzes: availableQuizzes.length,
    completed: recentAttempts.length,
    avgScore: recentAttempts.length > 0
      ? Math.round(recentAttempts.reduce((acc, curr) => acc + curr.score_percent, 0) / recentAttempts.length)
      : 0
  };

  const statCards = [
    { label: 'Enrolled Courses', value: stats.courses, icon: BookOpen, gradient: 'from-indigo-500 to-violet-500', light: 'bg-indigo-50', text: 'text-indigo-600' },
    { label: 'Available Quizzes', value: stats.quizzes, icon: Clock, gradient: 'from-amber-500 to-orange-500', light: 'bg-amber-50', text: 'text-amber-600' },
    { label: 'Completed', value: stats.completed, icon: CheckCircle2, gradient: 'from-emerald-500 to-teal-500', light: 'bg-emerald-50', text: 'text-emerald-600' },
    { label: 'Average Score', value: `${stats.avgScore}%`, icon: Trophy, gradient: 'from-violet-500 to-purple-500', light: 'bg-violet-50', text: 'text-violet-600' },
  ];

  return (
    <StudentLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Student Dashboard</h1>
            <p className="text-slate-500 text-sm mt-1">Welcome back! Ready to learn something new today?</p>
          </div>
          <div className="hidden sm:flex items-center gap-1.5 bg-emerald-50 border border-emerald-100 text-emerald-700 text-xs font-semibold px-3 py-1.5 rounded-xl">
            <Flame className="w-3.5 h-3.5" />
            Keep it up!
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {statCards.map((stat) => (
            <div key={stat.label} className="bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all overflow-hidden">
              <div className={`h-1 bg-gradient-to-r ${stat.gradient}`} />
              <div className="p-5">
                <div className={`p-2.5 ${stat.light} rounded-xl inline-flex mb-4`}>
                  <stat.icon className={`w-5 h-5 ${stat.text}`} />
                </div>
                <div className="text-2xl font-bold text-slate-900">{stat.value}</div>
                <div className="text-slate-500 text-xs mt-0.5 font-medium">{stat.label}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Available Quizzes */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900">Available Quizzes</h2>
              <Link to="/student/quizzes" className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 flex items-center gap-1">
                View all <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {availableQuizzes.length > 0 ? (
                availableQuizzes.slice(0, 4).map((quiz) => (
                  <div key={quiz.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all overflow-hidden group">
                    <div className="h-1 bg-gradient-to-r from-emerald-500 to-teal-500" />
                    <div className="p-5">
                      <div className="flex items-start justify-between mb-3">
                        <div className="p-2.5 bg-emerald-50 rounded-xl group-hover:bg-emerald-100 transition-all">
                          <Clock className="w-4 h-4 text-emerald-600" />
                        </div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50 px-2 py-1 rounded-lg">
                          {quiz.timeLimit} mins
                        </span>
                      </div>
                      <h3 className="text-sm font-bold text-slate-900 mb-1.5 line-clamp-1">{quiz.title}</h3>
                      <p className="text-slate-400 text-xs line-clamp-2 mb-4 leading-relaxed">{quiz.description}</p>
                      <Link
                        to={`/student/quiz/${quiz.id}`}
                        className="inline-flex items-center gap-1.5 bg-emerald-600 text-white text-xs font-semibold px-3.5 py-2 rounded-xl hover:bg-emerald-700 transition-all shadow-sm shadow-emerald-200 active:scale-[0.97]"
                      >
                        Start Quiz <ArrowRight className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                  </div>
                ))
              ) : (
                <div className="col-span-full py-16 text-center bg-white rounded-2xl border border-dashed border-slate-200">
                  <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
                    <Clock className="w-6 h-6 text-slate-300" />
                  </div>
                  <p className="text-slate-500 text-sm font-medium">No quizzes available</p>
                  <p className="text-slate-400 text-xs mt-1">Check back later for new quizzes</p>
                </div>
              )}
            </div>
          </div>

          {/* Recent Results */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900">Recent Results</h2>
              <Link to="/student/results" className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 flex items-center gap-1">
                View all <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="h-1 bg-gradient-to-r from-violet-500 to-purple-500" />
              <div className="p-5 space-y-3">
                {recentAttempts.length > 0 ? (
                  recentAttempts.slice(0, 5).map((attempt) => {
                    const pct = attempt.score_percent;
                    return (
                      <div
                        key={attempt.id}
                        className="flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 cursor-pointer transition-all"
                        onClick={() => window.location.href = `/student/results/${attempt.id}`}
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-slate-900 truncate">Quiz Result</div>
                          <div className="text-xs text-slate-400 mt-0.5">
                            {new Date(attempt.completed_at).toLocaleDateString()}
                          </div>
                        </div>
                        <div className={cn(
                          "shrink-0 px-2.5 py-1 rounded-lg text-xs font-bold",
                          pct >= 50 ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"
                        )}>
                          {pct}%
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-center py-10">
                    <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
                      <Trophy className="w-6 h-6 text-slate-300" />
                    </div>
                    <p className="text-slate-400 text-sm font-medium">No results yet</p>
                    <p className="text-slate-300 text-xs mt-1">Take a quiz to see your results</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </StudentLayout>
  );
}
