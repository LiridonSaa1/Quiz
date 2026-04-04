import React, { useEffect, useState } from 'react';
import { supabase } from '../../supabase';
import TeacherLayout from '../../components/layout/TeacherLayout';
import {
  User, Mail, Phone, Globe, BookOpen, Building2,
  Camera, Save, Lock, Bell, Shield, CheckCircle2,
  Edit3, GraduationCap, Calendar, Users, FileText,
  Award, Loader2, Eye, EyeOff, AlertTriangle
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

export default function TeacherProfile() {
  const [profile, setProfile] = useState<ProfileData>({
    displayName: '', bio: '', subject: '', institution: '',
    phone: '', website: '', avatarUrl: '', email: '', createdAt: '',
  });
  const [stats, setStats] = useState<Stats>({ students: 0, courses: 0, quizzes: 0, passRate: 0 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingField, setEditingField] = useState<string | null>(null);

  // Password change state
  const [showPassSection, setShowPassSection] = useState(false);
  const [passwords, setPasswords] = useState({ current: '', next: '', confirm: '' });
  const [showPass, setShowPass] = useState({ current: false, next: false, confirm: false });
  const [changingPass, setChangingPass] = useState(false);

  // Notification prefs
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
    else toast.success('Profile updated!');
    setSaving(false);
    setEditingField(null);
  };

  const handlePasswordChange = async () => {
    if (passwords.next !== passwords.confirm) {
      toast.error('Passwords do not match');
      return;
    }
    if (passwords.next.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }
    setChangingPass(true);
    const { error } = await supabase.auth.updateUser({ password: passwords.next });
    if (error) toast.error(error.message);
    else {
      toast.success('Password updated successfully!');
      setPasswords({ current: '', next: '', confirm: '' });
      setShowPassSection(false);
    }
    setChangingPass(false);
  };

  const initials = profile.displayName
    ? profile.displayName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : 'T';

  const memberSince = profile.createdAt
    ? new Date(profile.createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : '—';

  const statItems = [
    { label: 'Students', value: stats.students, icon: Users, color: 'text-violet-600', bg: 'bg-violet-50' },
    { label: 'Courses', value: stats.courses, icon: BookOpen, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'Quizzes', value: stats.quizzes, icon: FileText, color: 'text-indigo-600', bg: 'bg-indigo-50' },
    { label: 'Pass Rate', value: `${stats.passRate}%`, icon: Award, color: 'text-emerald-600', bg: 'bg-emerald-50' },
  ];

  return (
    <TeacherLayout>
      <div className="max-w-5xl mx-auto space-y-6">

        {/* Hero Card */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="h-28 bg-gradient-to-r from-violet-600 via-indigo-600 to-blue-600 relative">
            <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(circle at 20% 50%, white 1px, transparent 1px), radial-gradient(circle at 80% 20%, white 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
          </div>
          <div className="px-8 pb-8">
            <div className="flex items-end justify-between -mt-12 mb-6">
              <div className="relative">
                {profile.avatarUrl
                  ? <img src={profile.avatarUrl} alt="Avatar" className="w-24 h-24 rounded-2xl border-4 border-white shadow-xl object-cover" />
                  : (
                    <div className="w-24 h-24 rounded-2xl border-4 border-white shadow-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
                      <span className="text-2xl font-bold text-white">{loading ? '' : initials}</span>
                    </div>
                  )
                }
                <button className="absolute -bottom-1 -right-1 w-8 h-8 bg-white border border-slate-200 rounded-xl flex items-center justify-center shadow-sm hover:bg-slate-50 transition-all">
                  <Camera className="w-4 h-4 text-slate-500" />
                </button>
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

            {loading ? (
              <div className="space-y-2">
                <div className="h-7 w-48 bg-slate-100 rounded-lg animate-pulse" />
                <div className="h-4 w-32 bg-slate-100 rounded-lg animate-pulse" />
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-bold text-slate-900">{profile.displayName || 'Your Name'}</h1>
                  <div className="flex items-center flex-wrap gap-3 mt-2">
                    <span className="inline-flex items-center gap-1.5 text-sm text-slate-500">
                      <Mail className="w-4 h-4 text-slate-400" />{profile.email}
                    </span>
                    {profile.institution && (
                      <span className="inline-flex items-center gap-1.5 text-sm text-slate-500">
                        <Building2 className="w-4 h-4 text-slate-400" />{profile.institution}
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1.5 text-sm text-slate-500">
                      <Calendar className="w-4 h-4 text-slate-400" />Member since {memberSince}
                    </span>
                  </div>
                </div>
                <div className="inline-flex items-center gap-1.5 bg-violet-50 border border-violet-100 text-violet-700 text-xs font-semibold px-3 py-1.5 rounded-xl">
                  <GraduationCap className="w-3.5 h-3.5" />
                  Teacher
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {statItems.map(s => (
            <div key={s.label} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex items-center gap-4">
              <div className={`w-11 h-11 ${s.bg} rounded-xl flex items-center justify-center shrink-0`}>
                <s.icon className={`w-5 h-5 ${s.color}`} />
              </div>
              <div>
                {loading
                  ? <div className="h-6 w-10 bg-slate-100 rounded animate-pulse mb-1" />
                  : <div className="text-xl font-bold text-slate-900">{s.value}</div>
                }
                <div className="text-xs text-slate-400 font-medium">{s.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Two Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

          {/* Left — Personal Info */}
          <div className="lg:col-span-3 space-y-6">
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="h-1 bg-gradient-to-r from-violet-500 to-indigo-500" />
              <div className="p-6">
                <div className="flex items-center justify-between mb-5">
                  <h2 className="text-base font-bold text-slate-900">Personal Information</h2>
                  <Edit3 className="w-4 h-4 text-slate-400" />
                </div>
                <div className="space-y-4">
                  {[
                    { label: 'Full Name', key: 'displayName', icon: User, placeholder: 'Your full name' },
                    { label: 'Subject / Specialty', key: 'subject', icon: BookOpen, placeholder: 'e.g. Mathematics, Computer Science' },
                    { label: 'Institution', key: 'institution', icon: Building2, placeholder: 'School or university name' },
                    { label: 'Phone', key: 'phone', icon: Phone, placeholder: '+1 (555) 000-0000' },
                    { label: 'Website', key: 'website', icon: Globe, placeholder: 'https://yoursite.com' },
                  ].map(field => (
                    <div key={field.key}>
                      <label className="block text-xs font-semibold text-slate-500 mb-1.5">{field.label}</label>
                      <div className="relative">
                        <field.icon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                          type="text"
                          value={(profile as any)[field.key]}
                          onChange={e => setProfile(p => ({ ...p, [field.key]: e.target.value }))}
                          placeholder={field.placeholder}
                          disabled={loading}
                          className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:bg-white transition-all disabled:opacity-50"
                        />
                      </div>
                    </div>
                  ))}

                  {/* Bio */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1.5">Bio</label>
                    <textarea
                      value={profile.bio}
                      onChange={e => setProfile(p => ({ ...p, bio: e.target.value }))}
                      placeholder="Tell students a bit about yourself..."
                      rows={3}
                      disabled={loading}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:bg-white transition-all resize-none disabled:opacity-50"
                    />
                  </div>

                  {/* Email — read only */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1.5">Email Address</label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input
                        type="email"
                        value={profile.email}
                        readOnly
                        className="w-full pl-9 pr-4 py-2.5 bg-slate-100 border border-slate-200 rounded-xl text-sm text-slate-500 cursor-not-allowed"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-slate-400 bg-slate-200 px-1.5 py-0.5 rounded">Read-only</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column */}
          <div className="lg:col-span-2 space-y-6">

            {/* Notification Preferences */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="h-1 bg-gradient-to-r from-blue-500 to-indigo-500" />
              <div className="p-6">
                <div className="flex items-center gap-2 mb-5">
                  <Bell className="w-4 h-4 text-slate-400" />
                  <h2 className="text-base font-bold text-slate-900">Notifications</h2>
                </div>
                <div className="space-y-4">
                  {[
                    { key: 'quizComplete', label: 'Quiz Completed', desc: 'When a student finishes a quiz' },
                    { key: 'newStudent', label: 'New Student', desc: 'When a student joins your class' },
                    { key: 'weeklyReport', label: 'Weekly Report', desc: 'Summary email every Monday' },
                    { key: 'announcements', label: 'Announcements', desc: 'Platform-wide news & updates' },
                  ].map(n => (
                    <div key={n.key} className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-semibold text-slate-800">{n.label}</div>
                        <div className="text-xs text-slate-400">{n.desc}</div>
                      </div>
                      <button
                        onClick={() => setNotifs(p => ({ ...p, [n.key]: !(p as any)[n.key] }))}
                        className={cn(
                          'w-11 h-6 rounded-full relative transition-all duration-200',
                          (notifs as any)[n.key] ? 'bg-violet-500' : 'bg-slate-200'
                        )}
                      >
                        <span className={cn(
                          'absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm transition-all duration-200',
                          (notifs as any)[n.key] ? 'left-6' : 'left-1'
                        )} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Security */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="h-1 bg-gradient-to-r from-emerald-500 to-teal-500" />
              <div className="p-6">
                <div className="flex items-center gap-2 mb-5">
                  <Shield className="w-4 h-4 text-slate-400" />
                  <h2 className="text-base font-bold text-slate-900">Security</h2>
                </div>

                <div className="flex items-center justify-between mb-4">
                  <div>
                    <div className="text-sm font-semibold text-slate-800">Password</div>
                    <div className="text-xs text-slate-400">Last changed: Unknown</div>
                  </div>
                  <button
                    onClick={() => setShowPassSection(s => !s)}
                    className="text-xs font-semibold text-violet-600 hover:text-violet-800 transition-colors"
                  >
                    {showPassSection ? 'Cancel' : 'Change'}
                  </button>
                </div>

                {showPassSection && (
                  <div className="space-y-3 border-t border-slate-100 pt-4">
                    {([
                      { key: 'next', label: 'New Password' },
                      { key: 'confirm', label: 'Confirm Password' },
                    ] as { key: 'current' | 'next' | 'confirm'; label: string }[]).map(f => (
                      <div key={f.key}>
                        <label className="block text-xs font-semibold text-slate-500 mb-1">{f.label}</label>
                        <div className="relative">
                          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                          <input
                            type={(showPass as any)[f.key] ? 'text' : 'password'}
                            value={(passwords as any)[f.key]}
                            onChange={e => setPasswords(p => ({ ...p, [f.key]: e.target.value }))}
                            placeholder="••••••••"
                            className="w-full pl-9 pr-10 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPass(p => ({ ...p, [f.key]: !(p as any)[f.key] }))}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                          >
                            {(showPass as any)[f.key] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>
                    ))}
                    {passwords.next && passwords.confirm && passwords.next !== passwords.confirm && (
                      <p className="text-xs text-red-500 flex items-center gap-1"><AlertTriangle className="w-3 h-3" />Passwords don't match</p>
                    )}
                    <button
                      onClick={handlePasswordChange}
                      disabled={changingPass || !passwords.next || passwords.next !== passwords.confirm}
                      className="w-full py-2 bg-violet-600 text-white rounded-xl text-sm font-semibold hover:bg-violet-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {changingPass ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                      Update Password
                    </button>
                  </div>
                )}
              </div>
            </div>

          </div>
        </div>
      </div>
    </TeacherLayout>
  );
}
