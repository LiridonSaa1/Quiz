import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { supabase } from '../supabase';
import { apiUrl } from '../lib/apiUrl';
import { isProfileAccessAllowed } from '../lib/profileAccess';
import LanguageDropdown from '../components/LanguageDropdown';
import {
  Mail, Lock, Shield, GraduationCap,
  BookOpen, Users, Trophy, Eye, EyeOff,
  ArrowRight, Sparkles, CheckCircle2, BarChart3, Loader2,
} from 'lucide-react';

const Noise = () => (
  <svg className="absolute inset-0 w-full h-full opacity-[0.035] pointer-events-none" xmlns="http://www.w3.org/2000/svg">
    <filter id="noise">
      <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch" />
      <feColorMatrix type="saturate" values="0" />
    </filter>
    <rect width="100%" height="100%" filter="url(#noise)" />
  </svg>
);

const Ring = ({ size, opacity, className }: { size: number; opacity: number; className?: string }) => (
  <div
    className={`absolute rounded-full border pointer-events-none ${className}`}
    style={{ width: size, height: size, borderColor: `rgba(139,92,246,${opacity})` }}
  />
);

export default function Login() {
  const { t } = useTranslation();
  const [email, setEmail]           = useState('');
  const [password, setPassword]     = useState('');
  const [showPw, setShowPw]         = useState(false);
  const [loading, setLoading]       = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);
  const [checking, setChecking]     = useState(false);
  const [seeding, setSeeding]       = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [activeField, setActiveField] = useState<'email' | 'password' | null>(null);
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const mouseRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const blobRef  = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const FEATURES = [
    { icon: BookOpen,  title: t('login.features.smartCourseBuilder'),    desc: t('login.features.smartCourseBuilderDesc') },
    { icon: Users,     title: t('login.features.liveStudentTracking'),   desc: t('login.features.liveStudentTrackingDesc') },
    { icon: BarChart3, title: t('login.features.deepQuizAnalytics'),     desc: t('login.features.deepQuizAnalyticsDesc') },
    { icon: Trophy,    title: t('login.features.autoCertificates'),      desc: t('login.features.autoCertificatesDesc') },
  ];

  const STATS = [
    { value: '12 k+', label: t('login.stats.students') },
    { value: '98 %',  label: t('login.stats.satisfaction') },
    { value: '600+',  label: t('login.stats.courses') },
  ];

  const fetchRuntimeMaintenance = async (): Promise<boolean | null> => {
    try {
      const res = await fetch(`${apiUrl('/api/platform/runtime')}?t=${Date.now()}`, { cache: 'no-store' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.success) return null;
      return Boolean(json.maintenanceMode);
    } catch { return null; }
  };

  useEffect(() => {
    const el = blobRef.current;
    if (!el) return;
    const onMove = (e: MouseEvent) => {
      const rect = el.parentElement!.getBoundingClientRect();
      mouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      el.style.transform = `translate(${mouseRef.current.x - 300}px, ${mouseRef.current.y - 300}px)`;
    };
    el.parentElement!.addEventListener('mousemove', onMove);
    return () => el.parentElement!.removeEventListener('mousemove', onMove);
  }, []);

  useEffect(() => {
    const url = import.meta.env.VITE_SUPABASE_URL;
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
    if (!url || !key) setConfigError('Supabase config missing — add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to Secrets.');
  }, []);

  useEffect(() => {
    const skipIfAuthenticated = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user?.id) navigate('/', { replace: true });
    };
    void skipIfAuthenticated();
  }, [navigate]);

  useEffect(() => {
    const loadMaintenanceMode = async () => {
      const enabled = await fetchRuntimeMaintenance();
      setMaintenanceMode(Boolean(enabled));
    };
    void loadMaintenanceMode();
  }, []);

  const checkConnection = async () => {
    setChecking(true);
    try {
      const res  = await fetch(apiUrl('/api/health'));
      const data = await res.json();
      data.supabase?.status === 'connected'
        ? toast.success(t('success.dbConnected'))
        : toast.error(`DB error: ${data.supabase?.error ?? 'unknown'}`);
    } catch { toast.error(t('errors.loadFailed')); }
    finally { setChecking(false); }
  };

  const seedAdmin = async () => {
    setSeeding(true);
    try {
      const text = await fetch(apiUrl('/api/admin/seed')).then(r => r.text());
      text.includes('Success') ? toast.success(t('success.adminSeeded')) : toast.error('Seed failed.');
    } catch { toast.error(t('errors.loadFailed')); }
    finally { setSeeding(false); }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data: signData, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      const uid = signData.user?.id;
      if (!uid) throw new Error('No user id returned');

      const { data: prof, error: profileError } = await supabase
        .from('profiles')
        .select('status, role')
        .eq('id', uid)
        .single();

      if (profileError) {
        await supabase.auth.signOut();
        throw new Error(profileError.message || 'Could not load your profile');
      }
      if (!isProfileAccessAllowed(prof?.status)) {
        await supabase.auth.signOut();
        toast.error(t('errors.accountDisabled'), { id: 'account-disabled' });
        return;
      }

      const role = String(prof?.role || 'student').toLowerCase();
      const latestMaintenance = await fetchRuntimeMaintenance();
      const isMaintenance = latestMaintenance === null ? maintenanceMode : latestMaintenance;
      setMaintenanceMode(Boolean(isMaintenance));

      if (isMaintenance && role !== 'admin') {
        await supabase.auth.signOut();
        toast.error(t('login.maintenanceBanner'), { id: 'maintenance-mode' });
        return;
      }

      toast.success(t('login.welcomeBack') + '!');
      navigate('/');
    } catch (err: any) {
      const msg = err.message || 'Login failed';
      toast.error(msg);
      if (msg.includes('Invalid login credentials')) {
        toast.info('Check your email and password. Student accounts are created by an admin or teacher.');
      }
    } finally { setLoading(false); }
  };

  const handleGoogleLogin = async () => {
    setGoogleLoading(true);
    try {
      const redirectTo = `${window.location.origin}/`;
      const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } });
      if (error) throw error;
    } catch (err: any) {
      toast.error(err.message || 'Google login failed');
      setGoogleLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] flex font-sans antialiased" style={{ background: '#080a12' }}>

      {/* ═══════════════════ LEFT ═══════════════════ */}
      <div
        className="hidden lg:flex lg:w-[55%] flex-col relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg,#0d0f1e 0%,#110d2a 50%,#0a0d1e 100%)' }}
      >
        <Noise />
        <Ring size={700} opacity={0.12} className="-top-[200px] -left-[200px]" />
        <Ring size={500} opacity={0.08} className="top-[100px] -left-[50px]" />
        <Ring size={900} opacity={0.06} className="-bottom-[350px] -right-[300px]" />

        <div
          ref={blobRef}
          className="absolute w-[600px] h-[600px] rounded-full pointer-events-none transition-transform duration-700 ease-out"
          style={{ background: 'radial-gradient(circle,rgba(124,58,237,0.18) 0%,transparent 70%)', willChange: 'transform' }}
        />
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-violet-500/30 to-transparent" />

        <div className="relative z-10 flex flex-col h-full px-14 py-12">
          {/* Logo */}
          <div className="flex items-center gap-3 mb-auto">
            <div className="relative">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-900/60">
                <GraduationCap className="w-5 h-5 text-white" />
              </div>
              <div className="absolute -inset-0.5 rounded-xl bg-gradient-to-br from-violet-400 to-indigo-500 opacity-30 blur-sm -z-10" />
            </div>
            <div>
              <div className="text-base font-bold text-white tracking-tight leading-none">QuizMaster</div>
              <div className="text-[10px] text-violet-400/70 tracking-[0.2em] uppercase mt-0.5">Education Platform</div>
            </div>
          </div>

          {/* Hero text */}
          <div className="my-auto space-y-8">
            <div className="flex items-center gap-2">
              <div className="h-px w-8 bg-violet-500" />
              <span className="text-xs font-semibold tracking-widest text-violet-400 uppercase">{t('login.poweredByAI')}</span>
            </div>

            {(() => {
              const words = t('login.heroTitle').split(' ');
              const line1 = words.slice(0, 2).join(' ');
              const line2 = words.slice(2, -1).join(' ');
              const lastWord = words[words.length - 1];
              return (
                <h1 className="text-[3.5rem] font-extrabold leading-[1.05] tracking-tight text-white">
                  {line1}<br />
                  {line2 && <>{line2}{' '}</>}
                  <span
                    className="relative inline-block"
                    style={{ background: 'linear-gradient(90deg,#a78bfa,#818cf8,#c084fc)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}
                  >
                    {lastWord}
                    <svg className="absolute -bottom-1 left-0 w-full" height="6" viewBox="0 0 100 6" preserveAspectRatio="none">
                      <path d="M0 5 Q25 0 50 5 Q75 10 100 5" stroke="url(#ul)" strokeWidth="2" fill="none" />
                      <defs>
                        <linearGradient id="ul" x1="0%" y1="0%" x2="100%" y2="0%">
                          <stop offset="0%" stopColor="#a78bfa" />
                          <stop offset="100%" stopColor="#c084fc" />
                        </linearGradient>
                      </defs>
                    </svg>
                  </span>
                </h1>
              );
            })()}

            <p className="text-slate-400 text-base leading-relaxed max-w-sm">{t('login.heroDesc')}</p>

            <div className="space-y-3 pt-2">
              {FEATURES.map(({ icon: Icon, title, desc }) => (
                <div key={title} className="flex items-start gap-3.5 group">
                  <div className="mt-0.5 w-8 h-8 rounded-lg bg-violet-500/10 border border-violet-500/20 flex items-center justify-center shrink-0 group-hover:bg-violet-500/20 transition-colors">
                    <Icon className="w-3.5 h-3.5 text-violet-400" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-slate-200">{title}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Stats row */}
          <div className="mt-auto pt-10 flex items-center gap-8 border-t border-white/[0.06]">
            {STATS.map(({ value, label }) => (
              <div key={label}>
                <div className="text-xl font-bold text-white">{value}</div>
                <div className="text-xs text-slate-500 mt-0.5">{label}</div>
              </div>
            ))}
            <div className="ml-auto flex items-center gap-2 text-xs text-slate-500">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              {t('login.allSystemsNormal')}
            </div>
          </div>
        </div>
        <div className="absolute inset-y-0 right-0 w-px bg-gradient-to-b from-transparent via-violet-500/20 to-transparent" />
      </div>

      {/* ═══════════════════ RIGHT ══════════════════ */}
      <div
        className="flex-1 flex items-center justify-center px-6 relative overflow-y-auto"
        style={{
          background: '#080a12',
          paddingTop: 'max(1.5rem, env(safe-area-inset-top))',
          paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))',
          paddingLeft: 'max(1.5rem, env(safe-area-inset-left))',
          paddingRight: 'max(1.5rem, env(safe-area-inset-right))',
        }}
      >
        <Noise />
        <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse 60% 50% at 50% 50%,rgba(109,40,217,0.07),transparent)' }} />

        {/* Language switcher top-right */}
        <div className="absolute top-4 right-4 z-20">
          <LanguageDropdown variant="dark" />
        </div>

        <div className="relative z-10 w-full max-w-[400px]">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-3 mb-10">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
              <GraduationCap className="w-4 h-4 text-white" />
            </div>
            <span className="text-base font-bold text-white">QuizMaster</span>
          </div>

          {configError && (
            <div className="mb-6 p-4 rounded-2xl border border-red-500/20 bg-red-500/8 flex gap-3">
              <Shield className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <p className="text-xs text-red-400 leading-relaxed">{configError}</p>
            </div>
          )}

          {maintenanceMode && (
            <div className="mb-6 p-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 flex gap-3">
              <Shield className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-200 leading-relaxed">{t('login.maintenanceBanner')}</p>
            </div>
          )}

          {/* header */}
          <div className="mb-8">
            <div className="inline-flex items-center gap-1.5 bg-violet-500/10 border border-violet-500/20 rounded-full px-3 py-1 mb-4">
              <Sparkles className="w-3 h-3 text-violet-400" />
              <span className="text-[11px] font-semibold text-violet-400 tracking-wide">{t('login.welcomeBack')}</span>
            </div>
            <h2 className="text-2xl font-bold text-white tracking-tight">{t('login.title')}</h2>
            <p className="text-slate-500 text-sm mt-1.5">{t('login.subtitle')}</p>
          </div>

          {/* form card */}
          <div
            className="relative rounded-3xl p-7"
            style={{
              background: 'linear-gradient(145deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02))',
              border: '1px solid rgba(255,255,255,0.07)',
              boxShadow: '0 0 0 1px rgba(255,255,255,0.03) inset, 0 32px 64px rgba(0,0,0,0.4)',
            }}
          >
            <div className="absolute top-0 left-8 right-8 h-px bg-gradient-to-r from-transparent via-violet-500/40 to-transparent rounded-full" />

            <form onSubmit={handleLogin} className="space-y-4">
              {/* email */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-500 uppercase tracking-widest">{t('login.email')}</label>
                <div
                  className="flex items-center rounded-xl transition-all duration-200 overflow-hidden"
                  style={{
                    background: activeField === 'email' ? 'rgba(124,58,237,0.08)' : 'rgba(255,255,255,0.04)',
                    border: activeField === 'email' ? '1px solid rgba(124,58,237,0.4)' : '1px solid rgba(255,255,255,0.07)',
                    boxShadow: activeField === 'email' ? '0 0 0 3px rgba(124,58,237,0.1)' : 'none',
                  }}
                >
                  <Mail className={`ml-4 w-4 h-4 shrink-0 transition-colors duration-200 ${activeField === 'email' ? 'text-violet-400' : 'text-slate-600'}`} />
                  <input
                    type="email" required value={email}
                    onChange={e => setEmail(e.target.value)}
                    onFocus={() => setActiveField('email')}
                    onBlur={() => setActiveField(null)}
                    placeholder="you@example.com"
                    autoComplete="email"
                    className="flex-1 px-3 py-3.5 bg-transparent text-sm text-white placeholder:text-slate-700 focus:outline-none"
                  />
                  {email && <CheckCircle2 className="mr-3 w-4 h-4 text-emerald-500 shrink-0" />}
                </div>
              </div>

              {/* password */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-500 uppercase tracking-widest">{t('login.password')}</label>
                <div
                  className="flex items-center rounded-xl transition-all duration-200 overflow-hidden"
                  style={{
                    background: activeField === 'password' ? 'rgba(124,58,237,0.08)' : 'rgba(255,255,255,0.04)',
                    border: activeField === 'password' ? '1px solid rgba(124,58,237,0.4)' : '1px solid rgba(255,255,255,0.07)',
                    boxShadow: activeField === 'password' ? '0 0 0 3px rgba(124,58,237,0.1)' : 'none',
                  }}
                >
                  <Lock className={`ml-4 w-4 h-4 shrink-0 transition-colors duration-200 ${activeField === 'password' ? 'text-violet-400' : 'text-slate-600'}`} />
                  <input
                    type={showPw ? 'text' : 'password'} required value={password}
                    onChange={e => setPassword(e.target.value)}
                    onFocus={() => setActiveField('password')}
                    onBlur={() => setActiveField(null)}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    className="flex-1 px-3 py-3.5 bg-transparent text-sm text-white placeholder:text-slate-700 focus:outline-none"
                  />
                  <button type="button" onClick={() => setShowPw(!showPw)} tabIndex={-1} className="mr-3 text-slate-600 hover:text-slate-300 transition-colors">
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* submit */}
              <button
                type="submit" disabled={loading}
                className="relative w-full mt-2 py-3.5 rounded-xl font-semibold text-sm text-white flex items-center justify-center gap-2 overflow-hidden transition-all duration-200 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  background: loading ? 'rgba(124,58,237,0.6)' : 'linear-gradient(135deg,#7c3aed 0%,#6d28d9 50%,#5b21b6 100%)',
                  boxShadow: '0 1px 0 rgba(255,255,255,0.12) inset, 0 8px 24px rgba(109,40,217,0.45)',
                }}
              >
                <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent" />
                {loading ? (
                  <><Loader2 className="animate-spin w-4 h-4" />{t('login.signingIn')}</>
                ) : (
                  <>{t('login.signIn')}<ArrowRight className="w-4 h-4" /></>
                )}
              </button>
            </form>

            <div className="my-4 flex items-center gap-3">
              <div className="h-px flex-1 bg-white/[0.08]" />
              <span className="text-[11px] text-slate-600 uppercase tracking-wider">{t('common.or')}</span>
              <div className="h-px flex-1 bg-white/[0.08]" />
            </div>

            <button
              type="button" onClick={handleGoogleLogin}
              disabled={googleLoading || loading}
              className="w-full py-3 rounded-xl text-sm font-semibold border border-white/10 bg-white/[0.03] text-slate-200 hover:bg-white/[0.06] transition-all disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {googleLoading ? t('login.redirectingToGoogle') : t('login.continueWithGoogle')}
            </button>
          </div>

          {/* dev utility links */}
          <div className="mt-5 flex gap-1">
            <button
              onClick={checkConnection} disabled={checking}
              className="flex-1 py-2 text-[11px] text-slate-600 hover:text-slate-400 transition-colors flex items-center justify-center gap-1.5 rounded-lg hover:bg-white/[0.03]"
            >
              <Shield className={`w-3 h-3 ${checking ? 'animate-spin' : ''}`} />
              {checking ? t('login.checking') : t('login.checkDB')}
            </button>
            <div className="w-px bg-white/[0.05] my-1" />
            <button
              onClick={seedAdmin} disabled={seeding}
              className="flex-1 py-2 text-[11px] text-slate-600 hover:text-slate-400 transition-colors flex items-center justify-center gap-1.5 rounded-lg hover:bg-white/[0.03]"
            >
              <GraduationCap className={`w-3 h-3 ${seeding ? 'animate-spin' : ''}`} />
              {seeding ? t('login.seeding') : t('login.seedAdmin')}
            </button>
          </div>

          <p className="mt-5 text-center text-[11px] text-slate-700">{t('login.noAccount')}</p>
        </div>
      </div>
    </div>
  );
}
