import { useEffect, useState } from 'react';
import { apiUrl } from './apiUrl';

export interface BrandingPayload {
  logoUrl: string | null;
  faviconUrl: string | null;
  schoolName: string;
  colors: Record<string, string> | null;
  typography: Record<string, string> | null;
  copy: Record<string, string> | null;
  darkMode: boolean;
}

const DEFAULT_BRANDING: BrandingPayload = {
  logoUrl: null,
  faviconUrl: null,
  schoolName: 'QuizMaster',
  colors: null,
  typography: null,
  copy: null,
  darkMode: false,
};

const FONT_HREF_BASE = 'https://fonts.googleapis.com/css2?display=swap&family=';

const ensureGoogleFont = (family: string) => {
  if (typeof document === 'undefined' || !family) return;
  const id = `gf-${family.replace(/\s+/g, '-').toLowerCase()}`;
  if (document.getElementById(id)) return;
  const link = document.createElement('link');
  link.id = id;
  link.rel = 'stylesheet';
  link.href = `${FONT_HREF_BASE}${encodeURIComponent(family)}:wght@400;500;600;700`;
  document.head.appendChild(link);
};

const setFavicon = (url: string | null) => {
  if (typeof document === 'undefined') return;
  let link = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  link.href = url || '/favicon.svg';
};

const applyBrandingStyles = (b: BrandingPayload) => {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const colors = b.colors || {};
  const set = (name: string, value?: string) => {
    if (value && typeof value === 'string') root.style.setProperty(name, value);
    else root.style.removeProperty(name);
  };
  set('--brand-primary', colors.primary);
  set('--brand-accent', colors.accent);
  set('--brand-background', colors.background);
  set('--brand-text', colors.text);
  set('--brand-sidebar-bg', colors.sidebar_bg);
  set('--brand-sidebar-text', colors.sidebar_text);

  const typo = b.typography || {};
  if (typo.font_heading) {
    ensureGoogleFont(typo.font_heading);
    root.style.setProperty('--brand-font-heading', `"${typo.font_heading}", system-ui, sans-serif`);
  }
  if (typo.font_body) {
    ensureGoogleFont(typo.font_body);
    root.style.setProperty('--brand-font-body', `"${typo.font_body}", system-ui, sans-serif`);
    root.style.setProperty('font-family', `"${typo.font_body}", system-ui, sans-serif`);
  }
  if (typo.font_size) root.style.setProperty('--brand-font-size', `${parseInt(typo.font_size, 10) || 14}px`);
  if (typo.border_radius) root.style.setProperty('--brand-radius', `${parseInt(typo.border_radius, 10) || 12}px`);

  if (b.schoolName) document.title = b.schoolName;
  setFavicon(b.faviconUrl);
};

let cachedBranding: BrandingPayload = DEFAULT_BRANDING;
let inflight: Promise<BrandingPayload> | null = null;

const fetchBranding = async (): Promise<BrandingPayload> => {
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const res = await fetch(apiUrl('/api/platform/branding'));
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) return DEFAULT_BRANDING;
      const next: BrandingPayload = {
        logoUrl: json.logoUrl ?? null,
        faviconUrl: json.faviconUrl ?? null,
        schoolName: typeof json.schoolName === 'string' ? json.schoolName : 'QuizMaster',
        colors: json.colors ?? null,
        typography: json.typography ?? null,
        copy: json.copy ?? null,
        darkMode: Boolean(json.darkMode),
      };
      cachedBranding = next;
      return next;
    } catch {
      return DEFAULT_BRANDING;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
};

export function useBranding(): BrandingPayload {
  const [branding, setBranding] = useState<BrandingPayload>(cachedBranding);

  useEffect(() => {
    let mounted = true;
    fetchBranding().then((b) => {
      if (!mounted) return;
      setBranding(b);
      applyBrandingStyles(b);
    });

    const onUpdated = (event: Event) => {
      const detail = (event as CustomEvent<Partial<BrandingPayload>>).detail || {};
      // Optimistic update — apply patch immediately, then re-fetch to pick up
      // server-side fields the dispatcher didn't include (colors, fonts, etc.).
      setBranding((prev) => {
        const next = { ...prev, ...detail } as BrandingPayload;
        cachedBranding = next;
        applyBrandingStyles(next);
        return next;
      });
      fetchBranding().then((fresh) => {
        if (!mounted) return;
        setBranding(fresh);
        applyBrandingStyles(fresh);
      });
    };

    window.addEventListener('branding-updated', onUpdated);
    return () => {
      mounted = false;
      window.removeEventListener('branding-updated', onUpdated);
    };
  }, []);

  return branding;
}

export function refreshBrandingFromServer(): void {
  fetchBranding().then((b) => {
    applyBrandingStyles(b);
    window.dispatchEvent(new CustomEvent('branding-updated', { detail: b }));
  });
}
