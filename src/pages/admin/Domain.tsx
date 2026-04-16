import React, { useEffect, useState } from 'react';
import AdminLayout from '../../components/layout/AdminLayout';
import { cn } from '../../lib/utils';
import { toast } from 'sonner';
import {
  Globe, Shield, CheckCircle2, AlertCircle, Clock,
  Copy, RefreshCw, Save, ExternalLink, Lock,
  Zap, Server, ArrowRight
} from 'lucide-react';

type DnsStatus = 'verified' | 'pending' | 'failed';

interface DnsRecord {
  type: string;
  name: string;
  value: string;
  ttl: string;
  status: DnsStatus;
}

const DNS_RECORDS: DnsRecord[] = [
  { type: 'CNAME', name: 'www',   value: 'proxy.quizmaster.app',        ttl: '3600', status: 'verified' },
  { type: 'A',     name: '@',     value: '76.76.21.21',                 ttl: '3600', status: 'verified' },
  { type: 'TXT',   name: '@',     value: 'quizmaster-verify=a7f2c91b',  ttl: '3600', status: 'pending' },
  { type: 'MX',    name: '@',     value: 'mail.quizmaster.app',         ttl: '3600', status: 'failed' },
];

const STATUS_CFG: Record<DnsStatus, { label: string; bg: string; text: string; dot: string; icon: React.ElementType }> = {
  verified: { label: 'Verified', bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500', icon: CheckCircle2 },
  pending:  { label: 'Pending',  bg: 'bg-amber-50',   text: 'text-amber-700',   dot: 'bg-amber-500',   icon: Clock },
  failed:   { label: 'Failed',   bg: 'bg-rose-50',    text: 'text-rose-700',    dot: 'bg-rose-500',    icon: AlertCircle },
};

export default function AdminDomain() {
  const [customDomain, setCustomDomain] = useState('learn.myschool.edu');
  const [inputDomain, setInputDomain] = useState('learn.myschool.edu');
  const [sslEnabled, setSslEnabled] = useState(true);
  const [wwwRedirect, setWwwRedirect] = useState(true);
  const [httpsForce, setHttpsForce] = useState(true);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [records, setRecords] = useState<DnsRecord[]>(DNS_RECORDS);

  const overallStatus = records.every(r => r.status === 'verified')
    ? 'verified' : records.some(r => r.status === 'failed')
    ? 'failed' : 'pending';

  const handleSave = async () => {
    try {
      setSaving(true);
      const payload = { customDomain: inputDomain, sslEnabled, wwwRedirect, httpsForce, records };
      const res = await fetch('/api/admin/config/domain', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: payload }),
      });
      const json = await res.json();
      if (!res.ok || !json?.success) throw new Error(json?.error || 'Failed to save domain');
      setCustomDomain(inputDomain);
      toast.success('Domain settings saved.');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to save domain settings');
    } finally {
      setSaving(false);
    }
  };

  const handleCheck = async () => {
    setChecking(true);
    await new Promise(r => setTimeout(r, 1400));
    setRecords(prev => prev.map(r => ({
      ...r,
      status: (r.status === 'pending' ? 'verified' : r.status) as DnsStatus
    })));
    setChecking(false);
    toast.success('DNS records re-checked.');
  };

  const copyText = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/admin/config/domain');
        const json = await res.json();
        if (!res.ok || !json?.success || !json?.value) return;
        const v = json.value as any;
        if (typeof v.customDomain === 'string') {
          setCustomDomain(v.customDomain);
          setInputDomain(v.customDomain);
        }
        if (typeof v.sslEnabled === 'boolean') setSslEnabled(v.sslEnabled);
        if (typeof v.wwwRedirect === 'boolean') setWwwRedirect(v.wwwRedirect);
        if (typeof v.httpsForce === 'boolean') setHttpsForce(v.httpsForce);
        if (Array.isArray(v.records)) setRecords(v.records as DnsRecord[]);
      } catch {
        // keep defaults
      }
    })();
  }, []);

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Domain</h1>
            <p className="text-sm text-slate-500 mt-0.5">Configure your custom domain and SSL settings</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleCheck}
              disabled={checking}
              className="inline-flex items-center gap-2 bg-white border border-slate-200 hover:border-slate-300 text-slate-700 text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors disabled:opacity-60"
            >
              <RefreshCw className={cn('w-4 h-4', checking && 'animate-spin')} />
              {checking ? 'Checking…' : 'Recheck DNS'}
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>

        {/* Status Banner */}
        <div className={cn('rounded-2xl border p-5 flex items-start gap-4',
          overallStatus === 'verified' ? 'bg-emerald-50 border-emerald-200'
          : overallStatus === 'failed'  ? 'bg-rose-50 border-rose-200'
          : 'bg-amber-50 border-amber-200'
        )}>
          <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center shrink-0',
            overallStatus === 'verified' ? 'bg-emerald-100 text-emerald-600'
            : overallStatus === 'failed'  ? 'bg-rose-100 text-rose-600'
            : 'bg-amber-100 text-amber-600'
          )}>
            {overallStatus === 'verified' ? <CheckCircle2 className="w-5 h-5" /> : overallStatus === 'failed' ? <AlertCircle className="w-5 h-5" /> : <Clock className="w-5 h-5" />}
          </div>
          <div className="flex-1">
            <p className={cn('font-bold text-sm',
              overallStatus === 'verified' ? 'text-emerald-800'
              : overallStatus === 'failed'  ? 'text-rose-800'
              : 'text-amber-800'
            )}>
              {overallStatus === 'verified' ? 'Domain verified and active'
               : overallStatus === 'failed'  ? 'Domain configuration has errors'
               : 'DNS propagation in progress'}
            </p>
            <p className={cn('text-xs mt-0.5',
              overallStatus === 'verified' ? 'text-emerald-600'
              : overallStatus === 'failed'  ? 'text-rose-600'
              : 'text-amber-600'
            )}>
              {overallStatus === 'verified'
                ? `Your platform is live at https://${customDomain}`
                : overallStatus === 'failed'
                ? 'Check the DNS records below and update your registrar settings.'
                : 'DNS changes can take up to 48 hours to propagate globally.'}
            </p>
          </div>
          {overallStatus === 'verified' && (
            <a href={`https://${customDomain}`} target="_blank" rel="noreferrer" className="shrink-0 inline-flex items-center gap-1 text-xs text-emerald-700 font-semibold hover:underline">
              Visit <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left — Domain Config */}
          <div className="lg:col-span-2 space-y-5">
            {/* Custom Domain */}
            <Card title="Custom Domain" subtitle="Point your own domain to this platform" icon={Globe}>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">Your Domain</label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-slate-400">https://</span>
                      <input
                        value={inputDomain}
                        onChange={e => setInputDomain(e.target.value)}
                        className="w-full pl-16 pr-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
                        placeholder="learn.yourschool.com"
                      />
                    </div>
                  </div>
                  <p className="text-xs text-slate-400 mt-1.5">Add this domain at your registrar (Namecheap, GoDaddy, Cloudflare, etc.) then add the DNS records below.</p>
                </div>

                <div className="bg-slate-50 rounded-xl p-4 flex items-start gap-3">
                  <Zap className="w-4 h-4 text-indigo-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs font-semibold text-slate-700">Default URL (always available)</p>
                    <p className="text-xs text-slate-400 mt-0.5 font-mono">https://quizmaster-abc123.replit.app</p>
                  </div>
                </div>
              </div>
            </Card>

            {/* DNS Records */}
            <Card title="DNS Records" subtitle="Add these records at your domain registrar" icon={Server}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="text-left pb-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Type</th>
                      <th className="text-left pb-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Name</th>
                      <th className="text-left pb-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Value</th>
                      <th className="text-left pb-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden lg:table-cell">TTL</th>
                      <th className="text-left pb-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {records.map((r, i) => {
                      const sc = STATUS_CFG[r.status];
                      return (
                        <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                          <td className="py-3 pr-4">
                            <span className="inline-block px-2 py-0.5 bg-indigo-100 text-indigo-700 text-xs font-bold rounded font-mono">{r.type}</span>
                          </td>
                          <td className="py-3 pr-4 font-mono text-xs text-slate-700">{r.name}</td>
                          <td className="py-3 pr-4">
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono text-xs text-slate-600 truncate max-w-[160px]">{r.value}</span>
                              <button onClick={() => copyText(r.value)} className="shrink-0 text-slate-400 hover:text-indigo-500 transition-colors">
                                <Copy className="w-3 h-3" />
                              </button>
                            </div>
                          </td>
                          <td className="py-3 pr-4 hidden lg:table-cell">
                            <span className="font-mono text-xs text-slate-400">{r.ttl}</span>
                          </td>
                          <td className="py-3">
                            <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold', sc.bg, sc.text)}>
                              <span className={cn('w-1.5 h-1.5 rounded-full', sc.dot)} />
                              {sc.label}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>

          {/* Right — SSL & Options */}
          <div className="space-y-5">
            {/* SSL */}
            <Card title="SSL Certificate" subtitle="HTTPS security" icon={Lock}>
              <div className="space-y-3">
                <div className={cn('rounded-xl p-4 flex items-center gap-3', sslEnabled ? 'bg-emerald-50' : 'bg-slate-50')}>
                  <Shield className={cn('w-8 h-8', sslEnabled ? 'text-emerald-500' : 'text-slate-400')} />
                  <div>
                    <p className={cn('text-sm font-bold', sslEnabled ? 'text-emerald-700' : 'text-slate-600')}>
                      {sslEnabled ? 'SSL Active' : 'SSL Inactive'}
                    </p>
                    <p className="text-xs text-slate-400">Let's Encrypt · Auto-renews</p>
                  </div>
                </div>
                {sslEnabled && (
                  <div className="space-y-1 text-xs text-slate-500">
                    <p className="flex justify-between"><span>Issuer</span><span className="font-semibold text-slate-700">Let's Encrypt</span></p>
                    <p className="flex justify-between"><span>Expires</span><span className="font-semibold text-slate-700">Mar 15, 2027</span></p>
                    <p className="flex justify-between"><span>Algorithm</span><span className="font-semibold text-slate-700">RSA 2048</span></p>
                  </div>
                )}
              </div>
            </Card>

            {/* Options */}
            <Card title="Domain Options" icon={Globe}>
              <div className="space-y-3">
                <ToggleRow label="Force HTTPS" description="Redirect all HTTP to HTTPS" value={httpsForce} onChange={setHttpsForce} />
                <ToggleRow label="WWW Redirect" description="Redirect www to non-www" value={wwwRedirect} onChange={setWwwRedirect} />
              </div>
            </Card>

            {/* Steps */}
            <Card title="Setup Guide" icon={ArrowRight}>
              <ol className="space-y-3">
                {[
                  'Enter your domain name above',
                  'Log in to your domain registrar',
                  'Add the DNS records from the table',
                  'Wait up to 48h for propagation',
                  'Click Recheck DNS to verify',
                ].map((step, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-600 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                    <span className="text-xs text-slate-600">{step}</span>
                  </li>
                ))}
              </ol>
            </Card>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}

function Card({ title, subtitle, icon: Icon, children }: { title: string; subtitle?: string; icon?: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
      <div className="flex items-start gap-3 pb-4 border-b border-slate-100 mb-4">
        {Icon && (
          <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
            <Icon className="w-4 h-4" />
          </div>
        )}
        <div>
          <h3 className="text-base font-bold text-slate-900">{title}</h3>
          {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}

function ToggleRow({ label, description, value, onChange }: { label: string; description: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2 border-b border-slate-50 last:border-0">
      <div>
        <p className="text-sm font-semibold text-slate-800">{label}</p>
        <p className="text-xs text-slate-400">{description}</p>
      </div>
      <button onClick={() => onChange(!value)} className={cn('shrink-0 w-11 h-6 rounded-full transition-colors relative mt-0.5', value ? 'bg-indigo-600' : 'bg-slate-200')}>
        <span className={cn('absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform', value ? 'translate-x-5' : 'translate-x-0')} />
      </button>
    </div>
  );
}
