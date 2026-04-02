import React, { useState } from 'react';
import AdminLayout from '../../components/layout/AdminLayout';
import { cn } from '../../lib/utils';
import { toast } from 'sonner';
import {
  Shield, Lock, Smartphone, Eye, EyeOff,
  CheckCircle2, AlertTriangle, LogOut, Monitor,
  Clock, MapPin, RefreshCw, Key, ShieldAlert,
  ShieldCheck, Trash2, X
} from 'lucide-react';
import { format, subHours, subDays } from 'date-fns';

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

const SESSIONS: Session[] = [
  { id: '1', device: 'MacBook Pro',    browser: 'Chrome 124',  location: 'New York, NY',    ip: '192.168.1.1',   last_active: new Date(),            current: true },
  { id: '2', device: 'iPhone 15',      browser: 'Safari 17',   location: 'New York, NY',    ip: '192.168.1.22',  last_active: subHours(new Date(), 2), current: false },
  { id: '3', device: 'Windows PC',     browser: 'Edge 123',    location: 'Brooklyn, NY',    ip: '10.0.0.15',     last_active: subDays(new Date(), 1),  current: false },
  { id: '4', device: 'iPad Air',       browser: 'Safari 17',   location: 'Manhattan, NY',   ip: '172.16.0.9',    last_active: subDays(new Date(), 3),  current: false },
];

const LOGIN_HISTORY: LoginEvent[] = [
  { id: '1', status: 'success', device: 'MacBook Pro',  location: 'New York, NY',  ip: '192.168.1.1',  timestamp: new Date() },
  { id: '2', status: 'success', device: 'iPhone 15',    location: 'New York, NY',  ip: '192.168.1.22', timestamp: subHours(new Date(), 2) },
  { id: '3', status: 'failed',  device: 'Unknown',      location: 'Lagos, Nigeria', ip: '41.58.12.91',  timestamp: subHours(new Date(), 5) },
  { id: '4', status: 'failed',  device: 'Unknown',      location: 'Lagos, Nigeria', ip: '41.58.12.91',  timestamp: subHours(new Date(), 5.1) },
  { id: '5', status: 'success', device: 'Windows PC',   location: 'Brooklyn, NY',  ip: '10.0.0.15',    timestamp: subDays(new Date(), 1) },
  { id: '6', status: 'success', device: 'MacBook Pro',  location: 'New York, NY',  ip: '192.168.1.1',  timestamp: subDays(new Date(), 2) },
];

const passwordStrength = (pw: string) => {
  let score = 0;
  if (pw.length >= 8)  score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  return score;
};

const STRENGTH_LABELS = ['', 'Weak', 'Fair', 'Good', 'Strong', 'Very Strong'];
const STRENGTH_COLORS = ['', 'bg-rose-500', 'bg-amber-500', 'bg-yellow-400', 'bg-emerald-400', 'bg-emerald-600'];
const STRENGTH_TEXT   = ['', 'text-rose-600', 'text-amber-600', 'text-yellow-600', 'text-emerald-600', 'text-emerald-700'];

export default function AdminSecurity() {
  const [sessions, setSessions] = useState<Session[]>(SESSIONS);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew]     = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw]         = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwSaving, setPwSaving]   = useState(false);
  const [twoFAEnabled, setTwoFAEnabled] = useState(false);
  const [twoFAStep, setTwoFAStep] = useState<'idle' | 'setup' | 'verify'>('idle');
  const [twoFACode, setTwoFACode] = useState('');

  const strength = passwordStrength(newPw);
  const strengthPct = (strength / 5) * 100;

  const handlePasswordSave = async () => {
    if (!currentPw) return toast.error('Enter your current password.');
    if (newPw.length < 8) return toast.error('New password must be at least 8 characters.');
    if (newPw !== confirmPw) return toast.error('Passwords do not match.');
    setPwSaving(true);
    await new Promise(r => setTimeout(r, 900));
    setPwSaving(false);
    setCurrentPw(''); setNewPw(''); setConfirmPw('');
    toast.success('Password updated successfully.');
  };

  const revokeSession = (id: string) => {
    setSessions(prev => prev.filter(s => s.id !== id));
    toast.success('Session revoked.');
  };

  const revokeAll = () => {
    setSessions(prev => prev.filter(s => s.current));
    toast.success('All other sessions have been revoked.');
  };

  const handleTwoFAToggle = () => {
    if (twoFAEnabled) {
      setTwoFAEnabled(false);
      toast.success('Two-factor authentication disabled.');
    } else {
      setTwoFAStep('setup');
    }
  };

  const handleTwoFAVerify = () => {
    if (twoFACode === '123456') {
      setTwoFAEnabled(true);
      setTwoFAStep('idle');
      setTwoFACode('');
      toast.success('Two-factor authentication enabled.');
    } else {
      toast.error('Invalid code. Try 123456 for demo.');
    }
  };

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Security</h1>
          <p className="text-sm text-slate-500 mt-0.5">Manage your account security and active sessions</p>
        </div>

        {/* Security score */}
        <div className={cn(
          'rounded-2xl border p-5 flex items-start gap-4',
          twoFAEnabled ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'
        )}>
          <div className={cn('w-11 h-11 rounded-xl flex items-center justify-center shrink-0',
            twoFAEnabled ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'
          )}>
            {twoFAEnabled ? <ShieldCheck className="w-5 h-5" /> : <ShieldAlert className="w-5 h-5" />}
          </div>
          <div className="flex-1">
            <p className={cn('font-bold text-sm', twoFAEnabled ? 'text-emerald-800' : 'text-amber-800')}>
              {twoFAEnabled ? 'Your account is well protected' : 'Improve your account security'}
            </p>
            <p className={cn('text-xs mt-0.5', twoFAEnabled ? 'text-emerald-600' : 'text-amber-600')}>
              {twoFAEnabled
                ? 'Two-factor authentication is active. Your account has strong protection.'
                : 'Enable two-factor authentication to add an extra layer of security.'}
            </p>
            <div className="mt-2.5 flex items-center gap-3">
              <div className="flex-1 h-1.5 bg-white/60 rounded-full overflow-hidden max-w-48">
                <div
                  className={cn('h-full rounded-full transition-all', twoFAEnabled ? 'bg-emerald-500' : 'bg-amber-500')}
                  style={{ width: twoFAEnabled ? '90%' : '55%' }}
                />
              </div>
              <span className={cn('text-xs font-bold', twoFAEnabled ? 'text-emerald-700' : 'text-amber-700')}>
                {twoFAEnabled ? '90/100' : '55/100'}
              </span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Change Password */}
          <Card title="Change Password" icon={Lock} subtitle="Use a strong, unique password">
            <div className="space-y-4">
              <PasswordField label="Current Password" value={currentPw} onChange={setCurrentPw} show={showCurrent} onToggle={() => setShowCurrent(p => !p)} />
              <PasswordField label="New Password" value={newPw} onChange={setNewPw} show={showNew} onToggle={() => setShowNew(p => !p)} />

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
                        { ok: newPw.length >= 8,        label: '8+ chars' },
                        { ok: /[A-Z]/.test(newPw),      label: 'Uppercase' },
                        { ok: /[0-9]/.test(newPw),      label: 'Number' },
                        { ok: /[^A-Za-z0-9]/.test(newPw), label: 'Symbol' },
                      ].map(({ ok, label }) => (
                        <li key={label} className={cn('text-xs flex items-center gap-0.5', ok ? 'text-emerald-600' : 'text-slate-400')}>
                          <CheckCircle2 className="w-3 h-3" /> {label}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              <PasswordField label="Confirm New Password" value={confirmPw} onChange={setConfirmPw} show={showConfirm} onToggle={() => setShowConfirm(p => !p)} />
              {confirmPw && newPw !== confirmPw && (
                <p className="text-xs text-rose-500 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Passwords do not match</p>
              )}
              {confirmPw && newPw === confirmPw && newPw && (
                <p className="text-xs text-emerald-600 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Passwords match</p>
              )}

              <button
                onClick={handlePasswordSave}
                disabled={pwSaving}
                className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors"
              >
                {pwSaving ? 'Updating…' : 'Update Password'}
              </button>
            </div>
          </Card>

          {/* Two-Factor Auth */}
          <Card title="Two-Factor Authentication" icon={Smartphone} subtitle="Add an extra layer of security">
            <div className="space-y-4">
              <div className={cn('rounded-xl p-4 flex items-center gap-4', twoFAEnabled ? 'bg-emerald-50 border border-emerald-200' : 'bg-slate-50 border border-slate-200')}>
                <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center shrink-0', twoFAEnabled ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-200 text-slate-500')}>
                  <Shield className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <p className={cn('text-sm font-bold', twoFAEnabled ? 'text-emerald-700' : 'text-slate-700')}>
                    {twoFAEnabled ? '2FA is Enabled' : '2FA is Disabled'}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">Authenticator app (TOTP)</p>
                </div>
                <button
                  onClick={handleTwoFAToggle}
                  className={cn(
                    'text-sm font-semibold px-3 py-1.5 rounded-lg transition-colors',
                    twoFAEnabled
                      ? 'text-rose-600 hover:bg-rose-50 border border-rose-200'
                      : 'text-indigo-600 hover:bg-indigo-50 border border-indigo-200'
                  )}
                >
                  {twoFAEnabled ? 'Disable' : 'Enable'}
                </button>
              </div>

              {/* 2FA Setup Flow */}
              {twoFAStep === 'setup' && (
                <div className="border border-indigo-200 rounded-xl p-4 space-y-4 bg-indigo-50/40">
                  <p className="text-sm font-bold text-slate-800">Scan QR Code</p>
                  <p className="text-xs text-slate-500">Use Google Authenticator, Authy, or another TOTP app to scan this code.</p>
                  {/* Fake QR */}
                  <div className="w-36 h-36 mx-auto bg-white border-2 border-slate-200 rounded-xl flex items-center justify-center">
                    <div className="w-28 h-28 grid grid-cols-7 gap-0.5 opacity-80">
                      {Array.from({ length: 49 }).map((_, i) => (
                        <div key={i} className={cn('rounded-sm', Math.random() > 0.5 ? 'bg-slate-900' : 'bg-white')} />
                      ))}
                    </div>
                  </div>
                  <p className="text-center text-xs text-slate-400">Can't scan? Use code: <span className="font-mono font-bold text-slate-700">JBSW Y3DP EHPK</span></p>
                  <div className="space-y-2">
                    <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide">Enter 6-digit code to verify</label>
                    <div className="flex gap-2">
                      <input
                        value={twoFACode}
                        onChange={e => setTwoFACode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        placeholder="000000"
                        className="flex-1 px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 font-mono tracking-widest text-center"
                      />
                      <button onClick={handleTwoFAVerify} className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors">
                        Verify
                      </button>
                    </div>
                    <p className="text-xs text-slate-400 text-center">Use <span className="font-mono font-bold">123456</span> for demo</p>
                  </div>
                  <button onClick={() => setTwoFAStep('idle')} className="w-full text-xs text-slate-400 hover:text-slate-600 hover:underline transition-colors">
                    Cancel
                  </button>
                </div>
              )}

              {!twoFAEnabled && twoFAStep === 'idle' && (
                <div className="space-y-2">
                  {['Download an authenticator app (Google Authenticator, Authy)', 'Click Enable and scan the QR code', 'Enter the 6-digit code to confirm'].map((step, i) => (
                    <div key={i} className="flex items-start gap-2.5 text-xs text-slate-500">
                      <span className="w-4 h-4 rounded-full bg-indigo-100 text-indigo-600 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                      {step}
                    </div>
                  ))}
                </div>
              )}

              {twoFAEnabled && (
                <div className="space-y-2.5">
                  <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Backup Codes</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {['8f2a-3c9d', 'x7k1-m4qp', 'n9w2-r5ht', 'j3e8-b6vy', 'p1u7-k2ms', 'a4t6-w9zn'].map(code => (
                      <div key={code} className="font-mono text-xs bg-slate-100 text-slate-700 px-2.5 py-1.5 rounded-lg text-center font-semibold">{code}</div>
                    ))}
                  </div>
                  <p className="text-xs text-slate-400">Store these codes safely. Each can only be used once.</p>
                  <button className="text-xs text-indigo-600 font-semibold hover:underline flex items-center gap-1">
                    <RefreshCw className="w-3 h-3" /> Regenerate backup codes
                  </button>
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* Active Sessions */}
        <Card title="Active Sessions" icon={Monitor} subtitle="Devices currently signed in to your account"
          action={sessions.filter(s => !s.current).length > 0
            ? <button onClick={revokeAll} className="text-xs text-rose-600 font-semibold hover:underline flex items-center gap-1"><LogOut className="w-3 h-3" /> Revoke all others</button>
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
                      {s.current && <span className="text-xs bg-indigo-600 text-white px-2 py-0.5 rounded-full font-semibold">This device</span>}
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">{s.browser}</p>
                    <div className="flex items-center gap-3 mt-1.5">
                      <span className="flex items-center gap-1 text-xs text-slate-400"><MapPin className="w-3 h-3" />{s.location}</span>
                      <span className="flex items-center gap-1 text-xs text-slate-400"><Key className="w-3 h-3" />{s.ip}</span>
                      <span className="flex items-center gap-1 text-xs text-slate-400">
                        <Clock className="w-3 h-3" />
                        {s.current ? 'Now' : format(s.last_active, 'MMM d, h:mm a')}
                      </span>
                    </div>
                  </div>
                </div>
                {!s.current && (
                  <button onClick={() => revokeSession(s.id)} className="shrink-0 p-1.5 rounded-lg hover:bg-rose-50 text-slate-400 hover:text-rose-500 transition-colors" title="Revoke session">
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
            {sessions.length === 1 && sessions[0].current && (
              <p className="text-xs text-slate-400 text-center py-2">No other active sessions.</p>
            )}
          </div>
        </Card>

        {/* Login History */}
        <Card title="Login History" icon={Clock} subtitle="Recent sign-in activity on your account">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left pb-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                  <th className="text-left pb-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Device</th>
                  <th className="text-left pb-3 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden md:table-cell">Location</th>
                  <th className="text-left pb-3 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden lg:table-cell">IP Address</th>
                  <th className="text-left pb-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {LOGIN_HISTORY.map(ev => (
                  <tr key={ev.id} className={cn('hover:bg-slate-50/60 transition-colors', ev.status === 'failed' && 'bg-rose-50/30')}>
                    <td className="py-3 pr-4">
                      <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold',
                        ev.status === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                      )}>
                        <span className={cn('w-1.5 h-1.5 rounded-full', ev.status === 'success' ? 'bg-emerald-500' : 'bg-rose-500')} />
                        {ev.status === 'success' ? 'Success' : 'Failed'}
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
          {LOGIN_HISTORY.some(e => e.status === 'failed') && (
            <div className="mt-4 flex items-start gap-2.5 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 text-sm text-rose-700">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <p>Suspicious failed login attempts detected from Lagos, Nigeria. If this wasn't you, change your password immediately.</p>
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
