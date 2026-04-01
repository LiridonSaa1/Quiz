import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { supabase } from '../supabase';
import { LogIn, Mail, Lock, Shield, GraduationCap, BookOpen, Users, Trophy } from 'lucide-react';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [seeding, setSeeding] = useState(false);
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
    } catch (error) {
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
    } catch (error) {
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
    <div className="min-h-screen flex">
      {/* Left Panel */}
      <div className="hidden lg:flex lg:w-1/2 bg-slate-800 flex-col justify-between p-12 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-600/20 via-transparent to-violet-600/20 pointer-events-none" />
        <div className="absolute -top-24 -left-24 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-violet-600/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-900/50">
              <GraduationCap className="w-6 h-6 text-white" />
            </div>
            <span className="text-xl font-bold text-white">QuizMaster</span>
          </div>
        </div>

        <div className="relative z-10 space-y-6">
          <h2 className="text-4xl font-bold text-white leading-tight">
            The smart way to<br />
            <span className="text-indigo-400">teach & learn</span>
          </h2>
          <p className="text-slate-400 text-lg leading-relaxed">
            Manage courses, quizzes, and students — all in one powerful platform.
          </p>

          <div className="grid grid-cols-1 gap-4 pt-4">
            {[
              { icon: BookOpen, label: 'Course Management', desc: 'Create & organize courses with ease' },
              { icon: Users, label: 'Student Tracking', desc: 'Monitor progress & performance' },
              { icon: Trophy, label: 'Quiz Analytics', desc: 'Detailed results & insights' },
            ].map((feat) => (
              <div key={feat.label} className="flex items-center gap-4 bg-white/5 rounded-xl px-4 py-3 border border-white/10">
                <div className="w-9 h-9 bg-indigo-600/30 rounded-lg flex items-center justify-center shrink-0">
                  <feat.icon className="w-4 h-4 text-indigo-300" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-white">{feat.label}</div>
                  <div className="text-xs text-slate-400">{feat.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="relative z-10 text-xs text-slate-600">
          © {new Date().getFullYear()} QuizMaster. All rights reserved.
        </div>
      </div>

      {/* Right Panel - Form */}
      <div className="flex-1 flex items-center justify-center p-6 bg-slate-50">
        <div className="w-full max-w-md">
          {/* Mobile Logo */}
          <div className="lg:hidden flex items-center gap-2 mb-8">
            <div className="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center">
              <GraduationCap className="w-5 h-5 text-white" />
            </div>
            <span className="text-lg font-bold text-slate-900">QuizMaster</span>
          </div>

          {configError && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
              <Shield className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-red-800">Configuration Missing</p>
                <p className="text-xs text-red-600 mt-1 leading-relaxed">{configError}</p>
              </div>
            </div>
          )}

          <div className="mb-8">
            <h1 className="text-3xl font-bold text-slate-900">Welcome back</h1>
            <p className="text-slate-500 mt-2">Sign in to your account to continue</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all placeholder:text-slate-400"
                  placeholder="you@example.com"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Password</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all placeholder:text-slate-400"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-600 text-white py-3 rounded-xl font-semibold hover:bg-indigo-700 active:scale-[0.99] transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-indigo-200 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
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

          <div className="mt-6 pt-6 border-t border-slate-200 flex flex-col gap-2">
            <button
              onClick={checkConnection}
              disabled={checking}
              className="w-full py-2.5 text-xs text-slate-400 hover:text-slate-700 transition-colors flex items-center justify-center gap-2 hover:bg-slate-100 rounded-lg"
            >
              <Shield className={`w-3.5 h-3.5 ${checking ? 'animate-spin' : ''}`} />
              {checking ? 'Checking...' : 'Check Database Connection'}
            </button>
            <button
              onClick={seedAdmin}
              disabled={seeding}
              className="w-full py-2.5 text-xs text-slate-400 hover:text-slate-700 transition-colors flex items-center justify-center gap-2 hover:bg-slate-100 rounded-lg"
            >
              <LogIn className={`w-3.5 h-3.5 ${seeding ? 'animate-spin' : ''}`} />
              {seeding ? 'Seeding...' : 'Seed Admin Account'}
            </button>
          </div>

          <p className="mt-6 text-center text-xs text-slate-400">
            Contact your administrator if you don't have an account.
          </p>
        </div>
      </div>
    </div>
  );
}
