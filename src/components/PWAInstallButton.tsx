import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Download, Smartphone, X, Loader2 } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { useBranding } from '../lib/useBranding';
import { cn } from '../lib/utils';

function IOSInstructionsModal({ onClose, schoolName }: { onClose: () => void; schoolName: string }) {
  return (
    <div
      className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative z-10 w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6 animate-in slide-in-from-bottom-4 duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Icon */}
        <div className="w-14 h-14 rounded-2xl bg-indigo-600 flex items-center justify-center mb-4">
          <Smartphone className="w-7 h-7 text-white" />
        </div>

        <h2 className="text-lg font-bold text-slate-900 mb-1">Install {schoolName}</h2>
        <p className="text-sm text-slate-500 mb-5">
          Add this app to your Home Screen for the best experience.
        </p>

        {/* Steps */}
        <ol className="space-y-3 mb-6">
          <li className="flex items-start gap-3">
            <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">1</span>
            <p className="text-sm text-slate-700">
              Tap the{' '}
              <span className="inline-flex items-center gap-1 font-semibold">
                <svg className="w-4 h-4 inline" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 3v12M8 7l4-4 4 4" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M20 16v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2" strokeLinecap="round"/>
                </svg>
                Share
              </span>{' '}
              button in Safari's toolbar
            </p>
          </li>
          <li className="flex items-start gap-3">
            <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">2</span>
            <p className="text-sm text-slate-700">
              Scroll down and tap{' '}
              <span className="font-semibold text-slate-900">"Add to Home Screen"</span>
            </p>
          </li>
          <li className="flex items-start gap-3">
            <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">3</span>
            <p className="text-sm text-slate-700">
              Tap <span className="font-semibold text-slate-900">"Add"</span> in the top-right corner
            </p>
          </li>
        </ol>

        <button
          onClick={onClose}
          className="w-full py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition-colors"
        >
          Got it
        </button>
      </div>
    </div>
  );
}

export default function PWAInstallButton() {
  const { state, install } = usePWAInstall();
  const { schoolName } = useBranding();
  const [showIOSModal, setShowIOSModal] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  // Show toast on successful install
  useEffect(() => {
    if (state === 'installed') {
      toast.success(`${schoolName} installed successfully 🎉`, {
        description: `${schoolName} is now on your home screen.`,
        duration: 5000,
      });
    }
  }, [state, schoolName]);

  const handleInstallClick = async () => {
    if (state === 'ios') {
      setShowIOSModal(true);
      return;
    }
    if (state === 'available') {
      await install();
    }
  };

  const isVisible = !dismissed && (state === 'available' || state === 'ios');

  if (!isVisible) return null;

  return (
    <>
      {/* Install pill — floats in bottom-right corner */}
      <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 animate-in slide-in-from-bottom-4 duration-500">
        {/* Dismiss */}
        <button
          onClick={() => setDismissed(true)}
          className="w-8 h-8 rounded-full bg-white/90 backdrop-blur border border-slate-200 shadow-md flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-white transition-all"
          aria-label="Dismiss install banner"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Install button */}
        <button
          onClick={handleInstallClick}
          disabled={state === 'installing'}
          className={cn(
            'flex items-center gap-2 px-4 py-2.5 rounded-full shadow-lg shadow-indigo-500/30',
            'bg-indigo-600 hover:bg-indigo-700 active:scale-95',
            'text-white text-sm font-semibold',
            'transition-all duration-200',
            'disabled:opacity-70 disabled:cursor-not-allowed',
          )}
        >
          {state === 'installing' ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : state === 'ios' ? (
            <Smartphone className="w-4 h-4" />
          ) : (
            <Download className="w-4 h-4" />
          )}
          {state === 'installing' ? 'Installing…' : `Install ${schoolName}`}
        </button>
      </div>

      {/* iOS Instructions Modal */}
      {showIOSModal && (
        <IOSInstructionsModal
          onClose={() => setShowIOSModal(false)}
          schoolName={schoolName}
        />
      )}
    </>
  );
}
