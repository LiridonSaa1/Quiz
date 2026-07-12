export type Season = 'spring' | 'summer' | 'autumn' | 'winter';

export interface SeasonConfig {
  enabled: boolean;
  mode: 'auto' | 'manual';
  override: Season;
  customPrimary: string;
}

export const DEFAULT_SEASON_CONFIG: SeasonConfig = {
  enabled: true,
  mode: 'auto',
  override: 'summer',
  customPrimary: '',
};

export function getCurrentSeason(date = new Date()): Season {
  const m = date.getMonth() + 1;
  if (m >= 3 && m <= 5) return 'spring';
  if (m >= 6 && m <= 8) return 'summer';
  if (m >= 9 && m <= 11) return 'autumn';
  return 'winter';
}

export interface SeasonTheme {
  label: string;
  emoji: string;
  primary: string;
  accent: string;
  bg: string;
  gradFrom: string;
  gradTo: string;
  textDark: string;
  cssClass: string;
  description: string;
}

export const SEASON_THEMES: Record<Season, SeasonTheme> = {
  spring: {
    label: 'Spring',
    emoji: '🌸',
    primary: '#16a34a',
    accent: '#86efac',
    bg: '#f0fdf4',
    gradFrom: '#22c55e',
    gradTo: '#15803d',
    textDark: '#14532d',
    cssClass: 'season-spring',
    description: 'Fresh greens, flowers and nature',
  },
  summer: {
    label: 'Summer',
    emoji: '☀️',
    primary: '#2563eb',
    accent: '#fbbf24',
    bg: '#eff6ff',
    gradFrom: '#3b82f6',
    gradTo: '#1d4ed8',
    textDark: '#1e3a5f',
    cssClass: 'season-summer',
    description: 'Blue skies, sunshine and ocean vibes',
  },
  autumn: {
    label: 'Autumn',
    emoji: '🍂',
    primary: '#ea580c',
    accent: '#fbbf24',
    bg: '#fff7ed',
    gradFrom: '#f97316',
    gradTo: '#c2410c',
    textDark: '#431407',
    cssClass: 'season-autumn',
    description: 'Warm oranges, amber and falling leaves',
  },
  winter: {
    label: 'Winter',
    emoji: '❄️',
    primary: '#1e40af',
    accent: '#93c5fd',
    bg: '#f0f9ff',
    gradFrom: '#3b82f6',
    gradTo: '#1e3a5f',
    textDark: '#1e3a5f',
    cssClass: 'season-winter',
    description: 'Cool blues, snow and frosted glass',
  },
};

const SEASON_CSS_PROPS = [
  '--season-primary', '--season-accent', '--season-bg',
  '--season-grad-from', '--season-grad-to', '--season-text',
] as const;

export const SEASON_CLASSES = ['season-spring', 'season-summer', 'season-autumn', 'season-winter'];

export function applySeasonalTheme(config: SeasonConfig): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;

  SEASON_CLASSES.forEach(c => root.classList.remove(c));

  if (!config.enabled) {
    SEASON_CSS_PROPS.forEach(p => root.style.removeProperty(p));
    return;
  }

  const season = config.mode === 'auto' ? getCurrentSeason() : config.override;
  const theme = SEASON_THEMES[season];

  root.classList.add(theme.cssClass);
  root.style.setProperty('--season-primary', config.customPrimary || theme.primary);
  root.style.setProperty('--season-accent', theme.accent);
  root.style.setProperty('--season-bg', theme.bg);
  root.style.setProperty('--season-grad-from', config.customPrimary || theme.gradFrom);
  root.style.setProperty('--season-grad-to', theme.gradTo);
  root.style.setProperty('--season-text', theme.textDark);
}
