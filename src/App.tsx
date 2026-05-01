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
import StudentLiveSessionsList from './pages/student/LiveSessionsList';
import StudentExams from './pages/student/Exams';
import NotFound from './pages/NotFound';
import { apiUrl, authFetch } from './lib/apiUrl';
import { isProfileAccessAllowed } from './lib/profileAccess';
import { normalizeUserRole } from './lib/userRole';
import { defaultFeatureFlags, extractFeatureFlags, FeatureFlags } from './lib/platformFeatures';

export default function App() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [features, setFeatures] = useState<FeatureFlags>(defaultFeatureFlags);
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  // When 2FA is required but not yet completed, we store the pending userId here
  // and render TwoFaChallengeGate instead of signing the user out.
  const [twoFaGate, setTwoFaGate] = useState<{ userId: string } | null>(null);

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

        // ── 2FA enforcement on refresh ──
        // Ask the server whether this role needs 2FA and whether the user
        // has already verified in this session.  If verification is still
        // required we do NOT sign the user out — instead we raise the
        // TwoFaChallengeGate overlay (keeping the Supabase session alive so
        // authFetch continues to work) and wait for the user to complete
        // verification before setting the user profile.
        try {
          const reqRes = await authFetch('/api/auth/2fa/required');
          const reqJson = await reqRes.json().catch(() => ({}));
          if (reqRes.ok && reqJson?.required) {
            setTwoFaGate({ userId });
            return;
          }
        } catch (twoFaErr) {
          console.warn('[App] 2FA gate check failed (allowing session)', twoFaErr);
        }

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

  // 2FA gate: session is alive but the user hasn't completed 2FA verification.
  // Render an overlay (no sign-out) so the user can enter their code.
  if (twoFaGate) {
    return (
      <TwoFaChallengeGate
        onVerified={() => {
          setTwoFaGate(null);
          void fetchProfile(twoFaGate.userId);
        }}
        onCancel={async () => {
          await supabase.auth.signOut();
          setTwoFaGate(null);
        }}
      />
    );
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
      <Route path="/live-sessions" element={features.liveSessionsEnabled ? <StudentLiveSessionsList /> : <Navigate to="/not-found" replace />} />
      <Route path="/live-sessions/:id" element={features.liveSessionsEnabled ? <StudentLiveSessionJoin /> : <Navigate to="/not-found" replace />} />
      <Route path="/exams" element={<StudentExams />} />
      <Route path="/quiz/:quizId" element={<QuizTaking />} />
      <Route path="/results/:attemptId" element={<QuizResults />} />
      <Route path="/profile" element={<StudentProfile />} />
      <Route path="*" element={<Navigate to="/not-found" replace />} />
    </Routes>
  );
}

/* ─── 2FA challenge overlay ──────────────────────────────────────────────── */
// Shown when the server confirms 2FA is required but the user hasn't verified
// yet (e.g. after a server restart or a fresh session on a 2FA-enabled role).
// The Supabase session is kept alive so authFetch keeps working.

function TwoFaChallengeGate({ onVerified, onCancel }: {
  onVerified: () => void;
  onCancel: () => Promise<void>;
}) {
  const [code, setCode] = React.useState('');
  const [verifying, setVerifying] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [maskedEmail, setMaskedEmail] = React.useState('');
  const sentRef = React.useRef(false);

  const sendChallenge = React.useCallback(async () => {
    setBusy(true);
    try {
      const res = await authFetch('/api/auth/2fa/challenge', { method: 'POST' });
      const json = await res.json().catch(() => ({}));
      if (json.maskedEmail) setMaskedEmail(json.maskedEmail);
      if (json.devCode) {
        toast.message(`Your verification code: ${json.devCode}`, {
          description: 'Enter this code below to continue',
          duration: 30_000,
        });
      }
    } catch { /* ignore */ } finally { setBusy(false); }
  }, []);

  React.useEffect(() => {
    if (sentRef.current) return;
    sentRef.current = true;
    void sendChallenge();
  }, [sendChallenge]);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(code)) { toast.error('Code must be 6 digits'); return; }
    setVerifying(true);
    try {
      const res = await authFetch('/api/auth/2fa/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.success) throw new Error(json?.error || 'Verification failed');
      toast.success('Verified — welcome back!');
      onVerified();
    } catch (err: any) {
      toast.error(err.message || 'Verification failed');
    } finally { setVerifying(false); }
  };

  const handleResend = async () => {
    setCode('');
    await sendChallenge();
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 p-4">
      <Toaster position="top-right" richColors />
      <div className="w-full max-w-sm">
        {/* header */}
        <div className="flex items-center gap-2.5 mb-8 justify-center">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.955 11.955 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
            </svg>
          </div>
          <span className="text-white font-bold text-base">Two-Factor Authentication</span>
        </div>

        {/* card */}
        <div
          className="rounded-3xl p-7"
          style={{
            background: 'linear-gradient(145deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02))',
            border: '1px solid rgba(255,255,255,0.07)',
            boxShadow: '0 32px 64px rgba(0,0,0,0.4)',
          }}
        >
          <div className="mb-5">
            <p className="text-white font-semibold text-lg">Verify it&apos;s you</p>
            <p className="text-slate-400 text-sm mt-1">
              {maskedEmail
                ? <>Code sent to <span className="text-slate-300">{maskedEmail}</span> — check the notification above.</>
                : 'Your code appeared in the notification above.'}
            </p>
          </div>

          <form onSubmit={handleVerify} className="space-y-5">
            <div>
              <label className="text-xs font-medium text-slate-500 uppercase tracking-widest block mb-1.5">
                Verification Code
              </label>
              <div
                className="flex items-center rounded-xl overflow-hidden"
                style={{
                  background: 'rgba(16,185,129,0.06)',
                  border: '1px solid rgba(16,185,129,0.25)',
                  boxShadow: '0 0 0 3px rgba(16,185,129,0.06)',
                }}
              >
                <svg className="ml-4 w-4 h-4 shrink-0 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
                </svg>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  autoFocus
                  maxLength={6}
                  value={code}
                  onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  className="flex-1 px-3 py-3.5 bg-transparent text-center text-xl font-bold tracking-[0.5em] text-white placeholder:text-slate-700 placeholder:tracking-[0.3em] focus:outline-none"
                />
              </div>
              <p className="text-[11px] text-slate-500 text-center pt-1.5">
                Code expires in 5 minutes — 5 attempts allowed
              </p>
            </div>

            <button
              type="submit"
              disabled={verifying || code.length !== 6}
              className="relative w-full py-3.5 rounded-xl font-semibold text-sm text-white flex items-center justify-center gap-2 overflow-hidden transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: 'linear-gradient(135deg,#10b981 0%,#059669 50%,#047857 100%)', boxShadow: '0 8px 24px rgba(5,150,105,0.4)' }}
            >
              <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent" />
              {verifying ? (
                <>
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Verifying…
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.955 11.955 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                  </svg>
                  Verify &amp; Continue
                </>
              )}
            </button>

            <div className="flex items-center justify-between pt-1">
              <button
                type="button"
                onClick={() => void onCancel()}
                className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
                </svg>
                Sign out
              </button>
              <button
                type="button"
                onClick={() => void handleResend()}
                disabled={busy}
                className="inline-flex items-center gap-1.5 text-xs text-emerald-400 hover:text-emerald-300 disabled:opacity-50 transition-colors"
              >
                <svg className={`w-3 h-3 ${busy ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                </svg>
                {busy ? 'Sending…' : 'Resend code'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
