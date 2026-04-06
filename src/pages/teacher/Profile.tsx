import React, { useEffect, useState } from 'react';
import { supabase } from '../../supabase';
import TeacherLayout from '../../components/layout/TeacherLayout';
import {
  User, Mail, Phone, Globe, BookOpen, Building2,
  Camera, Save, Lock, Bell, Shield, CheckCircle2,
  GraduationCap, Users, FileText, Award, Loader2,
  Eye, EyeOff, AlertTriangle, ChevronDown, Pencil,
  Sparkles, BarChart3, Hash
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

interface Stats { students: number; courses: number; quizzes: number; passRate: number; }

type Section = 'info' | 'security' | 'notifications' | null;

export default function TeacherProfile() {
  const [profile, setProfile] = useState<ProfileData>({
    displayName: '', bio: '', subject: '', institution: '',
    phone: '', website: '', avatarUrl: '', email: '', createdAt: '',
  });
  const [stats, setStats] = useState<Stats>({ students: 0, courses: 0, quizzes: 0, passRate: 0 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [openSection, setOpenSection] = useState<Section>('info');

  const [passwords, setPasswords] = useState({ next: '', confirm: '' });
  const [showPass, setShowPass] = useState({ next: false, confirm: false });
  const [changingPass, setChangingPass] = useState(false);

  const [notifs, setNotifs] = useState({
    quizComplete: true, newStudent: true, weeklyReport: false, announcements: true,
  });

  useEffect(() => {
    const fetchProfile = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const uid = session.user.id;
      const [pSnap, sSnap, cSnap, qSnap, aSnap] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', uid).single(),
        supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('teacher_id', uid),
        supabase.from('courses').select('id', { count: 'exact', head: true }).eq('teacher_id', uid),
        supabase.from('quizzes').select('id', { count: 'exact', head: true }).eq('teacher_id', uid),
        supabase.from('attempts').select('passed').eq('teacher_id', uid),
      ]);
      if (!pSnap.error && pSnap.data) {
        const d = pSnap.data;
        setProfile({
          displayName: d.display_name || '', bio: d.bio || '', subject: d.subject || '',
          institution: d.institution || '', phone: d.phone || '', website: d.website || '',
          avatarUrl: d.avatar_url || '', email: session.user.email || '',
          createdAt: d.created_at || session.user.created_at || '',
        });
      }
      const attempts = aSnap.data || [];
      const passed = attempts.filter((a: any) => a.passed).length;
      setStats({
        students: sSnap.count ?? 0, courses: cSnap.count ?? 0, quizzes: qSnap.count ?? 0,
        passRate: attempts.length > 0 ? Math.round((passed / attempts.length) * 100) : 0,
      });
      setLoading(false);
    };
    fetchProfile();
  }, []);

  const updateProfile = (key: keyof ProfileData, val: string) => {
    setProfile(p => ({ ...p, [key]: val }));
    setDirty(true);
  };

  const handleSave = async () => {
    setSaving(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setSaving(false); return; }
    const { error } = await supabase.from('profiles').update({
      display_name: profile.displayName, bio: profile.bio, subject: profile.subject,
      institution: profile.institution, phone: profile.phone, website: profile.website,
    }).eq('id', session.user.id);
    if (error) toast.error('Failed to save profile');
    else { toast.success('Profile saved!'); setDirty(false); }
    setSaving(false);
  };

  const handlePasswordChange = async () => {
    if (passwords.next !== passwords.confirm) { toast.error('Passwords do not match'); return; }
    if (passwords.next.length < 8) { toast.error('Minimum 8 characters'); return; }
    setChangingPass(true);
    const { error } = await supabase.auth.updateUser({ password: passwords.next });
    if (error) toast.error(error.message);
    else { toast.success('Password updated!'); setPasswords({ next: '', confirm: '' }); }
    setChangingPass(false);
  };

  const initials = profile.displayName
    ? profile.displayName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : 'T';

  const memberYear = profile.createdAt
    ? new Date(profile.createdAt).getFullYear()
    : new Date().getFullYear();

  const toggle = (s: Section) => setOpenSection(o => o === s ? null : s);

  const inputCls = 'w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:bg-white transition-all disabled:opacity-50';
  const labelCls = 'block text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1.5';

  return (
    <TeacherLayout>
      <div className="max-w-6xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">

          {/* ── LEFT PANEL: Profile Card ── */}
          <div className="lg:col-span-2 space-y-4">

            {/* Identity Card */}
            <div className="rounded-3xl overflow-hidden shadow-xl">
              {/* Card top — dark gradient */}
              <div className="bg-gradient-to-b from-slate-900 to-slate-800 px-6 pt-8 pb-24 relative">
                <div className="absolute inset-0 overflow-hidden">
                  <div className="absolute -top-8 -right-8 w-40 h-40 bg-violet-600/20 rounded-full blur-3xl" />
                  <div className="absolute top-1/2 -left-4 w-32 h-32 bg-indigo-500/15 rounded-full blur-2xl" />
                  <div
                    className="absolute inset-0 opacity-[0.04]"
                    style={{
                      backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)',
                      backgroundSize: '20px 20px',
                    }}
                  />
                </div>

                {/* Role badge */}
                <div className="relative flex items-center justify-between mb-6">
                  <span className="inline-flex items-center gap-1.5 bg-violet-500/20 border border-violet-400/30 text-violet-300 text-[11px] font-bold px-3 py-1.5 rounded-full">
                    <GraduationCap className="w-3 h-3" /> Teacher
                  </span>
                  <span className="text-[11px] text-slate-500 font-medium">Since {memberYear}</span>
                </div>

                {/* Avatar */}
                <div className="relative flex justify-center">
                  <div className="relative">
                    {profile.avatarUrl
                      ? <img src={profile.avatarUrl} alt="Avatar" className="w-28 h-28 rounded-3xl object-cover ring-4 ring-slate-700 shadow-2xl" />
                      : (
                        <div className="w-28 h-28 rounded-3xl bg-gradient-to-br from-violet-500 via-indigo-500 to-blue-600 flex items-center justify-center ring-4 ring-slate-700 shadow-2xl">
                          {loading
                            ? <Loader2 className="w-8 h-8 text-white/50 animate-spin" />
                            : <span className="text-3xl font-black text-white">{initials}</span>
                          }
                        </div>
                      )
                    }
                    <button className="absolute -bottom-2 -right-2 w-9 h-9 bg-violet-600 hover:bg-violet-500 rounded-2xl flex items-center justify-center shadow-lg transition-all border-2 border-slate-800">
                      <Camera className="w-4 h-4 text-white" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Card bottom — white */}
              <div className="bg-white px-6 pb-6 -mt-14 relative">
                <div className="text-center pt-16 pb-4">
                  {loading ? (
                    <>
                      <div className="h-6 w-36 bg-slate-100 rounded-xl animate-pulse mx-auto mb-2" />
                      <div className="h-4 w-24 bg-slate-100 rounded-xl animate-pulse mx-auto" />
                    </>
                  ) : (
                    <>
                      <h1 className="text-xl font-black text-slate-900 tracking-tight">
                        {profile.displayName || 'Your Name'}
                      </h1>
                      {profile.subject && (
                        <p className="text-sm text-violet-600 font-semibold mt-1">{profile.subject}</p>
                      )}
                      {profile.bio && (
                        <p className="text-xs text-slate-500 leading-relaxed mt-3 line-clamp-3">{profile.bio}</p>
                      )}
                    </>
                  )}
                </div>

                {/* Divider */}
                <div className="h-px bg-slate-100 my-4" />

                {/* Contact info */}
                <div className="space-y-2.5">
                  {[
                    { icon: Mail, value: profile.email, placeholder: 'No email' },
                    { icon: Building2, value: profile.institution, placeholder: 'No institution' },
                    { icon: Phone, value: profile.phone, placeholder: 'No phone' },
                    { icon: Globe, value: profile.website, placeholder: 'No website' },
                  ].map((row, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <div className="w-7 h-7 bg-slate-100 rounded-lg flex items-center justify-center shrink-0">
                        <row.icon className="w-3.5 h-3.5 text-slate-400" />
                      </div>
                      {loading
                        ? <div className="h-3.5 w-32 bg-slate-100 rounded animate-pulse" />
                        : <span className={cn('text-xs truncate', row.value ? 'text-slate-700 font-medium' : 'text-slate-300 italic')}>
                            {row.value || row.placeholder}
                          </span>
                      }
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Students', value: stats.students, icon: Users, color: 'text-violet-600', bg: 'bg-violet-50', border: 'border-violet-100' },
                { label: 'Courses', value: stats.courses, icon: BookOpen, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-100' },
                { label: 'Quizzes', value: stats.quizzes, icon: FileText, color: 'text-indigo-600', bg: 'bg-indigo-50', border: 'border-indigo-100' },
                { label: 'Pass Rate', value: `${stats.passRate}%`, icon: Award, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-100' },
              ].map(s => (
                <div key={s.label} className={`bg-white rounded-2xl border ${s.border} p-4 shadow-sm`}>
                  <div className={`w-9 h-9 ${s.bg} rounded-xl flex items-center justify-center mb-2`}>
                    <s.icon className={`w-4 h-4 ${s.color}`} />
                  </div>
                  {loading
                    ? <div className="h-6 w-10 bg-slate-100 rounded animate-pulse mb-0.5" />
                    : <div className={`text-2xl font-black ${s.color}`}>{s.value}</div>
                  }
                  <div className="text-[11px] text-slate-400 font-semibold">{s.label}</div>
                </div>
              ))}
            </div>

            {/* Floating save bar */}
            {dirty && (
              <div className="sticky bottom-4 z-10">
                <div className="bg-slate-900 rounded-2xl px-5 py-3.5 flex items-center justify-between shadow-2xl shadow-slate-900/40 border border-slate-700">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                    <span className="text-white text-sm font-semibold">Unsaved changes</span>
                  </div>
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="inline-flex items-center gap-2 bg-violet-600 hover:bg-violet-500 text-white px-4 py-2 rounded-xl text-sm font-bold transition-all disabled:opacity-60"
                  >
                    {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    Save
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ── RIGHT PANEL: Accordion Sections ── */}
          <div className="lg:col-span-3 space-y-3">

            {/* Page title */}
            <div className="flex items-center gap-3 mb-2">
              <div className="w-9 h-9 bg-violet-100 rounded-xl flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-violet-600" />
              </div>
              <div>
                <h2 className="text-lg font-black text-slate-900">Account Settings</h2>
                <p className="text-xs text-slate-400">Manage your profile, security & preferences</p>
              </div>
            </div>

            {/* ── Section: Personal Info ── */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <button
                onClick={() => toggle('info')}
                className="w-full flex items-center justify-between px-6 py-4 hover:bg-slate-50/70 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-violet-50 rounded-xl flex items-center justify-center">
                    <Pencil className="w-4 h-4 text-violet-600" />
                  </div>
                  <div className="text-left">
                    <div className="text-sm font-bold text-slate-900">Personal Information</div>
                    <div className="text-xs text-slate-400">Name, bio, subject, contact details</div>
                  </div>
                </div>
                <ChevronDown className={cn('w-4 h-4 text-slate-400 transition-transform duration-200', openSection === 'info' && 'rotate-180')} />
              </button>

              {openSection === 'info' && (
                <div className="px-6 pb-6 border-t border-slate-50 pt-5 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="sm:col-span-2">
                      <label className={labelCls}>Full Name</label>
                      <div className="relative">
                        <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                          type="text"
                          value={profile.displayName}
                          onChange={e => updateProfile('displayName', e.target.value)}
                          placeholder="Your full name"
                          disabled={loading}
                          className={cn(inputCls, 'pl-10')}
                        />
                      </div>
                    </div>

                    <div>
                      <label className={labelCls}>Subject / Specialty</label>
                      <div className="relative">
                        <Hash className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                          type="text"
                          value={profile.subject}
                          onChange={e => updateProfile('subject', e.target.value)}
                          placeholder="e.g. Mathematics"
                          disabled={loading}
                          className={cn(inputCls, 'pl-10')}
                        />
                      </div>
                    </div>

                    <div>
                      <label className={labelCls}>Institution</label>
                      <div className="relative">
                        <Building2 className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                          type="text"
                          value={profile.institution}
                          onChange={e => updateProfile('institution', e.target.value)}
                          placeholder="School or university"
                          disabled={loading}
                          className={cn(inputCls, 'pl-10')}
                        />
                      </div>
                    </div>

                    <div>
                      <label className={labelCls}>Phone</label>
                      <div className="relative">
                        <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                          type="text"
                          value={profile.phone}
                          onChange={e => updateProfile('phone', e.target.value)}
                          placeholder="+1 (555) 000-0000"
                          disabled={loading}
                          className={cn(inputCls, 'pl-10')}
                        />
                      </div>
                    </div>

                    <div>
                      <label className={labelCls}>Website</label>
                      <div className="relative">
                        <Globe className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                          type="text"
                          value={profile.website}
                          onChange={e => updateProfile('website', e.target.value)}
                          placeholder="https://yoursite.com"
                          disabled={loading}
                          className={cn(inputCls, 'pl-10')}
                        />
                      </div>
                    </div>

                    <div className="sm:col-span-2">
                      <label className={labelCls}>Bio</label>
                      <textarea
                        value={profile.bio}
                        onChange={e => updateProfile('bio', e.target.value)}
                        placeholder="Tell students about yourself — your teaching style, background, interests..."
                        rows={3}
                        disabled={loading}
                        className={cn(inputCls, 'resize-none')}
                      />
                      <div className="flex justify-end mt-1">
                        <span className={cn('text-[11px] font-medium', profile.bio.length > 280 ? 'text-red-400' : 'text-slate-300')}>
                          {profile.bio.length}/300
                        </span>
                      </div>
                    </div>

                    <div className="sm:col-span-2">
                      <label className={labelCls}>Email Address</label>
                      <div className="relative">
                        <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                          type="email"
                          value={profile.email}
                          readOnly
                          className="w-full pl-10 pr-24 py-2.5 bg-slate-100 border border-slate-200 rounded-xl text-sm text-slate-500 cursor-not-allowed"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400 bg-slate-200 px-2 py-0.5 rounded-lg">LOCKED</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end pt-1">
                    <button
                      onClick={handleSave}
                      disabled={saving || !dirty}
                      className="inline-flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white px-5 py-2.5 rounded-xl font-bold text-sm transition-all shadow-lg shadow-violet-200 disabled:opacity-40"
                    >
                      {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                      Save Changes
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* ── Section: Notifications ── */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <button
                onClick={() => toggle('notifications')}
                className="w-full flex items-center justify-between px-6 py-4 hover:bg-slate-50/70 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-blue-50 rounded-xl flex items-center justify-center">
                    <Bell className="w-4 h-4 text-blue-600" />
                  </div>
                  <div className="text-left">
                    <div className="text-sm font-bold text-slate-900">Notifications</div>
                    <div className="text-xs text-slate-400">Choose what alerts you receive</div>
                  </div>
                </div>
                <ChevronDown className={cn('w-4 h-4 text-slate-400 transition-transform duration-200', openSection === 'notifications' && 'rotate-180')} />
              </button>

              {openSection === 'notifications' && (
                <div className="px-6 pb-6 border-t border-slate-50 pt-4 space-y-2">
                  {[
                    { key: 'quizComplete' as const, label: 'Quiz Completed', desc: 'When a student submits a quiz', accent: 'peer-checked:bg-violet-500' },
                    { key: 'newStudent' as const, label: 'New Student Enrolled', desc: 'When someone joins your class', accent: 'peer-checked:bg-blue-500' },
                    { key: 'weeklyReport' as const, label: 'Weekly Report', desc: 'Performance digest every Monday', accent: 'peer-checked:bg-indigo-500' },
                    { key: 'announcements' as const, label: 'Announcements', desc: 'Platform-wide news & updates', accent: 'peer-checked:bg-emerald-500' },
                  ].map(n => (
                    <label key={n.key} className="flex items-center justify-between p-4 rounded-xl bg-slate-50 hover:bg-slate-100 transition-colors cursor-pointer">
                      <div>
                        <div className="text-sm font-bold text-slate-800">{n.label}</div>
                        <div className="text-xs text-slate-400 mt-0.5">{n.desc}</div>
                      </div>
                      <button
                        onClick={() => setNotifs(p => ({ ...p, [n.key]: !p[n.key] }))}
                        className={cn(
                          'w-11 h-6 rounded-full relative transition-all duration-200 shrink-0 ml-4',
                          notifs[n.key] ? 'bg-violet-500' : 'bg-slate-200'
                        )}
                      >
                        <span className={cn(
                          'absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all duration-200',
                          notifs[n.key] ? 'left-6' : 'left-1'
                        )} />
                      </button>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {/* ── Section: Security ── */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <button
                onClick={() => toggle('security')}
                className="w-full flex items-center justify-between px-6 py-4 hover:bg-slate-50/70 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-emerald-50 rounded-xl flex items-center justify-center">
                    <Shield className="w-4 h-4 text-emerald-600" />
                  </div>
                  <div className="text-left">
                    <div className="text-sm font-bold text-slate-900">Security</div>
                    <div className="text-xs text-slate-400">Password & account protection</div>
                  </div>
                </div>
                <ChevronDown className={cn('w-4 h-4 text-slate-400 transition-transform duration-200', openSection === 'security' && 'rotate-180')} />
              </button>

              {openSection === 'security' && (
                <div className="px-6 pb-6 border-t border-slate-50 pt-5">
                  {/* Account detail pills */}
                  <div className="flex flex-wrap gap-2 mb-5">
                    {[
                      { icon: Mail, label: profile.email || '—' },
                      { icon: GraduationCap, label: 'Teacher Account' },
                      { icon: BarChart3, label: `${stats.courses} course${stats.courses !== 1 ? 's' : ''}` },
                    ].map((p, i) => (
                      <div key={i} className="inline-flex items-center gap-1.5 bg-slate-100 text-slate-600 text-xs font-semibold px-3 py-1.5 rounded-xl">
                        <p.icon className="w-3.5 h-3.5 text-slate-400" />
                        {p.label}
                      </div>
                    ))}
                  </div>

                  <div className="space-y-4">
                    <h3 className="text-sm font-bold text-slate-900">Change Password</h3>
                    {[
                      { key: 'next' as const, label: 'New Password' },
                      { key: 'confirm' as const, label: 'Confirm Password' },
                    ].map(f => (
                      <div key={f.key}>
                        <label className={labelCls}>{f.label}</label>
                        <div className="relative">
                          <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                          <input
                            type={showPass[f.key] ? 'text' : 'password'}
                            value={passwords[f.key]}
                            onChange={e => setPasswords(p => ({ ...p, [f.key]: e.target.value }))}
                            placeholder="••••••••"
                            className={cn(inputCls, 'pl-10 pr-11')}
                          />
                          <button
                            type="button"
                            onClick={() => setShowPass(p => ({ ...p, [f.key]: !p[f.key] }))}
                            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                          >
                            {showPass[f.key] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>
                    ))}

                    {passwords.next.length > 0 && passwords.next.length < 8 && (
                      <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 border border-amber-100 px-3 py-2 rounded-xl">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        Password must be at least 8 characters
                      </div>
                    )}
                    {passwords.confirm.length > 0 && passwords.next !== passwords.confirm && (
                      <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-100 px-3 py-2 rounded-xl">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        Passwords do not match
                      </div>
                    )}

                    <button
                      onClick={handlePasswordChange}
                      disabled={changingPass || !passwords.next || passwords.next !== passwords.confirm || passwords.next.length < 8}
                      className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold transition-all disabled:opacity-40 flex items-center justify-center gap-2 shadow-lg shadow-emerald-200/60"
                    >
                      {changingPass ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                      Update Password
                    </button>

                    <div className="mt-2 p-3.5 bg-red-50 border border-red-100 rounded-xl flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                      <p className="text-xs text-red-500 leading-relaxed">
                        To delete your account or transfer your data, please contact your platform administrator.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

          </div>
        </div>
      </div>
    </TeacherLayout>
  );
}
