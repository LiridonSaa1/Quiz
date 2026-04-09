import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { supabase } from '../supabase';
import {
  Mail, Lock, Shield, GraduationCap,
  BookOpen, Users, Trophy, Eye, EyeOff,
  ArrowRight, Zap, CheckCircle2, BarChart3, Award, Star
} from 'lucide-react';

/* ─── keyframe styles injected once ─── */
const CSS = `
@keyframes blob1 {
  0%,100% { transform: translate(0px, 0px) scale(1); }
  33%      { transform: translate(60px, -40px) scale(1.1); }
  66%      { transform: translate(-30px, 50px) scale(0.95); }
}
@keyframes blob2 {
  0%,100% { transform: translate(0px, 0px) scale(1); }
  33%      { transform: translate(-50px, 60px) scale(1.08); }
  66%      { transform: translate(40px, -30px) scale(0.92); }
}
@keyframes blob3 {
  0%,100% { transform: translate(0px, 0px) scale(1); }
  50%      { transform: translate(30px, 40px) scale(1.12); }
}
@keyframes blob4 {
  0%,100% { transform: translate(0px, 0px) scale(1); }
  40%      { transform: translate(-40px, -30px) scale(0.9); }
  80%      { transform: translate(20px, 50px) scale(1.05); }
}
@keyframes shimmer {
  0%   { background-position: -200% center; }
  100% { background-position: 200% center; }
}
@keyframes float {
  0%,100% { transform: translateY(0px); }
  50%      { transform: translateY(-8px); }
}
@keyframes fadeUp {
  from { opacity: 0; transform: translateY(18px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes pulse-ring {
  0%   { box-shadow: 0 0 0 0 rgba(20,184,166,0.4); }
  70%  { box-shadow: 0 0 0 10px rgba(20,184,166,0); }
  100% { box-shadow: 0 0 0 0 rgba(20,184,166,0); }
}
@keyframes spin-slow {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}
@keyframes twinkle {
  0%,100% { opacity: 0.2; transform: scale(1); }
  50%      { opacity: 1; transform: scale(1.4); }
}
.anim-fadeup { animation: fadeUp 0.55s ease both; }
.anim-float  { animation: float 4s ease-in-out infinite; }
`;

/* ─── tiny particle field ─── */
const PARTICLES = Array.from({ length: 28 }, (_, i) => ({
  id: i,
  x: Math.random() * 100,
  y: Math.random() * 100,
  size: Math.random() * 2 + 1,
  delay: Math.random() * 4,
  dur: 2 + Math.random() * 3,
}));

const FEATURES = [
  { icon: BookOpen,  label: 'Smart Course Builder',  desc: 'AI-assisted lessons in minutes' },
  { icon: Users,     label: 'Live Student Tracking',  desc: 'Real-time progress monitoring' },
  { icon: BarChart3, label: 'Deep Quiz Analytics',    desc: 'Granular scores & trend insights' },
  { icon: Trophy,    label: 'Auto Certificates',       desc: 'Issued instantly on completion' },
];

const STATS = [
  { value: '12k+', label: 'Students',    icon: Users },
  { value: '98%',  label: 'Satisfaction', icon: Star },
  { value: '600+', label: 'Courses',     icon: BookOpen },
];

/* ─── component ─── */
export default function Login() {
  const [email, setEmail]               = useState('');
  const [password, setPassword]         = useState('');
  const [showPw, setShowPw]             = useState(false);
  const [loading, setLoading]           = useState(false);
  const [configError, setConfigError]   = useState<string | null>(null);
  const [checking, setChecking]         = useState(false);
  const [seeding, setSeeding]           = useState(false);
  const [activeField, setActiveField]   = useState<'email'|'password'|null>(null);
  const [mounted, setMounted]           = useState(false);
  const navigate = useNavigate();

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    const url = import.meta.env.VITE_SUPABASE_URL;
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
    if (!url || !key) setConfigError('Supabase config missing — add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to Secrets.');
  }, []);

  const checkConnection = async () => {
    setChecking(true);
    try {
      const data = await fetch('/api/health').then(r => r.json());
      data.supabase?.status === 'connected'
        ? toast.success('Database connected!')
        : toast.error(`DB error: ${data.supabase?.error ?? 'unknown'}`);
    } catch { toast.error('Could not reach backend.'); }
    finally   { setChecking(false); }
  };

  const seedAdmin = async () => {
    setSeeding(true);
    try {
      const text = await fetch('/api/admin/seed').then(r => r.text());
      text.includes('Success') ? toast.success('Admin seeded!') : toast.error('Seed failed.');
    } catch { toast.error('Could not reach backend.'); }
    finally   { setSeeding(false); }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      toast.success('Welcome back!');
      navigate('/');
    } catch (err: any) {
      toast.error(err.message || 'Login failed');
      if (err.message?.includes('Invalid login credentials')) toast.info('Seed the admin account first.');
    } finally { setLoading(false); }
  };

  return (
    <>
      <style>{CSS}</style>
      <div className="min-h-screen flex overflow-hidden" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>

        {/* ══════════ LEFT — aurora dark panel ══════════ */}
        <div
          className="hidden lg:flex lg:w-[54%] relative flex-col overflow-hidden"
          style={{ background: '#020817' }}
        >
          {/* ── aurora blobs ── */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            {/* teal blob */}
            <div style={{
              position:'absolute', top:'-10%', left:'-5%',
              width: 480, height: 480, borderRadius:'50%',
              background: 'radial-gradient(circle, rgba(20,184,166,0.35) 0%, transparent 70%)',
              filter: 'blur(60px)',
              animation: 'blob1 12s ease-in-out infinite',
            }}/>
            {/* indigo blob */}
            <div style={{
              position:'absolute', top:'30%', right:'-10%',
              width: 520, height: 520, borderRadius:'50%',
              background: 'radial-gradient(circle, rgba(99,102,241,0.3) 0%, transparent 70%)',
              filter: 'blur(70px)',
              animation: 'blob2 15s ease-in-out infinite',
            }}/>
            {/* violet blob */}
            <div style={{
              position:'absolute', bottom:'-10%', left:'20%',
              width: 450, height: 450, borderRadius:'50%',
              background: 'radial-gradient(circle, rgba(139,92,246,0.28) 0%, transparent 70%)',
              filter: 'blur(65px)',
              animation: 'blob3 18s ease-in-out infinite',
            }}/>
            {/* rose/pink blob */}
            <div style={{
              position:'absolute', bottom:'20%', right:'5%',
              width: 300, height: 300, borderRadius:'50%',
              background: 'radial-gradient(circle, rgba(236,72,153,0.18) 0%, transparent 70%)',
              filter: 'blur(55px)',
              animation: 'blob4 20s ease-in-out infinite',
            }}/>
          </div>

          {/* ── star particles ── */}
          <div className="absolute inset-0 pointer-events-none">
            {PARTICLES.map(p => (
              <div
                key={p.id}
                style={{
                  position: 'absolute',
                  left: `${p.x}%`,
                  top: `${p.y}%`,
                  width: p.size,
                  height: p.size,
                  borderRadius: '50%',
                  background: '#fff',
                  animation: `twinkle ${p.dur}s ${p.delay}s ease-in-out infinite`,
                }}
              />
            ))}
          </div>

          {/* ── subtle grid ── */}
          <div className="absolute inset-0 pointer-events-none" style={{
            backgroundImage: 'linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)',
            backgroundSize: '44px 44px',
          }} />

          {/* top edge line */}
          <div className="absolute top-0 left-0 right-0 h-px" style={{
            background: 'linear-gradient(90deg, transparent, rgba(20,184,166,0.5), rgba(99,102,241,0.5), transparent)'
          }} />

          {/* ── content ── */}
          <div className="relative z-10 flex flex-col h-full px-12 py-11">

            {/* Logo */}
            <div className={`flex items-center gap-3 ${mounted ? 'anim-fadeup' : 'opacity-0'}`}
                 style={{ animationDelay: '0ms' }}>
              <div className="relative anim-float">
                <div style={{
                  width: 44, height: 44, borderRadius: 14,
                  background: 'linear-gradient(135deg, #14b8a6, #6366f1)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: '0 0 24px rgba(20,184,166,0.5)',
                }}>
                  <GraduationCap className="w-5 h-5 text-white" />
                </div>
              </div>
              <div>
                <div className="text-lg font-bold text-white tracking-tight leading-none">QuizMaster</div>
                <div style={{ fontSize: 10, color: 'rgba(94,234,212,0.7)', letterSpacing: '0.2em', textTransform: 'uppercase', marginTop: 2 }}>
                  Education Platform
                </div>
              </div>
            </div>

            {/* Main text */}
            <div className="my-auto space-y-7">
              {/* badge */}
              <div className={`inline-flex items-center gap-2 ${mounted ? 'anim-fadeup' : 'opacity-0'}`}
                   style={{ animationDelay: '80ms' }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '5px 14px', borderRadius: 999,
                  background: 'rgba(20,184,166,0.12)',
                  border: '1px solid rgba(20,184,166,0.25)',
                }}>
                  <Zap className="w-3 h-3" style={{ color: '#2dd4bf' }} />
                  <span style={{ fontSize: 11, fontWeight: 600, color: '#2dd4bf', letterSpacing: '0.14em', textTransform: 'uppercase' }}>
                    AI-Powered Learning
                  </span>
                </div>
              </div>

              {/* headline */}
              <div className={`${mounted ? 'anim-fadeup' : 'opacity-0'}`} style={{ animationDelay: '150ms' }}>
                <h1 style={{ fontSize: '3.4rem', fontWeight: 900, lineHeight: 1.05, letterSpacing: '-0.02em', color: '#fff', margin: 0 }}>
                  The platform<br />
                  educators{' '}
                  <span style={{
                    background: 'linear-gradient(90deg, #2dd4bf, #818cf8, #c084fc, #f472b6, #2dd4bf)',
                    backgroundSize: '300% auto',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    animation: 'shimmer 5s linear infinite',
                  }}>
                    love
                  </span>
                </h1>
              </div>

              <p className={`${mounted ? 'anim-fadeup' : 'opacity-0'}`}
                 style={{ animationDelay: '220ms', color: 'rgba(148,163,184,0.8)', fontSize: 15, lineHeight: 1.7, maxWidth: 340, margin: 0 }}>
                Build courses, track students, run quizzes, and issue certificates — all from one beautifully unified workspace.
              </p>

              {/* features */}
              <div className="space-y-3">
                {FEATURES.map(({ icon: Icon, label, desc }, i) => (
                  <div
                    key={label}
                    className={`flex items-center gap-3.5 ${mounted ? 'anim-fadeup' : 'opacity-0'}`}
                    style={{ animationDelay: `${300 + i * 70}ms` }}
                  >
                    <div style={{
                      width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Icon className="w-4 h-4" style={{ color: '#2dd4bf' }} />
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.9)' }}>{label}</div>
                      <div style={{ fontSize: 12, color: 'rgba(100,116,139,0.9)', marginTop: 1 }}>{desc}</div>
                    </div>
                    <CheckCircle2 className="w-4 h-4 ml-auto shrink-0" style={{ color: 'rgba(45,212,191,0.5)' }} />
                  </div>
                ))}
              </div>
            </div>

            {/* Stats */}
            <div
              className={`${mounted ? 'anim-fadeup' : 'opacity-0'}`}
              style={{
                animationDelay: '620ms',
                borderTop: '1px solid rgba(255,255,255,0.07)',
                paddingTop: 24,
                display: 'flex', alignItems: 'center', gap: 28,
              }}
            >
              {STATS.map(({ value, label, icon: Icon }) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: 8,
                    background: 'rgba(20,184,166,0.12)',
                    border: '1px solid rgba(20,184,166,0.2)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Icon className="w-3.5 h-3.5" style={{ color: '#2dd4bf' }} />
                  </div>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: '#fff' }}>{value}</div>
                    <div style={{ fontSize: 11, color: 'rgba(100,116,139,0.8)', marginTop: 1 }}>{label}</div>
                  </div>
                </div>
              ))}
              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#10b981', animation: 'pulse-ring 2s ease infinite' }} />
                <span style={{ fontSize: 11, color: 'rgba(100,116,139,0.7)' }}>All systems normal</span>
              </div>
            </div>
          </div>

          {/* right edge */}
          <div className="absolute inset-y-0 right-0 w-px" style={{
            background: 'linear-gradient(180deg, transparent, rgba(99,102,241,0.3), rgba(20,184,166,0.3), transparent)'
          }} />
        </div>

        {/* ══════════ RIGHT — clean light panel ══════════ */}
        <div className="flex-1 flex items-center justify-center px-8 relative overflow-hidden"
             style={{ background: 'linear-gradient(160deg, #f0fdf9 0%, #f8fafc 50%, #f5f3ff 100%)' }}>

          {/* soft teal/violet blobs behind form */}
          <div className="absolute pointer-events-none" style={{
            top: '-10%', right: '-5%', width: 350, height: 350, borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(20,184,166,0.08), transparent 70%)', filter: 'blur(40px)',
          }} />
          <div className="absolute pointer-events-none" style={{
            bottom: '5%', left: '-5%', width: 300, height: 300, borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(139,92,246,0.08), transparent 70%)', filter: 'blur(40px)',
          }} />

          <div className="relative z-10 w-full max-w-[400px]">

            {/* Mobile logo */}
            <div className="lg:hidden flex items-center gap-3 mb-10">
              <div style={{
                width: 38, height: 38, borderRadius: 12,
                background: 'linear-gradient(135deg, #14b8a6, #6366f1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 4px 14px rgba(20,184,166,0.4)',
              }}>
                <GraduationCap className="w-4 h-4 text-white" />
              </div>
              <span className="text-base font-bold text-slate-900">QuizMaster</span>
            </div>

            {/* Config error */}
            {configError && (
              <div className="mb-6 p-4 rounded-2xl flex gap-3"
                   style={{ background: '#fef2f2', border: '1px solid #fecaca' }}>
                <Shield className="w-4 h-4 shrink-0 mt-0.5" style={{ color: '#ef4444' }} />
                <p className="text-xs leading-relaxed" style={{ color: '#dc2626' }}>{configError}</p>
              </div>
            )}

            {/* Header */}
            <div className="mb-7">
              <div className="inline-flex items-center gap-1.5 mb-4" style={{
                padding: '4px 12px', borderRadius: 999,
                background: 'rgba(20,184,166,0.08)', border: '1px solid rgba(20,184,166,0.2)',
              }}>
                <Award className="w-3 h-3" style={{ color: '#0d9488' }} />
                <span style={{ fontSize: 11, fontWeight: 600, color: '#0d9488', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                  Welcome back
                </span>
              </div>
              <h2 className="text-2xl font-bold tracking-tight" style={{ color: '#0f172a' }}>
                Sign in to your account
              </h2>
              <p className="text-sm mt-1.5" style={{ color: '#64748b' }}>
                Access your dashboard and all learning tools
              </p>
            </div>

            {/* Card */}
            <div style={{
              background: 'rgba(255,255,255,0.9)',
              backdropFilter: 'blur(16px)',
              borderRadius: 24,
              padding: 28,
              border: '1px solid rgba(255,255,255,0.8)',
              boxShadow: '0 4px 6px rgba(0,0,0,0.04), 0 16px 48px rgba(15,23,42,0.08), 0 0 0 1px rgba(255,255,255,0.6) inset',
            }}>
              <form onSubmit={handleLogin} className="space-y-4">

                {/* Email */}
                <div className="space-y-1.5">
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#475569', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                    Email Address
                  </label>
                  <div style={{
                    display: 'flex', alignItems: 'center', borderRadius: 14,
                    border: `1.5px solid ${activeField === 'email' ? '#14b8a6' : '#e2e8f0'}`,
                    background: activeField === 'email' ? '#f0fdfb' : '#f8fafc',
                    boxShadow: activeField === 'email' ? '0 0 0 3px rgba(20,184,166,0.12)' : 'none',
                    transition: 'all 0.2s ease',
                  }}>
                    <Mail className="ml-4 w-4 h-4 shrink-0" style={{ color: activeField === 'email' ? '#14b8a6' : '#94a3b8', transition: 'color 0.2s' }} />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      onFocus={() => setActiveField('email')}
                      onBlur={() => setActiveField(null)}
                      placeholder="you@example.com"
                      autoComplete="email"
                      style={{
                        flex: 1, padding: '12px 12px', background: 'transparent',
                        fontSize: 14, color: '#0f172a', outline: 'none',
                        border: 'none',
                      }}
                    />
                    {email && <CheckCircle2 className="mr-3 w-4 h-4 shrink-0" style={{ color: '#10b981' }} />}
                  </div>
                </div>

                {/* Password */}
                <div className="space-y-1.5">
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#475569', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                    Password
                  </label>
                  <div style={{
                    display: 'flex', alignItems: 'center', borderRadius: 14,
                    border: `1.5px solid ${activeField === 'password' ? '#14b8a6' : '#e2e8f0'}`,
                    background: activeField === 'password' ? '#f0fdfb' : '#f8fafc',
                    boxShadow: activeField === 'password' ? '0 0 0 3px rgba(20,184,166,0.12)' : 'none',
                    transition: 'all 0.2s ease',
                  }}>
                    <Lock className="ml-4 w-4 h-4 shrink-0" style={{ color: activeField === 'password' ? '#14b8a6' : '#94a3b8', transition: 'color 0.2s' }} />
                    <input
                      type={showPw ? 'text' : 'password'}
                      required
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      onFocus={() => setActiveField('password')}
                      onBlur={() => setActiveField(null)}
                      placeholder="••••••••"
                      autoComplete="current-password"
                      style={{
                        flex: 1, padding: '12px 12px', background: 'transparent',
                        fontSize: 14, color: '#0f172a', outline: 'none',
                        border: 'none',
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw(!showPw)}
                      tabIndex={-1}
                      style={{ marginRight: 14, color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer', display: 'flex' }}
                    >
                      {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Submit */}
                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    width: '100%', marginTop: 6,
                    padding: '14px', borderRadius: 14,
                    background: loading
                      ? 'linear-gradient(135deg, #5eead4, #818cf8)'
                      : 'linear-gradient(135deg, #0d9488 0%, #6366f1 60%, #8b5cf6 100%)',
                    border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
                    color: '#fff', fontSize: 14, fontWeight: 700,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    boxShadow: '0 4px 20px rgba(99,102,241,0.4), 0 1px 0 rgba(255,255,255,0.15) inset',
                    transition: 'opacity 0.2s, transform 0.15s',
                    opacity: loading ? 0.75 : 1,
                  }}
                  onMouseEnter={e => { if (!loading) (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)'; }}
                >
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
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>
            </div>

            {/* Dev utilities */}
            <div className="mt-4 flex gap-1">
              <button
                onClick={checkConnection}
                disabled={checking}
                className="flex-1 py-2.5 flex items-center justify-center gap-1.5 rounded-xl transition-colors"
                style={{ fontSize: 11, color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer' }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#64748b'; (e.currentTarget as HTMLButtonElement).style.background = 'rgba(0,0,0,0.04)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = '#94a3b8'; (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
              >
                <Shield className={`w-3.5 h-3.5 ${checking ? 'animate-spin' : ''}`} />
                {checking ? 'Checking…' : 'Check Database'}
              </button>
              <div style={{ width: 1, background: '#e2e8f0', margin: '4px 0' }} />
              <button
                onClick={seedAdmin}
                disabled={seeding}
                className="flex-1 py-2.5 flex items-center justify-center gap-1.5 rounded-xl transition-colors"
                style={{ fontSize: 11, color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer' }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#64748b'; (e.currentTarget as HTMLButtonElement).style.background = 'rgba(0,0,0,0.04)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = '#94a3b8'; (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
              >
                <GraduationCap className={`w-3.5 h-3.5 ${seeding ? 'animate-spin' : ''}`} />
                {seeding ? 'Seeding…' : 'Seed Admin'}
              </button>
            </div>

            <p className="mt-4 text-center" style={{ fontSize: 11, color: '#cbd5e1' }}>
              Contact your administrator if you don't have an account.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
