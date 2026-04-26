import React, { useEffect, useState } from 'react';
import AdminLayout from '../../components/layout/AdminLayout';
import { cn } from '../../lib/utils';
import { toast } from 'sonner';
import { authFetch } from '../../lib/apiUrl';
import { defaultFeatureFlags, FeatureFlags } from '../../lib/platformFeatures';
import {
  Settings, Globe, Bell, Shield, Database, Mail,
  Clock, Languages, Save, ToggleLeft, ToggleRight,
  ChevronRight, School, Phone, MapPin, AlertTriangle
} from 'lucide-react';

interface GeneralForm {
  school_name: string;
  tagline: string;
  contact_email: string;
  support_phone: string;
  address: string;
  website: string;
  timezone: string;
  language: string;
  date_format: string;
}

interface NotifSettings {
  email_new_enrollment: boolean;
  email_quiz_submitted: boolean;
  email_certificate_issued: boolean;
  email_payment_received: boolean;
  system_maintenance_alerts: boolean;
  weekly_report: boolean;
}

const TIMEZONES = ['UTC', 'America/New_York', 'America/Chicago', 'America/Los_Angeles', 'Europe/London', 'Europe/Berlin', 'Asia/Tokyo', 'Asia/Dubai', 'Australia/Sydney'];
const LANGUAGES = ['English', 'French', 'German', 'Spanish', 'Arabic', 'Albanian', 'Turkish'];
const DATE_FORMATS = ['MMM D, YYYY', 'DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'];

const TABS = [
  { id: 'general',       label: 'General',       icon: School },
  { id: 'notifications', label: 'Notifications',  icon: Bell },
  { id: 'email',         label: 'Email',          icon: Mail },
  { id: 'security',      label: 'Security',       icon: Shield },
  { id: 'advanced',      label: 'Advanced',       icon: Database },
];

export default function AdminSettings() {
  const [activeTab, setActiveTab] = useState('general');
  const [saving, setSaving] = useState(false);
  const [maintenance, setMaintenance] = useState(false);
  const [registrationOpen, setRegistrationOpen] = useState(true);
  const [requireEmailVerify, setRequireEmailVerify] = useState(true);
  const [twoFactor, setTwoFactor] = useState(false);
  const [strongPasswords, setStrongPasswords] = useState(true);
  const [autoLogout, setAutoLogout] = useState(true);
  const [sessionTimeoutMinutes, setSessionTimeoutMinutes] = useState(30);
  const [maxLoginAttempts, setMaxLoginAttempts] = useState(5);
  const [telegramErrorAlerts, setTelegramErrorAlerts] = useState(true);
  const [features, setFeatures] = useState<FeatureFlags>(defaultFeatureFlags);

  const [general, setGeneral] = useState<GeneralForm>({
    school_name: 'QuizMaster Academy',
    tagline: 'The smart way to teach & learn',
    contact_email: 'admin@quizmaster.edu',
    support_phone: '+1 (555) 010-2030',
    address: '123 Education Blvd, Suite 400, New York, NY 10001',
    website: 'www.quizmaster.edu',
    timezone: 'America/New_York',
    language: 'English',
    date_format: 'MMM D, YYYY',
  });

  const [notifs, setNotifs] = useState<NotifSettings>({
    email_new_enrollment: true,
    email_quiz_submitted: true,
    email_certificate_issued: true,
    email_payment_received: true,
    system_maintenance_alerts: true,
    weekly_report: false,
  });

  const [emailSettings, setEmailSettings] = useState({
    smtp_host: 'smtp.mailgun.org',
    smtp_port: '587',
    smtp_user: 'postmaster@quizmaster.edu',
    smtp_password: '',
    from_name: 'QuizMaster Academy',
    from_email: 'noreply@quizmaster.edu',
    reply_to: 'support@quizmaster.edu',
  });

  const handleSave = async () => {
    try {
      setSaving(true);
      const res = await authFetch('/api/admin/config/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          value: {
            general,
            notifications: notifs,
            email: emailSettings,
            security: { twoFactor, requireEmailVerify, registrationOpen, strongPasswords, autoLogout, sessionTimeoutMinutes, maxLoginAttempts },
            advanced: { maintenance, telegramErrorAlerts },
            features,
          },
        }),
      });
      const json = await res.json();
      if (!res.ok || !json?.success) throw new Error(json?.error || 'Failed to save settings');
      window.dispatchEvent(new CustomEvent('settings-updated'));
      toast.success('Settings saved successfully.');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const res = await authFetch('/api/admin/config/settings');
        const json = await res.json();
        if (!res.ok || !json?.success || !json?.value) return;
        const v = json.value as any;
        if (v.general) setGeneral((prev) => ({ ...prev, ...v.general }));
        if (v.notifications) setNotifs((prev) => ({ ...prev, ...v.notifications }));
        if (v.email) setEmailSettings((prev) => ({ ...prev, ...v.email }));
        if (v.security) {
          if (typeof v.security.twoFactor === 'boolean') setTwoFactor(v.security.twoFactor);
          if (typeof v.security.requireEmailVerify === 'boolean') setRequireEmailVerify(v.security.requireEmailVerify);
          if (typeof v.security.registrationOpen === 'boolean') setRegistrationOpen(v.security.registrationOpen);
          if (typeof v.security.strongPasswords === 'boolean') setStrongPasswords(v.security.strongPasswords);
          if (typeof v.security.autoLogout === 'boolean') setAutoLogout(v.security.autoLogout);
          if (Number.isFinite(Number(v.security.sessionTimeoutMinutes))) setSessionTimeoutMinutes(Number(v.security.sessionTimeoutMinutes));
          if (Number.isFinite(Number(v.security.maxLoginAttempts))) setMaxLoginAttempts(Number(v.security.maxLoginAttempts));
        }
        if (v.advanced && typeof v.advanced.maintenance === 'boolean') setMaintenance(v.advanced.maintenance);
        if (v.advanced && typeof v.advanced.telegramErrorAlerts === 'boolean') {
          setTelegramErrorAlerts(v.advanced.telegramErrorAlerts);
        }
        if (v.features) {
          setFeatures({
            communityEnabled: typeof v.features.communityEnabled === 'boolean' ? v.features.communityEnabled : true,
            liveSessionsEnabled: typeof v.features.liveSessionsEnabled === 'boolean' ? v.features.liveSessionsEnabled : true,
            announcementsEnabled: typeof v.features.announcementsEnabled === 'boolean' ? v.features.announcementsEnabled : true,
            paymentsEnabled: typeof v.features.paymentsEnabled === 'boolean' ? v.features.paymentsEnabled : true,
          });
        }
      } catch {
        // keep local defaults when config table is missing or unavailable
      }
    })();
  }, []);

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
            <p className="text-sm text-slate-500 mt-0.5">Configure your platform preferences</p>
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>

        <div className="flex flex-col lg:flex-row gap-6">
          {/* Sidebar Tabs */}
          <div className="lg:w-56 shrink-0">
            <nav className="bg-white rounded-2xl border border-slate-100 shadow-sm p-2 space-y-0.5">
              {TABS.map(tab => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={cn(
                      'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all',
                      activeTab === tab.id
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'text-slate-600 hover:bg-slate-50'
                    )}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    {tab.label}
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Content */}
          <div className="flex-1 space-y-5">
            {/* GENERAL */}
            {activeTab === 'general' && (
              <>
                <Section title="School Information" subtitle="Basic details about your institution">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Field label="School Name" icon={School}>
                      <input value={general.school_name} onChange={e => setGeneral(p => ({ ...p, school_name: e.target.value }))} className={inputCls} />
                    </Field>
                    <Field label="Tagline">
                      <input value={general.tagline} onChange={e => setGeneral(p => ({ ...p, tagline: e.target.value }))} className={inputCls} />
                    </Field>
                    <Field label="Contact Email" icon={Mail}>
                      <input type="email" value={general.contact_email} onChange={e => setGeneral(p => ({ ...p, contact_email: e.target.value }))} className={inputCls} />
                    </Field>
                    <Field label="Support Phone" icon={Phone}>
                      <input value={general.support_phone} onChange={e => setGeneral(p => ({ ...p, support_phone: e.target.value }))} className={inputCls} />
                    </Field>
                    <Field label="Website" icon={Globe}>
                      <input value={general.website} onChange={e => setGeneral(p => ({ ...p, website: e.target.value }))} className={inputCls} />
                    </Field>
                    <Field label="Address" icon={MapPin}>
                      <input value={general.address} onChange={e => setGeneral(p => ({ ...p, address: e.target.value }))} className={inputCls} />
                    </Field>
                  </div>
                </Section>

                <Section title="Localization" subtitle="Language, timezone and date format">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Field label="Language" icon={Languages}>
                      <select value={general.language} onChange={e => setGeneral(p => ({ ...p, language: e.target.value }))} className={inputCls}>
                        {LANGUAGES.map(l => <option key={l}>{l}</option>)}
                      </select>
                    </Field>
                    <Field label="Timezone" icon={Clock}>
                      <select value={general.timezone} onChange={e => setGeneral(p => ({ ...p, timezone: e.target.value }))} className={inputCls}>
                        {TIMEZONES.map(t => <option key={t}>{t}</option>)}
                      </select>
                    </Field>
                    <Field label="Date Format">
                      <select value={general.date_format} onChange={e => setGeneral(p => ({ ...p, date_format: e.target.value }))} className={inputCls}>
                        {DATE_FORMATS.map(f => <option key={f}>{f}</option>)}
                      </select>
                    </Field>
                  </div>
                </Section>

                <Section title="Registration" subtitle="Control how students can join">
                  <Toggle
                    label="Open Registration"
                    description="Allow new students to register without an invitation"
                    value={registrationOpen}
                    onChange={setRegistrationOpen}
                  />
                  <Toggle
                    label="Require Email Verification"
                    description="Students must verify their email before accessing content"
                    value={requireEmailVerify}
                    onChange={setRequireEmailVerify}
                  />
                </Section>
              </>
            )}

            {/* NOTIFICATIONS */}
            {activeTab === 'notifications' && (
              <Section title="Email Notifications" subtitle="Choose which events trigger email alerts">
                <Toggle label={NOTIF_LABELS.email_new_enrollment.label}      description={NOTIF_LABELS.email_new_enrollment.desc}      value={notifs.email_new_enrollment}      onChange={v => setNotifs(p => ({ ...p, email_new_enrollment: v }))} />
                <Toggle label={NOTIF_LABELS.email_quiz_submitted.label}      description={NOTIF_LABELS.email_quiz_submitted.desc}      value={notifs.email_quiz_submitted}      onChange={v => setNotifs(p => ({ ...p, email_quiz_submitted: v }))} />
                <Toggle label={NOTIF_LABELS.email_certificate_issued.label}  description={NOTIF_LABELS.email_certificate_issued.desc}  value={notifs.email_certificate_issued}  onChange={v => setNotifs(p => ({ ...p, email_certificate_issued: v }))} />
                <Toggle label={NOTIF_LABELS.email_payment_received.label}    description={NOTIF_LABELS.email_payment_received.desc}    value={notifs.email_payment_received}    onChange={v => setNotifs(p => ({ ...p, email_payment_received: v }))} />
                <Toggle label={NOTIF_LABELS.system_maintenance_alerts.label} description={NOTIF_LABELS.system_maintenance_alerts.desc} value={notifs.system_maintenance_alerts} onChange={v => setNotifs(p => ({ ...p, system_maintenance_alerts: v }))} />
                <Toggle label={NOTIF_LABELS.weekly_report.label}             description={NOTIF_LABELS.weekly_report.desc}             value={notifs.weekly_report}             onChange={v => setNotifs(p => ({ ...p, weekly_report: v }))} />
              </Section>
            )}

            {/* EMAIL */}
            {activeTab === 'email' && (
              <>
                <Section title="SMTP Configuration" subtitle="Configure outgoing email server">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Field label="SMTP Host">
                      <input value={emailSettings.smtp_host} onChange={e => setEmailSettings(p => ({ ...p, smtp_host: e.target.value }))} className={inputCls} />
                    </Field>
                    <Field label="SMTP Port">
                      <input value={emailSettings.smtp_port} onChange={e => setEmailSettings(p => ({ ...p, smtp_port: e.target.value }))} className={inputCls} />
                    </Field>
                    <Field label="SMTP Username">
                      <input value={emailSettings.smtp_user} onChange={e => setEmailSettings(p => ({ ...p, smtp_user: e.target.value }))} className={inputCls} />
                    </Field>
                    <Field label="SMTP Password">
                      <input type="password" placeholder="••••••••" value={emailSettings.smtp_password} onChange={e => setEmailSettings(p => ({ ...p, smtp_password: e.target.value }))} className={inputCls} />
                    </Field>
                  </div>
                </Section>
                <Section title="Sender Details" subtitle="How emails appear to recipients">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Field label="From Name">
                      <input value={emailSettings.from_name} onChange={e => setEmailSettings(p => ({ ...p, from_name: e.target.value }))} className={inputCls} />
                    </Field>
                    <Field label="From Email">
                      <input type="email" value={emailSettings.from_email} onChange={e => setEmailSettings(p => ({ ...p, from_email: e.target.value }))} className={inputCls} />
                    </Field>
                    <Field label="Reply-To Email">
                      <input type="email" value={emailSettings.reply_to} onChange={e => setEmailSettings(p => ({ ...p, reply_to: e.target.value }))} className={inputCls} />
                    </Field>
                  </div>
                  <button className="mt-3 text-sm text-indigo-600 font-semibold hover:underline">Send Test Email</button>
                </Section>
              </>
            )}

            {/* SECURITY */}
            {activeTab === 'security' && (
              <>
                <Section title="Authentication" subtitle="Login and account security settings">
                  <Toggle
                    label="Two-Factor Authentication"
                    description="Require admins to use 2FA when signing in"
                    value={twoFactor}
                    onChange={setTwoFactor}
                  />
                  <Toggle
                    label="Require Strong Passwords"
                    description="Enforce minimum 8 characters, uppercase, number, and symbol"
                    value={strongPasswords}
                    onChange={setStrongPasswords}
                  />
                  <Toggle
                    label="Auto Logout on Inactivity"
                    description="Automatically log out users after 30 minutes of inactivity"
                    value={autoLogout}
                    onChange={setAutoLogout}
                  />
                </Section>
                <Section title="Session Settings" subtitle="Control active session behaviour">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Field label="Session Timeout (minutes)">
                      <input type="number" value={sessionTimeoutMinutes} onChange={e => setSessionTimeoutMinutes(Number(e.target.value) || 30)} className={inputCls} />
                    </Field>
                    <Field label="Max Login Attempts">
                      <input type="number" value={maxLoginAttempts} onChange={e => setMaxLoginAttempts(Number(e.target.value) || 5)} className={inputCls} />
                    </Field>
                  </div>
                </Section>
              </>
            )}

            {/* ADVANCED */}
            {activeTab === 'advanced' && (
              <>
                <Section title="Maintenance Mode" subtitle="Take the platform offline for maintenance">
                  <div className={cn('rounded-xl p-4 border', maintenance ? 'bg-rose-50 border-rose-200' : 'bg-slate-50 border-slate-200')}>
                    <Toggle
                      label="Enable Maintenance Mode"
                      description="Students and teachers will see a maintenance notice until this is disabled"
                      value={maintenance}
                      onChange={v => { setMaintenance(v); if (v) toast.warning('Maintenance mode enabled — users cannot access the platform.'); }}
                    />
                    {maintenance && (
                      <div className="mt-3 flex items-start gap-2 bg-rose-100 text-rose-700 rounded-lg px-3 py-2.5 text-sm">
                        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                        Platform is currently offline for all students and teachers.
                      </div>
                    )}
                  </div>
                </Section>
                <Section title="Feature Toggles" subtitle="Enable or disable important modules across the platform">
                  <Toggle
                    label="Community"
                    description="Show community pages for students, teachers, and admins"
                    value={features.communityEnabled}
                    onChange={v => setFeatures(p => ({ ...p, communityEnabled: v }))}
                  />
                  <Toggle
                    label="Live Sessions"
                    description="Enable live sessions and live classes navigation and routes"
                    value={features.liveSessionsEnabled}
                    onChange={v => setFeatures(p => ({ ...p, liveSessionsEnabled: v }))}
                  />
                  <Toggle
                    label="Announcements"
                    description="Enable announcement pages for admins and teachers"
                    value={features.announcementsEnabled}
                    onChange={v => setFeatures(p => ({ ...p, announcementsEnabled: v }))}
                  />
                  <Toggle
                    label="Payments & Invoices"
                    description="Enable business pages and payment/invoice management"
                    value={features.paymentsEnabled}
                    onChange={v => setFeatures(p => ({ ...p, paymentsEnabled: v }))}
                  />
                  <Toggle
                    label="Telegram Error Alerts"
                    description="Send backend error alerts to Telegram when incidents happen"
                    value={telegramErrorAlerts}
                    onChange={setTelegramErrorAlerts}
                  />
                </Section>
                <Section title="Data & Storage" subtitle="Manage platform data settings">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Field label="Max File Upload Size (MB)">
                      <input type="number" defaultValue={50} className={inputCls} />
                    </Field>
                    <Field label="Allowed File Types">
                      <input defaultValue="pdf, jpg, png, mp4, docx" className={inputCls} />
                    </Field>
                  </div>
                  <div className="mt-4 pt-4 border-t border-slate-100 flex gap-3">
                    <button className="text-sm text-indigo-600 font-semibold hover:underline">Export All Data</button>
                    <button className="text-sm text-rose-600 font-semibold hover:underline">Clear Cache</button>
                  </div>
                </Section>
              </>
            )}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}

const inputCls = 'w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 bg-white text-slate-800 placeholder:text-slate-400';

const NOTIF_LABELS: Record<string, { label: string; desc: string }> = {
  email_new_enrollment:       { label: 'New Enrollment',         desc: 'Notify when a student enrolls in a course' },
  email_quiz_submitted:       { label: 'Quiz Submitted',         desc: 'Notify when a student submits a quiz attempt' },
  email_certificate_issued:   { label: 'Certificate Issued',     desc: 'Notify when a certificate is issued to a student' },
  email_payment_received:     { label: 'Payment Received',       desc: 'Notify when a payment is successfully processed' },
  system_maintenance_alerts:  { label: 'Maintenance Alerts',     desc: 'Receive alerts about system health and maintenance' },
  weekly_report:              { label: 'Weekly Summary Report',  desc: 'Receive a weekly digest of platform activity' },
};

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-4">
      <div className="pb-3 border-b border-slate-100">
        <h3 className="text-base font-bold text-slate-900">{title}</h3>
        {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

function Field({ label, icon: Icon, children }: { label: string; icon?: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide">{label}</label>
      {children}
    </div>
  );
}

function Toggle({ label, description, value, onChange }: { label: string; description: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3 border-b border-slate-50 last:border-0">
      <div>
        <p className="text-sm font-semibold text-slate-800">{label}</p>
        <p className="text-xs text-slate-400 mt-0.5">{description}</p>
      </div>
      <button
        onClick={() => onChange(!value)}
        className={cn('shrink-0 w-11 h-6 rounded-full transition-colors relative mt-0.5', value ? 'bg-indigo-600' : 'bg-slate-200')}
      >
        <span className={cn('absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform', value ? 'translate-x-5' : 'translate-x-0')} />
      </button>
    </div>
  );
}
