import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../supabase';
import {
  User, Mail, Shield, Save, Loader2, Lock, Eye, EyeOff,
  Camera, CheckCircle2, AlertTriangle, BookOpen, Award,
  HelpCircle, TrendingUp, Phone, Globe, FileText, Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import StudentLayout from '../../components/layout/StudentLayout';
import { motion } from 'motion/react';
import { cn } from '../../lib/utils';
import { authFetch } from '../../lib/apiUrl';
import {
  AdminListPageShell,
  ADMIN_LIST_ITEM_CARD,
} from '../../components/admin/AdminListPageShell';

interface ProfileData {
  displayName: string;
  bio: string;
  phone: string;
  website: string;
  avatarUrl: string;
  email: string;
  createdAt: string;
}

interface Stats {
  coursesEnrolled: number;
  lessonsCompleted: number;
  quizzesTaken: number;
  certificatesEarned: number;
}

const emptyProfile: ProfileData = {
  displayName: '',
  bio: '',
  phone: '',
  website: '',
  avatarUrl: '',
  email: '',
  createdAt: '',
};

export default function StudentProfile() {
  const { t } = useTranslation();
  const [profile, setProfile] = useState<ProfileData>(emptyProfile);
  const [stats, setStats] = useState<Stats>({ coursesEnrolled: 0, lessonsCompleted: 0, quizzesTaken: 0, certificatesEarned: 0 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const [passwords, setPasswords] = useState({ next: '', confirm: '' });
  const [showPass, setShowPass] = useState({ next: false, confirm: false });
  const [changingPass, setChangingPass] = useState(false);

  const updateField = (key: keyof ProfileData, val: string) => {
    setProfile((p) => ({ ...p, [key]: val }));
    setDirty(true);
  };

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) return;

      const res = await authFetch('/api/student/profile');
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          const p = json.profile || {};
          setProfile({
            displayName: String(p.displayName || ''),
            bio: String(p.bio || ''),
            phone: String(p.phone || ''),
            website: String(p.website || ''),
            avatarUrl: String(p.avatarUrl || ''),
            email: session.user.email || String(p.email || ''),
            createdAt: String(p.createdAt || session.user.created_at || ''),
          });
          const s = json.stats || {};
          setStats({
            coursesEnrolled: Number(s.coursesEnrolled || 0),
            lessonsCompleted: Number(s.lessonsCompleted || 0),
            quizzesTaken: Number(s.quizzesTaken || 0),
            certificatesEarned: Number(s.certificatesEarned || 0),
          });
          return;
        }
      }
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .maybeSingle();
      if (error) throw error;
      if (data) {
        setProfile({
          displayName: String(data.display_name || ''),
          bio: String(data.bio || ''),
          phone: String(data.phone || ''),
          website: String(data.website || ''),
          avatarUrl: String(data.avatar_url || ''),
          email: session.user.email || String(data.email || ''),
          createdAt: String(data.created_at || ''),
        });
      }
    } catch (e) {
      console.error(e);
      toast.error(t('errors.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const handleSave = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user?.id) { toast.error(t('errors.notFound')); return; }
    if (!profile.displayName.trim()) { toast.error(t('student.profile.displayName') + ' ' + t('common.required')); return; }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        display_name: profile.displayName.trim(),
        bio: profile.bio.trim() || null,
        phone: profile.phone.trim() || null,
        website: profile.website.trim() || null,
        avatar_url: profile.avatarUrl.trim() || null,
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase.from('profiles').update(payload).eq('id', session.user.id);
      if (error) {
        const msg = error.message || '';
        const missingCol = /column|does not exist|schema cache/i.test(msg);
        if (missingCol) {
          const { error: e2 } = await supabase
            .from('profiles')
            .update({ display_name: profile.displayName.trim(), updated_at: new Date().toISOString() })
            .eq('id', session.user.id);
          if (e2) throw e2;
          toast.success(t('success.saved'));
        } else {
          throw error;
        }
      } else {
        toast.success(t('success.saved'));
      }
      setDirty(false);
      await loadAll();
    } catch (e: unknown) {
      toast.error((e as Error)?.message || t('errors.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordChange = async () => {
    if (passwords.next !== passwords.confirm) { toast.error(t('security.passwordMismatch')); return; }
    if (passwords.next.length < 8) { toast.error(t('security.toasts.minChars')); return; }
    setChangingPass(true);
    const { error } = await supabase.auth.updateUser({ password: passwords.next });
    if (error) toast.error(error.message);
    else {
      toast.success(t('security.toasts.updated'));
      setPasswords({ next: '', confirm: '' });
    }
    setChangingPass(false);
  };

  const initials = profile.displayName
    ? profile.displayName.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()
    : 'S';

  const memberYear = profile.createdAt ? new Date(profile.createdAt).getFullYear() : new Date().getFullYear();

  const statItems = [
    { label: t('student.profile.courses'), value: stats.coursesEnrolled, gradient: 'from-indigo-500 to-violet-600', shadow: 'shadow-indigo-500/25', icon: BookOpen },
    { label: t('student.profile.lessons'), value: stats.lessonsCompleted, gradient: 'from-blue-500 to-cyan-600', shadow: 'shadow-blue-500/25', icon: FileText },
    { label: t('student.profile.quizzes'), value: stats.quizzesTaken, gradient: 'from-violet-500 to-purple-600', shadow: 'shadow-violet-500/25', icon: HelpCircle },
    { label: t('student.profile.badges'), value: stats.certificatesEarned, gradient: 'from-emerald-500 to-teal-600', shadow: 'shadow-emerald-500/25', icon: Award },
  ];

  const inputCls =
    'w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all disabled:opacity-50';
  const labelCls = 'block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5';

  return (
    <StudentLayout>
      <AdminListPageShell
        breadcrumbPortalLabel={t('nav.studentPortal')}
        breadcrumbLabel={t('nav.profile')}
        title={t('nav.profile')}
        description={t('student.profile.profileDetails')}
        statsGridClassName="grid grid-cols-2 sm:grid-cols-4 gap-4"
        stats={statItems}
        action={
          <motion.button
            type="button"
            onClick={handleSave}
            disabled={saving || loading || !dirty}
            whileHover={{ scale: dirty ? 1.04 : 1 }}
            whileTap={{ scale: dirty ? 0.97 : 1 }}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl font-bold text-sm text-white shrink-0 transition-all disabled:opacity-50"
            style={{
              background: dirty
                ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
                : 'linear-gradient(135deg, #94a3b8 0%, #64748b 100%)',
              boxShadow: dirty ? '0 8px 32px rgba(16,185,129,0.35), 0 2px 8px rgba(0,0,0,0.12)' : undefined,
            }}
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {t('common.saveChanges')}
          </motion.button>
        }
      >
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1">
            <div className={cn(ADMIN_LIST_ITEM_CARD, 'lg:sticky lg:top-4')}>
              <div className="flex flex-col items-center text-center">
                <div className="relative">
                  {profile.avatarUrl ? (
                    <img
                      src={profile.avatarUrl}
                      alt=""
                      className="w-24 h-24 rounded-2xl object-cover ring-4 ring-emerald-100 shadow-lg"
                    />
                  ) : (
                    <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-2xl font-bold text-white shadow-lg">
                      {loading ? <Loader2 className="w-8 h-8 animate-spin opacity-70" /> : initials}
                    </div>
                  )}
                  <span className="absolute -bottom-1 -right-1 w-9 h-9 bg-white rounded-xl shadow border border-slate-100 flex items-center justify-center">
                    <Camera className="w-4 h-4 text-slate-400" />
                  </span>
                </div>
                <p className="mt-4 font-bold text-slate-900">{profile.displayName || t('student.profile.fullNamePlaceholder')}</p>
                <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-slate-500 bg-slate-100 px-2 py-1 rounded-full">
                  <Shield className="w-3.5 h-3.5" /> {t('roles.meta.student.label')} · {t('common.joinedDate')} {memberYear}
                </span>
                {profile.email && (
                  <p className="mt-2 text-xs text-slate-400 break-all">{profile.email}</p>
                )}
              </div>
            </div>

            <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
              <h2 className="text-sm font-black text-slate-900 uppercase tracking-wider mb-4 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-emerald-500" />
                {t('student.profile.yourStats')}
              </h2>
              <div className="grid grid-cols-2 gap-4">
                {[
                  { label: t('student.profile.courses'), value: stats.coursesEnrolled, icon: BookOpen, color: 'text-indigo-600', bg: 'bg-indigo-50' },
                  { label: t('student.profile.lessons'), value: stats.lessonsCompleted, icon: TrendingUp, color: 'text-blue-600', bg: 'bg-blue-50' },
                  { label: t('student.profile.quizzes'), value: stats.quizzesTaken, icon: HelpCircle, color: 'text-violet-600', bg: 'bg-violet-50' },
                  { label: t('student.profile.badges'), value: stats.certificatesEarned, icon: Award, color: 'text-emerald-600', bg: 'bg-emerald-50' },
                ].map((item) => (
                  <div key={item.label} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center', item.bg)}>
                        <item.icon className={cn('w-3.5 h-3.5', item.color)} />
                      </div>
                      <span className="text-xs text-slate-500 font-medium">{item.label}</span>
                    </div>
                    <span className="text-sm font-bold text-slate-900">{loading ? '-' : item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-emerald-500" />
                <h2 className="font-bold text-slate-900">{t('student.profile.profileDetails')}</h2>
              </div>
              <div className="p-5 space-y-4">
                {loading ? (
                  <div className="space-y-3">
                    {Array(5).fill(0).map((_, i) => (
                      <div key={i} className="h-11 bg-slate-100 rounded-xl animate-pulse" />
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="sm:col-span-2">
                      <label className={labelCls}>{t('student.profile.displayName')} *</label>
                      <div className="relative">
                        <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                          value={profile.displayName}
                          onChange={(e) => updateField('displayName', e.target.value)}
                          className={cn(inputCls, 'pl-10')}
                          placeholder={t('student.profile.fullNamePlaceholder')}
                        />
                      </div>
                    </div>
                    <div>
                      <label className={labelCls}>{t('student.profile.phone')}</label>
                      <div className="relative">
                        <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                          value={profile.phone}
                          onChange={(e) => updateField('phone', e.target.value)}
                          className={cn(inputCls, 'pl-10')}
                          placeholder="+1 …"
                        />
                      </div>
                    </div>
                    <div>
                      <label className={labelCls}>{t('student.profile.website')}</label>
                      <div className="relative">
                        <Globe className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                          value={profile.website}
                          onChange={(e) => updateField('website', e.target.value)}
                          className={cn(inputCls, 'pl-10')}
                          placeholder="https://"
                        />
                      </div>
                    </div>
                    <div className="sm:col-span-2">
                      <label className={labelCls}>{t('student.profile.avatarUrl')}</label>
                      <input
                        value={profile.avatarUrl}
                        onChange={(e) => updateField('avatarUrl', e.target.value)}
                        className={inputCls}
                        placeholder={t('student.profile.avatarUrlPlaceholder')}
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className={labelCls}>{t('student.profile.bio')}</label>
                      <textarea
                        value={profile.bio}
                        onChange={(e) => updateField('bio', e.target.value)}
                        rows={4}
                        className={cn(inputCls, 'resize-none')}
                        placeholder={t('student.profile.bioPlaceholder')}
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className={labelCls}>{t('student.profile.email')}</label>
                      <div className="relative">
                        <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                          value={profile.email}
                          readOnly
                          className="w-full pl-10 pr-4 py-3 bg-slate-100 border border-slate-200 rounded-xl text-sm text-slate-500 cursor-not-allowed"
                        />
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1">{t('student.profile.emailManaged')}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
                <Lock className="w-5 h-5 text-emerald-600" />
                <h2 className="font-bold text-slate-900">{t('student.profile.security')}</h2>
              </div>
              <div className="p-5 space-y-4">
                <div>
                  <label className={labelCls}>{t('student.profile.newPassword')}</label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type={showPass.next ? 'text' : 'password'}
                      value={passwords.next}
                      onChange={(e) => setPasswords((p) => ({ ...p, next: e.target.value }))}
                      className={cn(inputCls, 'pl-10 pr-11')}
                      placeholder="••••••••"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPass((p) => ({ ...p, next: !p.next }))}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      {showPass.next ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className={labelCls}>{t('student.profile.confirmPassword')}</label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type={showPass.confirm ? 'text' : 'password'}
                      value={passwords.confirm}
                      onChange={(e) => setPasswords((p) => ({ ...p, confirm: e.target.value }))}
                      className={cn(inputCls, 'pl-10 pr-11')}
                      placeholder="••••••••"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPass((p) => ({ ...p, confirm: !p.confirm }))}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      {showPass.confirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handlePasswordChange}
                  disabled={
                    changingPass ||
                    !passwords.next ||
                    passwords.next !== passwords.confirm ||
                    passwords.next.length < 8
                  }
                  className="w-full sm:w-auto px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm disabled:opacity-40 inline-flex items-center justify-center gap-2 transition-all"
                >
                  {changingPass ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  {t('student.profile.updatePassword')}
                </button>
                <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 border border-amber-100 text-xs text-amber-800">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  {t('student.profile.passwordRules')}
                </div>
              </div>
            </div>
          </div>
        </div>
      </AdminListPageShell>
    </StudentLayout>
  );
}
