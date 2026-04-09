import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { supabase } from '../supabase';
import {
  Mail, Lock, Shield, GraduationCap,
  BookOpen, Users, Trophy, Eye, EyeOff,
  ArrowRight, Sparkles, CheckCircle2, BarChart3, Award
} from 'lucide-react';

const FEATURES = [
  { icon: BookOpen,  title: 'Smart Course Builder',  desc: 'Create structured lessons with AI in minutes.' },
  { icon: Users,     title: 'Live Student Tracking', desc: 'Real-time progress for every learner.' },
  { icon: BarChart3, title: 'Deep Quiz Analytics',   desc: 'Granular insights into scores and trends.' },
  { icon: Trophy,    title: 'Auto Certificates',      desc: 'Issued automatically on course completion.' },
];

const STATS = [
  { value: '12 k+', label: 'Students' },
  { value: '98 %',  label: 'Satisfaction' },
  { value: '600+',  label: 'Courses' },
];

export default function Login() {
  const [email, setEmail]             = useState('');
  const [password, setPassword]       = useState('');
  const [showPw, setShowPw]           = useState(false);
  const [loading, setLoading]         = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);
  const [checking, setChecking]       = useState(false);
  const [seeding, setSeeding]         = useState(false);
  const [activeField, setActiveField] = useState<'email' | 'password' | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const url = import.meta.env.VITE_SUPABASE_URL;
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
    if (!url || !key) setConfigError('Supabase config missing — add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to Secrets.');
  }, []);

  const checkConnection = async () => {
    setChecking(true);
    try {
      const res  = await fetch('/api/health');
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
    <div className="min-h-screen flex">

      {/* ══════════════ LEFT — indigo/navy panel ══════════════ */}
      <div
        className="hidden lg:flex lg:w-[52%] flex-col relative overflow-hidden"
        style={{ background: 'linear-gradient(145deg, #1e1b4b 0%, #2d2a6e 40%, #1a2456 100%)' }}
      >
        {/* soft blob accents */}
        <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full opacity-30 blur-3xl pointer-events-none"
             style={{ background: 'radial-gradient(circle, #6366f1, transparent)' }} />
        <div className="absolute bottom-0 right-0 w-80 h-80 rounded-full opacity-20 blur-3xl pointer-events-none"
             style={{ background: 'radial-gradient(circle, #818cf8, transparent)' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full opacity-10 blur-3xl pointer-events-none"
             style={{ background: 'radial-gradient(circle, #a5b4fc, transparent)' }} />

        {/* subtle dot grid */}
        <div
          className="absolute inset-0 opacity-[0.06] pointer-events-none"
          style={{
            backgroundImage: 'radial-gradient(circle, #a5b4fc 1px, transparent 1px)',
            backgroundSize: '28px 28px',
          }}
        />

        <div className="relative z-10 flex flex-col h-full px-12 py-12">

          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/15 backdrop-blur border border-white/20 flex items-center justify-center shadow-lg">
              <GraduationCap className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="text-base font-bold text-white leading-none">QuizMaster</div>
              <div className="text-[10px] text-indigo-300/70 tracking-[0.18em] uppercase mt-0.5">Education Platform</div>
            </div>
          </div>

          {/* Hero */}
          <div className="my-auto space-y-7">
            <div className="flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-indigo-300" />
              <span className="text-xs font-semibold text-indigo-300 tracking-widest uppercase">AI-Powered Learning</span>
            </div>

            <h1 className="text-5xl font-extrabold text-white leading-[1.08] tracking-tight">
              The platform<br />
              educators{' '}
              <span
                style={{
                  background: 'linear-gradient(90deg, #a5b4fc, #c4b5fd)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}
              >
                love
              </span>
            </h1>

            <p className="text-indigo-200/70 text-base leading-relaxed max-w-sm">
              Build courses, track students, run quizzes, and issue certificates — all in one unified workspace.
            </p>

            {/* Feature list */}
            <div className="space-y-3 pt-1">
              {FEATURES.map(({ icon: Icon, title, desc }) => (
                <div key={title} className="flex items-start gap-3.5">
                  <div className="mt-0.5 w-8 h-8 rounded-xl bg-white/10 border border-white/15 flex items-center justify-center shrink-0">
                    <Icon className="w-3.5 h-3.5 text-indigo-200" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-white/90">{title}</div>
                    <div className="text-xs text-indigo-300/60 mt-0.5">{desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Stats */}
          <div className="border-t border-white/10 pt-7 flex items-center gap-8">
            {STATS.map(({ value, label }) => (
              <div key={label}>
                <div className="text-xl font-bold text-white">{value}</div>
                <div className="text-xs text-indigo-300/60 mt-0.5">{label}</div>
              </div>
            ))}
            <div className="ml-auto flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs text-indigo-300/50">All systems normal</span>
            </div>
          </div>
        </div>

        {/* right edge divider */}
        <div className="absolute inset-y-0 right-0 w-px bg-gradient-to-b from-transparent via-indigo-400/20 to-transparent" />
      </div>

      {/* ══════════════ RIGHT — light panel ══════════════ */}
      <div className="flex-1 flex items-center justify-center px-8 bg-slate-50 relative">
        {/* very subtle tinted background */}
        <div className="absolute inset-0 pointer-events-none"
             style={{ background: 'radial-gradient(ellipse 70% 60% at 50% 40%, rgba(99,102,241,0.05), transparent)' }} />

        <div className="relative z-10 w-full max-w-[400px]">

          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-3 mb-10">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center shadow">
              <GraduationCap className="w-4 h-4 text-white" />
            </div>
            <span className="text-base font-bold text-slate-900">QuizMaster</span>
          </div>

          {/* Config error */}
          {configError && (
            <div className="mb-6 p-4 rounded-2xl bg-red-50 border border-red-200 flex gap-3">
              <Shield className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <p className="text-xs text-red-600 leading-relaxed">{configError}</p>
            </div>
          )}

          {/* Header */}
          <div className="mb-8">
            <div className="inline-flex items-center gap-1.5 bg-indigo-50 border border-indigo-100 rounded-full px-3 py-1 mb-4">
              <Award className="w-3 h-3 text-indigo-500" />
              <span className="text-[11px] font-semibold text-indigo-600 tracking-wide">Welcome back</span>
            </div>
            <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Sign in to your account</h2>
            <p className="text-slate-500 text-sm mt-1.5">Access your dashboard and learning tools</p>
          </div>

          {/* Form card */}
          <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/60 border border-slate-100 p-7">
            <form onSubmit={handleLogin} className="space-y-5">

              {/* Email */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest">
                  Email Address
                </label>
                <div
                  className="flex items-center rounded-2xl border transition-all duration-200"
                  style={{
                    borderColor: activeField === 'email' ? '#6366f1' : '#e2e8f0',
                    background:  activeField === 'email' ? '#fafafe' : '#f8fafc',
                    boxShadow:   activeField === 'email' ? '0 0 0 3px rgba(99,102,241,0.12)' : 'none',
                  }}
                >
                  <Mail className={`ml-4 w-4 h-4 shrink-0 transition-colors ${activeField === 'email' ? 'text-indigo-500' : 'text-slate-400'}`} />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    onFocus={() => setActiveField('email')}
                    onBlur={() => setActiveField(null)}
                    placeholder="you@example.com"
                    autoComplete="email"
                    className="flex-1 px-3 py-3 bg-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
                  />
                  {email && <CheckCircle2 className="mr-3 w-4 h-4 text-emerald-500 shrink-0" />}
                </div>
              </div>

              {/* Password */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest">
                  Password
                </label>
                <div
                  className="flex items-center rounded-2xl border transition-all duration-200"
                  style={{
                    borderColor: activeField === 'password' ? '#6366f1' : '#e2e8f0',
                    background:  activeField === 'password' ? '#fafafe' : '#f8fafc',
                    boxShadow:   activeField === 'password' ? '0 0 0 3px rgba(99,102,241,0.12)' : 'none',
                  }}
                >
                  <Lock className={`ml-4 w-4 h-4 shrink-0 transition-colors ${activeField === 'password' ? 'text-indigo-500' : 'text-slate-400'}`} />
                  <input
                    type={showPw ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    onFocus={() => setActiveField('password')}
                    onBlur={() => setActiveField(null)}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    className="flex-1 px-3 py-3 bg-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw(!showPw)}
                    tabIndex={-1}
                    className="mr-3 text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={loading}
                className="w-full mt-1 py-3.5 rounded-2xl font-semibold text-sm text-white flex items-center justify-center gap-2 transition-all duration-200 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)',
                  boxShadow:  '0 4px 16px rgba(99,102,241,0.4), 0 1px 0 rgba(255,255,255,0.15) inset',
                }}
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

          {/* Dev utility */}
          <div className="mt-5 flex gap-1">
            <button
              onClick={checkConnection}
              disabled={checking}
              className="flex-1 py-2.5 text-xs text-slate-400 hover:text-slate-600 transition-colors flex items-center justify-center gap-1.5 rounded-xl hover:bg-slate-100"
            >
              <Shield className={`w-3.5 h-3.5 ${checking ? 'animate-spin' : ''}`} />
              {checking ? 'Checking…' : 'Check Database'}
            </button>
            <div className="w-px bg-slate-200 my-1" />
            <button
              onClick={seedAdmin}
              disabled={seeding}
              className="flex-1 py-2.5 text-xs text-slate-400 hover:text-slate-600 transition-colors flex items-center justify-center gap-1.5 rounded-xl hover:bg-slate-100"
            >
              <GraduationCap className={`w-3.5 h-3.5 ${seeding ? 'animate-spin' : ''}`} />
              {seeding ? 'Seeding…' : 'Seed Admin'}
            </button>
          </div>

          <p className="mt-5 text-center text-xs text-slate-400">
            Contact your administrator if you don't have an account.
          </p>
        </div>
      </div>
    </div>
  );
}
