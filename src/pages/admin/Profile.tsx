import React, { useEffect, useMemo, useRef, useState } from 'react';
import AdminLayout from '../../components/layout/AdminLayout';
import { cn } from '../../lib/utils';
import { toast } from 'sonner';
import LoadingButton from '../../components/ui/LoadingButton';
import { supabase } from '../../supabase';
import { authFetch } from '../../lib/apiUrl';
import { useTranslation } from 'react-i18next';
import {
  User, Mail, Phone, MapPin, Calendar, Camera,
  Save, Briefcase, Globe, Twitter, Linkedin, Github,
  Edit2, CheckCircle2
} from 'lucide-react';
import { format } from 'date-fns';

const AVATAR_GRADIENTS = [
  'from-violet-500 to-purple-600',
  'from-indigo-500 to-blue-600',
  'from-teal-500 to-cyan-600',
  'from-rose-500 to-pink-600',
  'from-amber-500 to-orange-600',
  'from-emerald-500 to-green-600',
];

export default function AdminProfile() {
  const { t } = useTranslation();
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [selectedGradient, setSelectedGradient] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activitySummary, setActivitySummary] = useState({
    coursesManaged: 0,
    students: 0,
    teachers: 0,
    certificates: 0,
  });
  const [accountInfo, setAccountInfo] = useState({
    createdAt: '',
    lastLoginAt: '',
    role: '',
    status: 'active',
  });

  const [form, setForm] = useState({
    display_name: '',
    email: '',
    phone: '',
    title: 'Platform Administrator',
    department: 'Administration',
    location: '',
    website: '',
    bio: '',
    twitter: '',
    linkedin: '',
    github: '',
  });

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const { data: authData, error: authErr } = await supabase.auth.getSession();
        if (authErr) throw authErr;
        const user = authData.session?.user;
        if (!user?.id) return;

        const [profileApiRes, analyticsRes] = await Promise.all([
          authFetch('/api/admin/profile'),
          authFetch('/api/admin/analytics').then((r) => r.json()).catch(() => null),
        ]);
        const profileApi = await profileApiRes.json();
        if (!profileApiRes.ok || !profileApi?.success) {
          throw new Error(profileApi?.error || 'Failed to load profile');
        }
        const p: any = profileApi.profile || {};
        setForm((prev) => ({
          ...prev,
          display_name: p.display_name || '',
          email: p.email || user.email || '',
          phone: p.phone || '',
          location: p.location || '',
          website: p.website || '',
          bio: p.bio || '',
          title: p.title || prev.title,
          department: p.department || prev.department,
          twitter: p.twitter || '',
          linkedin: p.linkedin || '',
          github: p.github || '',
        }));
        setAvatarUrl(p.avatar_url || null);
        setAccountInfo({
          createdAt: p.created_at || '',
          lastLoginAt: user.last_sign_in_at || '',
          role: p.role || 'admin',
          status: p.status || 'active',
        });

        if (analyticsRes?.success) {
          const ov = analyticsRes.overview || {};
          setActivitySummary({
            coursesManaged: Number(ov.totalCourses || 0),
            students: Number(ov.totalStudents || 0),
            teachers: Number(ov.totalTeachers || 0),
            certificates: Number(ov.totalCertificates || 0),
          });
        }
      } catch (e: any) {
        toast.error(e?.message || t('profile.toasts.saveFailed'));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const initials = useMemo(
    () =>
      (form.display_name || 'A')
        .split(' ')
        .filter(Boolean)
        .map((n) => n[0])
        .join('')
        .slice(0, 2)
        .toUpperCase(),
    [form.display_name],
  );

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : null;
      if (!dataUrl) {
        toast.error(t('profile.toasts.avatarFailed'));
        return;
      }
      setAvatarUrl(dataUrl);
      toast.success(t('profile.toasts.avatarUpdated'));
    };
    reader.onerror = () => toast.error(t('profile.toasts.avatarFailed'));
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const { data: authData, error: authErr } = await supabase.auth.getSession();
      if (authErr) throw authErr;
      const userId = authData.session?.user?.id;
      if (!userId) throw new Error(t('profile.toasts.notAuthenticated'));

      const res = await authFetch('/api/admin/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          display_name: form.display_name,
          email: form.email,
          phone: form.phone || null,
          location: form.location || null,
          website: form.website || null,
          bio: form.bio || null,
          avatar_url: avatarUrl || null,
          title: form.title || null,
          department: form.department || null,
          twitter: form.twitter || null,
          linkedin: form.linkedin || null,
          github: form.github || null,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json?.success) throw new Error(json?.error || t('profile.toasts.saveFailed'));
      toast.success(t('profile.toasts.saveSuccess'));
    } catch (e: any) {
      toast.error(e?.message || t('profile.toasts.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(p => ({ ...p, [field]: e.target.value }));

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{t('profile.adminProfile')}</h1>
            <p className="text-sm text-slate-500 mt-0.5">{t('profile.adminProfileDesc')}</p>
          </div>
          <LoadingButton
            onClick={handleSave}
            loading={saving}
            icon={<Save className="w-4 h-4" />}
            className="bg-indigo-600 hover:bg-indigo-700 px-4 py-2.5"
          >
            {t('common.saveChanges')}
          </LoadingButton>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left — Avatar & info card */}
          <div className="space-y-5">
            {/* Avatar card */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 flex flex-col items-center text-center">
              {/* Avatar */}
              <div className="relative mb-4">
                <div className={cn(
                  'w-24 h-24 rounded-full flex items-center justify-center text-white text-3xl font-bold shadow-lg overflow-hidden',
                  !avatarUrl && `bg-gradient-to-br ${AVATAR_GRADIENTS[selectedGradient]}`
                )}>
                  {avatarUrl
                    ? <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                    : initials
                  }
                </div>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute bottom-0 right-0 w-8 h-8 bg-indigo-600 hover:bg-indigo-700 rounded-full flex items-center justify-center shadow-md transition-colors"
                >
                  <Camera className="w-3.5 h-3.5 text-white" />
                </button>
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
              </div>

              <h2 className="text-lg font-bold text-slate-900">{form.display_name}</h2>
              <p className="text-sm text-slate-500 mt-0.5">{form.title}</p>
              <span className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 bg-violet-100 text-violet-700 rounded-full text-xs font-semibold">
                <CheckCircle2 className="w-3 h-3" />
                {t('profile.administrator')}
              </span>

              {/* Avatar gradient picker */}
              {!avatarUrl && (
                <div className="mt-4 w-full">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">{t('profile.avatarColor')}</p>
                  <div className="flex justify-center gap-2 flex-wrap">
                    {AVATAR_GRADIENTS.map((g, i) => (
                      <button
                        key={i}
                        onClick={() => setSelectedGradient(i)}
                        className={cn(
                          'w-7 h-7 rounded-full bg-gradient-to-br border-2 transition-all',
                          g,
                          i === selectedGradient ? 'border-slate-800 scale-110' : 'border-transparent hover:scale-105'
                        )}
                      />
                    ))}
                  </div>
                </div>
              )}

              {avatarUrl && (
                <button onClick={() => setAvatarUrl(null)} className="mt-3 text-xs text-rose-500 hover:underline font-medium">
                  {t('profile.removePhoto')}
                </button>
              )}

              {/* Quick info */}
              <div className="mt-5 w-full space-y-2.5 text-left border-t border-slate-100 pt-4">
                {[
                  { icon: Mail, value: form.email || t('profile.noEmail') },
                  { icon: Phone, value: form.phone || t('profile.noPhone') },
                  { icon: MapPin, value: form.location || t('profile.noLocation') },
                  {
                    icon: Calendar,
                    value: accountInfo.createdAt
                      ? `${t('profile.joined')} ${format(new Date(accountInfo.createdAt), 'MMM yyyy')}`
                      : `${t('profile.joined')} —`,
                  },
                ].map(({ icon: Icon, value }) => (
                  <div key={value} className="flex items-center gap-2.5 text-xs text-slate-500">
                    <Icon className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                    <span className="truncate">{value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Social links */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
              <h3 className="text-sm font-bold text-slate-900 mb-4">{t('profile.socialLinks')}</h3>
              <div className="space-y-3">
                <SocialField icon={Twitter} label={t('profile.twitter')} value={form.twitter} onChange={set('twitter')} placeholder="@username" color="text-sky-500" />
                <SocialField icon={Linkedin} label={t('profile.linkedIn')} value={form.linkedin} onChange={set('linkedin')} placeholder="linkedin.com/in/you" color="text-blue-600" />
                <SocialField icon={Github} label={t('profile.gitHub')} value={form.github} onChange={set('github')} placeholder="github.com/you" color="text-slate-700" />
                <SocialField icon={Globe} label={t('profile.website')} value={form.website} onChange={set('website')} placeholder="yoursite.com" color="text-indigo-500" />
              </div>
            </div>
          </div>

          {/* Right — Edit form */}
          <div className="lg:col-span-2 space-y-5">
            {/* Personal info */}
            <FormCard title={t('profile.personalInfo')} icon={User}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label={t('profile.fullName')}>
                  <input value={form.display_name} onChange={set('display_name')} className={inputCls} />
                </Field>
                <Field label={t('profile.emailAddress')}>
                  <input type="email" value={form.email} onChange={set('email')} className={inputCls} />
                </Field>
                <Field label={t('profile.phoneNumber')}>
                  <input type="tel" value={form.phone} onChange={set('phone')} className={inputCls} />
                </Field>
                <Field label={t('profile.location')}>
                  <input value={form.location} onChange={set('location')} className={inputCls} placeholder={t('profile.cityCountry')} />
                </Field>
              </div>
            </FormCard>

            {/* Professional info */}
            <FormCard title={t('profile.professionalInfo')} icon={Briefcase}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label={t('profile.jobTitle')}>
                  <input value={form.title} onChange={set('title')} className={inputCls} />
                </Field>
                <Field label={t('profile.department')}>
                  <input value={form.department} onChange={set('department')} className={inputCls} />
                </Field>
              </div>
              <div className="mt-4">
                <Field label={t('profile.bioLabel')}>
                  <textarea
                    value={form.bio}
                    onChange={set('bio')}
                    rows={3}
                    className={inputCls + ' resize-none'}
                    placeholder={t('profile.bioPlaceholder')}
                  />
                </Field>
              </div>
            </FormCard>

            {/* Activity summary */}
            <FormCard title={t('profile.activitySummary')} icon={CheckCircle2}>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                  { label: t('profile.coursesManagedLabel'), value: String(activitySummary.coursesManaged) },
                  { label: t('profile.studentsLabel'),         value: String(activitySummary.students) },
                  { label: t('profile.teachersLabel'),         value: String(activitySummary.teachers) },
                  { label: t('profile.certificatesLabel'),     value: String(activitySummary.certificates) },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-slate-50 rounded-xl p-4 text-center">
                    <p className="text-2xl font-bold text-indigo-600">{value}</p>
                    <p className="text-xs text-slate-500 mt-0.5 font-medium">{label}</p>
                  </div>
                ))}
              </div>

              <div className="mt-4 border-t border-slate-100 pt-4 space-y-2">
                {[
                  [
                    t('profile.accountCreated'),
                    accountInfo.createdAt
                      ? format(new Date(accountInfo.createdAt), 'MMMM d, yyyy')
                      : '—',
                  ],
                  [
                    t('profile.lastLogin'),
                    accountInfo.lastLoginAt
                      ? format(new Date(accountInfo.lastLoginAt), 'MMMM d, yyyy · h:mm a')
                      : '—',
                  ],
                  [t('profile.role'), accountInfo.role ? accountInfo.role : '—'],
                  [t('profile.accountStatus'), accountInfo.status || 'active'],
                ].map(([k, v]) => (
                  <div key={String(k)} className="flex justify-between items-center text-sm">
                    <span className="text-slate-400">{k}</span>
                    <span className={cn('font-semibold', String(v).toLowerCase() === 'active' ? 'text-emerald-600' : 'text-slate-700')}>{v}</span>
                  </div>
                ))}
              </div>
            </FormCard>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}

const inputCls = 'w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 bg-white text-slate-800 placeholder:text-slate-400';

function FormCard({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
      <div className="flex items-center gap-2.5 pb-4 border-b border-slate-100 mb-4">
        <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
          <Icon className="w-4 h-4" />
        </div>
        <h3 className="text-base font-bold text-slate-900">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide">{label}</label>
      {children}
    </div>
  );
}

function SocialField({ icon: Icon, label, value, onChange, placeholder, color }: {
  icon: React.ElementType; label: string; value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder: string; color: string;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <Icon className={cn('w-4 h-4 shrink-0', color)} />
      <input
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 text-slate-700 placeholder:text-slate-300"
      />
    </div>
  );
}
