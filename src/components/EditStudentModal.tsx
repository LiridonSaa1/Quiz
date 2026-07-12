import React, { useState } from 'react';
import { X, User, Mail, UserCheck, UserX, Clock, Pencil, Loader2 } from 'lucide-react';
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
  /** 'admin' endpoint: /api/admin/students/:id  |  'teacher' endpoint: /api/teacher/students/:id */
  endpoint: 'admin' | 'teacher';
  /** Optional teacher list for admin to reassign */
  teachers?: Array<{ id: string; name: string }>;
  onClose: () => void;
  onSuccess: (updated: Partial<StudentData>) => void;
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

  const inputCls = 'w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400/50 transition-all';
  const labelCls = 'block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5';

  return (
    <div
      className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4"
      style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))', paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
    >
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col" style={{ maxHeight: 'min(90dvh, 640px)' }}>

        {/* Header */}
        <div className="px-6 pt-6 pb-5 bg-gradient-to-r from-indigo-50 to-violet-50 border-b border-slate-100">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Pencil className="w-5 h-5 text-indigo-500" />
                Edit Student
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">Update student account information</p>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-white/60 rounded-xl transition-all -mt-1 -mr-2">
              <X className="w-5 h-5 text-slate-400" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4 overflow-y-auto flex-1">

          {/* Name */}
          <div>
            <label className={labelCls}>Full Name <span className="text-red-400 normal-case font-normal">*</span></label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={form.displayName}
                onChange={e => set('displayName', e.target.value)}
                placeholder="Student's full name"
                className={`${inputCls} pl-9`}
              />
            </div>
          </div>

          {/* Email */}
          <div>
            <label className={labelCls}>Email <span className="text-red-400 normal-case font-normal">*</span></label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="email"
                value={form.email}
                onChange={e => set('email', e.target.value)}
                placeholder="student@example.com"
                className={`${inputCls} pl-9`}
              />
            </div>
          </div>

          {/* Status */}
          <div>
            <label className={labelCls}>Status</label>
            <div className="flex gap-3">
              {(['active', 'inactive'] as const).map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => set('status', s)}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-semibold transition-all',
                    form.status === s
                      ? s === 'active'
                        ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                        : 'bg-slate-100 border-slate-300 text-slate-600'
                      : 'border-slate-200 text-slate-400 hover:bg-slate-50'
                  )}
                >
                  {s === 'active'
                    ? <><UserCheck className="w-4 h-4" /> Active</>
                    : <><UserX className="w-4 h-4" /> Inactive</>}
                </button>
              ))}
            </div>
          </div>

          {/* Trial days */}
          <div>
            <label className={labelCls}>
              Free Trial Days <span className="text-slate-300 normal-case font-normal">(optional — leave blank to keep current)</span>
            </label>
            <div className="relative">
              <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="number"
                min={0}
                value={form.trialDays}
                onChange={e => set('trialDays', e.target.value)}
                placeholder="e.g. 7  (0 = clear trial)"
                className={`${inputCls} pl-9`}
              />
            </div>
            <p className="mt-1.5 text-[11px] text-slate-400">
              Set a new trial period, or enter 0 to remove the existing one.
            </p>
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

        {/* Footer */}
        <div className="px-6 pb-6 pt-4 flex gap-3 shrink-0 border-t border-slate-100">
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
            className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold text-sm transition-all shadow-lg shadow-indigo-200 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
