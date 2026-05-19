import React, { useEffect, useState } from 'react';
import {
  X, User, Mail, Phone, Calendar, Globe, BarChart3,
  Eye, EyeOff, Copy, RotateCcw, ChevronRight, ChevronLeft,
  Check, UserPlus
} from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { supabase } from '../supabase';
import { cn } from '../lib/utils';
import { authFetch } from '../lib/apiUrl';
import LoadingButton from './ui/LoadingButton';

interface FormData {
  name: string;
  email: string;
  password: string;
  phone: string;
  dateOfBirth: string;
  gender: string;
  preferredLanguage: string;
  currentLevel: string;
  classId: string;
}

interface Props {
  onClose: () => void;
  onSuccess: () => void;
  accentColor?: 'violet' | 'emerald';
}

const LANGUAGES = ['English', 'Arabic', 'French', 'Spanish', 'German', 'Chinese', 'Turkish', 'Portuguese', 'Other'];
const LEVELS = ['Beginner', 'Elementary', 'Intermediate', 'Upper Intermediate', 'Advanced', 'Proficiency'];
const GENDERS = ['Male', 'Female', 'Non-binary', 'Prefer not to say'];

const generatePassword = () => {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$';
  return Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
};

const STEPS = ['Account', 'Personal', 'Academic'];

export default function AddStudentModal({ onClose, onSuccess, accentColor = 'violet' }: Props) {
  const { t } = useTranslation();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState<FormData>({
    name: '',
    email: '',
    password: generatePassword(),
    phone: '',
    dateOfBirth: '',
    gender: '',
    preferredLanguage: '',
    currentLevel: '',
    classId: '',
  });
  const [classes, setClasses] = useState<Array<{ id: string; name: string }>>([]);

  const accent = {
    ring: accentColor === 'violet' ? 'focus:ring-violet-500' : 'focus:ring-emerald-500',
    btn: accentColor === 'violet'
      ? 'bg-violet-600 hover:bg-violet-700 shadow-violet-200'
      : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-200',
    stepActive: accentColor === 'violet' ? 'bg-violet-600 text-white' : 'bg-emerald-600 text-white',
    stepDone: accentColor === 'violet' ? 'bg-violet-100 text-violet-600' : 'bg-emerald-100 text-emerald-600',
    stepConnector: accentColor === 'violet' ? 'bg-violet-200' : 'bg-emerald-200',
    header: accentColor === 'violet' ? 'from-violet-50 to-indigo-50' : 'from-emerald-50 to-teal-50',
  };

  const set = (key: keyof FormData, val: string) => setForm(f => ({ ...f, [key]: val }));
  const copyPassword = () => { navigator.clipboard.writeText(form.password); toast.success(t('modals.addStudent.passwordCopied')); };

  const canGoNext = () => {
    if (step === 0) return form.name.trim() !== '' && form.email.trim() !== '' && form.password.trim() !== '';
    if (step === 2 && classes.length > 0) return form.classId.trim() !== '';
    return true;
  };

  useEffect(() => {
    const loadClasses = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await authFetch('/api/teacher/classes');
      if (!res.ok) return;
      const json = await res.json().catch(() => ({}));
      if (!json?.success || !Array.isArray(json.classes)) return;
      setClasses(
        json.classes.map((c: any) => ({
          id: String(c.id),
          name: String(c.name || 'Untitled class'),
        }))
      );
    };
    void loadClasses();
  }, []);

  const handleSubmit = async () => {
    if (!form.name || !form.email || !form.password) {
      toast.error(t('modals.addStudent.nameEmailPasswordRequired'));
      return;
    }
    setSubmitting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await authFetch('/api/admin/create-student', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name.trim(),
          email: form.email.trim(),
          password: form.password,
          teacherId: session?.user.id,
          phone: form.phone || undefined,
          dateOfBirth: form.dateOfBirth || undefined,
          gender: form.gender || undefined,
          preferredLanguage: form.preferredLanguage || undefined,
          currentLevel: form.currentLevel || undefined,
          classId: form.classId || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || t('modals.addStudent.failedToCreateStudent'));
      toast.success(t('modals.addStudent.studentCreatedSuccess'));
      onSuccess();
      onClose();
    } catch (err: any) {
      toast.error(err.message || t('modals.addStudent.failedToCreateStudent'));
    } finally {
      setSubmitting(false);
    }
  };

  const inputCls = `w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 ${accent.ring} transition-all`;
  const labelCls = 'block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5';

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4" style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))', paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col" style={{ maxHeight: 'min(90dvh, 700px)' }}>

        {/* Header */}
        <div className={`px-6 pt-6 pb-5 bg-gradient-to-r ${accent.header} border-b border-slate-100`}>
          <div className="flex items-start justify-between mb-5">
            <div>
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <UserPlus className="w-5 h-5" />
                {t('modals.addStudent.title')}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">{t('modals.addStudent.subtitle')}</p>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-white/60 rounded-xl transition-all -mt-1 -mr-2">
              <X className="w-5 h-5 text-slate-400" />
            </button>
          </div>

          {/* Step indicator */}
          <div className="flex items-center gap-0">
            {STEPS.map((label, i) => (
              <React.Fragment key={label}>
                <div className="flex flex-col items-center gap-1">
                  <div className={cn(
                    'w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all',
                    i < step ? accent.stepDone : i === step ? accent.stepActive : 'bg-slate-100 text-slate-400'
                  )}>
                    {i < step ? <Check className="w-4 h-4" /> : i + 1}
                  </div>
                  <span className={cn('text-[10px] font-semibold', i === step ? 'text-slate-700' : 'text-slate-400')}>
                    {label}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <div className={cn('flex-1 h-0.5 mb-4 mx-1', i < step ? accent.stepConnector : 'bg-slate-100')} />
                )}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4 min-h-[220px] overflow-y-auto flex-1">

          {/* Step 0 — Account */}
          {step === 0 && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className={labelCls}>{t('modals.addStudent.fullName')} <span className="text-red-400 normal-case font-normal">*</span></label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="text" required
                      value={form.name}
                      onChange={e => set('name', e.target.value)}
                      placeholder={t('modals.addStudent.placeholder')}
                      className={`${inputCls} pl-9`}
                    />
                  </div>
                </div>
                <div className="col-span-2">
                  <label className={labelCls}>{t('modals.addStudent.emailAddress')} <span className="text-red-400 normal-case font-normal">*</span></label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="email" required
                      value={form.email}
                      onChange={e => set('email', e.target.value)}
                      placeholder={t('modals.addStudent.emailPlaceholder')}
                      className={`${inputCls} pl-9`}
                    />
                  </div>
                </div>
                <div className="col-span-2">
                  <label className={labelCls}>{t('modals.addStudent.temporaryPassword')} <span className="text-red-400 normal-case font-normal">*</span></label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        readOnly
                        value={form.password}
                        className="w-full pr-9 pl-4 py-2.5 bg-slate-100 border border-slate-200 rounded-xl text-sm font-mono text-slate-600 focus:outline-none"
                      />
                      <button type="button" onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                        {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                    <button type="button" onClick={copyPassword} title={t('modals.addStudent.passwordCopied')}
                      className="p-2.5 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-xl transition-all">
                      <Copy className="w-4 h-4 text-slate-500" />
                    </button>
                    <button type="button" onClick={() => set('password', generatePassword())} title={t('modals.addStudent.regenerate')}
                      className="p-2.5 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-xl transition-all">
                      <RotateCcw className="w-4 h-4 text-slate-500" />
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1.5">{t('modals.addStudent.sharePassword')}</p>
                </div>
              </div>
            </>
          )}

          {/* Step 1 — Personal */}
          {step === 1 && (
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className={labelCls}>{t('modals.addStudent.phoneNumber')} <span className="text-slate-300 normal-case font-normal">{t('modals.addStudent.optional')}</span></label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={e => set('phone', e.target.value)}
                    placeholder={t('modals.addStudent.phonePlaceholder')}
                    className={`${inputCls} pl-9`}
                  />
                </div>
              </div>
              <div>
                <label className={labelCls}>{t('modals.addStudent.dateOfBirth')} <span className="text-slate-300 normal-case font-normal">{t('modals.addStudent.optional')}</span></label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="date"
                    value={form.dateOfBirth}
                    onChange={e => set('dateOfBirth', e.target.value)}
                    className={`${inputCls} pl-9`}
                  />
                </div>
              </div>
              <div>
                <label className={labelCls}>{t('modals.addStudent.gender')} <span className="text-slate-300 normal-case font-normal">{t('modals.addStudent.optional')}</span></label>
                <select
                  value={form.gender}
                  onChange={e => set('gender', e.target.value)}
                  className={inputCls}
                >
                  <option value="">{t('modals.addStudent.selectGender')}</option>
                  {GENDERS.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
            </div>
          )}

          {/* Step 2 — Academic */}
          {step === 2 && (
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className={labelCls}>{t('modals.addStudent.preferredLanguage')} <span className="text-slate-300 normal-case font-normal">{t('modals.addStudent.optional')}</span></label>
                <div className="relative">
                  <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <select
                    value={form.preferredLanguage}
                    onChange={e => set('preferredLanguage', e.target.value)}
                    className={`${inputCls} pl-9`}
                  >
                    <option value="">{t('modals.addStudent.selectLanguage')}</option>
                    {LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
                  </select>
                </div>
              </div>
              <div className="col-span-2">
                <label className={labelCls}>{t('modals.addStudent.currentLevel')} <span className="text-slate-300 normal-case font-normal">{t('modals.addStudent.optional')}</span></label>
                <div className="relative">
                  <BarChart3 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <select
                    value={form.currentLevel}
                    onChange={e => set('currentLevel', e.target.value)}
                    className={`${inputCls} pl-9`}
                  >
                    <option value="">{t('modals.addStudent.selectLevel')}</option>
                    {LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
                  </select>
                </div>
              </div>
              <div className="col-span-2">
                <label className={labelCls}>
                  {t('modals.addStudent.class')} {classes.length > 0 ? <span className="text-red-400 normal-case font-normal">*</span> : <span className="text-slate-300 normal-case font-normal">{t('modals.addStudent.optional')}</span>}
                </label>
                <select
                  value={form.classId}
                  onChange={e => set('classId', e.target.value)}
                  className={inputCls}
                >
                  <option value="">{classes.length > 0 ? t('modals.addStudent.selectClass') : t('modals.addStudent.noClassAvailable')}</option>
                  {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              {/* Summary preview */}
              <div className="col-span-2 mt-2 bg-slate-50 rounded-xl p-4 border border-slate-100">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">{t('modals.addStudent.summary')}</p>
                <div className="space-y-2 text-sm">
                  <div className="flex gap-2">
                    <span className="text-slate-400 w-28 shrink-0">{t('modals.addStudent.nameLabel')}</span>
                    <span className="font-semibold text-slate-800">{form.name || '—'}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-slate-400 w-28 shrink-0">{t('modals.addStudent.emailLabel')}</span>
                    <span className="font-semibold text-slate-800">{form.email || '—'}</span>
                  </div>
                  {form.phone && <div className="flex gap-2"><span className="text-slate-400 w-28 shrink-0">{t('modals.addStudent.phoneLabel')}</span><span className="font-semibold text-slate-800">{form.phone}</span></div>}
                  {form.gender && <div className="flex gap-2"><span className="text-slate-400 w-28 shrink-0">{t('modals.addStudent.genderLabel')}</span><span className="font-semibold text-slate-800">{form.gender}</span></div>}
                  {form.preferredLanguage && <div className="flex gap-2"><span className="text-slate-400 w-28 shrink-0">{t('modals.addStudent.languageLabel')}</span><span className="font-semibold text-slate-800">{form.preferredLanguage}</span></div>}
                  {form.currentLevel && <div className="flex gap-2"><span className="text-slate-400 w-28 shrink-0">{t('modals.addStudent.levelLabel')}</span><span className="font-semibold text-slate-800">{form.currentLevel}</span></div>}
                  {form.classId && <div className="flex gap-2"><span className="text-slate-400 w-28 shrink-0">{t('modals.addStudent.classLabel')}</span><span className="font-semibold text-slate-800">{classes.find(c => c.id === form.classId)?.name || form.classId}</span></div>}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 pb-6 flex gap-3 shrink-0 border-t border-slate-100 pt-4">
          {step > 0 && (
            <button
              type="button"
              onClick={() => setStep(s => s - 1)}
              className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 text-slate-600 rounded-xl font-semibold text-sm hover:bg-slate-200 transition-all"
            >
              <ChevronLeft className="w-4 h-4" />
              {t('common.back')}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 bg-slate-100 text-slate-600 rounded-xl font-semibold text-sm hover:bg-slate-200 transition-all"
          >
            {t('common.cancel')}
          </button>
          <div className="flex-1" />
          {step < STEPS.length - 1 ? (
            <button
              type="button"
              onClick={() => { if (canGoNext()) setStep(s => s + 1); else toast.error('Please fill in the required fields.'); }}
              className={`flex items-center gap-2 px-5 py-2.5 ${accent.btn} text-white rounded-xl font-semibold text-sm transition-all shadow-lg`}
            >
              {t('common.next')}
              <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <LoadingButton
              onClick={handleSubmit}
              loading={submitting}
              className={`px-5 py-2.5 ${accent.btn} shadow-lg`}
              variant="primary"
              size="sm"
            >
              {t('modals.addStudent.createStudent')}
            </LoadingButton>
          )}
        </div>
      </div>
    </div>
  );
}
