export type HolidayKey =
  | 'new_year'
  | 'orthodox_christmas'
  | 'independence_day'
  | 'eid_al_fitr'
  | 'catholic_easter'
  | 'orthodox_easter'
  | 'constitution_day'
  | 'labour_day'
  | 'europe_day'
  | 'eid_al_adha'
  | 'catholic_christmas';

export interface HolidayTheme {
  key: HolidayKey;
  label: string;
  emoji: string;
  description: string;
  cssClass: string;
  primary: string;
  accent: string;
  bg: string;
  gradFrom: string;
  gradTo: string;
  textDark: string;
  particles: string[];
  defaultMessage: string;
}

export interface HolidayConfig {
  enabled: boolean;
  daysBeforeStart: number;
  daysAfterEnd: number;
  customMessages: Partial<Record<HolidayKey, string>>;
  disabledHolidays: HolidayKey[];
}

export const DEFAULT_HOLIDAY_CONFIG: HolidayConfig = {
  enabled: true,
  daysBeforeStart: 1,
  daysAfterEnd: 1,
  customMessages: {},
  disabledHolidays: [],
};

export const HOLIDAY_ORDER: HolidayKey[] = [
  'new_year',
  'orthodox_christmas',
  'independence_day',
  'eid_al_fitr',
  'catholic_easter',
  'orthodox_easter',
  'constitution_day',
  'labour_day',
  'europe_day',
  'eid_al_adha',
  'catholic_christmas',
];

export const HOLIDAY_THEMES: Record<HolidayKey, HolidayTheme> = {
  new_year: {
    key: 'new_year',
    label: 'Viti i Ri — New Year',
    emoji: '🎆',
    description: '1–2 Janar · Fishekzjarre, ar, blu dhe bardhë',
    cssClass: 'holiday-new-year',
    primary: '#1d4ed8',
    accent: '#fbbf24',
    bg: '#eff6ff',
    gradFrom: '#1e40af',
    gradTo: '#7c3aed',
    textDark: '#1e3a5f',
    particles: ['🎆', '🎇', '✨', '🎊', '🎉', '⭐'],
    defaultMessage: 'Gëzuar Vitin e Ri! 🎆',
  },
  orthodox_christmas: {
    key: 'orthodox_christmas',
    label: 'Krishtlindjet Ortodokse',
    emoji: '⛪',
    description: '7 Janar · Dimër, dëborë, paletë blu dhe bardhë',
    cssClass: 'holiday-orthodox-christmas',
    primary: '#1e40af',
    accent: '#93c5fd',
    bg: '#f0f9ff',
    gradFrom: '#3b82f6',
    gradTo: '#1e3a5f',
    textDark: '#1e3a5f',
    particles: ['❄️', '⛪', '✨', '❄️', '🕯️'],
    defaultMessage: 'Gëzuar Krishtlindjet Ortodokse! ⛪',
  },
  independence_day: {
    key: 'independence_day',
    label: 'Dita e Pavarësisë së Kosovës',
    emoji: '🇽🇰',
    description: '17 Shkurt · Ngjyrat e flamurit të Kosovës — blu dhe verdhë',
    cssClass: 'holiday-independence-day',
    primary: '#1a56db',
    accent: '#f5a623',
    bg: '#eff6ff',
    gradFrom: '#1a56db',
    gradTo: '#0e3db3',
    textDark: '#0e2a7a',
    particles: ['🇽🇰', '⭐', '🎊', '✨', '🎉', '🏳️'],
    defaultMessage: 'Urime Pavarësinë e Kosovës! 🇽🇰',
  },
  eid_al_fitr: {
    key: 'eid_al_fitr',
    label: 'Bajrami i Madh — Eid al-Fitr',
    emoji: '🌙',
    description: 'E ndryshueshme · Modele gjeometrike islame, gjelbër dhe ar',
    cssClass: 'holiday-eid-al-fitr',
    primary: '#15803d',
    accent: '#d4af37',
    bg: '#f0fdf4',
    gradFrom: '#16a34a',
    gradTo: '#14532d',
    textDark: '#14532d',
    particles: ['🌙', '⭐', '✨', '🌙', '⭐', '🕌'],
    defaultMessage: 'Bajrami Mubarak! 🌙',
  },
  catholic_easter: {
    key: 'catholic_easter',
    label: 'Pashkët Katolike',
    emoji: '🐣',
    description: 'E ndryshueshme (E Hënë) · Lule pranvere, vezë, ngjyra pastel',
    cssClass: 'holiday-catholic-easter',
    primary: '#16a34a',
    accent: '#f9a8d4',
    bg: '#f0fdf4',
    gradFrom: '#22c55e',
    gradTo: '#86efac',
    textDark: '#14532d',
    particles: ['🌸', '🐣', '🌼', '🦋', '🌺', '🐰'],
    defaultMessage: 'Gëzuar Pashkët Katolike! 🐣',
  },
  orthodox_easter: {
    key: 'orthodox_easter',
    label: 'Pashkët Ortodokse',
    emoji: '🥚',
    description: 'E ndryshueshme (E Hënë) · Dekorime tradicionale, ngjyra pranvere',
    cssClass: 'holiday-orthodox-easter',
    primary: '#d97706',
    accent: '#fbbf24',
    bg: '#fffbeb',
    gradFrom: '#f59e0b',
    gradTo: '#d97706',
    textDark: '#451a03',
    particles: ['🥚', '🌷', '✝️', '🌸', '🌿', '🐣'],
    defaultMessage: 'Gëzuar Pashkët Ortodokse! 🥚',
  },
  constitution_day: {
    key: 'constitution_day',
    label: 'Dita e Kushtetutës',
    emoji: '📜',
    description: '9 Prill · Temë blu profesionale, e frymëzuar nga Kushtetuta',
    cssClass: 'holiday-constitution-day',
    primary: '#1e40af',
    accent: '#3b82f6',
    bg: '#eff6ff',
    gradFrom: '#1e40af',
    gradTo: '#1e3a8a',
    textDark: '#1e3a5f',
    particles: ['📜', '⭐', '🏛️', '🇽🇰', '✨'],
    defaultMessage: 'Urime Dita e Kushtetutës! 📜',
  },
  labour_day: {
    key: 'labour_day',
    label: 'Dita e Punës',
    emoji: '🌿',
    description: '1 Maj · Temë parku pranveror, ngjyra jeshile të freskëta',
    cssClass: 'holiday-labour-day',
    primary: '#16a34a',
    accent: '#86efac',
    bg: '#f0fdf4',
    gradFrom: '#22c55e',
    gradTo: '#15803d',
    textDark: '#14532d',
    particles: ['🌿', '🌱', '🌻', '🍃', '🌾', '🌳'],
    defaultMessage: 'Gëzuar Ditën e Punës! 🌿',
  },
  europe_day: {
    key: 'europe_day',
    label: 'Dita e Europës',
    emoji: '🇪🇺',
    description: '9 Maj · Ngjyrat e BE-së — blu dhe yje ari',
    cssClass: 'holiday-europe-day',
    primary: '#003399',
    accent: '#ffcc00',
    bg: '#eff6ff',
    gradFrom: '#003399',
    gradTo: '#1a56db',
    textDark: '#001a6e',
    particles: ['🇪🇺', '⭐', '✨', '🌟', '🇽🇰', '⭐'],
    defaultMessage: 'Gëzuar Ditën e Europës! 🇪🇺',
  },
  eid_al_adha: {
    key: 'eid_al_adha',
    label: 'Bajrami i Vogël — Eid al-Adha',
    emoji: '🕌',
    description: 'E ndryshueshme · Gjelbër premium dhe ar, dekorime elegante',
    cssClass: 'holiday-eid-al-adha',
    primary: '#15803d',
    accent: '#d4af37',
    bg: '#f0fdf4',
    gradFrom: '#16a34a',
    gradTo: '#14532d',
    textDark: '#14532d',
    particles: ['🕌', '🌙', '⭐', '✨', '🌙', '🏮'],
    defaultMessage: 'Bajrami Kurban Mubarak! 🕌',
  },
  catholic_christmas: {
    key: 'catholic_christmas',
    label: 'Krishtlindjet Katolike',
    emoji: '🎄',
    description: '25 Dhjetor · Pema e Krishtlindjes, dëborë, e kuqe dhe jeshile',
    cssClass: 'holiday-catholic-christmas',
    primary: '#16a34a',
    accent: '#dc2626',
    bg: '#f0fdf4',
    gradFrom: '#15803d',
    gradTo: '#14532d',
    textDark: '#14532d',
    particles: ['🎄', '❄️', '🎅', '⭐', '🎁', '✨'],
    defaultMessage: 'Gëzuar Krishtlindjet! 🎄',
  },
};

// ── Easter Calculations ───────────────────────────────────────────────────────

export function catholicEaster(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

export function orthodoxEaster(year: number): Date {
  const a = year % 4;
  const b = year % 7;
  const c = year % 19;
  const d = (19 * c + 15) % 30;
  const e = (2 * a + 4 * b - d + 34) % 7;
  const month = Math.floor((d + e + 114) / 31);
  const day = ((d + e + 114) % 31) + 1;
  return new Date(year, month - 1, day + 13);
}

// ── Eid dates (approximate, hardcoded 2024–2031) ─────────────────────────────
const EID_DATES: Record<string, { fitr: [number, number]; adha: [number, number] }> = {
  '2024': { fitr: [4, 10],  adha: [6, 17] },
  '2025': { fitr: [3, 30],  adha: [6, 7]  },
  '2026': { fitr: [3, 20],  adha: [5, 27] },
  '2027': { fitr: [3, 9],   adha: [5, 17] },
  '2028': { fitr: [2, 27],  adha: [5, 5]  },
  '2029': { fitr: [2, 15],  adha: [4, 23] },
  '2030': { fitr: [2, 5],   adha: [4, 13] },
  '2031': { fitr: [1, 26],  adha: [4, 2]  },
};

// ── Fixed holiday calendar ───────────────────────────────────────────────────
interface FixedHoliday {
  month: number;
  day: number;
  endDay?: number;
  key: HolidayKey;
}

const FIXED_HOLIDAYS: FixedHoliday[] = [
  { month: 1,  day: 1,  endDay: 2, key: 'new_year' },
  { month: 1,  day: 7,             key: 'orthodox_christmas' },
  { month: 2,  day: 17,            key: 'independence_day' },
  { month: 4,  day: 9,             key: 'constitution_day' },
  { month: 5,  day: 1,             key: 'labour_day' },
  { month: 5,  day: 9,             key: 'europe_day' },
  { month: 12, day: 25,            key: 'catholic_christmas' },
];

// ── Active holiday detection ─────────────────────────────────────────────────

export interface ActiveHoliday {
  key: HolidayKey;
  theme: HolidayTheme;
  message: string;
}

export function getActiveHoliday(
  date: Date,
  config: HolidayConfig,
): ActiveHoliday | null {
  if (!config.enabled) return null;

  const year = date.getFullYear();
  const before = Math.max(0, config.daysBeforeStart ?? 1);
  const after = Math.max(0, config.daysAfterEnd ?? 1);

  const candidates: Array<{ key: HolidayKey; start: Date; end: Date }> = [];

  for (const h of FIXED_HOLIDAYS) {
    const start = new Date(year, h.month - 1, h.day);
    const end   = new Date(year, h.month - 1, h.endDay ?? h.day);
    candidates.push({ key: h.key, start, end });
  }

  const catSun = catholicEaster(year);
  const catMon = new Date(catSun); catMon.setDate(catMon.getDate() + 1);
  candidates.push({ key: 'catholic_easter', start: catMon, end: catMon });

  const orthSun = orthodoxEaster(year);
  const orthMon = new Date(orthSun); orthMon.setDate(orthMon.getDate() + 1);
  candidates.push({ key: 'orthodox_easter', start: orthMon, end: orthMon });

  const eid = EID_DATES[String(year)];
  if (eid) {
    candidates.push({
      key: 'eid_al_fitr',
      start: new Date(year, eid.fitr[0] - 1, eid.fitr[1]),
      end:   new Date(year, eid.fitr[0] - 1, eid.fitr[1]),
    });
    candidates.push({
      key: 'eid_al_adha',
      start: new Date(year, eid.adha[0] - 1, eid.adha[1]),
      end:   new Date(year, eid.adha[0] - 1, eid.adha[1]),
    });
  }

  const today = new Date(year, date.getMonth(), date.getDate());

  for (const c of candidates) {
    if ((config.disabledHolidays ?? []).includes(c.key)) continue;

    const winStart = new Date(c.start); winStart.setDate(winStart.getDate() - before);
    const winEnd   = new Date(c.end);   winEnd.setDate(winEnd.getDate() + after);

    if (today >= winStart && today <= winEnd) {
      const theme = HOLIDAY_THEMES[c.key];
      const message = (config.customMessages ?? {})[c.key] ?? theme.defaultMessage;
      return { key: c.key, theme, message };
    }
  }

  return null;
}

// ── Next occurrence of each holiday ─────────────────────────────────────────

export function getNextOccurrence(key: HolidayKey, fromDate = new Date()): Date {
  const year = fromDate.getFullYear();

  const compute = (y: number): Date | null => {
    const fixed = FIXED_HOLIDAYS.find(h => h.key === key);
    if (fixed) return new Date(y, fixed.month - 1, fixed.day);

    if (key === 'catholic_easter') {
      const sun = catholicEaster(y);
      const mon = new Date(sun); mon.setDate(mon.getDate() + 1);
      return mon;
    }
    if (key === 'orthodox_easter') {
      const sun = orthodoxEaster(y);
      const mon = new Date(sun); mon.setDate(mon.getDate() + 1);
      return mon;
    }
    if (key === 'eid_al_fitr') {
      const e = EID_DATES[String(y)];
      return e ? new Date(y, e.fitr[0] - 1, e.fitr[1]) : null;
    }
    if (key === 'eid_al_adha') {
      const e = EID_DATES[String(y)];
      return e ? new Date(y, e.adha[0] - 1, e.adha[1]) : null;
    }
    return null;
  };

  const today = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate());

  for (let y = year; y <= year + 2; y++) {
    const d = compute(y);
    if (d && d >= today) return d;
  }

  return compute(year + 1) ?? new Date(year + 1, 0, 1);
}

// ── CSS application ──────────────────────────────────────────────────────────

export const HOLIDAY_CSS_CLASSES = HOLIDAY_ORDER.map(k => HOLIDAY_THEMES[k].cssClass);

const SEASON_CSS_PROPS = [
  '--season-primary', '--season-accent', '--season-bg',
  '--season-grad-from', '--season-grad-to', '--season-text',
] as const;

export function applyHolidayTheme(theme: HolidayTheme): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;

  HOLIDAY_CSS_CLASSES.forEach(c => root.classList.remove(c));
  root.classList.add(theme.cssClass);

  root.style.setProperty('--season-primary', theme.primary);
  root.style.setProperty('--season-accent',   theme.accent);
  root.style.setProperty('--season-bg',        theme.bg);
  root.style.setProperty('--season-grad-from', theme.gradFrom);
  root.style.setProperty('--season-grad-to',   theme.gradTo);
  root.style.setProperty('--season-text',      theme.textDark);
}

export function clearHolidayTheme(): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  HOLIDAY_CSS_CLASSES.forEach(c => root.classList.remove(c));
  SEASON_CSS_PROPS.forEach(p => root.style.removeProperty(p));
}
