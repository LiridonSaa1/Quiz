import React, { useState, useRef } from 'react';
import AdminLayout from '../../components/layout/AdminLayout';
import { cn } from '../../lib/utils';
import { toast } from 'sonner';
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
  const [saving, setSaving] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [selectedGradient, setSelectedGradient] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    display_name: 'Liridon Salihi',
    email: 'liridon.salihi123@gmail.com',
    phone: '+1 (555) 010-2030',
    title: 'Platform Administrator',
    department: 'Administration',
    location: 'New York, NY',
    website: 'www.quizmaster.edu',
    bio: 'Platform administrator overseeing all aspects of the QuizMaster Academy learning management system.',
    twitter: '@liridon_s',
    linkedin: 'linkedin.com/in/liridons',
    github: 'github.com/liridons',
  });

  const initials = form.display_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarUrl(URL.createObjectURL(file));
    toast.success('Avatar updated.');
  };

  const handleSave = async () => {
    setSaving(true);
    await new Promise(r => setTimeout(r, 900));
    setSaving(false);
    toast.success('Profile saved successfully.');
  };

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(p => ({ ...p, [field]: e.target.value }));

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Profile</h1>
            <p className="text-sm text-slate-500 mt-0.5">Manage your personal information and preferences</p>
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving…' : 'Save Profile'}
          </button>
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
                Administrator
              </span>

              {/* Avatar gradient picker */}
              {!avatarUrl && (
                <div className="mt-4 w-full">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Avatar Color</p>
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
                  Remove photo
                </button>
              )}

              {/* Quick info */}
              <div className="mt-5 w-full space-y-2.5 text-left border-t border-slate-100 pt-4">
                {[
                  { icon: Mail, value: form.email },
                  { icon: Phone, value: form.phone },
                  { icon: MapPin, value: form.location },
                  { icon: Calendar, value: `Joined ${format(new Date('2024-01-15'), 'MMM yyyy')}` },
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
              <h3 className="text-sm font-bold text-slate-900 mb-4">Social Links</h3>
              <div className="space-y-3">
                <SocialField icon={Twitter} label="Twitter" value={form.twitter} onChange={set('twitter')} placeholder="@username" color="text-sky-500" />
                <SocialField icon={Linkedin} label="LinkedIn" value={form.linkedin} onChange={set('linkedin')} placeholder="linkedin.com/in/you" color="text-blue-600" />
                <SocialField icon={Github} label="GitHub" value={form.github} onChange={set('github')} placeholder="github.com/you" color="text-slate-700" />
                <SocialField icon={Globe} label="Website" value={form.website} onChange={set('website')} placeholder="yoursite.com" color="text-indigo-500" />
              </div>
            </div>
          </div>

          {/* Right — Edit form */}
          <div className="lg:col-span-2 space-y-5">
            {/* Personal info */}
            <FormCard title="Personal Information" icon={User}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Full Name">
                  <input value={form.display_name} onChange={set('display_name')} className={inputCls} />
                </Field>
                <Field label="Email Address">
                  <input type="email" value={form.email} onChange={set('email')} className={inputCls} />
                </Field>
                <Field label="Phone Number">
                  <input type="tel" value={form.phone} onChange={set('phone')} className={inputCls} />
                </Field>
                <Field label="Location">
                  <input value={form.location} onChange={set('location')} className={inputCls} placeholder="City, Country" />
                </Field>
              </div>
            </FormCard>

            {/* Professional info */}
            <FormCard title="Professional Information" icon={Briefcase}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Job Title">
                  <input value={form.title} onChange={set('title')} className={inputCls} />
                </Field>
                <Field label="Department">
                  <input value={form.department} onChange={set('department')} className={inputCls} />
                </Field>
              </div>
              <div className="mt-4">
                <Field label="Bio">
                  <textarea
                    value={form.bio}
                    onChange={set('bio')}
                    rows={3}
                    className={inputCls + ' resize-none'}
                    placeholder="Write a short bio about yourself…"
                  />
                </Field>
              </div>
            </FormCard>

            {/* Activity summary */}
            <FormCard title="Activity Summary" icon={CheckCircle2}>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                  { label: 'Courses Managed', value: '42' },
                  { label: 'Students',         value: '318' },
                  { label: 'Teachers',         value: '14' },
                  { label: 'Certificates',     value: '127' },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-slate-50 rounded-xl p-4 text-center">
                    <p className="text-2xl font-bold text-indigo-600">{value}</p>
                    <p className="text-xs text-slate-500 mt-0.5 font-medium">{label}</p>
                  </div>
                ))}
              </div>

              <div className="mt-4 border-t border-slate-100 pt-4 space-y-2">
                {[
                  ['Account Created',  'January 15, 2024'],
                  ['Last Login',       format(new Date(), 'MMMM d, yyyy · h:mm a')],
                  ['Role',             'Super Administrator'],
                  ['Account Status',   'Active'],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between items-center text-sm">
                    <span className="text-slate-400">{k}</span>
                    <span className={cn('font-semibold', v === 'Active' ? 'text-emerald-600' : 'text-slate-700')}>{v}</span>
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
