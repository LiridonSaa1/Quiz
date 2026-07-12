import React, { useEffect, useState, useRef } from 'react';
import AdminLayout from '../../components/layout/AdminLayout';
import { cn } from '../../lib/utils';
import { toast } from 'sonner';
import { authFetch } from '../../lib/apiUrl';
import { useTranslation } from 'react-i18next';
import {
  Palette, Upload, Save, Eye,
  Type, Image, Monitor, Smartphone, Sun, Moon,
  Sparkles, Snowflake, Leaf, Flower2, Wind, Info, RotateCcw, Check
} from 'lucide-react';
import { applySeasonalTheme, getCurrentSeason, SEASON_THEMES, DEFAULT_SEASON_CONFIG, Season } from '../../lib/seasonalTheme';

const PRESET_PALETTES = [
  { name: 'Indigo',   primary: '#6366f1', accent: '#8b5cf6', bg: '#eef2ff' },
  { name: 'Sky',      primary: '#0ea5e9', accent: '#06b6d4', bg: '#e0f2fe' },
  { name: 'Emerald',  primary: '#10b981', accent: '#059669', bg: '#d1fae5' },
  { name: 'Rose',     primary: '#f43f5e', accent: '#e11d48', bg: '#ffe4e6' },
  { name: 'Amber',    primary: '#f59e0b', accent: '#d97706', bg: '#fef3c7' },
  { name: 'Violet',   primary: '#7c3aed', accent: '#6d28d9', bg: '#ede9fe' },
];

const FONT_OPTIONS = ['Inter', 'Poppins', 'Roboto', 'Open Sans', 'Lato', 'Nunito', 'Montserrat', 'Raleway'];

const SEASONS_META: { id: Season; label: string; emoji: string; icon: React.ElementType; colors: string }[] = [
  { id: 'spring', label: 'Spring', emoji: '🌸', icon: Flower2, colors: 'from-green-400 to-emerald-600' },
  { id: 'summer', label: 'Summer', emoji: '☀️', icon: Sun,    colors: 'from-blue-400 to-blue-600' },
  { id: 'autumn', label: 'Autumn', emoji: '🍂', icon: Leaf,   colors: 'from-orange-400 to-orange-600' },
  { id: 'winter', label: 'Winter', emoji: '❄️', icon: Snowflake, colors: 'from-sky-300 to-blue-700' },
];

type PreviewMode = 'desktop' | 'mobile';

interface SeasonalCfg {
  enabled: boolean;
  mode: 'auto' | 'manual';
  override: Season;
  customPrimary: string;
}

interface PwaCfg {
  name: string;
  shortName: string;
  description: string;
  themeColor: string;
  backgroundColor: string;
  logoText: string;
}

const DEFAULT_PWA: PwaCfg = {
  name: '',
  shortName: '',
  description: '',
  themeColor: '#4f46e5',
  backgroundColor: '#0f172a',
  logoText: '',
};

export default function AdminBranding() {
  const { t } = useTranslation();
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<PreviewMode>('desktop');
  const [darkMode, setDarkMode] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [faviconUrl, setFaviconUrl] = useState<string | null>(null);
  const [logoText, setLogoText] = useState('QM');
  const logoInputRef = useRef<HTMLInputElement>(null);
  const faviconInputRef = useRef<HTMLInputElement>(null);

  const [activeSection, setActiveSection] = useState<'colors' | 'seasonal' | 'pwa'>('colors');

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

  const [seasonal, setSeasonal] = useState<SeasonalCfg>({
    ...DEFAULT_SEASON_CONFIG,
  });

  const [pwa, setPwa] = useState<PwaCfg>({ ...DEFAULT_PWA });

  const currentSeason = getCurrentSeason();

  const applyPreset = (p: typeof PRESET_PALETTES[0]) => {
    setColors(prev => ({ ...prev, primary: p.primary, accent: p.accent, background: p.bg }));
    toast.success(t('branding.toasts.applied', { name: p.name }));
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, type: 'logo' | 'favicon') => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : null;
      if (!dataUrl) { toast.error('Failed to read uploaded image.'); return; }
      if (type === 'logo') {
        setLogoUrl(dataUrl);
        window.dispatchEvent(new CustomEvent('branding-updated', { detail: { logoUrl: dataUrl } }));
      } else {
        setFaviconUrl(dataUrl);
        window.dispatchEvent(new CustomEvent('branding-updated', { detail: { faviconUrl: dataUrl } }));
      }
      toast.success(`${type === 'logo' ? 'Logo' : 'Favicon'} uploaded.`);
    };
    reader.onerror = () => toast.error('Failed to read uploaded image.');
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const res = await authFetch('/api/admin/config/branding', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          value: { colors, typography, copy, darkMode, preview, logoUrl, faviconUrl, logoText, seasonal, pwa },
        }),
      });
      const json = await res.json();
      if (!res.ok || !json?.success) throw new Error(json?.error || t('branding.toasts.saveFailed'));

      applySeasonalTheme(seasonal);

      window.dispatchEvent(new CustomEvent('branding-updated', {
        detail: { logoUrl, faviconUrl, logoText, colors, typography, copy, darkMode, seasonal, pwa },
      }));
      toast.success(t('branding.toasts.saved'));
    } catch (e: any) {
      toast.error(e?.message || t('branding.toasts.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleResetSeasonal = () => {
    setSeasonal({ ...DEFAULT_SEASON_CONFIG });
    toast.success('Seasonal theme reset to defaults.');
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
        if (v.seasonal && typeof v.seasonal === 'object') setSeasonal((prev) => ({ ...prev, ...v.seasonal }));
        if (v.pwa && typeof v.pwa === 'object') setPwa((prev) => ({ ...prev, ...v.pwa }));
      } catch {
        // fallback to defaults
      }
    })();
  }, []);

  const SECTION_TABS = [
    { id: 'colors' as const, label: 'Colors & Fonts', icon: Palette },
    { id: 'seasonal' as const, label: 'Seasonal Theme', icon: Sparkles },
    { id: 'pwa' as const, label: 'PWA Settings', icon: Smartphone },
  ];

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{t('branding.title')}</h1>
            <p className="text-sm text-slate-500 mt-0.5">{t('branding.subtitle')}</p>
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors"
          >
            <Save className="w-4 h-4" />
            {saving ? t('branding.saving') : t('branding.saveBranding')}
          </button>
        </div>

        {/* Section tabs */}
        <div className="flex gap-2 flex-wrap">
          {SECTION_TABS.map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveSection(tab.id)}
                className={cn(
                  'inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all border',
                  activeSection === tab.id
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                )}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* ── Colors & Fonts ── */}
        {activeSection === 'colors' && (
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <div className="xl:col-span-2 space-y-5">

              {/* Logo & Favicon */}
              <Card title={t('branding.logoFavicon')} subtitle={t('branding.logoFaviconDesc')} icon={Image}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">{t('branding.schoolLogo')}</label>
                    <div onClick={() => logoInputRef.current?.click()} className="relative border-2 border-dashed border-slate-200 rounded-xl h-28 flex flex-col items-center justify-center cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/30 transition-all group overflow-hidden">
                      {logoUrl ? (
                        <img src={logoUrl} alt="Logo" className="max-h-20 max-w-full object-contain" />
                      ) : (
                        <>
                          <Upload className="w-6 h-6 text-slate-400 group-hover:text-indigo-500 transition-colors mb-2" />
                          <span className="text-xs text-slate-400 group-hover:text-indigo-500">{t('branding.clickUpload')}</span>
                          <span className="text-xs text-slate-300 mt-0.5">{t('branding.fileFormats')}</span>
                        </>
                      )}
                      <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={e => handleImageUpload(e, 'logo')} />
                    </div>
                    {logoUrl && <button onClick={() => setLogoUrl(null)} className="mt-2 text-xs text-rose-500 hover:underline font-medium">{t('branding.removeLogo')}</button>}
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">{t('branding.favicon')}</label>
                    <div onClick={() => faviconInputRef.current?.click()} className="relative border-2 border-dashed border-slate-200 rounded-xl h-28 flex flex-col items-center justify-center cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/30 transition-all group overflow-hidden">
                      {faviconUrl ? (
                        <img src={faviconUrl} alt="Favicon" className="w-16 h-16 object-contain" />
                      ) : (
                        <>
                          <Upload className="w-6 h-6 text-slate-400 group-hover:text-indigo-500 transition-colors mb-2" />
                          <span className="text-xs text-slate-400 group-hover:text-indigo-500">{t('branding.clickUpload')}</span>
                          <span className="text-xs text-slate-300 mt-0.5">{t('branding.faviconFormat')}</span>
                        </>
                      )}
                      <input ref={faviconInputRef} type="file" accept="image/*" className="hidden" onChange={e => handleImageUpload(e, 'favicon')} />
                    </div>
                    {faviconUrl && <button onClick={() => setFaviconUrl(null)} className="mt-2 text-xs text-rose-500 hover:underline font-medium">{t('branding.removeFavicon')}</button>}
                  </div>
                </div>
                <div className="mt-5 pt-5 border-t border-slate-100">
                  <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">{t('branding.appIconText')}</label>
                  <p className="text-xs text-slate-400 mb-3">{t('branding.appIconTextDesc')}</p>
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-2xl flex items-center justify-center shrink-0 shadow-md select-none" style={{ background: colors.primary }}>
                      <span className="text-white font-extrabold tracking-tight" style={{ fontSize: logoText.length > 2 ? '20px' : '24px' }}>{logoText || 'QM'}</span>
                    </div>
                    <div className="flex-1">
                      <input value={logoText} onChange={e => setLogoText(e.target.value.toUpperCase().slice(0, 3))} maxLength={3} placeholder="SC" className={inputCls + ' max-w-[120px] text-center font-bold text-lg tracking-widest'} />
                      <p className="text-xs text-slate-400 mt-1.5">{t('branding.maxCharacters')}</p>
                    </div>
                  </div>
                </div>
              </Card>

              {/* Color Palettes */}
              <Card title={t('branding.colorScheme')} subtitle={t('branding.colorSchemeDesc')} icon={Palette}>
                <div className="mb-4">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">{t('branding.quickPresets')}</p>
                  <div className="flex flex-wrap gap-2">
                    {PRESET_PALETTES.map(p => (
                      <button key={p.name} onClick={() => applyPreset(p)} className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 hover:border-slate-300 hover:shadow-sm text-xs font-semibold text-slate-700 transition-all">
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
                        <input type="color" value={val} onChange={e => setColors(p => ({ ...p, [key]: e.target.value }))} className="w-10 h-10 rounded-lg border border-slate-200 cursor-pointer p-0.5 bg-white" />
                        <input type="text" value={val} onChange={e => setColors(p => ({ ...p, [key]: e.target.value }))} className="flex-1 px-2.5 py-2 text-xs font-mono border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400" />
                      </div>
                    </div>
                  ))}
                </div>
              </Card>

              {/* Typography */}
              <Card title={t('branding.typography')} subtitle={t('branding.typographyDesc')} icon={Type}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">{t('branding.headingFont')}</label>
                    <select value={typography.font_heading} onChange={e => setTypography(p => ({ ...p, font_heading: e.target.value }))} className={inputCls}>
                      {FONT_OPTIONS.map(f => <option key={f}>{f}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">{t('branding.bodyFont')}</label>
                    <select value={typography.font_body} onChange={e => setTypography(p => ({ ...p, font_body: e.target.value }))} className={inputCls}>
                      {FONT_OPTIONS.map(f => <option key={f}>{f}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">{t('branding.baseFontSize')}</label>
                    <input type="number" value={typography.font_size} onChange={e => setTypography(p => ({ ...p, font_size: e.target.value }))} className={inputCls} min={12} max={18} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">{t('branding.borderRadius')}</label>
                    <input type="number" value={typography.border_radius} onChange={e => setTypography(p => ({ ...p, border_radius: e.target.value }))} className={inputCls} min={0} max={24} />
                  </div>
                </div>
              </Card>

              {/* Copy */}
              <Card title={t('branding.platformCopy')} subtitle={t('branding.platformCopyDesc')}>
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">{t('branding.loginHeadline')}</label>
                    <input value={copy.login_headline} onChange={e => setCopy(p => ({ ...p, login_headline: e.target.value }))} className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">{t('branding.loginSubtext')}</label>
                    <textarea value={copy.login_subtext} onChange={e => setCopy(p => ({ ...p, login_subtext: e.target.value }))} className={inputCls + ' resize-none'} rows={2} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">{t('branding.footerText')}</label>
                    <input value={copy.footer_text} onChange={e => setCopy(p => ({ ...p, footer_text: e.target.value }))} className={inputCls} />
                  </div>
                </div>
              </Card>
            </div>

            {/* Preview */}
            <div className="space-y-4">
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 sticky top-6">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-sm font-bold text-slate-800">{t('branding.livePreview')}</p>
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
                <div className={cn('overflow-hidden rounded-xl border border-slate-200 mx-auto transition-all', preview === 'mobile' ? 'max-w-[180px]' : 'w-full')} style={{ background: darkMode ? '#0f172a' : colors.background }}>
                  <div className="flex h-44">
                    <div className="w-8 shrink-0 flex flex-col items-center pt-3 gap-2" style={{ background: colors.sidebar_bg }}>
                      <div className="w-4 h-4 rounded-sm" style={{ background: colors.primary }} />
                      {[...Array(4)].map((_, i) => (
                        <div key={i} className="w-3 h-2 rounded-sm opacity-40" style={{ background: colors.sidebar_text }} />
                      ))}
                    </div>
                    <div className="flex-1 flex flex-col">
                      <div className="h-6 flex items-center px-2 gap-1 border-b" style={{ borderColor: darkMode ? '#1e293b' : '#e2e8f0', background: darkMode ? '#1e293b' : '#fff' }}>
                        <div className="w-12 h-2 rounded-full" style={{ background: colors.primary, opacity: 0.8 }} />
                      </div>
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
                  <div className="px-2 py-1.5 border-t text-center" style={{ borderColor: darkMode ? '#1e293b' : '#e2e8f0' }}>
                    <p className="text-[7px] truncate" style={{ color: darkMode ? '#64748b' : '#94a3b8' }}>{copy.footer_text}</p>
                  </div>
                </div>
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
        )}

        {/* ── Seasonal Theme ── */}
        {activeSection === 'seasonal' && (
          <div className="max-w-3xl space-y-5">
            {/* Enable/Disable card */}
            <Card title="Seasonal Themes" subtitle="Automatically change the app's appearance based on the current season" icon={Sparkles}>
              <div className="flex items-start justify-between gap-4 py-2">
                <div>
                  <p className="text-sm font-semibold text-slate-800">Enable Seasonal Themes</p>
                  <p className="text-xs text-slate-400 mt-0.5">Apply season-specific colors, gradients and decorative particles</p>
                </div>
                <button
                  onClick={() => setSeasonal(p => ({ ...p, enabled: !p.enabled }))}
                  className={cn('shrink-0 w-11 h-6 rounded-full transition-colors relative mt-0.5', seasonal.enabled ? 'bg-indigo-600' : 'bg-slate-200')}
                >
                  <span className={cn('absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform', seasonal.enabled ? 'translate-x-5' : 'translate-x-0')} />
                </button>
              </div>

              {seasonal.enabled && (
                <>
                  {/* Mode picker */}
                  <div className="pt-4 border-t border-slate-100 space-y-3">
                    <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Detection Mode</p>
                    <div className="grid grid-cols-2 gap-3">
                      {(['auto', 'manual'] as const).map(mode => (
                        <button
                          key={mode}
                          onClick={() => setSeasonal(p => ({ ...p, mode }))}
                          className={cn(
                            'flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-sm font-semibold transition-all text-left',
                            seasonal.mode === mode
                              ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                              : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                          )}
                        >
                          <span className="text-xl">{mode === 'auto' ? '🔄' : '🎨'}</span>
                          <div>
                            <div>{mode === 'auto' ? 'Auto-detect' : 'Manual'}</div>
                            <div className="text-[11px] font-normal opacity-70">{mode === 'auto' ? 'Changes each season automatically' : 'You choose the season'}</div>
                          </div>
                          {seasonal.mode === mode && <Check className="w-4 h-4 ml-auto shrink-0" />}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Current season indicator (auto mode) */}
                  {seasonal.mode === 'auto' && (
                    <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100 text-sm text-slate-600">
                      <span className="text-xl">{SEASON_THEMES[currentSeason].emoji}</span>
                      <div>
                        <span className="font-semibold">Currently: {SEASON_THEMES[currentSeason].label}</span>
                        <span className="text-slate-400 ml-2 text-xs">{SEASON_THEMES[currentSeason].description}</span>
                      </div>
                    </div>
                  )}

                  {/* Season picker (manual mode) */}
                  {seasonal.mode === 'manual' && (
                    <div className="pt-4 border-t border-slate-100 space-y-3">
                      <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Select Season</p>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {SEASONS_META.map(s => {
                          const theme = SEASON_THEMES[s.id];
                          const active = seasonal.override === s.id;
                          return (
                            <button
                              key={s.id}
                              onClick={() => setSeasonal(p => ({ ...p, override: s.id }))}
                              className={cn(
                                'flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all',
                                active ? 'border-indigo-600 bg-indigo-50 shadow-sm' : 'border-slate-200 bg-white hover:border-slate-300'
                              )}
                            >
                              <span className="text-3xl">{s.emoji}</span>
                              <span className={cn('text-sm font-bold', active ? 'text-indigo-700' : 'text-slate-700')}>{s.label}</span>
                              <span className="text-[10px] text-slate-400 text-center leading-tight">{theme.description}</span>
                              {active && <span className="text-[10px] font-bold text-indigo-600 bg-indigo-100 px-2 py-0.5 rounded-full">Active</span>}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Custom color override */}
                  <div className="pt-4 border-t border-slate-100 space-y-3">
                    <div>
                      <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Custom Primary Color</p>
                      <p className="text-xs text-slate-400 mt-0.5">Override the season's default primary color. Leave blank to use the season default.</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <input
                        type="color"
                        value={seasonal.customPrimary || SEASON_THEMES[seasonal.mode === 'auto' ? currentSeason : seasonal.override].primary}
                        onChange={e => setSeasonal(p => ({ ...p, customPrimary: e.target.value }))}
                        className="w-12 h-10 rounded-lg border border-slate-200 cursor-pointer p-1"
                      />
                      <input
                        value={seasonal.customPrimary}
                        onChange={e => setSeasonal(p => ({ ...p, customPrimary: e.target.value }))}
                        placeholder="Leave blank for season default"
                        className={cn(inputCls, 'flex-1')}
                      />
                      {seasonal.customPrimary && (
                        <button onClick={() => setSeasonal(p => ({ ...p, customPrimary: '' }))} className="text-xs text-rose-500 hover:text-rose-700 font-semibold whitespace-nowrap transition-colors">
                          Reset
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Live color preview */}
                  <div className="pt-4 border-t border-slate-100">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Season Color Preview</p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {SEASONS_META.map(s => {
                        const theme = SEASON_THEMES[s.id];
                        const isActive = seasonal.mode === 'auto' ? s.id === currentSeason : s.id === seasonal.override;
                        return (
                          <div key={s.id} className={cn('rounded-xl overflow-hidden border-2 transition-all', isActive ? 'border-indigo-500 shadow-md' : 'border-slate-100')}>
                            <div className="h-12" style={{ background: `linear-gradient(135deg, ${theme.gradFrom}, ${theme.gradTo})` }} />
                            <div className="p-2 bg-white">
                              <p className="text-xs font-bold text-slate-700">{theme.emoji} {theme.label}</p>
                              <p className="text-[10px] text-slate-400 font-mono">{theme.primary}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}

              <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                <button onClick={handleResetSeasonal} className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-rose-600 font-semibold transition-colors">
                  <RotateCcw className="w-3.5 h-3.5" /> Reset to defaults
                </button>
                <button onClick={handleSave} disabled={saving} className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors">
                  <Save className="w-4 h-4" />
                  {saving ? 'Saving…' : 'Save Theme'}
                </button>
              </div>
            </Card>

            {/* Info box */}
            <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-100 rounded-xl text-sm text-blue-700">
              <Info className="w-4 h-4 mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold">How seasonal themes work</p>
                <p className="text-xs mt-0.5 text-blue-600">Spring (Mar–May) · Summer (Jun–Aug) · Autumn (Sep–Nov) · Winter (Dec–Feb). CSS variables are applied globally — no page refresh needed. Decorative particles (leaves, snowflakes, petals) animate at low opacity and respect the "prefers-reduced-motion" accessibility setting.</p>
              </div>
            </div>
          </div>
        )}

        {/* ── PWA Settings ── */}
        {activeSection === 'pwa' && (
          <div className="max-w-3xl space-y-5">
            <Card title="PWA / App Settings" subtitle="Customize how the app appears when installed on devices" icon={Smartphone}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">App Name</label>
                  <input value={pwa.name} onChange={e => setPwa(p => ({ ...p, name: e.target.value }))} placeholder="Britannica School" className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">Short Name <span className="text-slate-400 font-normal">(max 14 chars)</span></label>
                  <input value={pwa.shortName} onChange={e => setPwa(p => ({ ...p, shortName: e.target.value }))} placeholder="BritSchool" maxLength={14} className={inputCls} />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">Description</label>
                  <input value={pwa.description} onChange={e => setPwa(p => ({ ...p, description: e.target.value }))} placeholder="AI-powered educational platform" className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">Theme Color</label>
                  <div className="flex items-center gap-2">
                    <input type="color" value={pwa.themeColor} onChange={e => setPwa(p => ({ ...p, themeColor: e.target.value }))} className="w-12 h-10 rounded-lg border border-slate-200 cursor-pointer p-1" />
                    <input value={pwa.themeColor} onChange={e => setPwa(p => ({ ...p, themeColor: e.target.value }))} placeholder="#4f46e5" className={cn(inputCls, 'font-mono')} />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">Background Color</label>
                  <div className="flex items-center gap-2">
                    <input type="color" value={pwa.backgroundColor} onChange={e => setPwa(p => ({ ...p, backgroundColor: e.target.value }))} className="w-12 h-10 rounded-lg border border-slate-200 cursor-pointer p-1" />
                    <input value={pwa.backgroundColor} onChange={e => setPwa(p => ({ ...p, backgroundColor: e.target.value }))} placeholder="#0f172a" className={cn(inputCls, 'font-mono')} />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">Icon Text <span className="text-slate-400 font-normal">(1-3 chars, for generated icon)</span></label>
                  <input value={pwa.logoText} onChange={e => setPwa(p => ({ ...p, logoText: e.target.value.toUpperCase().slice(0, 3) }))} placeholder="BS" maxLength={3} className={cn(inputCls, 'font-mono tracking-widest text-center')} />
                </div>
              </div>

              {/* Live install preview */}
              <div className="mt-4 p-4 bg-slate-50 rounded-xl border border-slate-200">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                  <Eye className="w-3.5 h-3.5" /> Install Preview
                </p>
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-white text-xl font-black shadow-md shrink-0" style={{ backgroundColor: pwa.themeColor }}>
                    {(pwa.logoText || logoText || 'BS').slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-900">{pwa.name || 'App Name'}</p>
                    <p className="text-xs text-slate-500">{pwa.shortName || 'Short name'}</p>
                    <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">{pwa.description || 'App description'}</p>
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-3 text-xs text-slate-500">
                  <div className="flex items-center gap-1.5">
                    <div className="w-4 h-4 rounded" style={{ background: pwa.themeColor }} />
                    <span>Theme</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-4 h-4 rounded" style={{ background: pwa.backgroundColor }} />
                    <span>Background</span>
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-2 mt-2 p-3 bg-indigo-50 rounded-xl text-xs text-indigo-700">
                <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                After saving, the PWA manifest is regenerated automatically. Users may need to clear browser cache or reinstall the app to see icon changes.
              </div>
            </Card>

            <div className="flex justify-end">
              <button onClick={handleSave} disabled={saving} className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors">
                <Save className="w-4 h-4" />
                {saving ? 'Saving…' : 'Save PWA Settings'}
              </button>
            </div>
          </div>
        )}
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
