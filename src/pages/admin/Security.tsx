import React, { useEffect, useMemo, useState } from 'react';
import AdminLayout from '../../components/layout/AdminLayout';
import { cn } from '../../lib/utils';
import { toast } from 'sonner';
import { supabase } from '../../supabase';
import { useTranslation } from 'react-i18next';
import {
  Lock, Eye, EyeOff,
  CheckCircle2, AlertTriangle, LogOut, Monitor,
  Clock, MapPin, Key, ShieldCheck, Trash2, X
} from 'lucide-react';
import { format } from 'date-fns';

interface Session {
  id: string;
  device: string;
  browser: string;
  location: string;
  ip: string;
  last_active: Date;
  current: boolean;
}

interface LoginEvent {
  id: string;
  status: 'success' | 'failed';
  device: string;
  location: string;
  ip: string;
  timestamp: Date;
}

const passwordStrength = (pw: string) => {
  let score = 0;
  if (pw.length >= 8)  score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  return score;
};

const STRENGTH_COLORS = ['', 'bg-rose-500', 'bg-amber-500', 'bg-yellow-400', 'bg-emerald-400', 'bg-emerald-600'];

export default function AdminSecurity() {
  const { t } = useTranslation();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loginHistory, setLoginHistory] = useState<LoginEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew]     = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw]         = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwSaving, setPwSaving]   = useState(false);

  const strength = passwordStrength(newPw);

  const STRENGTH_LABELS = ['', t('security.strength.weak'), t('security.strength.fair'), t('security.strength.good'), t('security.strength.strong'), t('security.strength.veryStrong')];
  const STRENGTH_TEXT   = ['', 'text-rose-600', 'text-amber-600', 'text-yellow-600', 'text-emerald-600', 'text-emerald-700'];

  const deviceLabel = useMemo(() => {
    const ua = navigator.userAgent || '';
    if (/iphone/i.test(ua)) return 'iPhone';
    if (/ipad/i.test(ua)) return 'iPad';
    if (/android/i.test(ua)) return 'Android Device';
    if (/windows/i.test(ua)) return 'Windows PC';
    if (/macintosh|mac os x/i.test(ua)) return 'Mac';
    if (/linux/i.test(ua)) return 'Linux';
    return 'Current Device';
  }, []);

  const browserLabel = useMemo(() => {
    const ua = navigator.userAgent || '';
    if (/edg/i.test(ua)) return 'Edge';
    if (/chrome/i.test(ua) && !/edg/i.test(ua)) return 'Chrome';
    if (/safari/i.test(ua) && !/chrome/i.test(ua)) return 'Safari';
    if (/firefox/i.test(ua)) return 'Firefox';
    return 'Browser';
  }, []);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const { data: authData } = await supabase.auth.getSession();
        const session = authData.session;
        const user = session?.user;
        const now = new Date();
        const lastLogin = user?.last_sign_in_at ? new Date(user.last_sign_in_at) : now;
        const currentSession: Session = {
          id: user?.id || 'current',
          device: deviceLabel,
          browser: browserLabel,
          location: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Unknown',
          ip: 'Hidden',
          last_active: now,
          current: true,
        };
        setSessions([currentSession]);
        setLoginHistory([
          {
            id: 'current-login',
            status: 'success',
            device: deviceLabel,
            location: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Unknown',
            ip: 'Hidden',
            timestamp: lastLogin,
          },
        ]);

      } catch {
        // keep defaults if unavailable
      } finally {
        setLoading(false);
      }
    })();
  }, [browserLabel, deviceLabel]);


  const handlePasswordSave = async () => {
    if (!currentPw) return toast.error(t('security.toasts.enterCurrent'));
    if (newPw.length < 8) return toast.error(t('security.toasts.minChars'));
    if (newPw !== confirmPw) return toast.error(t('security.toasts.mismatch'));
    try {
      setPwSaving(true);
      const { error } = await supabase.auth.updateUser({ password: newPw });
      if (error) throw error;
      setCurrentPw('');
      setNewPw('');
      setConfirmPw('');
      toast.success(t('security.toasts.updated'));
    } catch (e: any) {
      toast.error(e?.message || t('errors.saveFailed'));
    } finally {
      setPwSaving(false);
    }
  };

  const revokeSession = (id: string) => {
    setSessions(prev => prev.filter(s => s.id !== id));
    toast.success(t('security.toasts.revoked'));
  };

  const revokeAll = () => {
    setSessions(prev => prev.filter(s => s.current));
    toast.success(t('security.toasts.allRevoked'));
  };

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('security.title')}</h1>
          <p className="text-sm text-slate-500 mt-0.5">{t('security.subtitle')}</p>
        </div>

        {/* Security score */}
        <div className="rounded-2xl border p-5 flex items-start gap-4 bg-emerald-50 border-emerald-200">
          <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 bg-emerald-100 text-emerald-600">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <p className="font-bold text-sm text-emerald-800">{t('security.protected')}</p>
            <p className="text-xs mt-0.5 text-emerald-600">{t('security.protectedDesc')}</p>
            <div className="mt-2.5 flex items-center gap-3">
              <div className="flex-1 h-1.5 bg-white/60 rounded-full overflow-hidden max-w-48">
                <div className="h-full rounded-full bg-emerald-500" style={{ width: '75%' }} />
              </div>
              <span className="text-xs font-bold text-emerald-700">75/100</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Change Password */}
          <Card title={t('security.changePassword')} icon={Lock} subtitle={t('security.changePasswordDesc')}>
            <div className="space-y-4">
              <PasswordField label={t('security.currentPassword')} value={currentPw} onChange={setCurrentPw} show={showCurrent} onToggle={() => setShowCurrent(p => !p)} />
              <PasswordField label={t('security.newPassword')} value={newPw} onChange={setNewPw} show={showNew} onToggle={() => setShowNew(p => !p)} />

              {/* Strength bar */}
              {newPw && (
                <div className="space-y-1.5">
                  <div className="flex gap-1">
                    {[1,2,3,4,5].map(i => (
                      <div key={i} className={cn('h-1.5 flex-1 rounded-full transition-all', i <= strength ? STRENGTH_COLORS[strength] : 'bg-slate-100')} />
                    ))}
                  </div>
                  <div className="flex justify-between items-center">
                    <p className={cn('text-xs font-semibold', STRENGTH_TEXT[strength])}>{STRENGTH_LABELS[strength]}</p>
                    <ul className="flex gap-3">
                      {[
                        { ok: newPw.length >= 8,        label: t('security.strength.chars8') },
                        { ok: /[A-Z]/.test(newPw),      label: t('security.strength.uppercase') },
                        { ok: /[0-9]/.test(newPw),      label: t('security.strength.number') },
                        { ok: /[^A-Za-z0-9]/.test(newPw), label: t('security.strength.symbol') },
                      ].map(({ ok, label }) => (
                        <li key={label} className={cn('text-xs flex items-center gap-0.5', ok ? 'text-emerald-600' : 'text-slate-400')}>
                          <CheckCircle2 className="w-3 h-3" /> {label}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              <PasswordField label={t('security.confirmPassword')} value={confirmPw} onChange={setConfirmPw} show={showConfirm} onToggle={() => setShowConfirm(p => !p)} />
              {confirmPw && newPw !== confirmPw && (
                <p className="text-xs text-rose-500 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> {t('security.passwordMismatch')}</p>
              )}
              {confirmPw && newPw === confirmPw && newPw && (
                <p className="text-xs text-emerald-600 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> {t('security.passwordMatch')}</p>
              )}

              <button
                onClick={handlePasswordSave}
                disabled={pwSaving}
                className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors"
              >
                {pwSaving ? t('security.updating') : t('security.updatePassword')}
              </button>
            </div>
          </Card>

        </div>

        {/* Active Sessions */}
        <Card title={t('security.activeSessions')} icon={Monitor} subtitle={t('security.activeSessionsDesc')}
          action={sessions.filter(s => !s.current).length > 0
            ? <button onClick={revokeAll} className="text-xs text-rose-600 font-semibold hover:underline flex items-center gap-1"><LogOut className="w-3 h-3" /> {t('security.revokeAllOthers')}</button>
            : undefined
          }
        >
          <div className="space-y-3">
            {sessions.map(s => (
              <div key={s.id} className={cn('flex items-start justify-between gap-4 p-4 rounded-xl border transition-all',
                s.current ? 'bg-indigo-50 border-indigo-200' : 'bg-slate-50 border-slate-100 hover:border-slate-200'
              )}>
                <div className="flex items-start gap-3">
                  <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center shrink-0',
                    s.current ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-200 text-slate-500'
                  )}>
                    <Monitor className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-bold text-slate-800">{s.device}</p>
                      {s.current && <span className="text-xs bg-indigo-600 text-white px-2 py-0.5 rounded-full font-semibold">{t('security.thisDevice')}</span>}
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">{s.browser}</p>
                    <div className="flex items-center gap-3 mt-1.5">
                      <span className="flex items-center gap-1 text-xs text-slate-400"><MapPin className="w-3 h-3" />{s.location}</span>
                      <span className="flex items-center gap-1 text-xs text-slate-400"><Key className="w-3 h-3" />{s.ip}</span>
                      <span className="flex items-center gap-1 text-xs text-slate-400">
                        <Clock className="w-3 h-3" />
                        {s.current ? t('security.now') : format(s.last_active, 'MMM d, h:mm a')}
                      </span>
                    </div>
                  </div>
                </div>
                {!s.current && (
                  <button onClick={() => revokeSession(s.id)} className="shrink-0 p-1.5 rounded-lg hover:bg-rose-50 text-slate-400 hover:text-rose-500 transition-colors" title={t('security.toasts.revoked')}>
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
            {sessions.length === 1 && sessions[0].current && (
              <p className="text-xs text-slate-400 text-center py-2">{t('security.noOtherSessions')}</p>
            )}
          </div>
        </Card>

        {/* Login History */}
        <Card title={t('security.loginHistory')} icon={Clock} subtitle={t('security.loginHistoryDesc')}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left pb-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">{t('security.table.status')}</th>
                  <th className="text-left pb-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">{t('security.table.device')}</th>
                  <th className="text-left pb-3 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden md:table-cell">{t('security.table.location')}</th>
                  <th className="text-left pb-3 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden lg:table-cell">{t('security.table.ip')}</th>
                  <th className="text-left pb-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">{t('security.table.time')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {loginHistory.map(ev => (
                  <tr key={ev.id} className={cn('hover:bg-slate-50/60 transition-colors', ev.status === 'failed' && 'bg-rose-50/30')}>
                    <td className="py-3 pr-4">
                      <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold',
                        ev.status === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                      )}>
                        <span className={cn('w-1.5 h-1.5 rounded-full', ev.status === 'success' ? 'bg-emerald-500' : 'bg-rose-500')} />
                        {ev.status === 'success' ? t('security.table.success') : t('security.table.failed')}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-sm text-slate-700 font-medium">{ev.device}</td>
                    <td className="py-3 pr-4 hidden md:table-cell">
                      <div className="flex items-center gap-1 text-slate-500 text-xs">
                        <MapPin className="w-3 h-3" />{ev.location}
                      </div>
                    </td>
                    <td className="py-3 pr-4 hidden lg:table-cell">
                      <span className="font-mono text-xs text-slate-400">{ev.ip}</span>
                    </td>
                    <td className="py-3 text-xs text-slate-400">{format(ev.timestamp, 'MMM d, h:mm a')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {loginHistory.some(e => e.status === 'failed') && (
            <div className="mt-4 flex items-start gap-2.5 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 text-sm text-rose-700">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <p>{t('security.suspiciousActivity')}</p>
            </div>
          )}
        </Card>
      </div>
    </AdminLayout>
  );
}

function Card({ title, icon: Icon, subtitle, children, action }: {
  title: string; icon: React.ElementType; subtitle?: string;
  children: React.ReactNode; action?: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
      <div className="flex items-start justify-between gap-3 pb-4 border-b border-slate-100 mb-5">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
            <Icon className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900">{title}</h3>
            {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
          </div>
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function PasswordField({ label, value, onChange, show, onToggle }: {
  label: string; value: string; onChange: (v: string) => void; show: boolean; onToggle: () => void;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide">{label}</label>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={e => onChange(e.target.value)}
          className="w-full pl-3.5 pr-10 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 bg-white"
          placeholder="••••••••"
        />
        <button
          type="button"
          onClick={onToggle}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
        >
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}
