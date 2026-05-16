import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import confetti from 'canvas-confetti';

interface WelcomeCelebrationProps {
  userId: string;
  displayName?: string;
  onDone: () => void;
}

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
        cx={w * 0.36}
        cy={bh * 0.28}
        rx={w * 0.09}
        ry={bh * 0.13}
        fill={color.shine}
        opacity={0.65}
        transform={`rotate(-22 ${w * 0.36} ${bh * 0.28})`}
      />
      <polygon
        points={`${w / 2 - 4},${bh * 0.93} ${w / 2 + 4},${bh * 0.93} ${w / 2},${bh * 1.01}`}
        fill={color.knot}
      />
      <path
        d={`M${w / 2},${bh * 1.01} Q${w * 0.33},${bh * 1.15} ${w / 2},${bh * 1.28} Q${w * 0.67},${bh * 1.41} ${w / 2},${total}`}
        fill="none"
        stroke={color.knot}
        strokeWidth="1.4"
        opacity="0.55"
      />
    </svg>
  );
}

const BALLOONS = Array.from({ length: 8 }, (_, i) => {
  const color = BALLOON_PALETTE[i % BALLOON_PALETTE.length];
  const left = 5 + i * 12 + (i % 2 === 0 ? 2 : -2);
  const size = 52 + (i % 3) * 10;
  const riseDuration = 2800 + (i % 4) * 300;
  const riseDelay = i * 120;
  const swayAmount = 10 + (i % 3) * 6;
  const swayDuration = 1800 + (i % 3) * 400;
  return { color, left, size, riseDuration, riseDelay, swayAmount, swayDuration, id: i };
});

const CSS = `
@keyframes wc-rise {
  0%   { transform: translateY(calc(100vh + 160px)); }
  100% { transform: translateY(0); }
}
@keyframes wc-sway {
  0%, 100% { transform: translateX(0px); }
  50%       { transform: translateX(var(--sway)); }
}
@keyframes wc-fade-out {
  0%   { opacity: 1; }
  100% { opacity: 0; }
}
.wc-balloon-outer {
  position: fixed;
  top: 64px;
  will-change: transform;
  pointer-events: none;
  z-index: 9999;
}
.wc-balloon-inner {
  will-change: transform;
  animation: wc-sway var(--sway-dur) ease-in-out infinite alternate;
}
`;

function Balloons({ visible }: { visible: boolean }) {
  return createPortal(
    <>
      <style>{CSS}</style>
      {BALLOONS.map(b => (
        <div
          key={b.id}
          className="wc-balloon-outer"
          style={{
            left: `${b.left}%`,
            animation: `wc-rise ${b.riseDuration}ms cubic-bezier(0.22,1,0.36,1) ${b.riseDelay}ms both${
              !visible ? `, wc-fade-out 600ms ease-in 4400ms both` : ''
            }`,
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
  );
}

export default function WelcomeCelebration({ onDone }: WelcomeCelebrationProps) {
  useEffect(() => {
    let cancelled = false;
    const allTimeouts: ReturnType<typeof setTimeout>[] = [];

    const fire = (particleRatio: number, opts: confetti.Options) => {
      if (cancelled) return;
      confetti({
        origin: { y: 0.7 },
        ...opts,
        particleCount: Math.floor(180 * particleRatio),
      });
    };

    const burst = (heavy = false) => {
      fire(heavy ? 0.25 : 0.12, { spread: 26, startVelocity: 55, colors: ['#6366f1', '#8b5cf6', '#a855f7'] });
      fire(heavy ? 0.2  : 0.1,  { spread: 60, colors: ['#10b981', '#34d399', '#6ee7b7'] });
      fire(heavy ? 0.3  : 0.15, { spread: 100, decay: 0.91, scalar: 0.8, colors: ['#f59e0b', '#fbbf24', '#fcd34d'] });
      fire(heavy ? 0.1  : 0.05, { spread: 120, startVelocity: 25, decay: 0.92, scalar: 1.2, colors: ['#ec4899', '#f43f5e'] });
    };

    const DURATION_MS = 5000;

    const startTimer = setTimeout(() => {
      if (cancelled) return;

      burst(true);
      allTimeouts.push(setTimeout(() => burst(true), 500));

      allTimeouts.push(setTimeout(() => { if (!cancelled) burst(false); }, 2000));
      allTimeouts.push(setTimeout(() => { if (!cancelled) burst(false); }, 3200));

      allTimeouts.push(setTimeout(() => { if (!cancelled) burst(true); }, DURATION_MS - 700));

      allTimeouts.push(setTimeout(() => {
        if (!cancelled) { confetti.reset(); onDone(); }
      }, DURATION_MS + 600));
    }, 150);

    return () => {
      cancelled = true;
      clearTimeout(startTimer);
      allTimeouts.forEach(clearTimeout);
      confetti.reset();
    };
  }, []);

  return <Balloons visible={true} />;
}
