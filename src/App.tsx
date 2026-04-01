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
import TeacherDashboard from './pages/teacher/Dashboard';
import StudentDashboard from './pages/student/Dashboard';
import CourseManagement from './pages/teacher/CourseManagement';
import StudentManagement from './pages/teacher/StudentManagement';
import QuizManagement from './pages/teacher/QuizManagement';
import QuizBuilder from './pages/teacher/QuizBuilder';
import QuizTaking from './pages/student/QuizTaking';
import QuizResults from './pages/student/QuizResults';
import StudentProfile from './pages/student/Profile';
import TeacherResults from './pages/teacher/Results';

const ADMIN_EMAIL = 'liridon.salihi123@gmail.com';

export default function App() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkBackend = async () => {
      try {
        const res = await fetch('/api/health');
        if (!res.ok) throw new Error('Backend not responding correctly');
        console.log('Backend health check: OK');
      } catch (error) {
        console.error('Backend health check failed:', error);
        toast.error('Backend server is not reachable. Some features may not work.');
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
        console.error('Initial session check failed:', error);
        toast.error(error.message || 'Failed to connect to Supabase. Check your configuration.');
        setLoading(false);
      }
    };

    checkBackend();
    initSession();

    // Listen for auth changes
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

    return () => {
      if (subscription) subscription.unsubscribe();
    };
  }, []);

  const fetchProfile = async (userId: string) => {
    try {
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) throw error;

      if (profile) {
        const userData: UserProfile = {
          uid: profile.id,
          email: profile.email,
          displayName: profile.display_name,
          role: profile.role,
          teacherId: profile.teacher_id,
          status: profile.status,
          createdAt: profile.created_at
        };
        setUser(userData);
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
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-900"></div>
      </div>
    );
  }

  return (
    <Router>
      <Toaster position="top-right" richColors />
      <Routes>
        {/* Public Routes */}
        <Route path="/login" element={!user ? <Login /> : <Navigate to="/" />} />

        {/* Protected Routes */}
        <Route
          path="/"
          element={
            user ? (
              user.role === 'admin' ? (
                <Navigate to="/admin" />
              ) : user.role === 'teacher' ? (
                <Navigate to="/teacher" />
              ) : (
                <Navigate to="/student" />
              )
            ) : (
              <Navigate to="/login" />
            )
          }
        />

        {/* Admin Routes */}
        <Route
          path="/admin/*"
          element={user?.role === 'admin' ? <AdminRoutes /> : <Navigate to="/login" />}
        />

        {/* Teacher Routes */}
        <Route
          path="/teacher/*"
          element={user?.role === 'teacher' ? <TeacherRoutes /> : <Navigate to="/login" />}
        />

        {/* Student Routes */}
        <Route
          path="/student/*"
          element={user?.role === 'student' ? <StudentRoutes /> : <Navigate to="/login" />}
        />
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
    </Routes>
  );
}

function TeacherRoutes() {
  return (
    <Routes>
      <Route path="/" element={<TeacherDashboard />} />
      <Route path="/courses" element={<CourseManagement />} />
      <Route path="/students" element={<StudentManagement />} />
      <Route path="/quizzes" element={<QuizManagement />} />
      <Route path="/quizzes/new" element={<QuizBuilder />} />
      <Route path="/quizzes/edit/:quizId" element={<QuizBuilder />} />
      <Route path="/results" element={<TeacherResults />} />
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
