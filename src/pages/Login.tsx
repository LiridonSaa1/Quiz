import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { supabase } from '../supabase';
import { apiUrl } from '../lib/apiUrl';
import { isProfileAccessAllowed } from '../lib/profileAccess';
import {
  Mail, Lock, Shield, GraduationCap,
  BookOpen, Users, Trophy, Eye, EyeOff,
  ArrowRight, Sparkles, CheckCircle2, BarChart3
} from 'lucide-react';

/* ─── tiny helpers ─────────────────────────────────────────── */

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

/* ─── static data ───────────────────────────────────────────── */

const FEATURES = [
  { icon: BookOpen, title: 'Smart Course Builder', desc: 'Create structured lessons with AI assistance in minutes.' },
  { icon: Users,    title: 'Live Student Tracking', desc: 'Real-time progress monitoring for every learner.' },
  { icon: BarChart3,title: 'Deep Quiz Analytics',  desc: 'Granular insights into scores, trends, and gaps.' },
  { icon: Trophy,   title: 'Auto Certificates',    desc: 'Beautiful certificates issued automatically on completion.' },
];

const STATS = [
  { value: '12 k+', label: 'Students' },
  { value: '98 %',  label: 'Satisfaction' },
  { value: '600+',  label: 'Courses' },
];

/* ─── component ────────────────────────────────────────────── */

export default function Login() {
  const [email, setEmail]           = useState('');
  const [password, setPassword]     = useState('');
  const [showPw, setShowPw]         = useState(false);
  const [loading, setLoading]       = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);
  const [checking, setChecking]     = useState(false);
  const [seeding, setSeeding]       = useState(false);
  const [activeField, setActiveField] = useState<'email' | 'password' | null>(null);
  const mouseRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const blobRef  = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  /* Cursor-following blob on left panel */
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

  const checkConnection = async () => {
    setChecking(true);
    try {
      const res  = await fetch(apiUrl('/api/health'));
      const data = await res.json();
      data.supabase?.status === 'connected'
        ? toast.success('Database connected!')
        : toast.error(`DB error: ${data.supabase?.error ?? 'unknown'}`);
    } catch { toast.error('Could not reach backend.'); }
    finally   { setChecking(false); }
  };

  const seedAdmin = async () => {
    setSeeding(true);
    try {
      const text = await fetch(apiUrl('/api/admin/seed')).then(r => r.text());
      text.includes('Success') ? toast.success('Admin seeded!') : toast.error('Seed failed.');
    } catch { toast.error('Could not reach backend.'); }
    finally   { setSeeding(false); }
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
        .select('status')
        .eq('id', uid)
        .single();

      if (profileError) {
        await supabase.auth.signOut();
        throw new Error(profileError.message || 'Could not load your profile');
      }
      if (!isProfileAccessAllowed(prof?.status)) {
        await supabase.auth.signOut();
        toast.error('This account has been disabled. Contact an administrator.', { id: 'account-disabled' });
        return;
      }

      toast.success('Welcome back!');
      navigate('/');
    } catch (err: any) {
      toast.error(err.message || 'Login failed');
      if (err.message?.includes('Invalid login credentials')) toast.info('Seed the admin account first.');
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex font-sans antialiased" style={{ background: '#080a12' }}>

      {/* ═══════════════════ LEFT ═══════════════════ */}
      <div
        className="hidden lg:flex lg:w-[55%] flex-col relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg,#0d0f1e 0%,#110d2a 50%,#0a0d1e 100%)' }}
      >
        <Noise />

        {/* decorative rings */}
        <Ring size={700} opacity={0.12} className="-top-[200px] -left-[200px]" />
        <Ring size={500} opacity={0.08} className="top-[100px] -left-[50px]" />
        <Ring size={900} opacity={0.06} className="-bottom-[350px] -right-[300px]" />

        {/* cursor-follow blob */}
        <div
          ref={blobRef}
          className="absolute w-[600px] h-[600px] rounded-full pointer-events-none transition-transform duration-700 ease-out"
          style={{ background: 'radial-gradient(circle,rgba(124,58,237,0.18) 0%,transparent 70%)', willChange: 'transform' }}
        />

        {/* top horizontal line accent */}
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-violet-500/30 to-transparent" />

        {/* ── content ── */}
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
            {/* label */}
            <div className="flex items-center gap-2">
              <div className="h-px w-8 bg-violet-500" />
              <span className="text-xs font-semibold tracking-widest text-violet-400 uppercase">Powered by AI</span>
            </div>

            <h1 className="text-[3.5rem] font-extrabold leading-[1.05] tracking-tight text-white">
              The platform<br />
              educators{' '}
              <span
                className="relative inline-block"
                style={{
                  background: 'linear-gradient(90deg,#a78bfa,#818cf8,#c084fc)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}
              >
                love
                <svg className="absolute -bottom-1 left-0 w-full" height="6" viewBox="0 0 100 6" preserveAspectRatio="none">
                  <path d="M0 5 Q25 0 50 5 Q75 10 100 5" stroke="url(#ul)" strokeWidth="2" fill="none" />
                  <defs>
                    <linearGradient id="ul" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%"   stopColor="#a78bfa" />
                      <stop offset="100%" stopColor="#c084fc" />
                    </linearGradient>
                  </defs>
                </svg>
              </span>
            </h1>

            <p className="text-slate-400 text-base leading-relaxed max-w-sm">
              Build courses, track students, run quizzes, and issue certificates — all from one beautifully unified workspace.
            </p>

            {/* feature list */}
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
              All systems normal
            </div>
          </div>
        </div>

        {/* right edge fade */}
        <div className="absolute inset-y-0 right-0 w-px bg-gradient-to-b from-transparent via-violet-500/20 to-transparent" />
      </div>

      {/* ═══════════════════ RIGHT ══════════════════ */}
      <div className="flex-1 flex items-center justify-center px-6 relative" style={{ background: '#080a12' }}>
        <Noise />

        {/* soft center glow */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: 'radial-gradient(ellipse 60% 50% at 50% 50%,rgba(109,40,217,0.07),transparent)' }}
        />

        <div className="relative z-10 w-full max-w-[400px]">

          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-3 mb-10">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
              <GraduationCap className="w-4 h-4 text-white" />
            </div>
            <span className="text-base font-bold text-white">QuizMaster</span>
          </div>

          {/* config error */}
          {configError && (
            <div className="mb-6 p-4 rounded-2xl border border-red-500/20 bg-red-500/8 flex gap-3">
              <Shield className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <p className="text-xs text-red-400 leading-relaxed">{configError}</p>
            </div>
          )}

          {/* header */}
          <div className="mb-8">
            <div className="inline-flex items-center gap-1.5 bg-violet-500/10 border border-violet-500/20 rounded-full px-3 py-1 mb-4">
              <Sparkles className="w-3 h-3 text-violet-400" />
              <span className="text-[11px] font-semibold text-violet-400 tracking-wide">Welcome back</span>
            </div>
            <h2 className="text-2xl font-bold text-white tracking-tight">Sign in to continue</h2>
            <p className="text-slate-500 text-sm mt-1.5">Access your dashboard and learning tools</p>
          </div>

          {/* ── form card ── */}
          <div
            className="relative rounded-3xl p-7"
            style={{
              background: 'linear-gradient(145deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02))',
              border: '1px solid rgba(255,255,255,0.07)',
              boxShadow: '0 0 0 1px rgba(255,255,255,0.03) inset, 0 32px 64px rgba(0,0,0,0.4)',
            }}
          >
            {/* gradient top accent */}
            <div className="absolute top-0 left-8 right-8 h-px bg-gradient-to-r from-transparent via-violet-500/40 to-transparent rounded-full" />

            <form onSubmit={handleLogin} className="space-y-4">

              {/* email */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-500 uppercase tracking-widest">Email</label>
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
                    type="email"
                    required
                    value={email}
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
                <label className="text-xs font-medium text-slate-500 uppercase tracking-widest">Password</label>
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
                    type={showPw ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    onFocus={() => setActiveField('password')}
                    onBlur={() => setActiveField(null)}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    className="flex-1 px-3 py-3.5 bg-transparent text-sm text-white placeholder:text-slate-700 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw(!showPw)}
                    tabIndex={-1}
                    className="mr-3 text-slate-600 hover:text-slate-300 transition-colors"
                  >
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* submit */}
              <button
                type="submit"
                disabled={loading}
                className="relative w-full mt-2 py-3.5 rounded-xl font-semibold text-sm text-white flex items-center justify-center gap-2 overflow-hidden transition-all duration-200 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  background: loading
                    ? 'rgba(124,58,237,0.6)'
                    : 'linear-gradient(135deg,#7c3aed 0%,#6d28d9 50%,#5b21b6 100%)',
                  boxShadow: '0 1px 0 rgba(255,255,255,0.12) inset, 0 8px 24px rgba(109,40,217,0.45)',
                }}
              >
                {/* highlight band */}
                <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent" />

                {loading ? (
                  <>
                    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Signing in…
                  </>
                ) : (
                  <>
                    Sign In
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                  </>
                )}
              </button>
            </form>
          </div>

          {/* dev utility links */}
          <div className="mt-5 flex gap-1">
            <button
              onClick={checkConnection}
              disabled={checking}
              className="flex-1 py-2 text-[11px] text-slate-600 hover:text-slate-400 transition-colors flex items-center justify-center gap-1.5 rounded-lg hover:bg-white/[0.03]"
            >
              <Shield className={`w-3 h-3 ${checking ? 'animate-spin' : ''}`} />
              {checking ? 'Checking…' : 'Check DB'}
            </button>
            <div className="w-px bg-white/[0.05] my-1" />
            <button
              onClick={seedAdmin}
              disabled={seeding}
              className="flex-1 py-2 text-[11px] text-slate-600 hover:text-slate-400 transition-colors flex items-center justify-center gap-1.5 rounded-lg hover:bg-white/[0.03]"
            >
              <GraduationCap className={`w-3 h-3 ${seeding ? 'animate-spin' : ''}`} />
              {seeding ? 'Seeding…' : 'Seed Admin'}
            </button>
          </div>

          <p className="mt-5 text-center text-[11px] text-slate-700">
            Contact your administrator if you don't have an account.
          </p>
        </div>
      </div>
    </div>
  );
}
