import { useEffect } from 'react';
import { useBranding } from '../lib/useBranding';
import { applySeasonalTheme, DEFAULT_SEASON_CONFIG, SEASON_CLASSES } from '../lib/seasonalTheme';

const PARTICLE_MAP: Partial<Record<string, string[]>> = {
  'season-spring': ['🌸', '🌺', '🌼', '🌸', '🌺'],
  'season-autumn': ['🍂', '🍁', '🍃', '🍂', '🍁'],
  'season-winter': ['❄️', '❄️', '✨', '❄️', '✨'],
};

const PARTICLE_COUNT = 10;

function removeParticles() {
  document.querySelectorAll('.season-particle').forEach(el => el.remove());
}

function spawnParticles(cssClass: string) {
  removeParticles();
  const emojis = PARTICLE_MAP[cssClass];
  if (!emojis) return;

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const el = document.createElement('div');
    el.className = 'season-particle';
    el.setAttribute('aria-hidden', 'true');
    el.textContent = emojis[i % emojis.length];
    el.style.left = `${Math.random() * 95}%`;
    el.style.animationDuration = `${7 + Math.random() * 9}s`;
    el.style.animationDelay = `${Math.random() * 10}s`;
    el.style.fontSize = `${0.75 + Math.random() * 0.55}rem`;
    el.style.opacity = '0';
    document.body.appendChild(el);
  }
}

export function SeasonalThemeProvider({ children }: { children: React.ReactNode }) {
  const branding = useBranding();

  useEffect(() => {
    const seasonal = (branding as any).seasonal ?? DEFAULT_SEASON_CONFIG;
    applySeasonalTheme(seasonal);

    if (!seasonal.enabled) {
      removeParticles();
      return;
    }

    const root = document.documentElement;
    const activeClass = SEASON_CLASSES.find(c => root.classList.contains(c)) ?? null;
    if (activeClass) {
      spawnParticles(activeClass);
    } else {
      removeParticles();
    }

    return () => { removeParticles(); };
  }, [branding]);

  return <>{children}</>;
}
