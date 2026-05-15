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
import RealtimeQuizHost from './pages/teacher/RealtimeQuizHost';
import RealtimeQuizReports from './pages/teacher/RealtimeQuizReports';
import RealtimeQuizPlay from './pages/student/RealtimeQuizPlay';
import QuizTaking from './pages/student/QuizTaking';
import QuizResults from './pages/student/QuizResults';
import StudentProfile from './pages/student/Profile';
import TeacherResults from './pages/teacher/Results';
import TeacherModules from './pages/teacher/Modules';
import TeacherLessons from './pages/teacher/Lessons';
import TeacherLessonContentManager from './pages/teacher/LessonContentManager';
import TeacherAssignments from './pages/teacher/Assignments';
import TeacherAttendance from './pages/teacher/Attendance';
import TeacherCertificates from './pages/teacher/Certificates';
import TeacherLiveSessions from './pages/teacher/LiveSessions';
import TeacherLiveSessionRoom from './pages/teacher/LiveSessionRoom';
import TeacherCommunity from './pages/teacher/Community';
import TeacherAnnouncements from './pages/teacher/Announcements';
import TeacherProgress from './pages/teacher/Progress';
import TeacherExams from './pages/teacher/Exams';
import TeacherProfilePage from './pages/teacher/Profile';
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
import JoinClass from './pages/student/JoinClass';
import Badges from './pages/student/Badges';
import StudentDashboard from './pages/student/Dashboard';
import StudentCourses from './pages/student/Courses';
import StudentCourseDetail from './pages/student/CourseDetail';
import ContinueLearning from './pages/student/ContinueLearning';
import StudentLessons from './pages/student/Lessons';
import StudentLessonDetail from './pages/student/LessonDetail';
import StudentQuizzes from './pages/student/Quizzes';
import StudentAssignments from './pages/student/Assignments';
import StudentAssignmentDetail from './pages/student/AssignmentDetail';
import StudentProgress from './pages/student/Progress';
import StudentResults from './pages/student/Results';
import StudentCertificates from './pages/student/Certificates';
import StudentCommunity from './pages/student/Community';
import StudentLiveClasses from './pages/student/LiveClasses';
import StudentLiveSessionJoin from './pages/student/LiveSessionJoin';
import StudentExams from './pages/student/Exams';
import StudentAnnouncements from './pages/student/Announcements';
import NotFound from './pages/NotFound';
import { apiUrl, authFetch } from './lib/apiUrl';
import { isProfileAccessAllowed } from './lib/profileAccess';
import { normalizeUserRole } from './lib/userRole';
import { defaultFeatureFlags, extractFeatureFlags, FeatureFlags } from './lib/platformFeatures';
import ChatBot from './components/ChatBot';
import PWAInstallButton from './components/PWAInstallButton';

export default function App() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [features, setFeatures] = useState<FeatureFlags>(defaultFeatureFlags);
  const [maintenanceMode, setMaintenanceMode] = useState(false);


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
    void loadPlatformRuntimeConfig();
    initSession();
    const onSettingsUpdated = () => { void loadPlatformRuntimeConfig(); };
    window.addEventListener('settings-updated', onSettingsUpdated);

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
      window.removeEventListener('settings-updated', onSettingsUpdated);
    };
  }, []);

  const loadPlatformRuntimeConfig = async () => {
    try {
      const [runtimeRes, brandingRes] = await Promise.all([
        fetch(`${apiUrl('/api/platform/runtime')}?t=${Date.now()}`, { cache: 'no-store' }),
        fetch(`${apiUrl('/api/platform/branding')}?t=${Date.now()}`, { cache: 'no-store' }),
      ]);
      const runtimeJson = await runtimeRes.json().catch(() => ({}));
      if (runtimeRes.ok && runtimeJson?.success) {
        const nextFeatures = extractFeatureFlags({ features: runtimeJson.features });
        setFeatures(nextFeatures);
        setMaintenanceMode(Boolean(runtimeJson.maintenanceMode));
        const schoolName = String(runtimeJson.schoolName || 'QuizMaster').trim();
        if (schoolName) document.title = schoolName;
      }
      const brandingJson = await brandingRes.json().catch(() => ({}));
      if (brandingRes.ok && brandingJson?.success) {
        const faviconUrl = brandingJson?.faviconUrl;
        if (typeof faviconUrl === 'string' && faviconUrl.trim()) {
          let link = document.querySelector("link[rel~='icon']") as HTMLLinkElement | null;
          if (!link) {
            link = document.createElement('link');
            link.rel = 'icon';
            document.head.appendChild(link);
          }
          link.href = faviconUrl;
        }
      }
    } catch {
      // keep defaults when config table is unavailable
    }
  };

  const fetchProfile = async (userId: string) => {
    try {
      let runtimeMaintenanceMode = maintenanceMode;
      try {
        const runtimeRes = await fetch(`${apiUrl('/api/platform/runtime')}?t=${Date.now()}`, { cache: 'no-store' });
        const runtimeJson = await runtimeRes.json().catch(() => ({}));
        if (runtimeRes.ok && runtimeJson?.success) {
          runtimeMaintenanceMode = Boolean(runtimeJson.maintenanceMode);
          setMaintenanceMode(runtimeMaintenanceMode);
        }
      } catch {
        // keep current in-memory maintenance value
      }

      let profile: any = null;
      const profileRes = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
      if (profileRes.error) {
        const fallbackRes = await supabase.from('profiles').select('*').eq('id', userId).limit(1);
        if (fallbackRes.error) throw fallbackRes.error;
        profile = (fallbackRes.data || [])[0] || null;
      } else {
        profile = profileRes.data;
      }

      if (!profile) {
        const { data: { session } } = await supabase.auth.getSession();
        const authUser = session?.user && session.user.id === userId ? session.user : null;
        const metadata = authUser?.user_metadata && typeof authUser.user_metadata === 'object'
          ? authUser.user_metadata as Record<string, unknown>
          : {};
        const fallbackRole = normalizeUserRole(typeof metadata.role === 'string' ? metadata.role : null);

        if (runtimeMaintenanceMode && fallbackRole !== 'admin') {
          await supabase.auth.signOut();
          setUser(null);
          toast.error('Platform is currently offline for all students and teachers.', { id: 'maintenance-mode' });
          return;
        }

        setUser({
          uid: userId,
          email: String(authUser?.email || ''),
          displayName: String(metadata.display_name || metadata.full_name || authUser?.email || 'Student'),
          role: fallbackRole,
          teacherId: typeof metadata.teacher_id === 'string' ? metadata.teacher_id : undefined,
          status: 'active',
          createdAt: String(authUser?.created_at || new Date().toISOString()),
        });
        return;
      }

      if (profile && !isProfileAccessAllowed(profile.status)) {
        await supabase.auth.signOut();
        setUser(null);
        toast.error('Your account has been disabled. Contact an administrator.', { id: 'account-disabled' });
        return;
      }
      if (profile && runtimeMaintenanceMode && normalizeUserRole(profile.role) !== 'admin') {
        await supabase.auth.signOut();
        setUser(null);
        toast.error('Platform is currently offline for all students and teachers.', { id: 'maintenance-mode' });
        return;
      }
      if (profile) {
        const verifiedRole = normalizeUserRole(profile.role);

        setUser({
          uid: profile.id,
          email: profile.email,
          displayName: profile.display_name,
          role: verifiedRole,
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

  /** If an admin disables this account while they are logged in, revoke access immediately. */
  useEffect(() => {
    const uid = user?.uid;
    if (!uid) return;

    const channel = supabase
      .channel(`profile-access-${uid}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${uid}` },
        (payload) => {
          const st = (payload.new as { status?: string } | null)?.status;
          if (!isProfileAccessAllowed(st)) {
            void supabase.auth.signOut();
            setUser(null);
            toast.error('Your account has been disabled. Contact an administrator.', { id: 'account-disabled' });
          }
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user?.uid]);

  /** Enforce maintenance mode for already logged-in non-admin users. */
  useEffect(() => {
    if (!user || user.role === 'admin') return;

    let active = true;
    let signingOut = false;

    const enforceMaintenance = async () => {
      if (!active || signingOut) return;
      try {
        const res = await fetch(`${apiUrl('/api/platform/runtime')}?t=${Date.now()}`, { cache: 'no-store' });
        const json = await res.json().catch(() => ({}));
        const enabled = Boolean(res.ok && json?.success && json?.maintenanceMode);
        setMaintenanceMode(enabled);
        if (enabled) {
          signingOut = true;
          await supabase.auth.signOut();
          if (!active) return;
          setUser(null);
          toast.error('Platform is currently offline for all students and teachers.', { id: 'maintenance-mode' });
        }
      } catch {
        // ignore transient polling failures
      }
    };

    void enforceMaintenance();
    const intervalId = window.setInterval(() => { void enforceMaintenance(); }, 10000);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void enforceMaintenance();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      active = false;
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [user]);

  if (loading) {
    return <AppBootSkeleton />;
  }

  if (maintenanceMode && user && user.role !== 'admin') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-100 p-6">
        <div className="max-w-lg text-center space-y-3">
          <h1 className="text-3xl font-bold">Platform Under Maintenance</h1>
          <p className="text-slate-300">The LMS is temporarily unavailable. Please try again later.</p>
        </div>
      </div>
    );
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
        <Route path="/admin/*" element={user?.role === 'admin' ? <AdminRoutes features={features} /> : <Navigate to="/login" />} />
        <Route path="/teacher/*" element={user?.role === 'teacher' ? <TeacherRoutes features={features} /> : <Navigate to="/login" />} />
        <Route path="/student/*" element={user?.role === 'student' ? <StudentRoutes features={features} /> : <Navigate to="/login" />} />
        <Route path="*" element={<Navigate to="/not-found" replace />} />
      </Routes>
      {user && <ChatBot userRole={user.role} />}
      <PWAInstallButton />
    </Router>
  );
}

function AdminRoutes({ features }: { features: FeatureFlags }) {
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
      <Route path="/live-sessions" element={features.liveSessionsEnabled ? <AdminLiveSessions /> : <Navigate to="/not-found" replace />} />
      <Route path="/live-sessions/:id/room" element={features.liveSessionsEnabled ? <AdminLiveSessionRoom /> : <Navigate to="/not-found" replace />} />
      <Route path="/community" element={features.communityEnabled ? <AdminCommunity /> : <Navigate to="/not-found" replace />} />
      <Route path="/announcements" element={features.announcementsEnabled ? <AdminAnnouncements /> : <Navigate to="/not-found" replace />} />
      <Route path="/analytics" element={<AdminAnalytics />} />
      <Route path="/reports" element={<AdminReports />} />
      <Route path="/payments" element={features.paymentsEnabled ? <AdminPayments /> : <Navigate to="/not-found" replace />} />
      <Route path="/invoices" element={features.paymentsEnabled ? <AdminInvoices /> : <Navigate to="/not-found" replace />} />
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

function TeacherRoutes({ features }: { features: FeatureFlags }) {
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
      <Route path="/live-quiz" element={<RealtimeQuizHost />} />
      <Route path="/live-quiz/reports" element={<RealtimeQuizReports />} />
      <Route path="/exams" element={<TeacherExams />} />
      <Route path="/results" element={<TeacherResults />} />
      <Route path="/modules" element={<TeacherModules />} />
      <Route path="/lessons" element={<TeacherLessons />} />
      <Route path="/lessons/:lessonId/content" element={<TeacherLessonContentManager />} />
      <Route path="/assignments" element={<TeacherAssignments />} />
      <Route path="/attendance" element={<TeacherAttendance />} />
      <Route path="/certificates" element={<TeacherCertificates />} />
      <Route path="/live-sessions" element={features.liveSessionsEnabled ? <TeacherLiveSessions /> : <Navigate to="/not-found" replace />} />
      <Route path="/live-sessions/:id/room" element={features.liveSessionsEnabled ? <TeacherLiveSessionRoom /> : <Navigate to="/not-found" replace />} />
      <Route path="/community" element={features.communityEnabled ? <TeacherCommunity /> : <Navigate to="/not-found" replace />} />
      <Route path="/announcements" element={features.announcementsEnabled ? <TeacherAnnouncements /> : <Navigate to="/not-found" replace />} />
      <Route path="/progress" element={<TeacherProgress />} />
      <Route path="/profile" element={<TeacherProfilePage />} />
      <Route path="*" element={<Navigate to="/not-found" replace />} />
    </Routes>
  );
}

function StudentRoutes({ features }: { features: FeatureFlags }) {
  return (
    <Routes>
      <Route path="/" element={<StudentDashboard />} />
      <Route path="/courses" element={<StudentCourses />} />
      <Route path="/courses/:courseId" element={<StudentCourseDetail />} />
      <Route path="/continue" element={<ContinueLearning />} />
      <Route path="/lessons" element={<StudentLessons />} />
      <Route path="/lessons/:lessonId" element={<StudentLessonDetail />} />
      <Route path="/quizzes" element={<StudentQuizzes />} />
      <Route path="/assignments" element={<StudentAssignments />} />
      <Route path="/assignments/:assignmentId" element={<StudentAssignmentDetail />} />
      <Route path="/progress" element={<StudentProgress />} />
      <Route path="/results" element={<StudentResults />} />
      <Route path="/certificates" element={<StudentCertificates />} />
      <Route path="/community" element={features.communityEnabled ? <StudentCommunity /> : <Navigate to="/not-found" replace />} />
      <Route path="/live-classes" element={features.liveSessionsEnabled ? <StudentLiveClasses /> : <Navigate to="/not-found" replace />} />
      <Route path="/live-sessions" element={features.liveSessionsEnabled ? <StudentLiveClasses /> : <Navigate to="/not-found" replace />} />
      <Route path="/live-sessions/:id" element={features.liveSessionsEnabled ? <StudentLiveSessionJoin /> : <Navigate to="/not-found" replace />} />
      <Route path="/live-quiz" element={<RealtimeQuizPlay />} />
      <Route path="/join-class" element={<JoinClass />} />
      <Route path="/badges" element={<Badges />} />
      <Route path="/exams" element={<StudentExams />} />
      <Route path="/announcements" element={features.announcementsEnabled ? <StudentAnnouncements /> : <Navigate to="/not-found" replace />} />
      <Route path="/quiz/:quizId" element={<QuizTaking />} />
      <Route path="/results/:attemptId" element={<QuizResults />} />
      <Route path="/profile" element={<StudentProfile />} />
      <Route path="*" element={<Navigate to="/not-found" replace />} />
    </Routes>
  );
}

