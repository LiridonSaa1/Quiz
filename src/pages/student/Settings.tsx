import React, { useEffect, useState } from 'react';
import StudentLayout from '../../components/layout/StudentLayout';
import { supabase } from '../../supabase';
import { toast } from 'sonner';
import { cn } from '../../lib/utils';
import { Settings, Bell, Shield, Loader2, Save, CheckCircle2, KeyRound, Eye, EyeOff } from 'lucide-react';
import { authFetch } from '../../lib/apiUrl';

interface StudentPrefs {
  notif_new_assignment: boolean;
  notif_quiz_graded: boolean;
  notif_announcement: boolean;
  notif_live_session: boolean;
  notif_certificate: boolean;
  notif_payment_reminder: boolean;
}

const DEFAULT_PREFS: StudentPrefs = {
  notif_new_assignment: true,
  notif_quiz_graded: true,
  notif_announcement: true,
  notif_live_session: true,
  notif_certificate: true,
  notif_payment_reminder: true,
};

const TABS = [
  { id: 'notifications', label: 'Njoftimet', icon: Bell },
  { id: 'security',      label: 'Siguria',   icon: Shield },
];

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none',
        checked ? 'bg-violet-600' : 'bg-white/10'
      )}
    >
      <span className={cn(
        'inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform',
        checked ? 'translate-x-6' : 'translate-x-1'
      )} />
    </button>
  );
}

export default function StudentSettings() {
  const [activeTab, setActiveTab] = useState('notifications');
  const [prefs, setPrefs] = useState<StudentPrefs>(DEFAULT_PREFS);
  const [userId, setUserId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [passwords, setPasswords] = useState({ next: '', confirm: '' });
  const [showPw, setShowPw] = useState({ next: false, confirm: false });
  const [changingPass, setChangingPass] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) { setLoading(false); return; }
      const uid = session.user.id;
      setUserId(uid);
      try {
        const { data } = await supabase
          .from('platform_config')
          .select('value')
          .eq('section', `student_settings:${uid}`)
          .maybeSingle();
        if (data?.value) setPrefs(prev => ({ ...prev, ...(data.value as Partial<StudentPrefs>) }));
      } catch { /* use defaults */ }
      setLoading(false);
    };
    void load();
  }, []);

  const savePrefs = async (patch: Partial<StudentPrefs>) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    setSaving(true);
    try {
      const { error } = await supabase
        .from('platform_config')
        .upsert({ section: `student_settings:${userId}`, value: next }, { onConflict: 'section' });
      if (error) throw error;
      toast.success('Cilësimet u ruajtën');
    } catch (e: any) {
      toast.error(e?.message || 'Ruajtja dështoi');
      setPrefs(prefs);
    }
    setSaving(false);
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passwords.next.length < 8) { toast.error('Fjalëkalimi duhet të ketë të paktën 8 karaktere.'); return; }
    if (passwords.next !== passwords.confirm) { toast.error('Fjalëkalimet nuk përputhen.'); return; }
    setChangingPass(true);
    try {
      const res = await authFetch('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ newPassword: passwords.next }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Ndryshimi dështoi.');
      toast.success('Fjalëkalimi u ndryshua me sukses!');
      setPasswords({ next: '', confirm: '' });
    } catch (err: any) {
      toast.error(err.message || 'Gabim gjatë ndryshimit të fjalëkalimit.');
    }
    setChangingPass(false);
  };

  const NOTIF_ROWS: { key: keyof StudentPrefs; label: string; desc: string }[] = [
    { key: 'notif_new_assignment',   label: 'Detyra të reja',         desc: 'Njoftim kur mësuesi shton një detyrë të re' },
    { key: 'notif_quiz_graded',      label: 'Quiz i vlerësuar',        desc: 'Njoftim kur quiz-i yt vlerësohet' },
    { key: 'notif_announcement',     label: 'Njoftime të rëndësishme', desc: 'Njoftime dhe komunikata nga mësuesi' },
    { key: 'notif_live_session',     label: 'Sesione live',            desc: 'Njoftim kur fillon ose planifikohet një sesion live' },
    { key: 'notif_certificate',      label: 'Certifikata',             desc: 'Njoftim kur të lëshohet një certifikatë' },
    { key: 'notif_payment_reminder', label: 'Kujtues pagese',          desc: 'Kujtues për pagesën mujore' },
  ];

  if (loading) {
    return (
      <StudentLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 text-violet-400 animate-spin" />
        </div>
      </StudentLayout>
    );
  }

  return (
    <StudentLayout>
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-violet-500/15 flex items-center justify-center">
            <Settings className="w-5 h-5 text-violet-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Cilësimet</h1>
            <p className="text-sm text-slate-400">Preferencat tuaja personale ruhen në Supabase</p>
          </div>
          {saving && <Loader2 className="w-4 h-4 text-violet-400 animate-spin ml-auto" />}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-white/[0.04] rounded-xl p-1">
          {TABS.map(tab => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'flex items-center gap-2 flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-all',
                  active
                    ? 'bg-violet-600 text-white shadow'
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                )}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Notifications Tab */}
        {activeTab === 'notifications' && (
          <div className="rounded-2xl border border-white/[0.08] overflow-hidden"
               style={{ background: 'rgba(255,255,255,0.03)' }}>
            <div className="px-5 py-4 border-b border-white/[0.06]">
              <h2 className="text-sm font-semibold text-white">Preferencat e njoftimeve</h2>
              <p className="text-xs text-slate-500 mt-0.5">Zgjidhni llojet e njoftimeve që dëshironi të merrni</p>
            </div>
            <div className="divide-y divide-white/[0.05]">
              {NOTIF_ROWS.map(row => (
                <div key={row.key} className="flex items-center justify-between px-5 py-4">
                  <div>
                    <p className="text-sm font-medium text-white">{row.label}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{row.desc}</p>
                  </div>
                  <Toggle
                    checked={prefs[row.key]}
                    onChange={val => savePrefs({ [row.key]: val })}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Security Tab */}
        {activeTab === 'security' && (
          <div className="rounded-2xl border border-white/[0.08] overflow-hidden"
               style={{ background: 'rgba(255,255,255,0.03)' }}>
            <div className="px-5 py-4 border-b border-white/[0.06] flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-violet-400" />
              <h2 className="text-sm font-semibold text-white">Ndrysho fjalëkalimin</h2>
            </div>
            <form onSubmit={handlePasswordChange} className="p-5 space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-400">Fjalëkalim i ri</label>
                <div className="relative">
                  <input
                    type={showPw.next ? 'text' : 'password'}
                    value={passwords.next}
                    onChange={e => setPasswords(p => ({ ...p, next: e.target.value }))}
                    placeholder="Minimum 8 karaktere"
                    className="w-full px-4 py-2.5 pr-10 rounded-xl bg-white/[0.06] border border-white/[0.08] text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-violet-500/50"
                  />
                  <button type="button" onClick={() => setShowPw(p => ({ ...p, next: !p.next }))}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white">
                    {showPw.next ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-400">Konfirmo fjalëkalimin</label>
                <div className="relative">
                  <input
                    type={showPw.confirm ? 'text' : 'password'}
                    value={passwords.confirm}
                    onChange={e => setPasswords(p => ({ ...p, confirm: e.target.value }))}
                    placeholder="Ripërsërit fjalëkalimin e ri"
                    className="w-full px-4 py-2.5 pr-10 rounded-xl bg-white/[0.06] border border-white/[0.08] text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-violet-500/50"
                  />
                  <button type="button" onClick={() => setShowPw(p => ({ ...p, confirm: !p.confirm }))}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white">
                    {showPw.confirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              {passwords.next && passwords.confirm && passwords.next !== passwords.confirm && (
                <p className="text-xs text-red-400">Fjalëkalimet nuk përputhen</p>
              )}
              <button
                type="submit"
                disabled={changingPass || passwords.next.length < 8 || passwords.next !== passwords.confirm}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors"
              >
                {changingPass ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Ndrysho fjalëkalimin
              </button>
            </form>
          </div>
        )}

        {/* Footer note */}
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-emerald-500/8 border border-emerald-500/15">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <p className="text-xs text-emerald-300">
            Cilësimet ruhen automatikisht në Supabase (<code className="text-emerald-400">platform_config</code>) — jo në browser storage.
          </p>
        </div>
      </div>
    </StudentLayout>
  );
}
