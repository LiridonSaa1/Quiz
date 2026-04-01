import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { supabase } from '../supabase';
import { LogIn, Mail, Lock, Shield } from 'lucide-react';

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
          toast.success('Database connection verified from server!');
        } else if (data.supabase.status === 'error') {
          toast.error(`Database error: ${data.supabase.error}`);
        } else {
          toast.error('Database connection failed from server.');
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
    // Check if Supabase is configured
    const url = import.meta.env.VITE_SUPABASE_URL;
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
    if (!url || !key) {
      setConfigError('Supabase configuration is missing. Please add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to the Settings > Secrets menu.');
    }
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;
      toast.success('Logged in successfully');
      navigate('/');
    } catch (error: any) {
      console.error('Login error:', error);
      toast.error(error.message || 'Failed to login');
      if (error.message?.includes('Invalid login credentials')) {
        toast.info('Make sure you have run the /api/admin/seed link first.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 border border-slate-100">
        {configError && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
            <Shield className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-red-900">Configuration Missing</p>
              <p className="text-xs text-red-700 mt-1 leading-relaxed">
                {configError}
              </p>
            </div>
          </div>
        )}
        
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-slate-900 text-white rounded-2xl mb-4">
            <LogIn className="w-8 h-8" />
          </div>
          <h1 className="text-3xl font-bold text-slate-900">Welcome Back</h1>
          <p className="text-slate-500 mt-2">Sign in to your QuizMaster account</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Email Address</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all"
                placeholder="you@example.com"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all"
                placeholder="••••••••"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-slate-900 text-white py-3 rounded-xl font-semibold hover:bg-slate-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div className="mt-4 space-y-2">
          <button
            onClick={checkConnection}
            disabled={checking}
            className="w-full py-2 text-xs text-slate-500 hover:text-slate-900 transition-colors flex items-center justify-center gap-2"
          >
            <Shield className={`w-3 h-3 ${checking ? 'animate-spin' : ''}`} />
            {checking ? 'Checking connection...' : 'Check Database Connection'}
          </button>
          
          <button
            onClick={seedAdmin}
            disabled={seeding}
            className="w-full py-2 text-xs text-slate-500 hover:text-slate-900 transition-colors flex items-center justify-center gap-2"
          >
            <LogIn className={`w-3 h-3 ${seeding ? 'animate-spin' : ''}`} />
            {seeding ? 'Seeding admin...' : 'Seed Admin Account'}
          </button>
        </div>

        <div className="mt-8 text-center">
          <p className="text-slate-500 text-sm">
            Contact your administrator if you don't have an account.
          </p>
        </div>
      </div>
    </div>
  );
}
