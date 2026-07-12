import { useEffect, useRef, useState } from 'react';
import { HolidayKey } from '../lib/holidayTheme';

/* ── Per-holiday particle emojis ─────────────────────────────────── */
const HOLIDAY_PARTICLES: Record<HolidayKey, string[]> = {
  new_year:             ['🎆', '🎇', '✨', '🎊', '🎉', '⭐', '🎆', '🎇'],
  orthodox_christmas:   ['❄️', '❄️', '✨', '⭐', '🕯️', '❄️', '❄️'],
  independence_day:     ['🇽🇰', '⭐', '🎊', '✨', '🎉', '🇽🇰', '⭐'],
  eid_al_fitr:         ['🌙', '⭐', '✨', '🕌', '🌟', '🌙', '⭐'],
  catholic_easter:      ['🥚', '🌸', '🌺', '🌼', '🐇', '🌸', '🥚'],
  orthodox_easter:      ['🥚', '🕊️', '🌷', '✨', '🌸', '🥚', '🌷'],
  constitution_day:     ['✨', '⭐', '💫', '✨', '⭐', '💫'],
  labour_day:           ['🌿', '🍃', '🌳', '🌱', '🍀', '🌿'],
  europe_day:           ['⭐', '🇪🇺', '⭐', '🌟', '⭐', '🇪🇺'],
  eid_al_adha:         ['🌙', '⭐', '🎁', '🌟', '✨', '🌙'],
  catholic_christmas:   ['❄️', '🎄', '⭐', '🎅', '✨', '🔔', '❄️'],
};

/* ── Logo accessories ────────────────────────────────────────────── */
export const HOLIDAY_ACCESSORIES: Record<HolidayKey, string> = {
  new_year:             '🎆',
  orthodox_christmas:   '⭐',
  independence_day:     '🇽🇰',
  eid_al_fitr:         '🌙',
  catholic_easter:      '🥚',
  orthodox_easter:      '🥚',
  constitution_day:     '📜',
  labour_day:           '🌿',
  europe_day:           '🇪🇺',
  eid_al_adha:         '🌙',
  catholic_christmas:   '🎅',
};

/* ── Default greetings ───────────────────────────────────────────── */
export const HOLIDAY_GREETINGS: Record<HolidayKey, string> = {
  new_year:             '🎆 Gëzuar Vitin e Ri!',
  orthodox_christmas:   '⭐ Gëzuar Krishtlindjet Ortodokse!',
  independence_day:     '🇽🇰 Urime Pavarësinë e Kosovës!',
  eid_al_fitr:         '🌙 Bajrami Mubarak!',
  catholic_easter:      '🥚 Gëzuar Pashkët Katolike!',
  orthodox_easter:      '🥚 Gëzuar Pashkët Ortodokse!',
  constitution_day:     '📜 Gëzuar Ditën e Kushtetutës!',
  labour_day:           '🌿 Gëzuar Ditën e Punës!',
  europe_day:           '🇪🇺 Gëzuar Ditën e Evropës!',
  eid_al_adha:         '🌙 Bajram Mubarak!',
  catholic_christmas:   '🎄 Gëzuar Krishtlindjet!',
};

/* ── Holidays that use canvas fireworks ──────────────────────────── */
const FIREWORK_HOLIDAYS: Partial<Record<HolidayKey, string[]>> = {
  new_year:         ['#fbbf24', '#1d4ed8', '#ffffff', '#7c3aed', '#f59e0b', '#60a5fa'],
  independence_day: ['#fbbf24', '#1a56db', '#ffffff', '#f5a623', '#60a5fa'],
};

/* ── Particle helpers ────────────────────────────────────────────── */
const PARTICLE_COUNT = 20;

function spawnHolidayParticles(key: HolidayKey): void {
  removeHolidayParticles();
  const emojis = HOLIDAY_PARTICLES[key] ?? [];
  if (!emojis.length) return;
  const isFloat  = key === 'eid_al_fitr' || key === 'eid_al_adha';
  const isSpark  = key === 'constitution_day';
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const el = document.createElement('div');
    el.className = 'holiday-particle';
    el.setAttribute('aria-hidden', 'true');
    el.textContent = emojis[i % emojis.length];
    if (isSpark) {
      el.style.left = `${5 + Math.random() * 90}%`;
      el.style.top  = `${10 + Math.random() * 70}%`;
      el.style.animationDuration = `${1.5 + Math.random() * 2}s`;
      el.style.animationDelay   = `${Math.random() * 2}s`;
    } else {
      el.style.left = `${Math.random() * 95}%`;
      el.style.top  = isFloat ? '100%' : '0';
      el.style.animationDuration = `${8 + Math.random() * 10}s`;
      el.style.animationDelay   = `${Math.random() * 14}s`;
    }
    el.style.fontSize = `${0.85 + Math.random() * 0.9}rem`;
    el.style.opacity  = '0';
    document.body.appendChild(el);
  }
}

function removeHolidayParticles(): void {
  document.querySelectorAll('.holiday-particle').forEach(el => el.remove());
}

/* ── Canvas fireworks engine ─────────────────────────────────────── */
interface Firework { x: number; y: number; vx: number; vy: number; alpha: number; color: string; size: number; }

function startFireworks(canvas: HTMLCanvasElement, colors: string[]): () => void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return () => {};

  const resize = () => {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
  };
  resize();

  const particles: Firework[] = [];
  let raf = 0;
  let lastLaunch = 0;

  const launch = () => {
    const x = 60 + Math.random() * (canvas.width - 120);
    const y = 60 + Math.random() * (canvas.height * 0.55);
    const color = colors[Math.floor(Math.random() * colors.length)];
    const count = 30 + Math.floor(Math.random() * 22);
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count;
      const speed = 1.8 + Math.random() * 3.2;
      particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        alpha: 1, color, size: 1.8 + Math.random() * 2.2,
      });
    }
  };

  const draw = (ts: number) => {
    if (!canvas.isConnected) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (ts - lastLaunch > 1800 + Math.random() * 1400) { launch(); lastLaunch = ts; }
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x   += p.vx;
      p.y   += p.vy;
      p.vy  += 0.035;
      p.vx  *= 0.982;
      p.vy  *= 0.982;
      p.alpha -= 0.011;
      if (p.alpha <= 0) { particles.splice(i, 1); continue; }
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fillStyle = p.color + Math.round(p.alpha * 255).toString(16).padStart(2, '0');
      ctx.fill();
    }
    raf = requestAnimationFrame(draw);
  };

  raf = requestAnimationFrame(draw);
  window.addEventListener('resize', resize);
  return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
}

/* ── Component ───────────────────────────────────────────────────── */
interface Props {
  holidayKey: HolidayKey | null;
  customGreeting?: string;
}

export function HolidayEffects({ holidayKey, customGreeting }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [bannerVisible, setBannerVisible] = useState(false);

  useEffect(() => {
    if (!holidayKey) { removeHolidayParticles(); setBannerVisible(false); return; }
    spawnHolidayParticles(holidayKey);
    setBannerVisible(true);
    const t = setTimeout(() => setBannerVisible(false), 6000);

    let stopFW: (() => void) | null = null;
    if (canvasRef.current && FIREWORK_HOLIDAYS[holidayKey]) {
      stopFW = startFireworks(canvasRef.current, FIREWORK_HOLIDAYS[holidayKey]!);
    }

    return () => {
      clearTimeout(t);
      removeHolidayParticles();
      stopFW?.();
    };
  }, [holidayKey]);

  if (!holidayKey) return null;

  const hasFireworks  = !!FIREWORK_HOLIDAYS[holidayKey];
  const greetingText  = customGreeting || HOLIDAY_GREETINGS[holidayKey];
  const accessory     = HOLIDAY_ACCESSORIES[holidayKey];

  return (
    <>
      {/* Canvas fireworks layer */}
      {hasFireworks && (
        <canvas
          ref={canvasRef}
          className="holiday-canvas"
          style={{
            position: 'fixed', inset: 0,
            width: '100%', height: '100%',
            pointerEvents: 'none', zIndex: 0,
          }}
        />
      )}

      {/* Greeting banner (fades out after 6 s) */}
      {greetingText && bannerVisible && (
        <div
          className="holiday-banner"
          style={{
            position: 'fixed', top: 0, left: 0, right: 0,
            zIndex: 9500, pointerEvents: 'none',
            display: 'flex', justifyContent: 'center', padding: '6px 0',
            animation: 'h-banner-fade 6s ease-in-out forwards',
          }}
        >
          <div
            className="notification-holiday-badge"
            style={{
              background: `linear-gradient(135deg, var(--season-grad-from, #6366f1), var(--season-grad-to, #4f46e5))`,
              color: '#fff',
              padding: '4px 14px',
              borderRadius: '999px',
              fontSize: '0.78rem',
              fontWeight: 700,
              letterSpacing: '0.2px',
              boxShadow: '0 2px 12px rgba(0,0,0,0.18)',
              display: 'flex', alignItems: 'center', gap: '6px',
            }}
          >
            {greetingText}
          </div>
        </div>
      )}

      {/* Logo accessory — positioned near top-left where logos typically live */}
      <div
        className="holiday-logo-accessory"
        style={{
          position: 'fixed', top: 8, left: 230,
          zIndex: 9600, pointerEvents: 'none',
          fontSize: '1.1rem', lineHeight: 1,
          animation: 'h-accessory-bounce 2s ease-in-out infinite',
        }}
        aria-hidden
      >
        {accessory}
      </div>
    </>
  );
}
