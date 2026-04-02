import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster, toast } from 'sonner';
import { supabase } from './supabase';
import { UserProfile } from './types';

// Pages
import Login from './pages/Login';
import AdminDashboard from './pages/AdminDashboard';
import AdminStudents from './pages/admin/Students';
import AdminTeachers from './pages/admin/Teachers';
import AdminCourses from './pages/admin/Courses';
import AdminCourseForm from './pages/admin/CourseForm';
import TeacherDashboard from './pages/teacher/Dashboard';
import TeacherCourses from './pages/teacher/Courses';
import TeacherCourseForm from './pages/teacher/CourseForm';
import StudentManagement from './pages/teacher/StudentManagement';
import QuizManagement from './pages/teacher/QuizManagement';
import QuizBuilder from './pages/teacher/QuizBuilder';
import QuizTaking from './pages/student/QuizTaking';
import QuizResults from './pages/student/QuizResults';
import StudentProfile from './pages/student/Profile';
import TeacherResults from './pages/teacher/Results';
import TeacherModules from './pages/teacher/Modules';
import TeacherLessons from './pages/teacher/Lessons';
import AdminModules from './pages/admin/Modules';
import AdminLessons from './pages/admin/Lessons';
import AdminQuizzes from './pages/admin/Quizzes';
import AdminClasses from './pages/admin/Classes';
import AdminAssignments from './pages/admin/Assignments';
import AdminAttendance from './pages/admin/Attendance';
import AdminCertificates from './pages/admin/Certificates';
import AdminLiveSessions from './pages/admin/LiveSessions';
import AdminLiveSessionRoom from './pages/admin/LiveSessionRoom';
import AdminCommunity from './pages/admin/Community';
import AdminAnnouncements from './pages/admin/Announcements';
import AdminAnalytics from './pages/admin/Analytics';
import AdminReports from './pages/admin/Reports';
import AdminPayments from './pages/admin/Payments';
import AdminInvoices from './pages/admin/Invoices';
import StudentDashboard from './pages/student/Dashboard';

export default function App() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkBackend = async () => {
      try {
        const res = await fetch('/api/health');
        if (!res.ok) throw new Error('Backend not responding');
        console.log('Backend health check: OK');
      } catch (error) {
        console.error('Backend health check failed:', error);
        toast.error('Backend server is not reachable.');
      }
    };

    const initSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          await fetchProfile(session.user.id);
        } else {
          setLoading(false);
        }
      } catch (error: any) {
        toast.error(error.message || 'Failed to connect to Supabase.');
        setLoading(false);
      }
    };

    checkBackend();
    initSession();

    let subscription: any;
    try {
      const { data } = supabase.auth.onAuthStateChange((_event, session) => {
        if (session) {
          fetchProfile(session.user.id);
        } else {
          setUser(null);
          setLoading(false);
        }
      });
      subscription = data.subscription;
    } catch (error) {
      console.error('Auth state change listener failed:', error);
    }

    return () => { if (subscription) subscription.unsubscribe(); };
  }, []);

  const fetchProfile = async (userId: string) => {
    try {
      const { data: profile, error } = await supabase.from('profiles').select('*').eq('id', userId).single();
      if (error) throw error;
      if (profile) {
        setUser({
          uid: profile.id,
          email: profile.email,
          displayName: profile.display_name,
          role: profile.role,
          teacherId: profile.teacher_id,
          status: profile.status,
          createdAt: profile.created_at
        });
      }
    } catch (error) {
      console.error('Error fetching profile:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center animate-pulse">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l9-5-9-5-9 5 9 5z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z" />
            </svg>
          </div>
          <div className="text-slate-500 text-sm font-medium">Loading QuizMaster...</div>
        </div>
      </div>
    );
  }

  return (
    <Router>
      <Toaster position="top-right" richColors />
      <Routes>
        <Route path="/login" element={!user ? <Login /> : <Navigate to="/" />} />
        <Route path="/" element={
          user ? (
            user.role === 'admin' ? <Navigate to="/admin" /> :
            user.role === 'teacher' ? <Navigate to="/teacher" /> :
            <Navigate to="/student" />
          ) : <Navigate to="/login" />
        } />
        <Route path="/admin/*" element={user?.role === 'admin' ? <AdminRoutes /> : <Navigate to="/login" />} />
        <Route path="/teacher/*" element={user?.role === 'teacher' ? <TeacherRoutes /> : <Navigate to="/login" />} />
        <Route path="/student/*" element={user?.role === 'student' ? <StudentRoutes /> : <Navigate to="/login" />} />
      </Routes>
    </Router>
  );
}

function AdminRoutes() {
  return (
    <Routes>
      <Route path="/" element={<AdminDashboard />} />
      <Route path="/students" element={<AdminStudents />} />
      <Route path="/teachers" element={<AdminTeachers />} />
      <Route path="/courses" element={<AdminCourses />} />
      <Route path="/courses/new" element={<AdminCourseForm />} />
      <Route path="/courses/:id/edit" element={<AdminCourseForm />} />
      <Route path="/modules" element={<AdminModules />} />
      <Route path="/lessons" element={<AdminLessons />} />
      <Route path="/quizzes" element={<AdminQuizzes />} />
      <Route path="/classes" element={<AdminClasses />} />
      <Route path="/assignments" element={<AdminAssignments />} />
      <Route path="/attendance" element={<AdminAttendance />} />
      <Route path="/certificates" element={<AdminCertificates />} />
      <Route path="/live-sessions" element={<AdminLiveSessions />} />
      <Route path="/live-sessions/:id/room" element={<AdminLiveSessionRoom />} />
      <Route path="/community" element={<AdminCommunity />} />
      <Route path="/announcements" element={<AdminAnnouncements />} />
      <Route path="/analytics" element={<AdminAnalytics />} />
      <Route path="/reports" element={<AdminReports />} />
      <Route path="/payments" element={<AdminPayments />} />
      <Route path="/invoices" element={<AdminInvoices />} />
    </Routes>
  );
}

function TeacherRoutes() {
  return (
    <Routes>
      <Route path="/" element={<TeacherDashboard />} />
      <Route path="/courses" element={<TeacherCourses />} />
      <Route path="/courses/new" element={<TeacherCourseForm />} />
      <Route path="/courses/:id/edit" element={<TeacherCourseForm />} />
      <Route path="/students" element={<StudentManagement />} />
      <Route path="/quizzes" element={<QuizManagement />} />
      <Route path="/quizzes/new" element={<QuizBuilder />} />
      <Route path="/quizzes/edit/:quizId" element={<QuizBuilder />} />
      <Route path="/results" element={<TeacherResults />} />
      <Route path="/modules" element={<TeacherModules />} />
      <Route path="/lessons" element={<TeacherLessons />} />
    </Routes>
  );
}

function StudentRoutes() {
  return (
    <Routes>
      <Route path="/" element={<StudentDashboard />} />
      <Route path="/quiz/:quizId" element={<QuizTaking />} />
      <Route path="/results/:attemptId" element={<QuizResults />} />
      <Route path="/profile" element={<StudentProfile />} />
    </Routes>
  );
}
