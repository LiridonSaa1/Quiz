import React, { useEffect, useRef, useState } from 'react';
import confetti from 'canvas-confetti';
import { Sparkles, X, BookOpen, Trophy, ArrowRight } from 'lucide-react';

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

export default function WelcomeCelebration({ userId, displayName, onDone }: WelcomeCelebrationProps) {
  const [visible, setVisible] = useState(true);
  const firedRef = useRef(false);

  useEffect(() => {
    if (firedRef.current) return;
    firedRef.current = true;

    const fire = (particleRatio: number, opts: confetti.Options) => {
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

    const DURATION_MS = 12000;
    const endTime = Date.now() + DURATION_MS;
    const timeouts: ReturnType<typeof setTimeout>[] = [];

    // Big opening burst
    burst(true);
    timeouts.push(setTimeout(() => burst(true), 600));
    timeouts.push(setTimeout(() => burst(true), 1200));

    // Keep firing lighter bursts every 1.2 s until DURATION_MS
    let next = 2000;
    while (next < DURATION_MS - 500) {
      const t = next;
      timeouts.push(setTimeout(() => {
        if (Date.now() < endTime) burst(false);
      }, t));
      next += 1200;
    }

    // Final big closing burst
    timeouts.push(setTimeout(() => burst(true), DURATION_MS - 800));

    return () => {
      timeouts.forEach(clearTimeout);
      confetti.reset();
    };
  }, []);

  const handleClose = () => {
    setVisible(false);
    markWelcomeSeen(userId);
    confetti.reset();
    onDone();
  };

  if (!visible) return null;

  const firstName = displayName?.split(' ')[0] || 'there';

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
        onClick={handleClose}
      />

      <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-[welcome-pop_0.4s_cubic-bezier(0.175,0.885,0.32,1.275)_both]">
        <div className="h-2 bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500" />

        <button
          onClick={handleClose}
          className="absolute top-4 right-4 w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="px-8 pt-8 pb-6 text-center">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 shadow-lg shadow-indigo-200 mb-5">
            <Sparkles className="w-9 h-9 text-white" />
          </div>

          <h2 className="text-2xl font-bold text-slate-900 mb-2">
            Welcome, {firstName}! 🎉
          </h2>
          <p className="text-slate-500 text-sm leading-relaxed mb-6">
            Your learning journey starts right here. Explore your courses, take quizzes, and earn certificates as you grow!
          </p>

          <div className="grid grid-cols-2 gap-3 mb-6">
            <div className="flex flex-col items-center gap-2 p-4 bg-indigo-50 rounded-2xl">
              <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
                <BookOpen className="w-5 h-5 text-indigo-600" />
              </div>
              <span className="text-xs font-semibold text-indigo-700 text-center">Explore Courses</span>
            </div>
            <div className="flex flex-col items-center gap-2 p-4 bg-violet-50 rounded-2xl">
              <div className="w-10 h-10 bg-violet-100 rounded-xl flex items-center justify-center">
                <Trophy className="w-5 h-5 text-violet-600" />
              </div>
              <span className="text-xs font-semibold text-violet-700 text-center">Earn Certificates</span>
            </div>
          </div>

          <button
            onClick={handleClose}
            className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white font-semibold py-3 rounded-2xl transition-all shadow-lg shadow-indigo-200 active:scale-[0.98]"
          >
            Let's get started <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <style>{`
        @keyframes welcome-pop {
          from { opacity: 0; transform: scale(0.7) translateY(20px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  );
}
