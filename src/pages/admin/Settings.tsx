import React, { useEffect, useState } from 'react';
import AdminLayout from '../../components/layout/AdminLayout';
import { cn } from '../../lib/utils';
import LoadingButton from '../../components/ui/LoadingButton';
import { toast } from 'sonner';
import { authFetch } from '../../lib/apiUrl';
import { defaultFeatureFlags, FeatureFlags } from '../../lib/platformFeatures';
import { useTranslation } from 'react-i18next';
import {
  Settings, Globe, Bell, Shield, Database, Mail,
  Clock, Languages, Save, ToggleLeft, ToggleRight,
  ChevronRight, School, Phone, MapPin, AlertTriangle,
  GraduationCap, Briefcase, Crown, Info
} from 'lucide-react';

type Role = 'student' | 'teacher' | 'admin';
type RoleBoolMap = Record<Role, boolean>;
type RoleNumMap = Record<Role, number>;

interface GeneralForm {
  school_name: string;
  tagline: string;
  contact_email: string;
  support_phone: string;
  website: string;
  address: string;
  language: string;
  timezone: string;
  date_format: string;
}

const LANGUAGES = ['English', 'Albanian', 'German', 'French', 'Spanish'];
const TIMEZONES = ['UTC', 'Europe/Tirane', 'Europe/Berlin', 'America/New_York'];
const DATE_FORMATS = ['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'];

const ROLES: { id: Role; label: string; icon: React.ElementType }[] = [
  { id: 'student', label: 'Student', icon: GraduationCap },
  { id: 'teacher', label: 'Teacher', icon: Briefcase },
  { id: 'admin',   label: 'Admin',   icon: Crown },
];

const TABS = [
  { id: 'general',       label: 'General',       icon: School },
  { id: 'notifications', label: 'Notifications',  icon: Bell },
  { id: 'email',         label: 'Email',          icon: Mail },
  { id: 'security',      label: 'Security',       icon: Shield },
  { id: 'advanced',      label: 'Advanced',       icon: Database },
];

export default function AdminSettings() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState('general');
  const [saving, setSaving] = useState(false);
  const [maintenance, setMaintenance] = useState(false);
  const [registrationOpen, setRegistrationOpen] = useState(true);
  const [requireEmailVerify, setRequireEmailVerify] = useState(true);
  const [strongPasswords, setStrongPasswords] = useState<RoleBoolMap>({ student: true, teacher: true, admin: true });
  const [autoLogout, setAutoLogout] = useState<RoleBoolMap>({ student: true, teacher: true, admin: true });
  const [sessionTimeoutMinutes, setSessionTimeoutMinutes] = useState<RoleNumMap>({ student: 30, teacher: 30, admin: 30 });
  const [maxLoginAttempts, setMaxLoginAttempts] = useState<RoleNumMap>({ student: 5, teacher: 5, admin: 5 });
  const [telegramErrorAlerts, setTelegramErrorAlerts] = useState(true);
  const [features, setFeatures] = useState<FeatureFlags>(defaultFeatureFlags);

  const TABS_LOCAL = [
    { id: 'general',       label: t('settings.tabs.general'),       icon: School },
    { id: 'notifications', label: t('settings.tabs.notifications'),  icon: Bell },
    { id: 'email',         label: t('settings.tabs.email'),          icon: Mail },
    { id: 'security',      label: t('settings.tabs.security'),       icon: Shield },
    { id: 'advanced',      label: t('settings.tabs.advanced'),       icon: Database },
  ];

  const NOTIF_LABELS_LOCAL: Record<string, { label: string; desc: string }> = {
    email_new_enrollment: { label: t('settings.notifications.enrollment'), desc: t('settings.notifications.enrollmentDesc') },
    email_quiz_submitted: { label: t('settings.notifications.enrollment'), desc: t('settings.notifications.enrollmentDesc') },
    email_certificate_issued: { label: t('settings.notifications.enrollment'), desc: t('settings.notifications.enrollmentDesc') },
    email_payment_received: { label: t('settings.notifications.payments'), desc: t('settings.notifications.paymentsDesc') },
    system_maintenance_alerts: { label: t('settings.notifications.system'), desc: t('settings.notifications.systemDesc') },
    weekly_report: { label: t('settings.notifications.system'), desc: t('settings.notifications.systemDesc') },
  };

  const [general, setGeneral] = useState<GeneralForm>({
    school_name: 'QuizMaster Academy',
    tagline: 'The smart way to teach & learn',
    contact_email: 'admin@quizmaster.com',
    support_phone: '+355 69 123 4567',
    website: 'https://quizmaster-academy.com',
    address: 'Tirana, Albania',
    language: 'English',
    timezone: 'Europe/Tirane',
    date_format: 'DD/MM/YYYY',
  });

  const [notifs, setNotifs] = useState<Record<string, RoleBoolMap>>({
    email_new_enrollment: { student: true, teacher: true, admin: true },
    email_quiz_submitted: { student: false, teacher: true, admin: true },
    email_certificate_issued: { student: true, teacher: false, admin: true },
    email_payment_received: { student: true, teacher: false, admin: true },
    system_maintenance_alerts: { student: false, teacher: false, admin: true },
    weekly_report: { student: false, teacher: false, admin: true },
  });

  const [emailSettings, setEmailSettings] = useState({
    smtp_host: 'smtp.gmail.com',
    smtp_port: '587',
    smtp_user: '',
    smtp_password: '',
    from_name: 'QuizMaster Academy',
    from_email: 'noreply@quizmaster.com',
    reply_to: 'support@quizmaster.com',
    brevo_api_key: '',
    brevo_sender_name: 'QuizMaster',
    brevo_sender_email: '',
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
            security: {
              registrationOpen,
              requireEmailVerify,
              strongPasswords,
              autoLogout,
              sessionTimeoutMinutes,
              maxLoginAttempts,
            },
            advanced: {
              maintenance,
              telegramErrorAlerts,
            },
            features,
          },
        }),
      });
      const json = await res.json();
      if (!res.ok || !json?.success) throw new Error(json?.error || t('settings.toasts.failed'));
      window.dispatchEvent(new CustomEvent('settings-updated'));
      toast.success(t('settings.toasts.saved'));
    } catch (e: any) {
      toast.error(e?.message || t('settings.toasts.failed'));
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/admin/config/settings');
        const json = await res.json();
        if (!json.success || !json.config?.value) return;
        const v = json.config.value;
        if (v.general) setGeneral(prev => ({ ...prev, ...v.general }));
        if (v.notifications) setNotifs(prev => ({ ...prev, ...v.notifications }));
        if (v.email) setEmailSettings(prev => ({ ...prev, ...v.email }));
        if (v.security) {
          const asRoleBool = (obj: any, def: boolean): RoleBoolMap => ({
            student: typeof obj?.student === 'boolean' ? obj.student : def,
            teacher: typeof obj?.teacher === 'boolean' ? obj.teacher : def,
            admin:   typeof obj?.admin   === 'boolean' ? obj.admin   : def,
          });
          const asRoleNum = (obj: any, def: number): RoleNumMap => ({
            student: typeof obj?.student === 'number' ? obj.student : def,
            teacher: typeof obj?.teacher === 'number' ? obj.teacher : def,
            admin:   typeof obj?.admin   === 'number' ? obj.admin   : def,
          });

          if (typeof v.security.requireEmailVerify === 'boolean') setRequireEmailVerify(v.security.requireEmailVerify);
          if (typeof v.security.registrationOpen === 'boolean') setRegistrationOpen(v.security.registrationOpen);
          setStrongPasswords(asRoleBool(v.security.strongPasswords, true));
          setAutoLogout(asRoleBool(v.security.autoLogout, true));
          setSessionTimeoutMinutes(asRoleNum(v.security.sessionTimeoutMinutes, 30));
          setMaxLoginAttempts(asRoleNum(v.security.maxLoginAttempts, 5));
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
            <h1 className="text-2xl font-bold text-slate-900">{t('settings.title')}</h1>
            <p className="text-sm text-slate-500 mt-0.5">{t('settings.subtitle')}</p>
          </div>
          <LoadingButton
            onClick={handleSave}
            loading={saving}
            icon={<Save className="w-4 h-4" />}
            className="bg-indigo-600 hover:bg-indigo-700 px-4 py-2.5"
          >
            {t('settings.saveChanges')}
          </LoadingButton>
        </div>

        <div className="flex flex-col lg:flex-row gap-6">
          {/* Sidebar Tabs */}
          <div className="lg:w-56 shrink-0">
            <nav className="bg-white rounded-2xl border border-slate-100 shadow-sm p-2 space-y-0.5">
              {TABS_LOCAL.map(tab => {
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
                <Section title={t('settings.general.schoolInfo')} subtitle={t('settings.general.schoolInfoDesc')}>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Field label={t('settings.general.schoolName')} icon={School}>
                      <input value={general.school_name} onChange={e => setGeneral(p => ({ ...p, school_name: e.target.value }))} className={inputCls} />
                    </Field>
                    <Field label={t('settings.general.tagline')}>
                      <input value={general.tagline} onChange={e => setGeneral(p => ({ ...p, tagline: e.target.value }))} className={inputCls} />
                    </Field>
                    <Field label={t('settings.general.contactEmail')} icon={Mail}>
                      <input type="email" value={general.contact_email} onChange={e => setGeneral(p => ({ ...p, contact_email: e.target.value }))} className={inputCls} />
                    </Field>
                    <Field label={t('settings.general.supportPhone')} icon={Phone}>
                      <input value={general.support_phone} onChange={e => setGeneral(p => ({ ...p, support_phone: e.target.value }))} className={inputCls} />
                    </Field>
                    <Field label={t('settings.general.website')} icon={Globe}>
                      <input value={general.website} onChange={e => setGeneral(p => ({ ...p, website: e.target.value }))} className={inputCls} />
                    </Field>
                    <Field label={t('settings.general.address')} icon={MapPin}>
                      <input value={general.address} onChange={e => setGeneral(p => ({ ...p, address: e.target.value }))} className={inputCls} />
                    </Field>
                  </div>
                </Section>

                <Section title={t('settings.general.localization')} subtitle={t('settings.general.localizationDesc')}>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Field label={t('settings.general.language')} icon={Languages}>
                      <select value={general.language} onChange={e => setGeneral(p => ({ ...p, language: e.target.value }))} className={inputCls}>
                        {LANGUAGES.map(l => <option key={l}>{l}</option>)}
                      </select>
                    </Field>
                    <Field label={t('settings.general.timezone')} icon={Clock}>
                      <select value={general.timezone} onChange={e => setGeneral(p => ({ ...p, timezone: e.target.value }))} className={inputCls}>
                        {TIMEZONES.map(t => <option key={t}>{t}</option>)}
                      </select>
                    </Field>
                    <Field label={t('settings.general.dateFormat')}>
                      <select value={general.date_format} onChange={e => setGeneral(p => ({ ...p, date_format: e.target.value }))} className={inputCls}>
                        {DATE_FORMATS.map(f => <option key={f}>{f}</option>)}
                      </select>
                    </Field>
                  </div>
                </Section>

                <Section title={t('settings.general.registration')} subtitle={t('settings.general.registrationDesc')}>
                  <Toggle
                    label={t('settings.general.openRegistration')}
                    description={t('settings.general.openRegistrationDesc')}
                    value={registrationOpen}
                    onChange={setRegistrationOpen}
                  />
                  <Toggle
                    label={t('settings.general.requireEmailVerify')}
                    description={t('settings.general.requireEmailVerifyDesc')}
                    value={requireEmailVerify}
                    onChange={setRequireEmailVerify}
                  />
                </Section>
              </>
            )}

            {/* NOTIFICATIONS */}
            {activeTab === 'notifications' && (
              <>
                {/* Legend */}
                <div className="bg-gradient-to-br from-indigo-50 to-blue-50 border border-indigo-100 rounded-2xl p-4 flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-white flex items-center justify-center shrink-0 shadow-sm">
                    <Bell className="w-4 h-4 text-indigo-600" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-900">{t('settings.notifications.controlTitle')}</p>
                    <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                      {t('settings.notifications.controlDesc')}
                      <span className="inline-flex items-center gap-1 ml-1">
                        <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" /> {t('settings.notifications.roles.students')}
                        <span className="inline-block w-2 h-2 rounded-full bg-violet-500 ml-1" /> {t('settings.notifications.roles.teachers')}
                        <span className="inline-block w-2 h-2 rounded-full bg-amber-500 ml-1" /> {t('settings.notifications.roles.admins')}
                      </span>
                    </p>
                  </div>
                </div>

                <Section title={t('settings.notifications.enrollment')} subtitle={t('settings.notifications.enrollmentDesc')}>
                  <RoleToggleRow
                    label={NOTIF_LABELS_LOCAL.email_new_enrollment.label}
                    description={NOTIF_LABELS_LOCAL.email_new_enrollment.desc}
                    value={notifs.email_new_enrollment}
                    onChange={v => setNotifs(p => ({ ...p, email_new_enrollment: v }))}
                  />
                  <RoleToggleRow
                    label={NOTIF_LABELS_LOCAL.email_quiz_submitted.label}
                    description={NOTIF_LABELS_LOCAL.email_quiz_submitted.desc}
                    value={notifs.email_quiz_submitted}
                    onChange={v => setNotifs(p => ({ ...p, email_quiz_submitted: v }))}
                  />
                  <RoleToggleRow
                    label={NOTIF_LABELS_LOCAL.email_certificate_issued.label}
                    description={NOTIF_LABELS_LOCAL.email_certificate_issued.desc}
                    value={notifs.email_certificate_issued}
                    onChange={v => setNotifs(p => ({ ...p, email_certificate_issued: v }))}
                  />
                </Section>

                <Section title={t('settings.notifications.payments')} subtitle={t('settings.notifications.paymentsDesc')}>
                  <RoleToggleRow
                    label={NOTIF_LABELS_LOCAL.email_payment_received.label}
                    description={NOTIF_LABELS_LOCAL.email_payment_received.desc}
                    value={notifs.email_payment_received}
                    onChange={v => setNotifs(p => ({ ...p, email_payment_received: v }))}
                  />
                </Section>

                <Section title={t('settings.notifications.system')} subtitle={t('settings.notifications.systemDesc')}>
                  <RoleToggleRow
                    label={NOTIF_LABELS_LOCAL.system_maintenance_alerts.label}
                    description={NOTIF_LABELS_LOCAL.system_maintenance_alerts.desc}
                    value={notifs.system_maintenance_alerts}
                    onChange={v => setNotifs(p => ({ ...p, system_maintenance_alerts: v }))}
                  />
                  <RoleToggleRow
                    label={NOTIF_LABELS_LOCAL.weekly_report.label}
                    description={NOTIF_LABELS_LOCAL.weekly_report.desc}
                    value={notifs.weekly_report}
                    onChange={v => setNotifs(p => ({ ...p, weekly_report: v }))}
                  />
                </Section>
              </>
            )}

            {/* EMAIL */}
            {activeTab === 'email' && (
              <>
                <Section title={t('settings.email.smtpTitle')} subtitle={t('settings.email.smtpDesc')}>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Field label={t('settings.email.host')}>
                      <input value={emailSettings.smtp_host} onChange={e => setEmailSettings(p => ({ ...p, smtp_host: e.target.value }))} className={inputCls} />
                    </Field>
                    <Field label={t('settings.email.port')}>
                      <input value={emailSettings.smtp_port} onChange={e => setEmailSettings(p => ({ ...p, smtp_port: e.target.value }))} className={inputCls} />
                    </Field>
                    <Field label={t('settings.email.user')}>
                      <input value={emailSettings.smtp_user} onChange={e => setEmailSettings(p => ({ ...p, smtp_user: e.target.value }))} className={inputCls} />
                    </Field>
                    <Field label={t('settings.email.password')}>
                      <input type="password" placeholder="••••••••" value={emailSettings.smtp_password} onChange={e => setEmailSettings(p => ({ ...p, smtp_password: e.target.value }))} className={inputCls} />
                    </Field>
                  </div>
                </Section>
                <Section title={t('settings.email.senderTitle')} subtitle={t('settings.email.senderDesc')}>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Field label={t('settings.email.fromName')}>
                      <input value={emailSettings.from_name} onChange={e => setEmailSettings(p => ({ ...p, from_name: e.target.value }))} className={inputCls} />
                    </Field>
                    <Field label={t('settings.email.fromEmail')}>
                      <input type="email" value={emailSettings.from_email} onChange={e => setEmailSettings(p => ({ ...p, from_email: e.target.value }))} className={inputCls} />
                    </Field>
                    <Field label={t('settings.email.replyTo')}>
                      <input type="email" value={emailSettings.reply_to} onChange={e => setEmailSettings(p => ({ ...p, reply_to: e.target.value }))} className={inputCls} />
                    </Field>
                  </div>

                  <div className="mt-6 pt-5 border-t border-slate-200/70">
                    <div className="flex items-start gap-3 mb-4">
                      <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0">
                        <Shield className="w-4 h-4 text-indigo-600" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-900">{t('settings.email.otpTitle')}</p>
                        <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                          {t('settings.email.otpDesc')}
                        </p>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <Field label={t('settings.email.apiKey')}>
                        <input
                          type="password"
                          autoComplete="off"
                          placeholder="xkeysib-..."
                          value={emailSettings.brevo_api_key}
                          onChange={e => setEmailSettings(p => ({ ...p, brevo_api_key: e.target.value }))}
                          className={inputCls}
                        />
                      </Field>
                      <Field label={t('settings.email.otpSenderName')}>
                        <input
                          placeholder="QuizMaster"
                          value={emailSettings.brevo_sender_name}
                          onChange={e => setEmailSettings(p => ({ ...p, brevo_sender_name: e.target.value }))}
                          className={inputCls}
                        />
                      </Field>
                      <div className="md:col-span-2">
                        <Field label={t('settings.email.otpSenderEmail')}>
                          <input
                            type="email"
                            placeholder="otp@yourdomain.com"
                            value={emailSettings.brevo_sender_email}
                            onChange={e => setEmailSettings(p => ({ ...p, brevo_sender_email: e.target.value }))}
                            className={inputCls}
                          />
                        </Field>
                      </div>
                    </div>
                  </div>

                  <button className="mt-3 text-sm text-indigo-600 font-semibold hover:underline">{t('settings.email.sendTest')}</button>
                </Section>
              </>
            )}

            {/* SECURITY */}
            {activeTab === 'security' && (
              <>
                <div className="bg-gradient-to-br from-indigo-50 to-blue-50 border border-indigo-100 rounded-2xl p-4 flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-white flex items-center justify-center shrink-0 shadow-sm">
                    <Shield className="w-4 h-4 text-indigo-600" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-900">{t('settings.security.policiesTitle')}</p>
                    <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                      {t('settings.security.policiesDesc')}
                    </p>
                  </div>
                </div>

                <Section title={t('settings.security.strongPasswords')} subtitle={t('settings.security.strongPasswordsDesc')}>
                  <RoleToggleRow
                    label={t('settings.security.requireStrongPasswords')}
                    description={t('settings.security.requireStrongPasswordsDesc')}
                    value={strongPasswords}
                    onChange={setStrongPasswords}
                  />
                  <RoleToggleRow
                    label={t('settings.security.autoLogout')}
                    description={t('settings.security.autoLogoutDesc')}
                    value={autoLogout}
                    onChange={setAutoLogout}
                  />
                </Section>

                <Section title={t('settings.security.sessionTitle')} subtitle={t('settings.security.sessionDesc')}>
                  <RoleNumberRow
                    label={t('settings.security.sessionTimeout')}
                    description={t('settings.security.sessionTimeoutDesc')}
                    value={sessionTimeoutMinutes}
                    onChange={setSessionTimeoutMinutes}
                    min={1}
                    max={1440}
                    suffix="min"
                  />
                  <RoleNumberRow
                    label={t('settings.security.maxLoginAttempts')}
                    description={t('settings.security.maxLoginAttemptsDesc')}
                    value={maxLoginAttempts}
                    onChange={setMaxLoginAttempts}
                    min={1}
                    max={20}
                    suffix="tries"
                  />
                </Section>
              </>
            )}

            {/* ADVANCED */}
            {activeTab === 'advanced' && (
              <>
                <Section title={t('settings.advanced.maintenanceTitle')} subtitle={t('settings.advanced.maintenanceSubtitle')}>
                  <div className={cn('rounded-xl p-4 border', maintenance ? 'bg-rose-50 border-rose-200' : 'bg-slate-50 border-slate-200')}>
                    <Toggle
                      label={t('settings.advanced.maintenance')}
                      description={t('settings.advanced.maintenanceDesc')}
                      value={maintenance}
                      onChange={v => { setMaintenance(v); if (v) toast.warning(t('settings.advanced.maintenanceEnabledToast')); }}
                    />
                    {maintenance && (
                      <div className="mt-3 flex items-start gap-2 bg-rose-100 text-rose-700 rounded-lg px-3 py-2.5 text-sm">
                        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                        {t('settings.advanced.maintenanceNotice')}
                      </div>
                    )}
                  </div>
                </Section>
                <Section title={t('settings.features.title')} subtitle={t('settings.features.subtitle')}>
                  <Toggle
                    label={t('settings.features.community')}
                    description={t('settings.features.communityDesc')}
                    value={features.communityEnabled}
                    onChange={v => setFeatures(p => ({ ...p, communityEnabled: v }))}
                  />
                  <Toggle
                    label={t('settings.features.live')}
                    description={t('settings.features.liveDesc')}
                    value={features.liveSessionsEnabled}
                    onChange={v => setFeatures(p => ({ ...p, liveSessionsEnabled: v }))}
                  />
                  <Toggle
                    label={t('settings.features.announcements')}
                    description={t('settings.features.announcementsDesc')}
                    value={features.announcementsEnabled}
                    onChange={v => setFeatures(p => ({ ...p, announcementsEnabled: v }))}
                  />
                  <Toggle
                    label={t('settings.features.payments')}
                    description={t('settings.features.paymentsDesc')}
                    value={features.paymentsEnabled}
                    onChange={v => setFeatures(p => ({ ...p, paymentsEnabled: v }))}
                  />
                  <Toggle
                    label={t('settings.advanced.telegram')}
                    description={t('settings.advanced.telegramDesc')}
                    value={telegramErrorAlerts}
                    onChange={setTelegramErrorAlerts}
                  />
                </Section>
                <Section title={t('settings.advanced.dataStorage')} subtitle={t('settings.advanced.dataStorageDesc')}>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Field label={t('settings.advanced.maxFileUpload')}>
                      <input type="number" defaultValue={50} className={inputCls} />
                    </Field>
                    <Field label={t('settings.advanced.allowedFileTypes')}>
                      <input defaultValue="pdf, jpg, png, mp4, docx" className={inputCls} />
                    </Field>
                  </div>
                  <div className="mt-4 pt-4 border-t border-slate-100 flex gap-3">
                    <button className="text-sm text-indigo-600 font-semibold hover:underline">{t('settings.advanced.exportData')}</button>
                    <button className="text-sm text-rose-600 font-semibold hover:underline">{t('settings.advanced.clearCache')}</button>
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

function Section({ title, subtitle, children, className }: { title: string; subtitle?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-4", className)}>
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

function Toggle({ label, description, value, onChange, variant = 'primary' }: { label: string; description?: string; value: boolean; onChange: (v: boolean) => void; variant?: 'primary' | 'danger' }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3 border-b border-slate-50 last:border-0">
      <div>
        <p className="text-sm font-semibold text-slate-800">{label}</p>
        {description && <p className="text-xs text-slate-400 mt-0.5">{description}</p>}
      </div>
      <button
        onClick={() => onChange(!value)}
        className={cn(
          'shrink-0 w-11 h-6 rounded-full transition-colors relative mt-0.5',
          value ? (variant === 'danger' ? 'bg-rose-600' : 'bg-indigo-600') : 'bg-slate-200'
        )}
      >
        <span className={cn('absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform', value ? 'translate-x-5' : 'translate-x-0')} />
      </button>
    </div>
  );
}

const ROLE_COLORS: Record<Role, { on: string; off: string; ring: string }> = {
  student: { on: 'bg-emerald-500 border-emerald-500 text-white', off: 'bg-white border-slate-200 text-slate-500 hover:border-emerald-300', ring: 'focus:ring-emerald-300' },
  teacher: { on: 'bg-violet-500 border-violet-500 text-white',   off: 'bg-white border-slate-200 text-slate-500 hover:border-violet-300', ring: 'focus:ring-violet-300' },
  admin:   { on: 'bg-amber-500 border-amber-500 text-white',     off: 'bg-white border-slate-200 text-slate-500 hover:border-amber-300', ring: 'focus:ring-amber-300' },
};

function RoleToggleRow({ label, description, value, onChange }: {
  label: string; description: string;
  value: RoleBoolMap; onChange: (v: RoleBoolMap) => void;
}) {
  const { t } = useTranslation();
  const allOn  = ROLES.every(r => value[r.id]);
  const allOff = ROLES.every(r => !value[r.id]);
  const enabledCount = ROLES.filter(r => value[r.id]).length;

  return (
    <div className="py-4 border-b border-slate-100 last:border-0">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <p className="text-sm font-bold text-slate-800">{label}</p>
            <span className={cn(
              'text-[10px] font-bold px-2 py-0.5 rounded-md',
              allOn ? 'bg-emerald-50 text-emerald-700' : allOff ? 'bg-slate-100 text-slate-500' : 'bg-amber-50 text-amber-700'
            )}>
              {allOn ? t('settings.common.allOn') : allOff ? t('settings.common.off') : `${enabledCount}/3`}
            </span>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed pr-2">{description}</p>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {ROLES.map(r => {
            const Icon = r.icon;
            const on = value[r.id];
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => onChange({ ...value, [r.id]: !on })}
                className={cn(
                  'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11px] font-bold border transition-all focus:outline-none focus:ring-2',
                  on ? ROLE_COLORS[r.id].on : ROLE_COLORS[r.id].off,
                  ROLE_COLORS[r.id].ring
                )}
                title={`${on ? 'Disable for' : 'Enable for'} ${r.label}`}
              >
                <Icon className="w-3 h-3" />
                {t(`settings.notifications.roles.${r.id}s`)}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function RoleNumberRow({ label, description, value, onChange, min = 1, max = 9999, suffix }: {
  label: string; description: string;
  value: RoleNumMap; onChange: (v: RoleNumMap) => void;
  min?: number; max?: number; suffix?: string;
}) {
  const { t } = useTranslation();
  const same = value.student === value.teacher && value.teacher === value.admin;

  return (
    <div className="py-4 border-b border-slate-100 last:border-0">
      <div className="flex items-center gap-2 mb-1">
        <p className="text-sm font-bold text-slate-800">{label}</p>
        {same && (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-500">
            {t('settings.common.sameForAll')}
          </span>
        )}
      </div>
      <p className="text-xs text-slate-400 leading-relaxed mb-3 pr-2">{description}</p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        {ROLES.map(r => {
          const Icon = r.icon;
          const colorMap: Record<Role, string> = {
            student: 'border-emerald-200 bg-emerald-50/40 focus-within:ring-emerald-300 focus-within:border-emerald-400',
            teacher: 'border-violet-200 bg-violet-50/40 focus-within:ring-violet-300 focus-within:border-violet-400',
            admin:   'border-amber-200 bg-amber-50/40 focus-within:ring-amber-300 focus-within:border-amber-400',
          };
          const iconColor: Record<Role, string> = {
            student: 'text-emerald-600', teacher: 'text-violet-600', admin: 'text-amber-600',
          };
          return (
            <div
              key={r.id}
              className={cn(
                'flex items-center gap-2 px-3 py-2 rounded-xl border transition-all focus-within:ring-2',
                colorMap[r.id]
              )}
            >
              <Icon className={cn('w-4 h-4 shrink-0', iconColor[r.id])} />
              <div className="flex-1 min-w-0">
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wide leading-none">
                  {t(`settings.notifications.roles.${r.id}s`)}
                </div>
                <div className="flex items-baseline gap-1.5 mt-0.5">
                  <input
                    type="number"
                    min={min}
                    max={max}
                    value={value[r.id]}
                    onChange={e => {
                      const n = Number(e.target.value);
                      const safe = Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : min;
                      onChange({ ...value, [r.id]: safe });
                    }}
                    className="w-full bg-transparent border-0 p-0 text-base font-black text-slate-900 focus:outline-none focus:ring-0"
                  />
                  {suffix && <span className="text-[10px] font-bold text-slate-400 shrink-0">{suffix}</span>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
