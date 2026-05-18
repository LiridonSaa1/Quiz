import React, { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../supabase';
import TeacherLayout from '../../components/layout/TeacherLayout';
import LoadingButton from '../../components/ui/LoadingButton';
import { motion } from 'motion/react';
import { AdminListPageShell, ADMIN_LIST_ITEM_CARD } from '../../components/admin/AdminListPageShell';
import {
  User, Mail, Phone, Globe, BookOpen, Building2,
  Camera, Save, Lock, CheckCircle2, Loader2,
  Eye, EyeOff, AlertTriangle, GraduationCap,
  Users, FileText, Award, Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../../lib/utils';
import { authFetch, readApiError } from '../../lib/apiUrl';
import { useTeacherPermissions } from '../../lib/teacherPermissions';

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

const emptyProfile: ProfileData = {
  displayName: '',
  bio: '',
  subject: '',
  institution: '',
  phone: '',
  website: '',
  avatarUrl: '',
  email: '',
  createdAt: '',
};

export default function TeacherProfile() {
  const { t } = useTranslation();
  const [profile, setProfile] = useState<ProfileData>(emptyProfile);
  const [stats, setStats] = useState<Stats>({ students: 0, courses: 0, quizzes: 0, passRate: 0 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const [passwords, setPasswords] = useState({ next: '', confirm: '' });
  const [showPass, setShowPass] = useState({ next: false, confirm: false });
  const [changingPass, setChangingPass] = useState(false);
  const { can } = useTeacherPermissions();

  const updateField = (key: keyof ProfileData, val: string) => {
    if (!can('actions.teacher.profile.edit')) return;
    setProfile((p) => ({ ...p, [key]: val }));
    setDirty(true);
  };

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) return;
      const uid = session.user.id;
      const res = await authFetch(`/api/teacher/profile?userId=${encodeURIComponent(uid)}`);
      if (!res.ok) throw new Error(await readApiError(res));
      const json = await res.json();

      const dataProfile = (json?.profile || {}) as Partial<ProfileData>;
      setProfile({
        displayName: String(dataProfile.displayName || ''),
        bio: String(dataProfile.bio || ''),
        subject: String(dataProfile.subject || ''),
        institution: String(dataProfile.institution || ''),
        phone: String(dataProfile.phone || ''),
        website: String(dataProfile.website || ''),
        avatarUrl: String(dataProfile.avatarUrl || ''),
        email: session.user.email || String(dataProfile.email || ''),
        createdAt: String(dataProfile.createdAt || session.user.created_at || ''),
      });

      const dataStats = (json?.stats || {}) as Partial<Stats>;
      setStats({
        students: Number(dataStats.students || 0),
        courses: Number(dataStats.courses || 0),
        quizzes: Number(dataStats.quizzes || 0),
        passRate: Number(dataStats.passRate || 0),
      });
    } catch (e) {
      console.error(e);
      toast.error(t('teacher.profile.failedLoadProfile'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const handleSave = async () => {
    if (!can('actions.teacher.profile.edit')) {
      toast.error(t('teacher.profile.noPermissionEdit'));
      return;
    }
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user?.id) {
      toast.error(t('teacher.profile.notSignedIn'));
      return;
    }
    if (!profile.displayName.trim()) {
      toast.error(t('teacher.profile.displayNameRequired'));
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        display_name: profile.displayName.trim(),
        bio: profile.bio.trim() || null,
        subject: profile.subject.trim() || null,
        institution: profile.institution.trim() || null,
        phone: profile.phone.trim() || null,
        website: profile.website.trim() || null,
        avatar_url: profile.avatarUrl.trim() || null,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase.from('profiles').update(payload).eq('id', session.user.id);
      if (error) throw error;
      toast.success(t('teacher.profile.profileSaved'));
      setDirty(false);
      await loadAll();
    } catch (e: unknown) {
      const msg = (e as Error)?.message || '';
      const missingCol = /column|does not exist|schema cache/i.test(msg);
      const { data: { session: s2 } } = await supabase.auth.getSession();
      if (missingCol && s2?.user?.id) {
        const { error: e2 } = await supabase
          .from('profiles')
          .update({
            display_name: profile.displayName.trim(),
            avatar_url: profile.avatarUrl.trim() || null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', s2.user.id);
        if (e2) toast.error(e2.message);
        else {
          toast.success(t('teacher.profile.savedPartial'));
          setDirty(false);
          await loadAll();
        }
      } else {
        toast.error(msg || t('teacher.profile.failedSaveProfile'));
      }
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordChange = async () => {
    if (!can('actions.teacher.profile.edit')) {
      toast.error(t('teacher.profile.noPermissionChangePassword'));
      return;
    }
    if (passwords.next !== passwords.confirm) {
      toast.error(t('teacher.profile.passwordsDoNotMatch'));
      return;
    }
    if (passwords.next.length < 8) {
      toast.error(t('teacher.profile.minimumCharacters'));
      return;
    }
    setChangingPass(true);
    const { error } = await supabase.auth.updateUser({ password: passwords.next });
    if (error) toast.error(error.message);
    else {
      toast.success(t('teacher.profile.passwordUpdated'));
      setPasswords({ next: '', confirm: '' });
    }
    setChangingPass(false);
  };

  const initials = profile.displayName
    ? profile.displayName.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()
    : 'T';

  const memberYear = profile.createdAt ? new Date(profile.createdAt).getFullYear() : new Date().getFullYear();

  const statItems = [
    { label: t('teacher.profile.students'), value: stats.students, gradient: 'from-indigo-500 to-violet-600', shadow: 'shadow-indigo-500/25', icon: Users },
    { label: t('teacher.profile.courses'), value: stats.courses, gradient: 'from-blue-500 to-cyan-600', shadow: 'shadow-blue-500/25', icon: BookOpen },
    { label: t('teacher.profile.quizzes'), value: stats.quizzes, gradient: 'from-violet-500 to-purple-600', shadow: 'shadow-violet-500/25', icon: FileText },
    { label: t('teacher.profile.passRate'), value: stats.passRate, gradient: 'from-emerald-500 to-teal-600', shadow: 'shadow-emerald-500/25', icon: Award },
  ];

  const inputCls =
    'w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all disabled:opacity-50';
  const labelCls = 'block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5';

  return (
    <TeacherLayout>
      <AdminListPageShell
        breadcrumbPortalLabel={t('nav.teacherPortal')}
        breadcrumbLabel={t('teacher.profile.title')}
        title={t('teacher.profile.title')}
        description={t('teacher.profile.description')}
        statsGridClassName="grid grid-cols-2 sm:grid-cols-4 gap-4"
        stats={statItems}
        action={
          <LoadingButton
            onClick={handleSave}
            loading={saving}
            disabled={saving || loading || !dirty}
            icon={<Save className="w-4 h-4" />}
            className="px-6 py-3 rounded-2xl font-bold shrink-0"
            style={{
              background: dirty
                ? 'linear-gradient(135deg, #818cf8 0%, #a78bfa 100%)'
                : 'linear-gradient(135deg, #94a3b8 0%, #64748b 100%)',
              boxShadow: dirty ? '0 8px 32px rgba(139,92,246,0.45), 0 2px 8px rgba(0,0,0,0.15)' : undefined,
            }}
          >
            {t('teacher.profile.saveChanges')}
          </LoadingButton>
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
                      className="w-24 h-24 rounded-2xl object-cover ring-4 ring-indigo-100 shadow-lg"
                    />
                  ) : (
                    <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-2xl font-bold text-white shadow-lg">
                      {loading ? <Loader2 className="w-8 h-8 animate-spin opacity-70" /> : initials}
                    </div>
                  )}
                  <span className="absolute -bottom-1 -right-1 w-9 h-9 bg-white rounded-xl shadow border border-slate-100 flex items-center justify-center">
                    <Camera className="w-4 h-4 text-slate-400" />
                  </span>
                </div>
                <p className="mt-4 font-bold text-slate-900">{profile.displayName || t('teacher.profile.yourName')}</p>
                {profile.subject ? <p className="text-sm text-indigo-600 font-medium">{profile.subject}</p> : null}
                <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-slate-500 bg-slate-100 px-2 py-1 rounded-full">
                  <GraduationCap className="w-3.5 h-3.5" /> {t('teacher.profile.teacherSince', { year: memberYear })}
                </span>
              </div>
            </div>
          </div>

          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-indigo-500" />
                <h2 className="font-bold text-slate-900">{t('teacher.profile.profileDetails')}</h2>
              </div>
              <div className="p-5 space-y-4">
                {loading ? (
                  <div className="space-y-3">
                    {Array(6).fill(0).map((_, i) => (
                      <div key={i} className="h-11 bg-slate-100 rounded-xl animate-pulse" />
                    ))}
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="sm:col-span-2">
                        <label className={labelCls}>{t('teacher.profile.displayName')} *</label>
                        <div className="relative">
                          <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                          <input
                            value={profile.displayName}
                            onChange={(e) => updateField('displayName', e.target.value)}
                            className={cn(inputCls, 'pl-10')}
                            placeholder={t('teacher.profile.yourFullName')}
                          />
                        </div>
                      </div>
                      <div>
                        <label className={labelCls}>{t('teacher.profile.subject')}</label>
                        <input
                          value={profile.subject}
                          onChange={(e) => updateField('subject', e.target.value)}
                          className={inputCls}
                          placeholder={t('teacher.profile.subjectPlaceholder')}
                        />
                      </div>
                      <div>
                        <label className={labelCls}>{t('teacher.profile.institution')}</label>
                        <div className="relative">
                          <Building2 className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                          <input
                            value={profile.institution}
                            onChange={(e) => updateField('institution', e.target.value)}
                            className={cn(inputCls, 'pl-10')}
                            placeholder={t('teacher.profile.institutionPlaceholder')}
                          />
                        </div>
                      </div>
                      <div>
                        <label className={labelCls}>{t('teacher.profile.phone')}</label>
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
                        <label className={labelCls}>{t('teacher.profile.website')}</label>
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
                        <label className={labelCls}>{t('teacher.profile.avatarImageURL')}</label>
                        <input
                          value={profile.avatarUrl}
                          onChange={(e) => updateField('avatarUrl', e.target.value)}
                          className={inputCls}
                          placeholder={t('teacher.profile.avatarImageURLPlaceholder')}
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className={labelCls}>{t('teacher.profile.bio')}</label>
                        <textarea
                          value={profile.bio}
                          onChange={(e) => updateField('bio', e.target.value)}
                          rows={4}
                          className={cn(inputCls, 'resize-none')}
                          placeholder="Tell students about your teaching and background."
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className={labelCls}>Email</label>
                        <div className="relative">
                          <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                          <input
                            value={profile.email}
                            readOnly
                            className="w-full pl-10 pr-4 py-3 bg-slate-100 border border-slate-200 rounded-xl text-sm text-slate-500 cursor-not-allowed"
                          />
                        </div>
                        <p className="text-[11px] text-slate-400 mt-1">Email is managed by your login provider.</p>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
                <Lock className="w-5 h-5 text-emerald-600" />
                <h2 className="font-bold text-slate-900">Security</h2>
              </div>
              <div className="p-5 space-y-4">
                <div>
                  <label className={labelCls}>New password</label>
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
                  <label className={labelCls}>Confirm password</label>
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
                  className="w-full sm:w-auto px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm disabled:opacity-40 inline-flex items-center justify-center gap-2"
                >
                  {changingPass ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  Update password
                </button>
                <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 border border-amber-100 text-xs text-amber-800">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  Use a strong password you don’t reuse elsewhere.
                </div>
              </div>
            </div>
          </div>
        </div>
      </AdminListPageShell>
    </TeacherLayout>
  );
}
