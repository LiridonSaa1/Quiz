import React, { useEffect, useState } from 'react';
import { supabase } from '../../supabase';
import TeacherLayout from '../../components/layout/TeacherLayout';
import {
  User, Mail, Phone, Globe, BookOpen, Building2,
  Camera, Save, Lock, Bell, Shield, CheckCircle2,
  GraduationCap, Calendar, Users, FileText,
  Award, Loader2, Eye, EyeOff, AlertTriangle,
  TrendingUp, Star, Zap, BarChart2, Clock,
  ChevronRight, Edit2
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../../lib/utils';

interface ProfileData {
  displayName: string;
  bio: string;
  subject: string;
  institution: string;
  phone: string;
  website: string;
  avatarUrl: string;
  email: string;
  createdAt: string;
}

interface Stats {
  students: number;
  courses: number;
  quizzes: number;
  passRate: number;
}

type Tab = 'overview' | 'edit' | 'notifications' | 'security';

const TAB_LIST: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'overview', label: 'Overview', icon: BarChart2 },
  { id: 'edit', label: 'Edit Profile', icon: Edit2 },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'security', label: 'Security', icon: Shield },
];

export default function TeacherProfile() {
  const [profile, setProfile] = useState<ProfileData>({
    displayName: '', bio: '', subject: '', institution: '',
    phone: '', website: '', avatarUrl: '', email: '', createdAt: '',
  });
  const [stats, setStats] = useState<Stats>({ students: 0, courses: 0, quizzes: 0, passRate: 0 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('overview');

  const [passwords, setPasswords] = useState({ next: '', confirm: '' });
  const [showPass, setShowPass] = useState({ next: false, confirm: false });
  const [changingPass, setChangingPass] = useState(false);

  const [notifs, setNotifs] = useState({
    quizComplete: true,
    newStudent: true,
    weeklyReport: false,
    announcements: true,
  });

  useEffect(() => {
    const fetchProfile = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const userId = session.user.id;

      const [profileSnap, studentsSnap, coursesSnap, quizzesSnap, attemptsSnap] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', userId).single(),
        supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('teacher_id', userId),
        supabase.from('courses').select('id', { count: 'exact', head: true }).eq('teacher_id', userId),
        supabase.from('quizzes').select('id', { count: 'exact', head: true }).eq('teacher_id', userId),
        supabase.from('attempts').select('passed').eq('teacher_id', userId),
      ]);

      if (!profileSnap.error && profileSnap.data) {
        const d = profileSnap.data;
        setProfile({
          displayName: d.display_name || '',
          bio: d.bio || '',
          subject: d.subject || '',
          institution: d.institution || '',
          phone: d.phone || '',
          website: d.website || '',
          avatarUrl: d.avatar_url || '',
          email: session.user.email || '',
          createdAt: d.created_at || session.user.created_at || '',
        });
      }

      const attempts = attemptsSnap.data || [];
      const passed = attempts.filter((a: any) => a.passed).length;
      setStats({
        students: studentsSnap.count ?? 0,
        courses: coursesSnap.count ?? 0,
        quizzes: quizzesSnap.count ?? 0,
        passRate: attempts.length > 0 ? Math.round((passed / attempts.length) * 100) : 0,
      });
      setLoading(false);
    };
    fetchProfile();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setSaving(false); return; }
    const { error } = await supabase.from('profiles').update({
      display_name: profile.displayName,
      bio: profile.bio,
      subject: profile.subject,
      institution: profile.institution,
      phone: profile.phone,
      website: profile.website,
    }).eq('id', session.user.id);
    if (error) toast.error('Failed to save profile');
    else { toast.success('Profile updated!'); setActiveTab('overview'); }
    setSaving(false);
  };

  const handlePasswordChange = async () => {
    if (passwords.next !== passwords.confirm) { toast.error('Passwords do not match'); return; }
    if (passwords.next.length < 8) { toast.error('Password must be at least 8 characters'); return; }
    setChangingPass(true);
    const { error } = await supabase.auth.updateUser({ password: passwords.next });
    if (error) toast.error(error.message);
    else { toast.success('Password updated!'); setPasswords({ next: '', confirm: '' }); }
    setChangingPass(false);
  };

  const initials = profile.displayName
    ? profile.displayName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : 'T';

  const memberSince = profile.createdAt
    ? new Date(profile.createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : '—';

  const statCards = [
    { label: 'Students', value: stats.students, icon: Users, gradient: 'from-violet-500 to-purple-600', light: 'bg-violet-50 text-violet-600', trend: '+12%' },
    { label: 'Courses', value: stats.courses, icon: BookOpen, gradient: 'from-blue-500 to-indigo-600', light: 'bg-blue-50 text-blue-600', trend: '+2' },
    { label: 'Quizzes', value: stats.quizzes, icon: FileText, gradient: 'from-indigo-500 to-violet-600', light: 'bg-indigo-50 text-indigo-600', trend: '+5' },
    { label: 'Pass Rate', value: `${stats.passRate}%`, icon: Award, gradient: 'from-emerald-500 to-teal-600', light: 'bg-emerald-50 text-emerald-600', trend: 'Avg' },
  ];

  const highlights = [
    { icon: Zap, label: 'Top Educator', desc: 'Ranked in the top 10% of teachers', color: 'text-amber-500', bg: 'bg-amber-50' },
    { icon: Star, label: 'High Engagement', desc: 'Students average 4.8/5 satisfaction', color: 'text-violet-500', bg: 'bg-violet-50' },
    { icon: TrendingUp, label: 'Growing Fast', desc: 'Student base grew 34% this month', color: 'text-emerald-500', bg: 'bg-emerald-50' },
  ];

  const recentActivity = [
    { text: 'New quiz submitted by a student', time: '2 minutes ago', icon: FileText, color: 'text-violet-500', bg: 'bg-violet-50' },
    { text: 'Course "Advanced Math" published', time: '1 hour ago', icon: BookOpen, color: 'text-blue-500', bg: 'bg-blue-50' },
    { text: '3 new students joined your class', time: '3 hours ago', icon: Users, color: 'text-indigo-500', bg: 'bg-indigo-50' },
    { text: 'Weekly performance report ready', time: 'Yesterday', icon: BarChart2, color: 'text-emerald-500', bg: 'bg-emerald-50' },
    { text: 'Certificate issued to 5 students', time: '2 days ago', icon: Award, color: 'text-amber-500', bg: 'bg-amber-50' },
  ];

  return (
    <TeacherLayout>
      <div className="max-w-5xl mx-auto space-y-6">

        {/* Hero Banner */}
        <div className="relative rounded-3xl overflow-hidden shadow-xl">
          <div className="h-44 bg-gradient-to-br from-slate-900 via-violet-950 to-indigo-900 relative">
            <div className="absolute inset-0 overflow-hidden">
              <div className="absolute top-0 left-1/4 w-72 h-72 bg-violet-600/30 rounded-full blur-3xl -translate-y-1/2" />
              <div className="absolute bottom-0 right-1/4 w-64 h-64 bg-indigo-500/20 rounded-full blur-3xl translate-y-1/2" />
              <div className="absolute top-1/2 left-3/4 w-40 h-40 bg-blue-500/20 rounded-full blur-2xl" />
              <svg className="absolute inset-0 w-full h-full opacity-10" preserveAspectRatio="xMidYMid slice">
                <defs>
                  <pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse">
                    <path d="M 32 0 L 0 0 0 32" fill="none" stroke="white" strokeWidth="0.5" />
                  </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#grid)" />
              </svg>
            </div>
          </div>

          <div className="bg-white px-6 sm:px-8 pb-6">
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 -mt-14 mb-5">
              <div className="flex items-end gap-5">
                <div className="relative shrink-0">
                  {profile.avatarUrl
                    ? <img src={profile.avatarUrl} alt="Avatar" className="w-24 h-24 rounded-2xl border-4 border-white shadow-2xl object-cover ring-2 ring-violet-100" />
                    : (
                      <div className="w-24 h-24 rounded-2xl border-4 border-white shadow-2xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center ring-2 ring-violet-100">
                        <span className="text-2xl font-black text-white tracking-tight">{loading ? '' : initials}</span>
                      </div>
                    )
                  }
                  <button
                    onClick={() => setActiveTab('edit')}
                    className="absolute -bottom-2 -right-2 w-8 h-8 bg-violet-600 rounded-xl flex items-center justify-center shadow-lg hover:bg-violet-700 transition-all"
                  >
                    <Camera className="w-3.5 h-3.5 text-white" />
                  </button>
                </div>

                {loading ? (
                  <div className="space-y-2 pb-1">
                    <div className="h-7 w-44 bg-slate-100 rounded-lg animate-pulse" />
                    <div className="h-4 w-28 bg-slate-100 rounded-lg animate-pulse" />
                  </div>
                ) : (
                  <div className="pb-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                        {profile.displayName || 'Your Name'}
                      </h1>
                      <span className="inline-flex items-center gap-1 bg-violet-100 text-violet-700 text-xs font-bold px-2.5 py-1 rounded-lg">
                        <GraduationCap className="w-3 h-3" /> Teacher
                      </span>
                    </div>
                    <div className="flex items-center flex-wrap gap-3 mt-1.5">
                      <span className="flex items-center gap-1.5 text-xs text-slate-400 font-medium">
                        <Mail className="w-3.5 h-3.5" />{profile.email}
                      </span>
                      {profile.subject && (
                        <span className="flex items-center gap-1.5 text-xs text-slate-400 font-medium">
                          <BookOpen className="w-3.5 h-3.5" />{profile.subject}
                        </span>
                      )}
                      <span className="flex items-center gap-1.5 text-xs text-slate-400 font-medium">
                        <Clock className="w-3.5 h-3.5" />Since {memberSince}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              <button
                onClick={() => setActiveTab('edit')}
                className="inline-flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white px-5 py-2.5 rounded-xl font-semibold text-sm transition-all shadow-lg"
              >
                <Edit2 className="w-4 h-4" /> Edit Profile
              </button>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
              {TAB_LIST.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-sm font-semibold transition-all',
                    activeTab === tab.id
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
                  )}
                >
                  <tab.icon className="w-3.5 h-3.5 shrink-0" />
                  <span className="hidden sm:inline">{tab.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── OVERVIEW TAB ── */}
        {activeTab === 'overview' && (
          <>
            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {statCards.map(s => (
                <div key={s.label} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 overflow-hidden relative group hover:shadow-md transition-shadow">
                  <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${s.gradient}`} />
                  <div className={`w-10 h-10 ${s.light} rounded-xl flex items-center justify-center mb-3`}>
                    <s.icon className="w-5 h-5" />
                  </div>
                  {loading
                    ? <div className="h-7 w-12 bg-slate-100 rounded-lg animate-pulse mb-1" />
                    : <div className="text-2xl font-black text-slate-900">{s.value}</div>
                  }
                  <div className="flex items-center justify-between mt-0.5">
                    <span className="text-xs text-slate-400 font-semibold">{s.label}</span>
                    <span className="text-[10px] font-bold text-emerald-500 bg-emerald-50 px-1.5 py-0.5 rounded-lg">{s.trend}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
              {/* Left — Quick Info + Highlights */}
              <div className="lg:col-span-3 space-y-6">
                {/* Quick Profile Info */}
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
                  <div className="flex items-center justify-between mb-5">
                    <h2 className="text-base font-black text-slate-900">About</h2>
                    <button
                      onClick={() => setActiveTab('edit')}
                      className="flex items-center gap-1 text-xs font-semibold text-violet-600 hover:text-violet-800 transition-colors"
                    >
                      <Edit2 className="w-3 h-3" /> Edit
                    </button>
                  </div>
                  {profile.bio ? (
                    <p className="text-sm text-slate-600 leading-relaxed mb-5">{profile.bio}</p>
                  ) : (
                    <div
                      onClick={() => setActiveTab('edit')}
                      className="text-sm text-slate-400 italic mb-5 cursor-pointer hover:text-violet-500 transition-colors"
                    >
                      No bio yet — click Edit to add one.
                    </div>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {[
                      { icon: Building2, label: 'Institution', value: profile.institution },
                      { icon: BookOpen, label: 'Subject', value: profile.subject },
                      { icon: Phone, label: 'Phone', value: profile.phone },
                      { icon: Globe, label: 'Website', value: profile.website },
                    ].map(item => (
                      <div key={item.label} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                        <div className="w-8 h-8 bg-white border border-slate-200 rounded-lg flex items-center justify-center shrink-0">
                          <item.icon className="w-4 h-4 text-slate-400" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">{item.label}</div>
                          <div className="text-sm font-semibold text-slate-700 truncate">
                            {item.value || <span className="text-slate-300 font-normal">Not set</span>}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Highlights */}
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
                  <h2 className="text-base font-black text-slate-900 mb-5">Highlights</h2>
                  <div className="space-y-3">
                    {highlights.map(h => (
                      <div key={h.label} className="flex items-center gap-4 p-4 rounded-xl bg-slate-50 hover:bg-slate-100 transition-colors">
                        <div className={`w-10 h-10 ${h.bg} rounded-xl flex items-center justify-center shrink-0`}>
                          <h.icon className={`w-5 h-5 ${h.color}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-bold text-slate-800">{h.label}</div>
                          <div className="text-xs text-slate-400">{h.desc}</div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Right — Activity Feed */}
              <div className="lg:col-span-2">
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 h-full">
                  <div className="flex items-center justify-between mb-5">
                    <h2 className="text-base font-black text-slate-900">Recent Activity</h2>
                    <span className="text-[10px] font-bold bg-violet-100 text-violet-600 px-2 py-1 rounded-lg">LIVE</span>
                  </div>
                  <div className="space-y-1">
                    {recentActivity.map((item, i) => (
                      <div key={i} className="flex items-start gap-3 py-3 border-b border-slate-50 last:border-0">
                        <div className={`w-8 h-8 ${item.bg} rounded-xl flex items-center justify-center shrink-0 mt-0.5`}>
                          <item.icon className={`w-4 h-4 ${item.color}`} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-slate-700 font-medium leading-snug">{item.text}</p>
                          <p className="text-xs text-slate-400 mt-0.5">{item.time}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* ── EDIT PROFILE TAB ── */}
        {activeTab === 'edit' && (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="h-1 bg-gradient-to-r from-violet-500 via-indigo-500 to-blue-500" />
            <div className="p-6 sm:p-8">
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h2 className="text-lg font-black text-slate-900">Edit Profile</h2>
                  <p className="text-sm text-slate-400 mt-0.5">Update your personal information</p>
                </div>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="inline-flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white px-5 py-2.5 rounded-xl font-semibold text-sm transition-all shadow-lg shadow-violet-200 disabled:opacity-60"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Save Changes
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                {[
                  { label: 'Full Name', key: 'displayName', icon: User, placeholder: 'Your full name', span: true },
                  { label: 'Subject / Specialty', key: 'subject', icon: BookOpen, placeholder: 'e.g. Mathematics, Computer Science' },
                  { label: 'Institution', key: 'institution', icon: Building2, placeholder: 'School or university name' },
                  { label: 'Phone', key: 'phone', icon: Phone, placeholder: '+1 (555) 000-0000' },
                  { label: 'Website', key: 'website', icon: Globe, placeholder: 'https://yoursite.com' },
                ].map(field => (
                  <div key={field.key} className={field.span ? 'sm:col-span-2' : ''}>
                    <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wide">{field.label}</label>
                    <div className="relative">
                      <field.icon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input
                        type="text"
                        value={(profile as any)[field.key]}
                        onChange={e => setProfile(p => ({ ...p, [field.key]: e.target.value }))}
                        placeholder={field.placeholder}
                        disabled={loading}
                        className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:bg-white transition-all disabled:opacity-50"
                      />
                    </div>
                  </div>
                ))}

                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wide">Bio</label>
                  <textarea
                    value={profile.bio}
                    onChange={e => setProfile(p => ({ ...p, bio: e.target.value }))}
                    placeholder="Tell students a bit about yourself — your teaching style, experience, interests..."
                    rows={4}
                    disabled={loading}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:bg-white transition-all resize-none disabled:opacity-50"
                  />
                  <p className="text-xs text-slate-400 mt-1.5">{profile.bio.length} / 300 characters</p>
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wide">Email Address</label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="email"
                      value={profile.email}
                      readOnly
                      className="w-full pl-11 pr-28 py-3 bg-slate-100 border border-slate-200 rounded-xl text-sm text-slate-500 cursor-not-allowed"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400 bg-slate-200 px-2 py-0.5 rounded-lg">READ-ONLY</span>
                  </div>
                </div>
              </div>

              <div className="flex justify-end mt-8 pt-6 border-t border-slate-100">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="inline-flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white px-6 py-3 rounded-xl font-bold text-sm transition-all shadow-lg shadow-violet-200 disabled:opacity-60"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  Save All Changes
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── NOTIFICATIONS TAB ── */}
        {activeTab === 'notifications' && (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="h-1 bg-gradient-to-r from-blue-500 to-indigo-500" />
            <div className="p-6 sm:p-8">
              <div className="mb-8">
                <h2 className="text-lg font-black text-slate-900">Notification Preferences</h2>
                <p className="text-sm text-slate-400 mt-0.5">Choose what alerts you want to receive</p>
              </div>
              <div className="space-y-3">
                {[
                  { key: 'quizComplete', label: 'Quiz Completed', desc: 'When a student finishes a quiz', icon: FileText, color: 'text-violet-500', bg: 'bg-violet-50' },
                  { key: 'newStudent', label: 'New Student Enrolled', desc: 'When a student joins your class', icon: Users, color: 'text-blue-500', bg: 'bg-blue-50' },
                  { key: 'weeklyReport', label: 'Weekly Report', desc: 'A performance summary email every Monday', icon: BarChart2, color: 'text-indigo-500', bg: 'bg-indigo-50' },
                  { key: 'announcements', label: 'Platform Announcements', desc: 'System-wide news and feature updates', icon: Bell, color: 'text-amber-500', bg: 'bg-amber-50' },
                ].map(n => (
                  <div key={n.key} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl hover:bg-slate-100 transition-colors">
                    <div className="flex items-center gap-4">
                      <div className={`w-10 h-10 ${n.bg} rounded-xl flex items-center justify-center shrink-0`}>
                        <n.icon className={`w-5 h-5 ${n.color}`} />
                      </div>
                      <div>
                        <div className="text-sm font-bold text-slate-800">{n.label}</div>
                        <div className="text-xs text-slate-400 mt-0.5">{n.desc}</div>
                      </div>
                    </div>
                    <button
                      onClick={() => setNotifs(p => ({ ...p, [n.key]: !(p as any)[n.key] }))}
                      className={cn(
                        'w-12 h-6 rounded-full relative transition-all duration-200 shrink-0',
                        (notifs as any)[n.key] ? 'bg-violet-500' : 'bg-slate-200'
                      )}
                    >
                      <span className={cn(
                        'absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm transition-all duration-200',
                        (notifs as any)[n.key] ? 'left-7' : 'left-1'
                      )} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── SECURITY TAB ── */}
        {activeTab === 'security' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Password */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="h-1 bg-gradient-to-r from-emerald-500 to-teal-500" />
              <div className="p-6">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center">
                    <Lock className="w-5 h-5 text-emerald-600" />
                  </div>
                  <div>
                    <h2 className="text-base font-black text-slate-900">Change Password</h2>
                    <p className="text-xs text-slate-400">Use a strong password of at least 8 characters</p>
                  </div>
                </div>
                <div className="space-y-4">
                  {([
                    { key: 'next' as const, label: 'New Password' },
                    { key: 'confirm' as const, label: 'Confirm New Password' },
                  ]).map(f => (
                    <div key={f.key}>
                      <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wide">{f.label}</label>
                      <div className="relative">
                        <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                          type={showPass[f.key] ? 'text' : 'password'}
                          value={passwords[f.key]}
                          onChange={e => setPasswords(p => ({ ...p, [f.key]: e.target.value }))}
                          placeholder="••••••••"
                          className="w-full pl-11 pr-12 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPass(p => ({ ...p, [f.key]: !p[f.key] }))}
                          className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                        >
                          {showPass[f.key] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                  ))}

                  {passwords.next && passwords.confirm && passwords.next !== passwords.confirm && (
                    <div className="flex items-center gap-2 bg-red-50 border border-red-100 rounded-xl px-4 py-2.5">
                      <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
                      <p className="text-xs text-red-600 font-semibold">Passwords don't match</p>
                    </div>
                  )}
                  {passwords.next && passwords.next.length < 8 && (
                    <div className="flex items-center gap-2 bg-amber-50 border border-amber-100 rounded-xl px-4 py-2.5">
                      <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                      <p className="text-xs text-amber-600 font-semibold">Password must be at least 8 characters</p>
                    </div>
                  )}

                  <button
                    onClick={handlePasswordChange}
                    disabled={changingPass || !passwords.next || passwords.next !== passwords.confirm || passwords.next.length < 8}
                    className="w-full py-3 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-emerald-200"
                  >
                    {changingPass ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                    Update Password
                  </button>
                </div>
              </div>
            </div>

            {/* Account Info */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="h-1 bg-gradient-to-r from-slate-400 to-slate-500" />
              <div className="p-6">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center">
                    <Shield className="w-5 h-5 text-slate-500" />
                  </div>
                  <div>
                    <h2 className="text-base font-black text-slate-900">Account Details</h2>
                    <p className="text-xs text-slate-400">Your account information</p>
                  </div>
                </div>
                <div className="space-y-3">
                  {[
                    { label: 'Email Address', value: profile.email, icon: Mail },
                    { label: 'Member Since', value: memberSince, icon: Calendar },
                    { label: 'Account Role', value: 'Teacher', icon: GraduationCap },
                  ].map(item => (
                    <div key={item.label} className="flex items-center gap-3 p-4 bg-slate-50 rounded-xl">
                      <div className="w-9 h-9 bg-white border border-slate-200 rounded-xl flex items-center justify-center shrink-0">
                        <item.icon className="w-4 h-4 text-slate-400" />
                      </div>
                      <div>
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">{item.label}</div>
                        <div className="text-sm font-semibold text-slate-700">{item.value || '—'}</div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-6 p-4 bg-amber-50 border border-amber-100 rounded-xl">
                  <div className="flex items-center gap-2 mb-1">
                    <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                    <span className="text-xs font-bold text-amber-700">Danger Zone</span>
                  </div>
                  <p className="text-xs text-amber-600">To delete your account or transfer data, contact your administrator.</p>
                </div>
              </div>
            </div>
          </div>
        )}

      </div>
    </TeacherLayout>
  );
}
