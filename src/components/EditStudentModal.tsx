import React, { useState } from 'react';
import { X, User, Mail, UserCheck, UserX, Clock, Pencil, Loader2, GraduationCap } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { cn } from '../lib/utils';
import { authFetch } from '../lib/apiUrl';

interface StudentData {
  uid: string;
  displayName: string;
  email: string;
  status: string;
  teacherId?: string;
}

interface Props {
  student: StudentData;
  endpoint: 'admin' | 'teacher';
  teachers?: Array<{ id: string; name: string }>;
  onClose: () => void;
  onSuccess: (updated: Partial<StudentData>) => void;
}

function getInitials(name: string, email: string) {
  const src = name?.trim() || email?.trim() || '?';
  return src.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

const AVATAR_COLORS = [
  ['from-violet-500 to-indigo-600', 'bg-indigo-50 border-indigo-200'],
  ['from-emerald-500 to-teal-600', 'bg-emerald-50 border-emerald-200'],
  ['from-rose-500 to-pink-600', 'bg-rose-50 border-rose-200'],
  ['from-amber-500 to-orange-600', 'bg-amber-50 border-amber-200'],
  ['from-sky-500 to-blue-600', 'bg-sky-50 border-sky-200'],
];

function pickColor(uid: string) {
  const idx = (uid || '').charCodeAt(0) % AVATAR_COLORS.length;
  return AVATAR_COLORS[idx];
}

export default function EditStudentModal({ student, endpoint, teachers, onClose, onSuccess }: Props) {
  const { t } = useTranslation();
  const [form, setForm] = useState({
    displayName: student.displayName || '',
    email: student.email || '',
    status: student.status || 'active',
    trialDays: '',
    teacherId: student.teacherId || '',
  });
  const [saving, setSaving] = useState(false);

  const set = (k: keyof typeof form, v: string) => setForm(f => ({ ...f, [k]: v }));
  const [avatarGrad, avatarBg] = pickColor(student.uid);
  const initials = getInitials(form.displayName, form.email);

  const handleSave = async () => {
    if (!form.displayName.trim()) { toast.error('Name is required.'); return; }
    if (!form.email.trim()) { toast.error('Email is required.'); return; }
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        display_name: form.displayName.trim(),
        email: form.email.trim(),
        status: form.status,
      };
      if (form.trialDays !== '') body.trialDays = Number(form.trialDays);
      if (endpoint === 'admin' && teachers && form.teacherId) body.teacher_id = form.teacherId;

      const url = endpoint === 'admin'
        ? `/api/admin/students/${encodeURIComponent(student.uid)}`
        : `/api/teacher/students/${encodeURIComponent(student.uid)}`;

      const res = await authFetch(url, { method: 'PATCH', body: JSON.stringify(body) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.success) throw new Error(json?.error || t('errors.saveFailed'));

      toast.success(t('dashboard.studentUpdated'));
      onSuccess({
        displayName: form.displayName.trim(),
        email: form.email.trim(),
        status: form.status,
        teacherId: form.teacherId || student.teacherId,
      });
      onClose();
    } catch (e: any) {
      toast.error(e?.message || t('errors.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const inputCls = 'w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400/60 focus:border-indigo-300 transition-all placeholder:text-slate-300';
  const labelCls = 'block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5';

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))', paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
    >
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-[3px]" onClick={onClose} />

      <div
        className="relative bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden flex flex-col"
        style={{ maxHeight: 'min(92dvh, 660px)' }}
      >
        {/* ── Gradient Header ── */}
        <div className="relative overflow-hidden px-6 pt-6 pb-5"
          style={{ background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)' }}>
          <div
            className="absolute inset-0 opacity-10"
            style={{ backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)', backgroundSize: '20px 20px' }}
          />
          <div className="relative flex items-start justify-between">
            <div className="flex items-center gap-4">
              {/* Avatar */}
              <div className={cn(
                'w-14 h-14 rounded-2xl bg-gradient-to-br flex items-center justify-center shadow-lg text-white text-lg font-extrabold shrink-0',
                avatarGrad
              )}>
                {initials || <GraduationCap className="w-7 h-7" />}
              </div>
              <div>
                <p className="text-xs font-bold text-indigo-200 uppercase tracking-widest mb-0.5">Edit Student</p>
                <h2 className="text-lg font-extrabold text-white leading-tight">
                  {student.displayName || student.email || 'Student'}
                </h2>
                <p className="text-xs text-indigo-300 mt-0.5 truncate max-w-[200px]">{student.email}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/20 rounded-xl transition-all -mt-1 -mr-1 text-white/70 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* ── Body ── */}
        <div className="p-6 space-y-5 overflow-y-auto flex-1 bg-slate-50/40">

          {/* Name + Email — 2 col */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Full Name <span className="text-rose-400 normal-case font-normal">*</span></label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                <input
                  type="text"
                  value={form.displayName}
                  onChange={e => set('displayName', e.target.value)}
                  placeholder="Full name"
                  className={`${inputCls} pl-9`}
                />
              </div>
            </div>
            <div>
              <label className={labelCls}>Email <span className="text-rose-400 normal-case font-normal">*</span></label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                <input
                  type="email"
                  value={form.email}
                  onChange={e => set('email', e.target.value)}
                  placeholder="email@domain.com"
                  className={`${inputCls} pl-9`}
                />
              </div>
            </div>
          </div>

          {/* Status pills */}
          <div>
            <label className={labelCls}>Account Status</label>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => set('status', 'active')}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl border-2 text-sm font-bold transition-all',
                  form.status === 'active'
                    ? 'bg-emerald-50 border-emerald-400 text-emerald-700 shadow-sm shadow-emerald-100'
                    : 'border-slate-200 text-slate-400 hover:bg-slate-50 bg-white'
                )}
              >
                <div className={cn('w-2 h-2 rounded-full', form.status === 'active' ? 'bg-emerald-500' : 'bg-slate-300')} />
                <UserCheck className="w-4 h-4" />
                Active
              </button>
              <button
                type="button"
                onClick={() => set('status', 'inactive')}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl border-2 text-sm font-bold transition-all',
                  form.status === 'inactive'
                    ? 'bg-slate-100 border-slate-400 text-slate-700 shadow-sm'
                    : 'border-slate-200 text-slate-400 hover:bg-slate-50 bg-white'
                )}
              >
                <div className={cn('w-2 h-2 rounded-full', form.status === 'inactive' ? 'bg-slate-500' : 'bg-slate-300')} />
                <UserX className="w-4 h-4" />
                Inactive
              </button>
            </div>
          </div>

          {/* Trial days */}
          <div>
            <label className={labelCls}>
              Free Trial Days
              <span className="ml-1.5 normal-case font-normal text-slate-300">(leave blank = keep current · 0 = remove)</span>
            </label>
            <div className="relative">
              <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
              <input
                type="number"
                min={0}
                value={form.trialDays}
                onChange={e => set('trialDays', e.target.value)}
                placeholder="e.g. 7"
                className={`${inputCls} pl-9`}
              />
            </div>
          </div>

          {/* Teacher selector — admin only */}
          {endpoint === 'admin' && teachers && teachers.length > 0 && (
            <div>
              <label className={labelCls}>Assigned Teacher</label>
              <select
                value={form.teacherId}
                onChange={e => set('teacherId', e.target.value)}
                className={inputCls}
              >
                <option value="">— No change —</option>
                {teachers.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="px-6 pb-6 pt-4 flex items-center gap-3 shrink-0 bg-white border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 bg-slate-100 text-slate-600 rounded-xl font-semibold text-sm hover:bg-slate-200 transition-all"
          >
            {t('common.cancel')}
          </button>
          <div className="flex-1" />
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold text-sm text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)', boxShadow: '0 4px 16px rgba(99,102,241,0.35)' }}
          >
            {saving
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
              : <><Pencil className="w-4 h-4" /> Save Changes</>}
          </button>
        </div>
      </div>
    </div>
  );
}
