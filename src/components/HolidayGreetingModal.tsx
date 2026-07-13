import { useEffect, useState } from 'react';
import { useActiveHoliday } from '../lib/useActiveHoliday';
import { HOLIDAY_ACCESSORIES } from './HolidayEffects';

const PREFIX = 'holiday_greeted_';

export default function HolidayGreetingModal() {
  const active = useActiveHoliday();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!active) return;
    const storageKey = PREFIX + active.key;
    if (sessionStorage.getItem(storageKey)) return;
    const t = setTimeout(() => setVisible(true), 900);
    return () => clearTimeout(t);
  }, [active?.key]);

  const dismiss = () => {
    if (active) sessionStorage.setItem(PREFIX + active.key, '1');
    setVisible(false);
  };

  if (!active || !visible) return null;

  const { theme, message } = active;
  const accessory = HOLIDAY_ACCESSORIES[active.key];

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9900,
        background: 'rgba(0,0,0,0.7)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '1rem',
        animation: 'h-modal-bg-in 0.3s ease-out forwards',
      }}
      onClick={dismiss}
      role="dialog"
      aria-modal="true"
    >
      <div
        style={{
          background: `linear-gradient(145deg, ${theme.gradFrom} 0%, ${theme.gradTo} 100%)`,
          borderRadius: '1.75rem',
          padding: '2.5rem 2rem 2rem',
          maxWidth: '400px',
          width: '100%',
          textAlign: 'center',
          boxShadow: `0 32px 96px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.13), inset 0 1px 0 rgba(255,255,255,0.2)`,
          animation: 'h-modal-card-in 0.45s cubic-bezier(0.34,1.56,0.64,1) forwards',
          position: 'relative',
          overflow: 'hidden',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Subtle noise overlay */}
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.04)', borderRadius: 'inherit', pointerEvents: 'none' }} />

        {/* Big emoji */}
        <div style={{ fontSize: '4.5rem', lineHeight: 1, marginBottom: '1.25rem', filter: 'drop-shadow(0 6px 20px rgba(0,0,0,0.35))', position: 'relative' }}>
          {accessory}
        </div>

        {/* Greeting */}
        <h2 style={{ color: '#fff', fontSize: '1.55rem', fontWeight: 800, marginBottom: '0.55rem', textShadow: '0 2px 14px rgba(0,0,0,0.3)', lineHeight: 1.25, position: 'relative' }}>
          {message}
        </h2>
        <p style={{ color: 'rgba(255,255,255,0.72)', fontSize: '0.88rem', lineHeight: 1.5, marginBottom: '2rem', position: 'relative' }}>
          {theme.description}
        </p>

        {/* Particles row */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', marginBottom: '1.5rem', fontSize: '1.25rem', position: 'relative' }}>
          {theme.particles.slice(0, 6).map((p, i) => (
            <span key={i} style={{ display: 'inline-block', animation: `h-bounce-pop ${0.6 + i * 0.12}s cubic-bezier(0.34,1.56,0.64,1) both`, animationDelay: `${i * 0.07}s` }}>{p}</span>
          ))}
        </div>

        {/* Dismiss button */}
        <button
          onClick={dismiss}
          style={{
            background: 'rgba(255,255,255,0.18)',
            color: '#fff',
            border: '1.5px solid rgba(255,255,255,0.32)',
            borderRadius: '999px',
            padding: '0.65rem 2.25rem',
            fontSize: '0.92rem',
            fontWeight: 700,
            cursor: 'pointer',
            transition: 'background 0.18s, transform 0.1s',
            position: 'relative',
            letterSpacing: '0.01em',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.3)'; e.currentTarget.style.transform = 'scale(1.03)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.18)'; e.currentTarget.style.transform = 'scale(1)'; }}
        >
          ✨ Vazhdo
        </button>
      </div>
    </div>
  );
}
