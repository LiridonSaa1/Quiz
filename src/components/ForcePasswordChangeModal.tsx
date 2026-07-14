import React, { useState } from 'react';
import { supabase } from '../supabase';
import { authFetch } from '../lib/apiUrl';
import { toast } from 'sonner';
import { Lock, Eye, EyeOff, ShieldCheck, Loader2, CheckCircle2 } from 'lucide-react';

interface Props {
  onDone: () => void;
}

function strengthScore(pw: string): { score: number; label: string; color: string } {
  let s = 0;
  if (pw.length >= 8)  s++;
  if (pw.length >= 12) s++;
  if (/[A-Z]/.test(pw)) s++;
  if (/[0-9]/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  if (s <= 1) return { score: s, label: 'Shumë e dobët', color: 'bg-red-500' };
  if (s <= 2) return { score: s, label: 'E dobët',      color: 'bg-orange-400' };
  if (s <= 3) return { score: s, label: 'Mesatare',     color: 'bg-yellow-400' };
  if (s <= 4) return { score: s, label: 'E mirë',       color: 'bg-emerald-400' };
  return               { score: s, label: 'Shumë e fortë', color: 'bg-emerald-500' };
}

export default function ForcePasswordChangeModal({ onDone }: Props) {
  const [newPw,    setNewPw]    = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showNew,  setShowNew]  = useState(false);
  const [showConf, setShowConf] = useState(false);
  const [saving,   setSaving]   = useState(false);

  const strength = strengthScore(newPw);
  const match    = newPw && confirmPw && newPw === confirmPw;
  const canSave  = newPw.length >= 8 && match;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave) return;
    setSaving(true);
    try {
      // 1. Clear sessionStorage flags first — so fetchProfile won't re-trigger the modal
      //    even if onAuthStateChange fires before we call onDone().
      sessionStorage.removeItem('firstLoginHint');

      // 2. Clear the force_password_change DB flag BEFORE changing the password,
      //    so that the USER_UPDATED onAuthStateChange event finds force_password_change=false.
      await authFetch('/api/auth/clear-force-password-flag', { method: 'POST' }).catch(() => {});

      // 3. Change the password client-side — this keeps the session alive.
      //    Using supabase.auth.updateUser avoids the session invalidation that
      //    supabaseAdmin.auth.admin.updateUserById causes server-side.
      const { error: pwErr } = await supabase.auth.updateUser({ password: newPw });
      if (pwErr) throw pwErr;

      toast.success('Fjalëkalimi u ndryshua me sukses!');
      onDone();
    } catch (err: any) {
      toast.error(err.message || 'Gabim gjatë ndryshimit të fjalëkalimit.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
         style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)' }}>
      <div
        className="w-full max-w-md rounded-3xl overflow-hidden shadow-2xl"
        style={{
          background: 'linear-gradient(145deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))',
          border: '1px solid rgba(255,255,255,0.1)',
        }}
      >
        {/* Header */}
        <div className="px-8 pt-8 pb-6 text-center"
             style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center"
               style={{ background: 'linear-gradient(135deg,#7c3aed,#6d28d9)', boxShadow: '0 8px 24px rgba(124,58,237,0.45)' }}>
            <ShieldCheck className="w-7 h-7 text-white" />
          </div>
          <h2 className="text-xl font-bold text-white mb-1">Ndrysho fjalëkalimin</h2>
          <p className="text-sm text-slate-400 leading-relaxed">
            Ky është aksesi juaj i parë. Ju lutemi vendosni një fjalëkalim të ri personal para se të vazhdoni.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-8 py-6 space-y-4">
          {/* New password */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-widest">
              Fjalëkalimi i ri
            </label>
            <div className="flex items-center rounded-xl overflow-hidden transition-all"
                 style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
              <Lock className="ml-4 w-4 h-4 text-slate-500 shrink-0" />
              <input
                type={showNew ? 'text' : 'password'}
                value={newPw}
                onChange={e => setNewPw(e.target.value)}
                placeholder="Minimum 8 karaktere"
                autoComplete="new-password"
                className="flex-1 px-3 py-3.5 bg-transparent text-sm text-white placeholder:text-slate-700 focus:outline-none"
              />
              <button type="button" tabIndex={-1} onClick={() => setShowNew(v => !v)}
                className="mr-3 text-slate-600 hover:text-slate-300 transition-colors">
                {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {/* Strength bar */}
            {newPw.length > 0 && (
              <div className="space-y-1">
                <div className="flex gap-1 h-1">
                  {[1,2,3,4,5].map(i => (
                    <div key={i} className={`flex-1 rounded-full transition-all duration-300 ${i <= strength.score ? strength.color : 'bg-white/10'}`} />
                  ))}
                </div>
                <p className="text-[11px] text-slate-500">{strength.label}</p>
              </div>
            )}
          </div>

          {/* Confirm password */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-widest">
              Konfirmo fjalëkalimin
            </label>
            <div className="flex items-center rounded-xl overflow-hidden transition-all"
                 style={{
                   background: 'rgba(255,255,255,0.05)',
                   border: confirmPw
                     ? match ? '1px solid rgba(16,185,129,0.5)' : '1px solid rgba(239,68,68,0.5)'
                     : '1px solid rgba(255,255,255,0.1)',
                 }}>
              <Lock className="ml-4 w-4 h-4 text-slate-500 shrink-0" />
              <input
                type={showConf ? 'text' : 'password'}
                value={confirmPw}
                onChange={e => setConfirmPw(e.target.value)}
                placeholder="Përsërit fjalëkalimin"
                autoComplete="new-password"
                className="flex-1 px-3 py-3.5 bg-transparent text-sm text-white placeholder:text-slate-700 focus:outline-none"
              />
              <div className="mr-3 flex items-center gap-1">
                {confirmPw && match && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                <button type="button" tabIndex={-1} onClick={() => setShowConf(v => !v)}
                  className="text-slate-600 hover:text-slate-300 transition-colors">
                  {showConf ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            {confirmPw && !match && (
              <p className="text-[11px] text-red-400">Fjalëkalimet nuk përputhen.</p>
            )}
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={!canSave || saving}
            className="w-full mt-2 py-3.5 rounded-xl font-semibold text-sm text-white flex items-center justify-center gap-2 transition-all duration-200 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              background: canSave && !saving
                ? 'linear-gradient(135deg,#7c3aed 0%,#6d28d9 50%,#5b21b6 100%)'
                : 'rgba(124,58,237,0.4)',
              boxShadow: canSave ? '0 8px 24px rgba(109,40,217,0.45)' : 'none',
            }}
          >
            {saving
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Duke ruajtur...</>
              : 'Ruaj fjalëkalimin e ri'}
          </button>
        </form>
      </div>
    </div>
  );
}
