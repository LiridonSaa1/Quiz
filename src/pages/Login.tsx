import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { supabase } from '../supabase';
import {
  LogIn, Mail, Lock, Shield, GraduationCap,
  BookOpen, Users, Trophy, Eye, EyeOff,
  Zap, Star, TrendingUp, Award
} from 'lucide-react';

const FloatingOrb = ({ className }: { className: string }) => (
  <div className={`absolute rounded-full blur-3xl opacity-20 pointer-events-none animate-pulse ${className}`} />
);

const StatCard = ({
  icon: Icon,
  value,
  label,
  delay,
}: {
  icon: React.ElementType;
  value: string;
  label: string;
  delay: string;
}) => (
  <div
    className="flex items-center gap-3 bg-white/8 backdrop-blur-sm border border-white/10 rounded-2xl px-4 py-3 shadow-xl"
    style={{ animationDelay: delay }}
  >
    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500/40 to-violet-500/40 border border-indigo-400/30 flex items-center justify-center shrink-0">
      <Icon className="w-4 h-4 text-indigo-300" />
    </div>
    <div>
      <div className="text-sm font-bold text-white">{value}</div>
      <div className="text-[11px] text-slate-400">{label}</div>
    </div>
  </div>
);

const FeaturePill = ({ icon: Icon, text }: { icon: React.ElementType; text: string }) => (
  <div className="flex items-center gap-2 bg-white/6 border border-white/10 rounded-full px-3.5 py-1.5 text-xs text-slate-300">
    <Icon className="w-3.5 h-3.5 text-indigo-400" />
    {text}
  </div>
);

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [emailFocused, setEmailFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const navigate = useNavigate();

  const seedAdmin = async () => {
    setSeeding(true);
    try {
      const response = await fetch('/api/admin/seed');
      const text = await response.text();
      if (text.includes('Success')) {
        toast.success('Admin account seeded successfully!');
      } else if (text.includes('Database Table Missing')) {
        toast.error('The profiles table is missing. Please run the SQL in Supabase.');
      } else {
        toast.error('Seed failed: ' + text.substring(0, 100));
      }
    } catch {
      toast.error('Could not reach backend to seed.');
    } finally {
      setSeeding(false);
    }
  };

  const checkConnection = async () => {
    setChecking(true);
    try {
      const response = await fetch('/api/health');
      const data = await response.json();
      if (data.status === 'ok') {
        if (data.supabase.status === 'connected') {
          toast.success('Database connection verified!');
        } else if (data.supabase.status === 'error') {
          toast.error(`Database error: ${data.supabase.error}`);
        } else {
          toast.error('Database connection failed.');
        }
      } else {
        toast.error('Backend reported an issue.');
      }
    } catch {
      toast.error('Could not reach backend server.');
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    const url = import.meta.env.VITE_SUPABASE_URL;
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
    if (!url || !key) {
      setConfigError('Supabase configuration is missing. Please add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to the Secrets menu.');
    }
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      toast.success('Logged in successfully');
      navigate('/');
    } catch (error: any) {
      console.error('Login error:', error);
      toast.error(error.message || 'Failed to login');
      if (error.message?.includes('Invalid login credentials')) {
        toast.info('Make sure you have seeded the admin account first.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-slate-950">

      {/* ── LEFT PANEL ────────────────────────────── */}
      <div className="hidden lg:flex lg:w-[52%] relative flex-col justify-between p-12 overflow-hidden bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900">

        {/* Animated orbs */}
        <FloatingOrb className="w-[500px] h-[500px] bg-indigo-600 -top-40 -left-40" />
        <FloatingOrb className="w-[400px] h-[400px] bg-violet-600 bottom-0 right-0" />
        <FloatingOrb className="w-[200px] h-[200px] bg-blue-500 top-1/2 left-1/3" />

        {/* Subtle grid overlay */}
        <div
          className="absolute inset-0 pointer-events-none opacity-[0.03]"
          style={{
            backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }}
        />

        {/* Logo */}
        <div className="relative z-10 flex items-center gap-3">
          <div className="w-11 h-11 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-2xl flex items-center justify-center shadow-2xl shadow-indigo-900/60">
            <GraduationCap className="w-6 h-6 text-white" />
          </div>
          <div>
            <span className="text-xl font-bold text-white tracking-tight">QuizMaster</span>
            <div className="text-[10px] text-indigo-400 font-medium tracking-widest uppercase">Education Platform</div>
          </div>
        </div>

        {/* Center content */}
        <div className="relative z-10 space-y-8">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 bg-indigo-500/15 border border-indigo-500/25 rounded-full px-4 py-1.5">
            <Zap className="w-3.5 h-3.5 text-indigo-400" />
            <span className="text-xs font-semibold text-indigo-300 tracking-wide">AI-Powered Learning</span>
          </div>

          <div className="space-y-4">
            <h2 className="text-5xl font-extrabold text-white leading-[1.1] tracking-tight">
              The smarter way<br />
              to <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-violet-400">teach & learn</span>
            </h2>
            <p className="text-slate-400 text-base leading-relaxed max-w-sm">
              Manage courses, quizzes, and students — all in one beautiful, powerful platform built for educators.
            </p>
          </div>

          {/* Feature pills */}
          <div className="flex flex-wrap gap-2">
            <FeaturePill icon={BookOpen} text="Course Builder" />
            <FeaturePill icon={Users} text="Student Tracking" />
            <FeaturePill icon={Trophy} text="Quiz Analytics" />
            <FeaturePill icon={Award} text="Certificates" />
            <FeaturePill icon={TrendingUp} text="AI Insights" />
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-2 gap-3 max-w-sm">
            <StatCard icon={Users} value="10,000+" label="Active Students" delay="0ms" />
            <StatCard icon={BookOpen} value="500+" label="Courses Created" delay="100ms" />
            <StatCard icon={Trophy} value="98%" label="Satisfaction Rate" delay="200ms" />
            <StatCard icon={Star} value="4.9 / 5" label="Average Rating" delay="300ms" />
          </div>
        </div>

        {/* Footer */}
        <div className="relative z-10 flex items-center justify-between">
          <span className="text-xs text-slate-600">© {new Date().getFullYear()} QuizMaster. All rights reserved.</span>
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs text-slate-500">All systems operational</span>
          </div>
        </div>
      </div>

      {/* ── RIGHT PANEL ───────────────────────────── */}
      <div className="flex-1 flex items-center justify-center p-6 relative overflow-hidden">
        {/* Soft background glow */}
        <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-indigo-900/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 w-full max-w-md">

          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-3 mb-10">
            <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-900/50">
              <GraduationCap className="w-5 h-5 text-white" />
            </div>
            <div>
              <span className="text-lg font-bold text-white">QuizMaster</span>
              <div className="text-[10px] text-indigo-400 font-medium tracking-widest uppercase">Education Platform</div>
            </div>
          </div>

          {/* Config error */}
          {configError && (
            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-start gap-3">
              <Shield className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-red-300">Configuration Missing</p>
                <p className="text-xs text-red-400/80 mt-1 leading-relaxed">{configError}</p>
              </div>
            </div>
          )}

          {/* Header */}
          <div className="mb-8">
            <p className="text-xs font-semibold tracking-widest text-indigo-400 uppercase mb-2">Welcome back</p>
            <h1 className="text-3xl font-bold text-white tracking-tight">Sign in to your account</h1>
            <p className="text-slate-500 mt-2 text-sm">Enter your credentials to access the platform</p>
          </div>

          {/* Form card */}
          <div className="bg-white/[0.04] border border-white/[0.08] rounded-3xl p-7 backdrop-blur-sm shadow-2xl shadow-black/30">
            <form onSubmit={handleLogin} className="space-y-5">

              {/* Email */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Email Address
                </label>
                <div className={`relative flex items-center rounded-2xl border transition-all duration-200 ${
                  emailFocused
                    ? 'border-indigo-500/60 bg-indigo-500/5 shadow-[0_0_0_3px_rgba(99,102,241,0.12)]'
                    : 'border-white/10 bg-white/5'
                }`}>
                  <Mail className={`absolute left-4 w-4 h-4 transition-colors duration-200 ${emailFocused ? 'text-indigo-400' : 'text-slate-600'}`} />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onFocus={() => setEmailFocused(true)}
                    onBlur={() => setEmailFocused(false)}
                    className="w-full pl-11 pr-4 py-3.5 bg-transparent text-sm text-white placeholder:text-slate-600 focus:outline-none rounded-2xl"
                    placeholder="you@example.com"
                    autoComplete="email"
                  />
                </div>
              </div>

              {/* Password */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Password
                </label>
                <div className={`relative flex items-center rounded-2xl border transition-all duration-200 ${
                  passwordFocused
                    ? 'border-indigo-500/60 bg-indigo-500/5 shadow-[0_0_0_3px_rgba(99,102,241,0.12)]'
                    : 'border-white/10 bg-white/5'
                }`}>
                  <Lock className={`absolute left-4 w-4 h-4 transition-colors duration-200 ${passwordFocused ? 'text-indigo-400' : 'text-slate-600'}`} />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onFocus={() => setPasswordFocused(true)}
                    onBlur={() => setPasswordFocused(false)}
                    className="w-full pl-11 pr-12 py-3.5 bg-transparent text-sm text-white placeholder:text-slate-600 focus:outline-none rounded-2xl"
                    placeholder="••••••••"
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 text-slate-600 hover:text-slate-300 transition-colors"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={loading}
                className="w-full relative overflow-hidden bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white py-3.5 rounded-2xl font-semibold text-sm transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-indigo-900/40 flex items-center justify-center gap-2 active:scale-[0.99] mt-2"
              >
                {/* Shimmer */}
                {!loading && (
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full hover:translate-x-full transition-transform duration-700 ease-in-out pointer-events-none" />
                )}
                {loading ? (
                  <>
                    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Signing in...
                  </>
                ) : (
                  <>
                    <LogIn className="w-4 h-4" />
                    Sign In
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Dev tools */}
          <div className="mt-5 grid grid-cols-2 gap-2">
            <button
              onClick={checkConnection}
              disabled={checking}
              className="py-2.5 text-xs text-slate-600 hover:text-slate-300 transition-colors flex items-center justify-center gap-1.5 hover:bg-white/5 rounded-xl border border-transparent hover:border-white/8"
            >
              <Shield className={`w-3.5 h-3.5 ${checking ? 'animate-spin' : ''}`} />
              {checking ? 'Checking...' : 'Check Database'}
            </button>
            <button
              onClick={seedAdmin}
              disabled={seeding}
              className="py-2.5 text-xs text-slate-600 hover:text-slate-300 transition-colors flex items-center justify-center gap-1.5 hover:bg-white/5 rounded-xl border border-transparent hover:border-white/8"
            >
              <LogIn className={`w-3.5 h-3.5 ${seeding ? 'animate-spin' : ''}`} />
              {seeding ? 'Seeding...' : 'Seed Admin'}
            </button>
          </div>

          <p className="mt-5 text-center text-xs text-slate-700">
            Contact your administrator if you don't have an account.
          </p>
        </div>
      </div>
    </div>
  );
}
