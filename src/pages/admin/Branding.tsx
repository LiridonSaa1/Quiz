import React, { useEffect, useState, useRef } from 'react';
import AdminLayout from '../../components/layout/AdminLayout';
import { cn } from '../../lib/utils';
import { toast } from 'sonner';
import { authFetch } from '../../lib/apiUrl';
import {
  Palette, Upload, Save, RefreshCw, Eye,
  Type, Image, Monitor, Smartphone, Sun, Moon
} from 'lucide-react';

const PRESET_PALETTES = [
  { name: 'Indigo',   primary: '#6366f1', accent: '#8b5cf6', bg: '#eef2ff' },
  { name: 'Sky',      primary: '#0ea5e9', accent: '#06b6d4', bg: '#e0f2fe' },
  { name: 'Emerald',  primary: '#10b981', accent: '#059669', bg: '#d1fae5' },
  { name: 'Rose',     primary: '#f43f5e', accent: '#e11d48', bg: '#ffe4e6' },
  { name: 'Amber',    primary: '#f59e0b', accent: '#d97706', bg: '#fef3c7' },
  { name: 'Violet',   primary: '#7c3aed', accent: '#6d28d9', bg: '#ede9fe' },
];

const FONT_OPTIONS = ['Inter', 'Poppins', 'Roboto', 'Open Sans', 'Lato', 'Nunito', 'Montserrat', 'Raleway'];

export default function AdminBranding() {
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<'desktop' | 'mobile'>('desktop');
  const [darkMode, setDarkMode] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [faviconUrl, setFaviconUrl] = useState<string | null>(null);
  const [logoText, setLogoText] = useState('QM');
  const logoInputRef = useRef<HTMLInputElement>(null);
  const faviconInputRef = useRef<HTMLInputElement>(null);

  const [colors, setColors] = useState({
    primary: '#6366f1',
    accent: '#8b5cf6',
    background: '#eef2ff',
    text: '#1e293b',
    sidebar_bg: '#1e1b4b',
    sidebar_text: '#c7d2fe',
  });

  const [typography, setTypography] = useState({
    font_heading: 'Inter',
    font_body: 'Inter',
    font_size: '14',
    border_radius: '12',
  });

  const [copy, setCopy] = useState({
    login_headline: 'The smart way to teach & learn',
    login_subtext: 'Manage courses, quizzes, and students — all in one powerful platform.',
    footer_text: '© 2026 QuizMaster Academy. All rights reserved.',
  });

  const applyPreset = (p: typeof PRESET_PALETTES[0]) => {
    setColors(prev => ({ ...prev, primary: p.primary, accent: p.accent, background: p.bg }));
    toast.success(`Applied "${p.name}" palette`);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, type: 'logo' | 'favicon') => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : null;
      if (!dataUrl) {
        toast.error('Failed to read uploaded image.');
        return;
      }
      if (type === 'logo') {
        setLogoUrl(dataUrl);
        window.dispatchEvent(
          new CustomEvent('branding-updated', { detail: { logoUrl: dataUrl } }),
        );
      } else {
        setFaviconUrl(dataUrl);
        window.dispatchEvent(
          new CustomEvent('branding-updated', { detail: { faviconUrl: dataUrl } }),
        );
      }
      toast.success(`${type === 'logo' ? 'Logo' : 'Favicon'} uploaded.`);
    };
    reader.onerror = () => {
      toast.error('Failed to read uploaded image.');
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const res = await authFetch('/api/admin/config/branding', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          value: { colors, typography, copy, darkMode, preview, logoUrl, faviconUrl, logoText },
        }),
      });
      const json = await res.json();
      if (!res.ok || !json?.success) throw new Error(json?.error || 'Failed to save branding');
      window.dispatchEvent(
        new CustomEvent('branding-updated', {
          detail: { logoUrl, faviconUrl, logoText, colors, typography, copy, darkMode },
        }),
      );
      toast.success('Branding saved successfully.');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to save branding');
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const res = await authFetch('/api/admin/config/branding');
        const json = await res.json();
        if (!res.ok || !json?.success || !json?.value) return;
        const v = json.value as any;
        if (v.colors) setColors((prev) => ({ ...prev, ...v.colors }));
        if (v.typography) setTypography((prev) => ({ ...prev, ...v.typography }));
        if (v.copy) setCopy((prev) => ({ ...prev, ...v.copy }));
        if (typeof v.darkMode === 'boolean') setDarkMode(v.darkMode);
        if (v.preview === 'desktop' || v.preview === 'mobile') setPreview(v.preview);
        if (typeof v.logoUrl === 'string' || v.logoUrl === null) setLogoUrl(v.logoUrl ?? null);
        if (typeof v.faviconUrl === 'string' || v.faviconUrl === null) setFaviconUrl(v.faviconUrl ?? null);
        if (typeof v.logoText === 'string' && v.logoText.trim()) setLogoText(v.logoText.trim().toUpperCase());
      } catch {
        // fallback to defaults
      }
    })();
  }, []);

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Branding</h1>
            <p className="text-sm text-slate-500 mt-0.5">Customize the look and feel of your platform</p>
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving…' : 'Save Branding'}
          </button>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Left column — controls */}
          <div className="xl:col-span-2 space-y-5">

            {/* Logo & Favicon */}
            <Card title="Logo & Favicon" subtitle="Upload your school logo and browser favicon" icon={Image}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                {/* Logo */}
                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">School Logo</label>
                  <div
                    onClick={() => logoInputRef.current?.click()}
                    className="relative border-2 border-dashed border-slate-200 rounded-xl h-28 flex flex-col items-center justify-center cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/30 transition-all group overflow-hidden"
                  >
                    {logoUrl ? (
                      <img src={logoUrl} alt="Logo" className="max-h-20 max-w-full object-contain" />
                    ) : (
                      <>
                        <Upload className="w-6 h-6 text-slate-400 group-hover:text-indigo-500 transition-colors mb-2" />
                        <span className="text-xs text-slate-400 group-hover:text-indigo-500">Click to upload</span>
                        <span className="text-xs text-slate-300 mt-0.5">PNG, SVG (max 2MB)</span>
                      </>
                    )}
                    <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={e => handleImageUpload(e, 'logo')} />
                  </div>
                  {logoUrl && (
                    <button onClick={() => setLogoUrl(null)} className="mt-2 text-xs text-rose-500 hover:underline font-medium">Remove logo</button>
                  )}
                </div>
                {/* Favicon */}
                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">Favicon</label>
                  <div
                    onClick={() => faviconInputRef.current?.click()}
                    className="relative border-2 border-dashed border-slate-200 rounded-xl h-28 flex flex-col items-center justify-center cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/30 transition-all group overflow-hidden"
                  >
                    {faviconUrl ? (
                      <img src={faviconUrl} alt="Favicon" className="w-16 h-16 object-contain" />
                    ) : (
                      <>
                        <Upload className="w-6 h-6 text-slate-400 group-hover:text-indigo-500 transition-colors mb-2" />
                        <span className="text-xs text-slate-400 group-hover:text-indigo-500">Click to upload</span>
                        <span className="text-xs text-slate-300 mt-0.5">ICO, PNG 32×32</span>
                      </>
                    )}
                    <input ref={faviconInputRef} type="file" accept="image/*" className="hidden" onChange={e => handleImageUpload(e, 'favicon')} />
                  </div>
                  {faviconUrl && (
                    <button onClick={() => setFaviconUrl(null)} className="mt-2 text-xs text-rose-500 hover:underline font-medium">Remove favicon</button>
                  )}
                </div>
              </div>

              {/* App Icon Text (PWA) */}
              <div className="mt-5 pt-5 border-t border-slate-100">
                <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">App Icon Text</label>
                <p className="text-xs text-slate-400 mb-3">2–3 letters shown on the installed app icon (e.g. "SC" for Britanika School). Used when the app is installed on mobile or desktop.</p>
                <div className="flex items-center gap-4">
                  {/* Live preview of icon */}
                  <div
                    className="w-16 h-16 rounded-2xl flex items-center justify-center shrink-0 shadow-md select-none"
                    style={{ background: colors.primary }}
                  >
                    <span className="text-white font-extrabold tracking-tight" style={{ fontSize: logoText.length > 2 ? '20px' : '24px' }}>
                      {logoText || 'QM'}
                    </span>
                  </div>
                  <div className="flex-1">
                    <input
                      value={logoText}
                      onChange={e => setLogoText(e.target.value.toUpperCase().slice(0, 3))}
                      maxLength={3}
                      placeholder="SC"
                      className={inputCls + ' max-w-[120px] text-center font-bold text-lg tracking-widest'}
                    />
                    <p className="text-xs text-slate-400 mt-1.5">Max 3 characters · auto uppercase</p>
                  </div>
                </div>
              </div>
            </Card>

            {/* Color Palettes */}
            <Card title="Color Scheme" subtitle="Define your brand colors" icon={Palette}>
              <div className="mb-4">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Quick Presets</p>
                <div className="flex flex-wrap gap-2">
                  {PRESET_PALETTES.map(p => (
                    <button
                      key={p.name}
                      onClick={() => applyPreset(p)}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 hover:border-slate-300 hover:shadow-sm text-xs font-semibold text-slate-700 transition-all"
                    >
                      <span className="w-3.5 h-3.5 rounded-full border border-white shadow-sm" style={{ background: p.primary }} />
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {(Object.entries(colors) as [string, string][]).map(([key, val]) => (
                  <div key={key}>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">{COLOR_LABELS[key]}</label>
                    <div className="flex items-center gap-2">
                      <div className="relative">
                        <input
                          type="color"
                          value={val}
                          onChange={e => setColors(p => ({ ...p, [key]: e.target.value }))}
                          className="w-10 h-10 rounded-lg border border-slate-200 cursor-pointer p-0.5 bg-white"
                        />
                      </div>
                      <input
                        type="text"
                        value={val}
                        onChange={e => setColors(p => ({ ...p, [key]: e.target.value }))}
                        className="flex-1 px-2.5 py-2 text-xs font-mono border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            {/* Typography */}
            <Card title="Typography" subtitle="Fonts and sizing" icon={Type}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">Heading Font</label>
                  <select value={typography.font_heading} onChange={e => setTypography(p => ({ ...p, font_heading: e.target.value }))} className={inputCls}>
                    {FONT_OPTIONS.map(f => <option key={f}>{f}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">Body Font</label>
                  <select value={typography.font_body} onChange={e => setTypography(p => ({ ...p, font_body: e.target.value }))} className={inputCls}>
                    {FONT_OPTIONS.map(f => <option key={f}>{f}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">Base Font Size (px)</label>
                  <input type="number" value={typography.font_size} onChange={e => setTypography(p => ({ ...p, font_size: e.target.value }))} className={inputCls} min={12} max={18} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">Border Radius (px)</label>
                  <input type="number" value={typography.border_radius} onChange={e => setTypography(p => ({ ...p, border_radius: e.target.value }))} className={inputCls} min={0} max={24} />
                </div>
              </div>
            </Card>

            {/* Copy */}
            <Card title="Platform Copy" subtitle="Text shown to students on the login page and footer">
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">Login Page Headline</label>
                  <input value={copy.login_headline} onChange={e => setCopy(p => ({ ...p, login_headline: e.target.value }))} className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">Login Page Subtext</label>
                  <textarea value={copy.login_subtext} onChange={e => setCopy(p => ({ ...p, login_subtext: e.target.value }))} className={inputCls + ' resize-none'} rows={2} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">Footer Text</label>
                  <input value={copy.footer_text} onChange={e => setCopy(p => ({ ...p, footer_text: e.target.value }))} className={inputCls} />
                </div>
              </div>
            </Card>
          </div>

          {/* Right column — live preview */}
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 sticky top-6">
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm font-bold text-slate-800">Live Preview</p>
                <div className="flex items-center gap-1.5">
                  <button onClick={() => setDarkMode(!darkMode)} className={cn('p-1.5 rounded-lg transition-colors', darkMode ? 'bg-slate-800 text-white' : 'hover:bg-slate-100 text-slate-500')}>
                    {darkMode ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
                  </button>
                  <button onClick={() => setPreview('desktop')} className={cn('p-1.5 rounded-lg transition-colors', preview === 'desktop' ? 'bg-indigo-100 text-indigo-600' : 'hover:bg-slate-100 text-slate-500')}>
                    <Monitor className="w-4 h-4" />
                  </button>
                  <button onClick={() => setPreview('mobile')} className={cn('p-1.5 rounded-lg transition-colors', preview === 'mobile' ? 'bg-indigo-100 text-indigo-600' : 'hover:bg-slate-100 text-slate-500')}>
                    <Smartphone className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Mockup */}
              <div className={cn('overflow-hidden rounded-xl border border-slate-200 mx-auto transition-all', preview === 'mobile' ? 'max-w-[180px]' : 'w-full')}
                style={{ background: darkMode ? '#0f172a' : colors.background }}>
                {/* Sidebar strip */}
                <div className="flex h-44">
                  <div className="w-8 shrink-0 flex flex-col items-center pt-3 gap-2" style={{ background: colors.sidebar_bg }}>
                    <div className="w-4 h-4 rounded-sm" style={{ background: colors.primary }} />
                    {[...Array(4)].map((_, i) => (
                      <div key={i} className="w-3 h-2 rounded-sm opacity-40" style={{ background: colors.sidebar_text }} />
                    ))}
                  </div>
                  <div className="flex-1 flex flex-col">
                    {/* Top bar */}
                    <div className="h-6 flex items-center px-2 gap-1 border-b" style={{ borderColor: darkMode ? '#1e293b' : '#e2e8f0', background: darkMode ? '#1e293b' : '#fff' }}>
                      <div className="w-12 h-2 rounded-full" style={{ background: colors.primary, opacity: 0.8 }} />
                    </div>
                    {/* Content */}
                    <div className="flex-1 p-2 space-y-1.5">
                      <div className="flex gap-1.5">
                        {[colors.primary, colors.accent, '#10b981', '#f59e0b'].map((c, i) => (
                          <div key={i} className="flex-1 h-8 rounded-lg" style={{ background: c, opacity: 0.15 }}>
                            <div className="h-full rounded-lg flex items-center justify-center">
                              <div className="w-4 h-1 rounded-full" style={{ background: c }} />
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="h-16 rounded-xl" style={{ background: darkMode ? '#1e293b' : '#fff', border: `1px solid ${darkMode ? '#334155' : '#e2e8f0'}` }}>
                        <div className="p-2 space-y-1">
                          <div className="h-1.5 rounded-full w-3/4" style={{ background: colors.primary, opacity: 0.3 }} />
                          <div className="h-1 rounded-full w-1/2" style={{ background: darkMode ? '#475569' : '#e2e8f0' }} />
                          <div className="h-1 rounded-full w-5/6" style={{ background: darkMode ? '#334155' : '#f1f5f9' }} />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                {/* Footer strip */}
                <div className="px-2 py-1.5 border-t text-center" style={{ borderColor: darkMode ? '#1e293b' : '#e2e8f0' }}>
                  <p className="text-[7px] truncate" style={{ color: darkMode ? '#64748b' : '#94a3b8' }}>{copy.footer_text}</p>
                </div>
              </div>

              {/* Color swatches */}
              <div className="mt-4 flex gap-1.5 flex-wrap">
                {Object.values(colors).map((c, i) => (
                  <div key={i} className="w-6 h-6 rounded-full border-2 border-white shadow-sm" title={c} style={{ background: c }} />
                ))}
              </div>
              <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                Font: <span className="font-semibold text-slate-600">{typography.font_heading}</span> · Radius: <span className="font-semibold text-slate-600">{typography.border_radius}px</span>
              </p>
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}

const inputCls = 'w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 bg-white text-slate-800';

const COLOR_LABELS: Record<string, string> = {
  primary: 'Primary',
  accent: 'Accent',
  background: 'Background',
  text: 'Text',
  sidebar_bg: 'Sidebar BG',
  sidebar_text: 'Sidebar Text',
};

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
