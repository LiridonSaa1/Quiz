import { useMemo } from 'react';
import { useActiveHoliday } from '../lib/useActiveHoliday';
import { getNextOccurrence, HOLIDAY_THEMES, HOLIDAY_ORDER, type HolidayKey } from '../lib/holidayTheme';

function getClosestUpcoming(): { key: HolidayKey; days: number } | null {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let best: { key: HolidayKey; days: number } | null = null;
  for (const key of HOLIDAY_ORDER) {
    const next = getNextOccurrence(key, now);
    const ms = next.getTime() - today.getTime();
    const days = Math.round(ms / 86_400_000);
    if (days > 0 && days <= 30 && (!best || days < best.days)) {
      best = { key, days };
    }
  }
  return best;
}

interface Props {
  className?: string;
}

export default function HolidayDashboardBanner({ className = '' }: Props) {
  const active = useActiveHoliday();
  const upcoming = useMemo(() => (active ? null : getClosestUpcoming()), [active]);

  if (!active && !upcoming) return null;

  /* ── Active holiday banner ── */
  if (active) {
    const { theme, message } = active;
    return (
      <div
        className={className}
        style={{
          background: `linear-gradient(135deg, ${theme.gradFrom}ee 0%, ${theme.gradTo}dd 100%)`,
          borderRadius: '0.875rem',
          padding: '0.9rem 1.1rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          boxShadow: `0 4px 28px ${theme.gradFrom}55`,
          border: '1px solid rgba(255,255,255,0.14)',
        }}
      >
        <span style={{ fontSize: '1.9rem', filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.25))', flexShrink: 0, lineHeight: 1 }}>
          {theme.emoji}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: '#fff', fontWeight: 700, fontSize: '0.95rem', lineHeight: 1.3 }}>{message}</div>
          <div style={{ color: 'rgba(255,255,255,0.62)', fontSize: '0.77rem', marginTop: '0.15rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {theme.label}
          </div>
        </div>
        <div style={{
          flexShrink: 0,
          background: 'rgba(255,255,255,0.16)',
          border: '1px solid rgba(255,255,255,0.28)',
          borderRadius: '999px',
          padding: '0.2rem 0.8rem',
          color: '#fff',
          fontSize: '0.7rem',
          fontWeight: 700,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          whiteSpace: 'nowrap',
        }}>
          Sot 🎉
        </div>
      </div>
    );
  }

  /* ── Countdown banner ── */
  if (!upcoming) return null;
  const ct = HOLIDAY_THEMES[upcoming.key];
  return (
    <div
      className={className}
      style={{
        background: `linear-gradient(135deg, ${ct.gradFrom}1a 0%, ${ct.gradTo}14 100%)`,
        border: `1.5px solid ${ct.gradFrom}44`,
        borderRadius: '0.875rem',
        padding: '0.8rem 1.1rem',
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
      }}
    >
      <span style={{ fontSize: '1.6rem', flexShrink: 0, lineHeight: 1 }}>{ct.emoji}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: ct.gradFrom, fontWeight: 700, fontSize: '0.9rem', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {ct.label}
        </div>
        <div style={{ color: '#64748b', fontSize: '0.77rem', marginTop: '0.1rem' }}>
          vjen pas {upcoming.days} {upcoming.days === 1 ? 'dite' : 'ditësh'}
        </div>
      </div>
      <div style={{
        flexShrink: 0,
        background: `${ct.gradFrom}1e`,
        border: `1px solid ${ct.gradFrom}44`,
        borderRadius: '0.625rem',
        padding: '0.3rem 0.65rem',
        textAlign: 'center',
        minWidth: '3.25rem',
      }}>
        <div style={{ color: ct.gradFrom, fontWeight: 800, fontSize: '1.25rem', lineHeight: 1 }}>{upcoming.days}</div>
        <div style={{ color: '#94a3b8', fontSize: '0.6rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>ditë</div>
      </div>
    </div>
  );
}
