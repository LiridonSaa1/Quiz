import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createPortal } from 'react-dom';
import confetti from 'canvas-confetti';

interface WelcomeCelebrationProps {
  userId: string;
  displayName?: string;
  onDone: () => void;
}

/* ─── Balloon palette ─── */
const BALLOON_PALETTE = [
  { body: '#6366f1', shine: '#c7d2fe', knot: '#4338ca' },
  { body: '#a855f7', shine: '#e9d5ff', knot: '#7e22ce' },
  { body: '#10b981', shine: '#a7f3d0', knot: '#059669' },
  { body: '#f59e0b', shine: '#fde68a', knot: '#d97706' },
  { body: '#ec4899', shine: '#fbcfe8', knot: '#be185d' },
  { body: '#ef4444', shine: '#fecaca', knot: '#b91c1c' },
  { body: '#3b82f6', shine: '#bfdbfe', knot: '#1d4ed8' },
  { body: '#f97316', shine: '#fed7aa', knot: '#c2410c' },
];

function BalloonSvg({ color, size }: { color: typeof BALLOON_PALETTE[0]; size: number }) {
  const w = size;
  const bh = size * 1.15;
  const total = bh + 32;
  return (
    <svg width={w} height={total} viewBox={`0 0 ${w} ${total}`} style={{ overflow: 'visible' }}>
      <ellipse cx={w / 2} cy={bh * 0.46} rx={w * 0.44} ry={bh * 0.46} fill={color.body} />
      <ellipse
        cx={w * 0.36} cy={bh * 0.28}
        rx={w * 0.09} ry={bh * 0.13}
        fill={color.shine} opacity={0.65}
        transform={`rotate(-22 ${w * 0.36} ${bh * 0.28})`}
      />
      <polygon
        points={`${w / 2 - 4},${bh * 0.93} ${w / 2 + 4},${bh * 0.93} ${w / 2},${bh * 1.01}`}
        fill={color.knot}
      />
      <path
        d={`M${w / 2},${bh * 1.01} Q${w * 0.33},${bh * 1.15} ${w / 2},${bh * 1.28} Q${w * 0.67},${bh * 1.41} ${w / 2},${total}`}
        fill="none" stroke={color.knot} strokeWidth="1.4" opacity="0.55"
      />
    </svg>
  );
}

const BALLOONS = Array.from({ length: 8 }, (_, i) => ({
  id: i,
  color: BALLOON_PALETTE[i % BALLOON_PALETTE.length],
  left: 5 + i * 12 + (i % 2 === 0 ? 2 : -2),
  size: 52 + (i % 3) * 10,
  riseDuration: 2800 + (i % 4) * 300,
  riseDelay: i * 120,
  swayAmount: 10 + (i % 3) * 6,
  swayDuration: 1800 + (i % 3) * 400,
}));

const INJECTED_CSS = `
@keyframes wc-rise {
  0%   { transform: translateY(calc(100vh + 160px)); }
  100% { transform: translateY(0); }
}
@keyframes wc-sway {
  0%, 100% { transform: translateX(0px); }
  50%       { transform: translateX(var(--sway)); }
}
@keyframes wc-modal-in {
  0%   { opacity: 0; transform: translate(-50%, -50%) scale(0.82); }
  100% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
}
@keyframes wc-modal-out {
  0%   { opacity: 1; transform: translate(-50%, -50%) scale(1); }
  100% { opacity: 0; transform: translate(-50%, -50%) scale(0.88); }
}
@keyframes wc-overlay-in {
  from { opacity: 0; } to { opacity: 1; }
}
@keyframes wc-overlay-out {
  from { opacity: 1; } to { opacity: 0; }
}
@keyframes wc-bounce-emoji {
  0%, 100% { transform: translateY(0) scale(1); }
  40%       { transform: translateY(-12px) scale(1.15); }
  60%       { transform: translateY(-6px) scale(1.08); }
}
@keyframes wc-shimmer {
  0%   { background-position: -200% center; }
  100% { background-position: 200% center; }
}
.wc-balloon-outer {
  position: fixed; top: 64px;
  will-change: transform; pointer-events: none; z-index: 9998;
}
.wc-balloon-inner {
  will-change: transform;
  animation: wc-sway var(--sway-dur) ease-in-out infinite alternate;
}
.wc-overlay {
  position: fixed; inset: 0; z-index: 9999;
  background: rgba(15,10,40,0.55);
  backdrop-filter: blur(3px);
  -webkit-backdrop-filter: blur(3px);
}
.wc-overlay.entering { animation: wc-overlay-in 350ms ease both; }
.wc-overlay.leaving  { animation: wc-overlay-out 300ms ease both; }
.wc-card {
  position: fixed; top: 50%; left: 50%;
  z-index: 10000;
  width: min(420px, 92vw);
  border-radius: 28px;
  overflow: hidden;
}
.wc-card.entering { animation: wc-modal-in 420ms cubic-bezier(0.34,1.56,0.64,1) both; }
.wc-card.leaving  { animation: wc-modal-out 280ms ease both; }
.wc-emoji { animation: wc-bounce-emoji 1.4s ease-in-out infinite; display: inline-block; }
.wc-shimmer-btn {
  background: linear-gradient(90deg, #6366f1 0%, #a855f7 40%, #ec4899 70%, #6366f1 100%);
  background-size: 200% auto;
  animation: wc-shimmer 2.4s linear infinite;
}
`;

function WelcomeModal({
  displayName,
  phase,
  onClose,
}: {
  displayName?: string;
  phase: 'entering' | 'leaving';
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const first = displayName?.split(' ')[0] || 'Student';

  return createPortal(
    <>
      <style>{INJECTED_CSS}</style>
      <div className={`wc-overlay ${phase}`} />
      <div className={`wc-card ${phase}`}>
        {/* gradient header */}
        <div style={{
          background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 50%, #db2777 100%)',
          padding: '36px 32px 28px',
          textAlign: 'center',
          position: 'relative',
        }}>
          {/* decorative circles */}
          <div style={{ position:'absolute', top:'-20px', left:'-20px', width:'120px', height:'120px', borderRadius:'50%', background:'rgba(255,255,255,0.07)' }} />
          <div style={{ position:'absolute', bottom:'-30px', right:'-10px', width:'90px', height:'90px', borderRadius:'50%', background:'rgba(255,255,255,0.06)' }} />

          <div style={{ fontSize: '56px', lineHeight: 1, marginBottom: '14px' }}>
            <span className="wc-emoji">🎉</span>
          </div>
          <h2 style={{
            margin: 0, color: '#fff', fontWeight: 800,
            fontSize: 'clamp(20px, 5vw, 26px)', letterSpacing: '-0.5px',
          }}>
            {t('welcomeCelebration.greeting', { name: first })}
          </h2>
          <p style={{ margin: '8px 0 0', color: 'rgba(255,255,255,0.8)', fontSize: '14px', fontWeight: 500 }}>
            {t('welcomeCelebration.accountReady')}
          </p>
        </div>

        {/* body */}
        <div style={{
          background: '#fff',
          padding: '28px 32px 32px',
          textAlign: 'center',
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '28px' }}>
            {[
              { emoji: '📚', key: 'exploreCourses' },
              { emoji: '🧠', key: 'takeQuizzes' },
              { emoji: '🏆', key: 'earnCertificates' },
            ].map(({ emoji, key }) => (
              <div key={key} style={{
                display: 'flex', alignItems: 'center', gap: '12px',
                background: '#f8f7ff', borderRadius: '12px', padding: '12px 16px', textAlign: 'left',
              }}>
                <span style={{ fontSize: '22px', flexShrink: 0 }}>{emoji}</span>
                <span style={{ fontSize: '14px', color: '#374151', fontWeight: 500 }}>{t(`welcomeCelebration.${key}`)}</span>
              </div>
            ))}
          </div>

          <button
            onClick={onClose}
            className="wc-shimmer-btn"
            style={{
              width: '100%', padding: '14px 24px',
              border: 'none', borderRadius: '14px',
              color: '#fff', fontWeight: 700, fontSize: '16px',
              cursor: 'pointer', letterSpacing: '0.2px',
              boxShadow: '0 8px 24px rgba(99,102,241,0.4)',
            }}
          >
            {t('welcomeCelebration.getStarted')}
          </button>
        </div>
      </div>
    </>,
    document.body
  );
}

export default function WelcomeCelebration({ displayName, onDone }: WelcomeCelebrationProps) {
  const { t } = useTranslation();
  const [modalPhase, setModalPhase] = useState<'hidden' | 'entering' | 'leaving'>('hidden');

  const handleClose = () => {
    setModalPhase('leaving');
    setTimeout(() => { confetti.reset(); onDone(); }, 320);
  };

  useEffect(() => {
    let cancelled = false;
    const allTimeouts: ReturnType<typeof setTimeout>[] = [];

    const fire = (particleRatio: number, opts: confetti.Options) => {
      if (cancelled) return;
      confetti({ origin: { y: 0.7 }, ...opts, particleCount: Math.floor(180 * particleRatio) });
    };

    const burst = (heavy = false) => {
      fire(heavy ? 0.25 : 0.12, { spread: 26, startVelocity: 55, colors: ['#6366f1', '#8b5cf6', '#a855f7'] });
      fire(heavy ? 0.2  : 0.1,  { spread: 60,  colors: ['#10b981', '#34d399', '#6ee7b7'] });
      fire(heavy ? 0.3  : 0.15, { spread: 100, decay: 0.91, scalar: 0.8, colors: ['#f59e0b', '#fbbf24', '#fcd34d'] });
      fire(heavy ? 0.1  : 0.05, { spread: 120, startVelocity: 25, decay: 0.92, scalar: 1.2, colors: ['#ec4899', '#f43f5e'] });
    };

    // Looping confetti — keeps firing every 2.5s until user clicks Continue
    const scheduleLoop = (delay: number) => {
      const t = setTimeout(() => {
        if (cancelled) return;
        burst(false);
        scheduleLoop(2500);
      }, delay);
      allTimeouts.push(t);
    };

    const startTimer = setTimeout(() => {
      if (cancelled) return;

      // Opening heavy burst
      burst(true);
      allTimeouts.push(setTimeout(() => { if (!cancelled) burst(true); }, 500));

      // Show modal after 1.5s (balloons mid-flight)
      allTimeouts.push(setTimeout(() => {
        if (!cancelled) setModalPhase('entering');
      }, 1500));

      // Start looping gentle bursts every 2.5s after the opening
      scheduleLoop(2000);
    }, 150);

    return () => {
      cancelled = true;
      clearTimeout(startTimer);
      allTimeouts.forEach(clearTimeout);
      confetti.reset();
    };
  }, []);

  return (
    <>
      {/* Balloons — always injected, behind modal */}
      {createPortal(
        <>
          <style>{INJECTED_CSS}</style>
          {BALLOONS.map(b => (
            <div
              key={b.id}
              className="wc-balloon-outer"
              style={{
                left: `${b.left}%`,
                animation: `wc-rise ${b.riseDuration}ms cubic-bezier(0.22,1,0.36,1) ${b.riseDelay}ms both`,
              }}
            >
              <div
                className="wc-balloon-inner"
                style={{
                  ['--sway' as string]: `${b.swayAmount}px`,
                  ['--sway-dur' as string]: `${b.swayDuration}ms`,
                  animationDelay: `${b.riseDelay + b.riseDuration * 0.5}ms`,
                }}
              >
                <BalloonSvg color={b.color} size={b.size} />
              </div>
            </div>
          ))}
        </>,
        document.body
      )}

      {/* Modal — shown after 1.5s */}
      {modalPhase !== 'hidden' && (
        <WelcomeModal
          displayName={displayName}
          phase={modalPhase === 'leaving' ? 'leaving' : 'entering'}
          onClose={handleClose}
        />
      )}
    </>
  );
}
