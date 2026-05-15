import { useEffect } from 'react';
import confetti from 'canvas-confetti';

interface WelcomeCelebrationProps {
  userId: string;
  displayName?: string;
  onDone: () => void;
}

const STORAGE_KEY = (uid: string) => `quizmaster_welcomed_v1_${uid}`;

export function hasSeenWelcome(userId: string): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY(userId)) === '1';
  } catch {
    return true;
  }
}

export function markWelcomeSeen(userId: string): void {
  try {
    localStorage.setItem(STORAGE_KEY(userId), '1');
  } catch {}
}

export default function WelcomeCelebration({ onDone }: WelcomeCelebrationProps) {
  useEffect(() => {
    let cancelled = false;
    const allTimeouts: ReturnType<typeof setTimeout>[] = [];

    const fire = (particleRatio: number, opts: confetti.Options) => {
      if (cancelled) return;
      confetti({
        origin: { y: 0.6 },
        ...opts,
        particleCount: Math.floor(200 * particleRatio),
      });
    };

    const burst = (heavy = false) => {
      fire(heavy ? 0.25 : 0.15, { spread: 26, startVelocity: 55, colors: ['#6366f1', '#8b5cf6', '#a855f7'] });
      fire(heavy ? 0.2  : 0.12, { spread: 60, colors: ['#10b981', '#34d399', '#6ee7b7'] });
      fire(heavy ? 0.35 : 0.2,  { spread: 100, decay: 0.91, scalar: 0.8, colors: ['#f59e0b', '#fbbf24', '#fcd34d'] });
      fire(heavy ? 0.1  : 0.06, { spread: 120, startVelocity: 25, decay: 0.92, scalar: 1.2, colors: ['#ec4899', '#f43f5e'] });
      fire(heavy ? 0.1  : 0.06, { spread: 120, startVelocity: 45, colors: ['#6366f1', '#10b981', '#f59e0b'] });
    };

    // 150 ms start delay: React Strict Mode's first-mount cleanup fires before
    // this callback runs, so only the second (real) mount actually starts confetti.
    const startTimer = setTimeout(() => {
      if (cancelled) return;

      const DURATION_MS = 12000;
      const endTime = Date.now() + DURATION_MS;

      burst(true);
      allTimeouts.push(setTimeout(() => burst(true), 600));
      allTimeouts.push(setTimeout(() => burst(true), 1200));

      let next = 2000;
      while (next < DURATION_MS - 500) {
        const t = next;
        allTimeouts.push(setTimeout(() => {
          if (!cancelled && Date.now() < endTime) burst(false);
        }, t));
        next += 1200;
      }

      allTimeouts.push(setTimeout(() => burst(true), DURATION_MS - 800));
      allTimeouts.push(setTimeout(() => {
        if (!cancelled) { confetti.reset(); onDone(); }
      }, DURATION_MS + 500));
    }, 150);

    return () => {
      cancelled = true;
      clearTimeout(startTimer);
      allTimeouts.forEach(clearTimeout);
      confetti.reset();
    };
  }, []);

  return null;
}
