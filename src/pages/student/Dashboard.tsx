import React, { useEffect, useState } from 'react';
import { supabase } from '../../supabase';
import StudentLayout from '../../components/layout/StudentLayout';
import { 
  BookOpen, 
  Clock, 
  CheckCircle2, 
  Trophy,
  ArrowRight,
  Calendar
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Course, Quiz } from '../../types';
import { cn } from '../../lib/utils';

export default function StudentDashboard() {
  const [enrolledCourses, setEnrolledCourses] = useState<Course[]>([]);
  const [availableQuizzes, setAvailableQuizzes] = useState<Quiz[]>([]);
  const [recentAttempts, setRecentAttempts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const studentId = session.user.id;

      try {
        // Fetch courses where student is enrolled
        const { data: courses, error: coursesError } = await supabase
          .from('courses')
          .select('*')
          .contains('student_ids', [studentId]);
        
        if (coursesError) throw coursesError;
        setEnrolledCourses(courses as any);

        if (courses && courses.length > 0) {
          const courseIds = courses.map(c => c.id);
          // Fetch published quizzes for these courses
          const { data: quizzes, error: quizzesError } = await supabase
            .from('quizzes')
            .select('*')
            .in('course_id', courseIds)
            .eq('published', true);
          
          if (quizzesError) throw quizzesError;
          setAvailableQuizzes(quizzes as any);
        }

        // Fetch recent attempts
        const { data: attempts, error: attemptsError } = await supabase
          .from('attempts')
          .select('*')
          .eq('student_id', studentId)
          .order('completed_at', { ascending: false });
        
        if (attemptsError) throw attemptsError;
        setRecentAttempts(attempts || []);

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
      ? Math.round(recentAttempts.reduce((acc, curr) => acc + (curr.score / curr.total_points * 100), 0) / recentAttempts.length)
      : 0
  };

  return (
    <StudentLayout>
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Student Dashboard</h1>
          <p className="text-slate-500 mt-2">Welcome back! Ready to learn something new today?</p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            { label: 'Enrolled Courses', value: stats.courses, icon: BookOpen, color: 'bg-blue-50 text-blue-600' },
            { label: 'Available Quizzes', value: stats.quizzes, icon: Clock, color: 'bg-orange-50 text-orange-600' },
            { label: 'Completed Quizzes', value: stats.completed, icon: CheckCircle2, color: 'bg-green-50 text-green-600' },
            { label: 'Average Score', value: `${stats.avgScore}%`, icon: Trophy, color: 'bg-purple-50 text-purple-600' },
          ].map((stat) => (
            <div key={stat.label} className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
              <div className={cn("p-3 rounded-xl inline-flex mb-4", stat.color)}>
                <stat.icon className="w-6 h-6" />
              </div>
              <div className="text-2xl font-bold text-slate-900">{stat.value}</div>
              <div className="text-slate-500 text-sm mt-1">{stat.label}</div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Upcoming Quizzes */}
          <div className="lg:col-span-2 space-y-6">
            <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-slate-400" />
              Available Quizzes
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {availableQuizzes.length > 0 ? (
                availableQuizzes.map((quiz) => (
                  <div key={quiz.id} className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all group">
                    <div className="flex items-start justify-between mb-4">
                      <div className="p-3 bg-slate-50 rounded-xl text-slate-600 group-hover:bg-slate-900 group-hover:text-white transition-all">
                        <Clock className="w-6 h-6" />
                      </div>
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                        {quiz.timeLimit} mins
                      </span>
                    </div>
                    <h3 className="text-lg font-bold text-slate-900 mb-2">{quiz.title}</h3>
                    <p className="text-slate-500 text-sm line-clamp-2 mb-6">{quiz.description}</p>
                    <Link
                      to={`/student/quiz/${quiz.id}`}
                      className="inline-flex items-center gap-2 text-slate-900 font-bold text-sm hover:gap-3 transition-all"
                    >
                      Start Quiz <ArrowRight className="w-4 h-4" />
                    </Link>
                  </div>
                ))
              ) : (
                <div className="col-span-full py-20 text-center bg-white rounded-2xl border border-dashed border-slate-200">
                  <Clock className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                  <p className="text-slate-500">No quizzes available at the moment.</p>
                </div>
              )}
            </div>
          </div>

          {/* Recent Results */}
          <div className="space-y-6">
            <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <Trophy className="w-5 h-5 text-slate-400" />
              Recent Results
            </h2>
            <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm space-y-6">
              {recentAttempts.length > 0 ? (
                recentAttempts.slice(0, 5).map((attempt) => (
                  <div key={attempt.id} className="flex items-center justify-between group cursor-pointer" onClick={() => window.location.href = `/student/results/${attempt.id}`}>
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-slate-900 truncate">Quiz Result</div>
                      <div className="text-xs text-slate-400 mt-1">
                        {new Date(attempt.completedAt).toLocaleDateString()}
                      </div>
                    </div>
                    <div className={cn(
                      "px-3 py-1 rounded-full text-xs font-bold",
                      attempt.passed ? "bg-green-50 text-green-600" : "bg-red-50 text-red-600"
                    )}>
                      {Math.round((attempt.score / attempt.totalPoints) * 100)}%
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-10">
                  <p className="text-slate-400 text-sm">No attempts yet.</p>
                </div>
              )}
              <Link
                to="/student/results"
                className="block w-full py-3 text-center text-sm font-bold text-slate-600 hover:bg-slate-50 rounded-xl transition-all"
              >
                View All Results
              </Link>
            </div>
          </div>
        </div>
      </div>
    </StudentLayout>
  );
}
