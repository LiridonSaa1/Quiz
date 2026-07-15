import React, { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster, toast } from 'sonner';
import { supabase } from './supabase';
import { UserProfile } from './types';
import { AppBootSkeleton } from './components/ui/Skeleton';
import { usePWAInstall } from './hooks/usePWAInstall';
import { IOSInstructionsModal } from './components/PWAInstallButton';

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
const SmartTestBuilder = lazy(() => import('./pages/teacher/SmartTestBuilder'));
const RealtimeQuizHost = lazy(() => import('./pages/teacher/RealtimeQuizHost'));
const RealtimeQuizReports = lazy(() => import('./pages/teacher/RealtimeQuizReports'));
const RealtimeQuizPlay = lazy(() => import('./pages/student/RealtimeQuizPlay'));
const QuizTaking = lazy(() => import('./pages/student/QuizTaking'));
const QuizExperience = lazy(() => import('./pages/student/QuizExperience'));
const QuizResults = lazy(() => import('./pages/student/QuizResults'));
const StudentProfile = lazy(() => import('./pages/student/Profile'));
const TeacherResults = lazy(() => import('./pages/teacher/Results'));
const TeacherModules = lazy(() => import('./pages/teacher/Modules'));
const TeacherModuleDetail = lazy(() => import('./pages/teacher/ModuleDetail'));
const TeacherLessons = lazy(() => import('./pages/teacher/Lessons'));
const TeacherCoursesList = lazy(() => import('./pages/teacher/TeacherCoursesList'));
const HeadwayTestImport = lazy(() => import('./pages/teacher/HeadwayTestImport'));
const TeacherModuleTests = lazy(() => import('./pages/teacher/TeacherModuleTests'));
const TeacherLessonContentManager = lazy(() => import('./pages/teacher/LessonContentManager'));
const TeacherAssignments = lazy(() => import('./pages/teacher/Assignments'));
const TeacherAttendance = lazy(() => import('./pages/teacher/Attendance'));
const TeacherCertificates = lazy(() => import('./pages/teacher/Certificates'));
const TeacherLiveSessions = lazy(() => import('./pages/teacher/LiveSessions'));
const TeacherLiveSessionRoom = lazy(() => import('./pages/teacher/LiveSessionRoom'));
const TeacherCommunity = lazy(() => import('./pages/teacher/Community'));
const TeacherAnnouncements = lazy(() => import('./pages/teacher/Announcements'));
const TeacherProgress = lazy(() => import('./pages/teacher/Progress'));
const StudentProgressDetail = lazy(() => import('./pages/teacher/StudentProgressDetail'));
const TeacherExams = lazy(() => import('./pages/teacher/Exams'));
const TeacherProfilePage = lazy(() => import('./pages/teacher/Profile'));
const TeacherSettingsPage = lazy(() => import('./pages/teacher/Settings'));
const TeacherExamBuilder = lazy(() => import('./pages/teacher/ExamBuilder'));
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
const AdminStudentPayments = lazy(() => import('./pages/admin/StudentPayments'));
const AdminTeacherHours = lazy(() => import('./pages/admin/TeacherHours'));
const AdminSettings = lazy(() => import('./pages/admin/Settings'));
const AdminBranding = lazy(() => import('./pages/admin/Branding'));
const AdminDomain = lazy(() => import('./pages/admin/Domain'));
const AdminRoles = lazy(() => import('./pages/admin/Roles'));
const AdminProfile = lazy(() => import('./pages/admin/Profile'));
const AdminSecurityPage = lazy(() => import('./pages/admin/Security'));
const AdminPresentations = lazy(() => import('./pages/admin/Presentations'));
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
const StudentSettingsPage = lazy(() => import('./pages/student/Settings'));
const HeadwayAudio = lazy(() => import('./pages/student/HeadwayAudio'));
const TestBuilder = lazy(() => import('./pages/student/TestBuilder'));
const ModuleTestBuilder = lazy(() => import('./pages/student/ModuleTestBuilder'));
const HeadwayGrammar = lazy(() => import('./pages/student/HeadwayGrammar'));
const StudentModules = lazy(() => import('./pages/student/Modules'));
const NotFound = lazy(() => import('./pages/NotFound'));
const GuidePage = lazy(() => import('./pages/GuidePage'));
import { apiUrl } from './lib/apiUrl';
import { isProfileAccessAllowed } from './lib/profileAccess';
import { normalizeUserRole } from './lib/userRole';
import { defaultFeatureFlags, extractFeatureFlags, FeatureFlags } from './lib/platformFeatures';
import ForcePasswordChangeModal from './components/ForcePasswordChangeModal';
import { SeasonalThemeProvider } from './components/SeasonalThemeProvider';
import { HolidayEffects } from './components/HolidayEffects';
import { useActiveHoliday } from './lib/useActiveHoliday';
import HolidayGreetingModal from './components/HolidayGreetingModal';

function ActiveHolidayEffects() {
  const active = useActiveHoliday();
  return <HolidayEffects holidayKey={active?.key ?? null} />;
}

const PLATFORM_CONFIG_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const SESSION_STORAGE_KEY = 'qm_platform_init';

// In-memory cache for within-session reuse
let platformConfigCache: { data: any; expiresAt: number } = { data: null, expiresAt: 0 };

// Read/write sessionStorage so data survives React re-mounts but not tab close
function readPlatformInitCache(): any | null {
  try {
    const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Date.now() < parsed.expiresAt) return parsed.data;
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
  } catch { /* ignore */ }
  return null;
}
function writePlatformInitCache(data: any) {
  try {
    sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ data, expiresAt: Date.now() + PLATFORM_CONFIG_CACHE_TTL_MS }));
  } catch { /* quota exceeded — ignore */ }
}

export default function App() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [features, setFeatures] = useState<FeatureFlags>(defaultFeatureFlags);
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [forcePasswordChange, setForcePasswordChange] = useState(false);
  const [showFirstLoginPWA, setShowFirstLoginPWA] = useState(false);
  const pendingPWARef = useRef(false);
  const { state: pwaState, install: pwaInstall } = usePWAInstall();
  // Tracks the userId that initSession already loaded so onAuthStateChange
  // doesn't trigger a redundant second fetchProfile on startup.
  const initializedUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    const checkBackend = async () => {
      const maxAttempts = 3;
      const delayMs = 1500;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          const res = await fetch(apiUrl('/api/health'));
          if (!res.ok) throw new Error('Backend not responding');
          console.log('Backend health check: OK');
          return;
        } catch (error) {
          if (attempt < maxAttempts) {
            await new Promise(r => setTimeout(r, delayMs));
          } else {
            console.error('Backend health check failed:', error);
            toast.error('Backend server is not reachable.');
          }
        }
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
      // 1. In-memory cache (fastest — survives React re-renders)
      if (platformConfigCache.data && Date.now() < platformConfigCache.expiresAt) {
        applyPlatformInit(platformConfigCache.data);
        return;
      }
      // 2. sessionStorage cache (survives page navigations within the tab)
      const cached = readPlatformInitCache();
      if (cached) {
        platformConfigCache = { data: cached, expiresAt: Date.now() + PLATFORM_CONFIG_CACHE_TTL_MS };
        applyPlatformInit(cached);
        return;
      }
      // 3. Network — ONE request instead of two
      const res = await fetch(apiUrl('/api/platform/init'));
      const json = await res.json().catch(() => ({}));
      if (res.ok && json?.success) {
        platformConfigCache = { data: json, expiresAt: Date.now() + PLATFORM_CONFIG_CACHE_TTL_MS };
        writePlatformInitCache(json);
        applyPlatformInit(json);
      }
    } catch {
      // keep defaults when config table is unavailable
    }
  };

  const applyPlatformInit = (json: any) => {
    if (!json?.success) return;
    const nextFeatures = extractFeatureFlags({ features: json.features });
    setFeatures(nextFeatures);
    setMaintenanceMode(Boolean(json.maintenanceMode));
    const schoolName = String(json.schoolName || 'QuizMaster').trim();
    if (schoolName) document.title = schoolName;
    // Apply favicon
    const faviconUrl = json?.faviconUrl;
    if (typeof faviconUrl === 'string' && faviconUrl.trim()) {
      let link = document.querySelector("link[rel~='icon']") as HTMLLinkElement | null;
      if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.head.appendChild(link);
      }
      link.href = faviconUrl;
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

        const isFirstLogin = sessionStorage.getItem('firstLoginHint') === '1';
        if (Boolean(profile.force_password_change) || isFirstLogin) {
          setForcePasswordChange(true);
          if (isFirstLogin) pendingPWARef.current = true;
        }
      }
    } catch (error) {
      console.error('Error fetching profile:', error);
    } finally {
      setLoading(false);
    }
  };

  // After the force-password modal is dismissed, trigger PWA install if this was a first login
  const handlePasswordChangeDone = () => {
    setForcePasswordChange(false);
    sessionStorage.removeItem('firstLoginHint');
    if (pendingPWARef.current) {
      pendingPWARef.current = false;
      if (pwaState === 'available') {
        pwaInstall();
      } else if (pwaState === 'ios') {
        setShowFirstLoginPWA(true);
      }
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
    <SeasonalThemeProvider>
    <ActiveHolidayEffects />
    <HolidayGreetingModal />
    <Router>
      <Toaster position="top-right" richColors />
      {forcePasswordChange && user && (
        <ForcePasswordChangeModal onDone={handlePasswordChangeDone} />
      )}
      {showFirstLoginPWA && (
        <IOSInstructionsModal
          onClose={() => setShowFirstLoginPWA(false)}
          schoolName={user?.displayName ? '' : 'QuizMaster'}
        />
      )}
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
    </SeasonalThemeProvider>
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
      <Route path="/student-payments" element={<AdminStudentPayments />} />
      <Route path="/teacher-hours" element={<AdminTeacherHours />} />
      <Route path="/settings" element={<AdminSettings />} />
      <Route path="/branding" element={<AdminBranding />} />
      <Route path="/domain" element={<AdminDomain />} />
      <Route path="/roles" element={<AdminRoles />} />
      <Route path="/profile" element={<AdminProfile />} />
      <Route path="/security" element={<AdminSecurityPage />} />
      <Route path="/guide" element={<GuidePage />} />
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
      <Route path="/quizzes/test-builder" element={<SmartTestBuilder />} />
      <Route path="/live-quiz" element={<RealtimeQuizHost />} />
      <Route path="/live-quiz/reports" element={<RealtimeQuizReports />} />
      <Route path="/exams" element={<TeacherExams />} />
      <Route path="/results" element={<TeacherResults />} />
      <Route path="/modules" element={<TeacherModules />} />
      <Route path="/modules/:moduleId" element={<TeacherModuleDetail />} />
      <Route path="/courses/:courseId/modules" element={<TeacherModules />} />
      <Route path="/headway-tests" element={<HeadwayTestImport />} />
      <Route path="/module-tests" element={<TeacherModuleTests />} />
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
      <Route path="/progress/:studentId" element={<StudentProgressDetail />} />
      <Route path="/profile" element={<TeacherProfilePage />} />
      <Route path="/settings" element={<TeacherSettingsPage />} />
      <Route path="/exams/builder/:examId" element={<TeacherExamBuilder />} />
      <Route path="/guide" element={<GuidePage />} />
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
      <Route path="/modules" element={<StudentModules />} />
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
      <Route path="/quiz/:quizId" element={<QuizExperience />} />
      <Route path="/results/:attemptId" element={<QuizResults />} />
      <Route path="/profile" element={<StudentProfile />} />
      <Route path="/settings" element={<StudentSettingsPage />} />
      <Route path="/headway-audio" element={<HeadwayAudio />} />
      <Route path="/test-builder" element={<TestBuilder />} />
      <Route path="/module-test-builder" element={<ModuleTestBuilder />} />
      <Route path="/headway-grammar" element={<HeadwayGrammar />} />
      <Route path="/guide" element={<GuidePage />} />
      <Route path="*" element={<Navigate to="/not-found" replace />} />
    </Routes>
  );
}

