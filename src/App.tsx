import React, { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster, toast } from 'sonner';
import { supabase } from './supabase';
import { UserProfile } from './types';
import { AppBootSkeleton } from './components/ui/Skeleton';

// Pages — loaded lazily to enable code splitting (reduces initial bundle from 3.5MB to ~200KB)
const Login = lazy(() => import('./pages/Login'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));
const AdminStudents = lazy(() => import('./pages/admin/Students'));
const AdminTeachers = lazy(() => import('./pages/admin/Teachers'));
const AdminCourses = lazy(() => import('./pages/admin/Courses'));
const AdminCourseForm = lazy(() => import('./pages/admin/CourseForm'));
const TeacherDashboard = lazy(() => import('./pages/teacher/Dashboard'));
const TeacherClasses = lazy(() => import('./pages/teacher/Classes'));
const TeacherCourses = lazy(() => import('./pages/teacher/Courses'));
const TeacherCourseForm = lazy(() => import('./pages/teacher/CourseForm'));
const StudentManagement = lazy(() => import('./pages/teacher/StudentManagement'));
const QuizManagement = lazy(() => import('./pages/teacher/QuizManagement'));
const QuizBuilder = lazy(() => import('./pages/teacher/QuizBuilder'));
const RealtimeQuizHost = lazy(() => import('./pages/teacher/RealtimeQuizHost'));
const RealtimeQuizReports = lazy(() => import('./pages/teacher/RealtimeQuizReports'));
const RealtimeQuizPlay = lazy(() => import('./pages/student/RealtimeQuizPlay'));
const QuizTaking = lazy(() => import('./pages/student/QuizTaking'));
const QuizResults = lazy(() => import('./pages/student/QuizResults'));
const StudentProfile = lazy(() => import('./pages/student/Profile'));
const TeacherResults = lazy(() => import('./pages/teacher/Results'));
const TeacherModules = lazy(() => import('./pages/teacher/Modules'));
const TeacherLessons = lazy(() => import('./pages/teacher/Lessons'));
const TeacherLessonContentManager = lazy(() => import('./pages/teacher/LessonContentManager'));
const TeacherAssignments = lazy(() => import('./pages/teacher/Assignments'));
const TeacherAttendance = lazy(() => import('./pages/teacher/Attendance'));
const TeacherCertificates = lazy(() => import('./pages/teacher/Certificates'));
const TeacherLiveSessions = lazy(() => import('./pages/teacher/LiveSessions'));
const TeacherLiveSessionRoom = lazy(() => import('./pages/teacher/LiveSessionRoom'));
const TeacherCommunity = lazy(() => import('./pages/teacher/Community'));
const TeacherAnnouncements = lazy(() => import('./pages/teacher/Announcements'));
const TeacherProgress = lazy(() => import('./pages/teacher/Progress'));
const TeacherExams = lazy(() => import('./pages/teacher/Exams'));
const TeacherProfilePage = lazy(() => import('./pages/teacher/Profile'));
const AdminModules = lazy(() => import('./pages/admin/Modules'));
const AdminLessons = lazy(() => import('./pages/admin/Lessons'));
const AdminQuizzes = lazy(() => import('./pages/admin/Quizzes'));
const AdminClasses = lazy(() => import('./pages/admin/Classes'));
const AdminAssignments = lazy(() => import('./pages/admin/Assignments'));
const AdminAttendance = lazy(() => import('./pages/admin/Attendance'));
const AdminCertificates = lazy(() => import('./pages/admin/Certificates'));
const AdminLiveSessions = lazy(() => import('./pages/admin/LiveSessions'));
const AdminLiveSessionRoom = lazy(() => import('./pages/admin/LiveSessionRoom'));
const AdminCommunity = lazy(() => import('./pages/admin/Community'));
const AdminAnnouncements = lazy(() => import('./pages/admin/Announcements'));
const AdminAnalytics = lazy(() => import('./pages/admin/Analytics'));
const AdminReports = lazy(() => import('./pages/admin/Reports'));
const AdminPayments = lazy(() => import('./pages/admin/Payments'));
const AdminInvoices = lazy(() => import('./pages/admin/Invoices'));
const AdminSettings = lazy(() => import('./pages/admin/Settings'));
const AdminBranding = lazy(() => import('./pages/admin/Branding'));
const AdminDomain = lazy(() => import('./pages/admin/Domain'));
const AdminRoles = lazy(() => import('./pages/admin/Roles'));
const AdminProfile = lazy(() => import('./pages/admin/Profile'));
const AdminSecurityPage = lazy(() => import('./pages/admin/Security'));
const AdminPresentations = lazy(() => import('./pages/admin/Presentations'));
const TeacherPresentations = lazy(() => import('./pages/teacher/Presentations'));
const StudentPresentations = lazy(() => import('./pages/student/Presentations'));
const JoinClass = lazy(() => import('./pages/student/JoinClass'));
const Badges = lazy(() => import('./pages/student/Badges'));
const StudentDashboard = lazy(() => import('./pages/student/Dashboard'));
const StudentCourses = lazy(() => import('./pages/student/Courses'));
const StudentCourseDetail = lazy(() => import('./pages/student/CourseDetail'));
const ContinueLearning = lazy(() => import('./pages/student/ContinueLearning'));
const StudentLessons = lazy(() => import('./pages/student/Lessons'));
const StudentLessonDetail = lazy(() => import('./pages/student/LessonDetail'));
const StudentQuizzes = lazy(() => import('./pages/student/Quizzes'));
const StudentAssignments = lazy(() => import('./pages/student/Assignments'));
const StudentAssignmentDetail = lazy(() => import('./pages/student/AssignmentDetail'));
const StudentProgress = lazy(() => import('./pages/student/Progress'));
const StudentResults = lazy(() => import('./pages/student/Results'));
const StudentCertificates = lazy(() => import('./pages/student/Certificates'));
const StudentCommunity = lazy(() => import('./pages/student/Community'));
const StudentLiveClasses = lazy(() => import('./pages/student/LiveClasses'));
const StudentLiveSessionJoin = lazy(() => import('./pages/student/LiveSessionJoin'));
const StudentExams = lazy(() => import('./pages/student/Exams'));
const StudentAnnouncements = lazy(() => import('./pages/student/Announcements'));
const NotFound = lazy(() => import('./pages/NotFound'));
import { apiUrl } from './lib/apiUrl';
import { isProfileAccessAllowed } from './lib/profileAccess';
import { normalizeUserRole } from './lib/userRole';
import { defaultFeatureFlags, extractFeatureFlags, FeatureFlags } from './lib/platformFeatures';

const PLATFORM_CONFIG_CACHE_TTL_MS = 20_000;
let platformConfigCache: { runtime: any; branding: any; expiresAt: number } = {
  runtime: null,
  branding: null,
  expiresAt: 0,
};

export default function App() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [features, setFeatures] = useState<FeatureFlags>(defaultFeatureFlags);
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  // Tracks the userId that initSession already loaded so onAuthStateChange
  // doesn't trigger a redundant second fetchProfile on startup.
  const initializedUserIdRef = useRef<string | null>(null);

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
          initializedUserIdRef.current = session.user.id;
          await fetchProfile(session.user.id);
        } else {
          setLoading(false);
        }
      } catch (error: any) {
        toast.error(error.message || 'Failed to connect to Supabase.');
        setLoading(false);
      }
    };

    // Fire health check and platform config in parallel with session init
    checkBackend();
    void loadPlatformRuntimeConfig();
    initSession();
    const onSettingsUpdated = () => { void loadPlatformRuntimeConfig(); };
    window.addEventListener('settings-updated', onSettingsUpdated);

    let subscription: any;
    try {
      const { data } = supabase.auth.onAuthStateChange((_event, session) => {
        if (session) {
          // Skip if initSession already loaded this exact user to avoid
          // the double-fetchProfile that happens on every cold startup.
          if (initializedUserIdRef.current === session.user.id) {
            initializedUserIdRef.current = null;
            return;
          }
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
      const now = Date.now();
      let runtimeJson: any = platformConfigCache.runtime;
      let brandingJson: any = platformConfigCache.branding;

      if (now >= platformConfigCache.expiresAt || !runtimeJson || !brandingJson) {
        const [runtimeRes, brandingRes] = await Promise.all([
          fetch(apiUrl('/api/platform/runtime')),
          fetch(apiUrl('/api/platform/branding')),
        ]);
        runtimeJson = await runtimeRes.json().catch(() => ({}));
        brandingJson = await brandingRes.json().catch(() => ({}));
        if (runtimeRes.ok || brandingRes.ok) {
          platformConfigCache = {
            runtime: runtimeJson,
            branding: brandingJson,
            expiresAt: Date.now() + PLATFORM_CONFIG_CACHE_TTL_MS,
          };
        }
      }

      if (runtimeJson?.success) {
        const nextFeatures = extractFeatureFlags({ features: runtimeJson.features });
        setFeatures(nextFeatures);
        setMaintenanceMode(Boolean(runtimeJson.maintenanceMode));
        const schoolName = String(runtimeJson.schoolName || 'QuizMaster').trim();
        if (schoolName) document.title = schoolName;
      }
      if (brandingJson?.success) {
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
      // NOTE: Do NOT call /api/platform/runtime here.
      // loadPlatformRuntimeConfig() already fetches it in parallel on startup.
      // Calling it again causes a duplicate DB round-trip on every login/refresh.
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
        await supabase.auth.signOut();
        setUser(null);
        setLoading(false);
        toast.error('Account not found in database. Please contact your administrator.', { id: 'no-profile' });
        return;
      }

      if (profile && !isProfileAccessAllowed(profile.status)) {
        await supabase.auth.signOut();
        setUser(null);
        toast.error('Your account has been disabled. Contact an administrator.', { id: 'account-disabled' });
        return;
      }
      if (profile && maintenanceMode && normalizeUserRole(profile.role) !== 'admin') {
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
      <Suspense fallback={<AppBootSkeleton />}>
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
      </Suspense>
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
      <Route path="/presentations" element={<AdminPresentations />} />
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
      <Route path="/presentations" element={<TeacherPresentations />} />
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
      <Route path="/presentations" element={<StudentPresentations />} />
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

