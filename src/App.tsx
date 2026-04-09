import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster, toast } from 'sonner';
import { supabase } from './supabase';
import { UserProfile } from './types';
import { AppBootSkeleton } from './components/ui/Skeleton';

// Pages
import Login from './pages/Login';
import AdminDashboard from './pages/AdminDashboard';
import AdminStudents from './pages/admin/Students';
import AdminTeachers from './pages/admin/Teachers';
import AdminCourses from './pages/admin/Courses';
import AdminCourseForm from './pages/admin/CourseForm';
import TeacherDashboard from './pages/teacher/Dashboard';
import TeacherClasses from './pages/teacher/Classes';
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
import TeacherAssignments from './pages/teacher/Assignments';
import TeacherAttendance from './pages/teacher/Attendance';
import TeacherCertificates from './pages/teacher/Certificates';
import TeacherLiveSessions from './pages/teacher/LiveSessions';
import TeacherCommunity from './pages/teacher/Community';
import TeacherAnnouncements from './pages/teacher/Announcements';
import TeacherProgress from './pages/teacher/Progress';
import TeacherExams from './pages/teacher/Exams';
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
import AdminSettings from './pages/admin/Settings';
import AdminBranding from './pages/admin/Branding';
import AdminDomain from './pages/admin/Domain';
import AdminRoles from './pages/admin/Roles';
import AdminProfile from './pages/admin/Profile';
import AdminSecurityPage from './pages/admin/Security';
import StudentDashboard from './pages/student/Dashboard';
import StudentCourses from './pages/student/Courses';
import ContinueLearning from './pages/student/ContinueLearning';
import StudentLessons from './pages/student/Lessons';
import StudentQuizzes from './pages/student/Quizzes';
import StudentAssignments from './pages/student/Assignments';
import StudentProgress from './pages/student/Progress';
import StudentResults from './pages/student/Results';
import StudentCertificates from './pages/student/Certificates';
import StudentCommunity from './pages/student/Community';
import StudentLiveClasses from './pages/student/LiveClasses';
import StudentExams from './pages/student/Exams';
import NotFound from './pages/NotFound';
import { apiUrl } from './lib/apiUrl';

export default function App() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkBackend = async () => {
      try {
        const res = await fetch(apiUrl('/api/health'));
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
    return <AppBootSkeleton />;
  }

  return (
    <Router>
      <Toaster position="top-right" richColors />
      <Routes>
        <Route path="/login" element={!user ? <Login /> : <Navigate to="/" />} />
        <Route path="/not-found" element={<NotFound />} />
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
        <Route path="*" element={<Navigate to="/not-found" replace />} />
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
      <Route path="/settings" element={<AdminSettings />} />
      <Route path="/branding" element={<AdminBranding />} />
      <Route path="/domain" element={<AdminDomain />} />
      <Route path="/roles" element={<AdminRoles />} />
      <Route path="/profile" element={<AdminProfile />} />
      <Route path="/security" element={<AdminSecurityPage />} />
      <Route path="*" element={<Navigate to="/not-found" replace />} />
    </Routes>
  );
}

function TeacherRoutes() {
  return (
    <Routes>
      <Route path="/" element={<TeacherDashboard />} />
      <Route path="/classes" element={<TeacherClasses />} />
      <Route path="/courses" element={<TeacherCourses />} />
      <Route path="/courses/new" element={<TeacherCourseForm />} />
      <Route path="/courses/:id/edit" element={<TeacherCourseForm />} />
      <Route path="/students" element={<StudentManagement />} />
      <Route path="/quizzes" element={<QuizManagement />} />
      <Route path="/quizzes/new" element={<QuizBuilder />} />
      <Route path="/quizzes/edit/:quizId" element={<QuizBuilder />} />
      <Route path="/exams" element={<TeacherExams />} />
      <Route path="/results" element={<TeacherResults />} />
      <Route path="/modules" element={<TeacherModules />} />
      <Route path="/lessons" element={<TeacherLessons />} />
      <Route path="/assignments" element={<TeacherAssignments />} />
      <Route path="/attendance" element={<TeacherAttendance />} />
      <Route path="/certificates" element={<TeacherCertificates />} />
      <Route path="/live-sessions" element={<TeacherLiveSessions />} />
      <Route path="/community" element={<TeacherCommunity />} />
      <Route path="/announcements" element={<TeacherAnnouncements />} />
      <Route path="/progress" element={<TeacherProgress />} />
      <Route path="*" element={<Navigate to="/not-found" replace />} />
    </Routes>
  );
}

function StudentRoutes() {
  return (
    <Routes>
      <Route path="/" element={<StudentDashboard />} />
      <Route path="/courses" element={<StudentCourses />} />
      <Route path="/continue" element={<ContinueLearning />} />
      <Route path="/lessons" element={<StudentLessons />} />
      <Route path="/quizzes" element={<StudentQuizzes />} />
      <Route path="/assignments" element={<StudentAssignments />} />
      <Route path="/progress" element={<StudentProgress />} />
      <Route path="/results" element={<StudentResults />} />
      <Route path="/certificates" element={<StudentCertificates />} />
      <Route path="/community" element={<StudentCommunity />} />
      <Route path="/live-classes" element={<StudentLiveClasses />} />
      <Route path="/exams" element={<StudentExams />} />
      <Route path="/quiz/:quizId" element={<QuizTaking />} />
      <Route path="/results/:attemptId" element={<QuizResults />} />
      <Route path="/profile" element={<StudentProfile />} />
      <Route path="*" element={<Navigate to="/not-found" replace />} />
    </Routes>
  );
}
