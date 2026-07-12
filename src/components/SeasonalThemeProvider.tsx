import { useEffect } from 'react';
import { useBranding } from '../lib/useBranding';
import { applySeasonalTheme, DEFAULT_SEASON_CONFIG, SEASON_CLASSES } from '../lib/seasonalTheme';
import {
  applyHolidayTheme, clearHolidayTheme,
  getActiveHoliday, DEFAULT_HOLIDAY_CONFIG,
} from '../lib/holidayTheme';

const SEASON_PARTICLE_MAP: Partial<Record<string, string[]>> = {
  'season-spring': ['🌸', '🌺', '🌼', '🌸', '🌺'],
  'season-autumn': ['🍂', '🍁', '🍃', '🍂', '🍁'],
  'season-winter': ['❄️', '❄️', '✨', '❄️', '✨'],
};

const PARTICLE_COUNT = 12;

function removeParticles() {
  document.querySelectorAll('.season-particle').forEach(el => el.remove());
}

function spawnParticles(emojis: string[]) {
  removeParticles();
  if (!emojis.length) return;
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const el = document.createElement('div');
    el.className = 'season-particle';
    el.setAttribute('aria-hidden', 'true');
    el.textContent = emojis[i % emojis.length];
    el.style.left = `${Math.random() * 95}%`;
    el.style.animationDuration = `${7 + Math.random() * 9}s`;
    el.style.animationDelay = `${Math.random() * 12}s`;
    el.style.fontSize = `${0.8 + Math.random() * 0.6}rem`;
    el.style.opacity = '0';
    document.body.appendChild(el);
  }
}

export function SeasonalThemeProvider({ children }: { children: React.ReactNode }) {
  const branding = useBranding();

  useEffect(() => {
    const holidayConfig = (branding as any).holiday ?? DEFAULT_HOLIDAY_CONFIG;
    const seasonalConfig = (branding as any).seasonal ?? DEFAULT_SEASON_CONFIG;

    const active = getActiveHoliday(new Date(), holidayConfig);

    if (active) {
      applyHolidayTheme(active.theme);
      spawnParticles(active.theme.particles);
    } else {
      clearHolidayTheme();
      applySeasonalTheme(seasonalConfig);

      if (seasonalConfig.enabled) {
        const root = document.documentElement;
        const activeClass = SEASON_CLASSES.find(c => root.classList.contains(c)) ?? null;
        const emojis = activeClass ? (SEASON_PARTICLE_MAP[activeClass] ?? []) : [];
        spawnParticles(emojis);
      } else {
        removeParticles();
      }
    }

    return () => { removeParticles(); };
  }, [branding]);

  return <>{children}</>;
}
