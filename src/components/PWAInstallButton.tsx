import React, { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Download, Smartphone, X, Loader2 } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { useBranding } from '../lib/useBranding';
import { cn } from '../lib/utils';
import { useTranslation } from 'react-i18next';

function IOSInstructionsModal({ onClose, schoolName }: { onClose: () => void; schoolName: string }) {
  const { t } = useTranslation();
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
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="w-14 h-14 rounded-2xl bg-indigo-600 flex items-center justify-center mb-4">
          <Smartphone className="w-7 h-7 text-white" />
        </div>

        <h2 className="text-lg font-bold text-slate-900 mb-1">{t('pwa.install', { name: schoolName })}</h2>
        <p className="text-sm text-slate-500 mb-5">{t('pwa.addToHomeScreen')}</p>

        <ol className="space-y-3 mb-6">
          <li className="flex items-start gap-3">
            <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">1</span>
            <p className="text-sm text-slate-700">
              {t('pwa.step1').split('Share')[0]}
              <span className="inline-flex items-center gap-1 font-semibold">
                <svg className="w-4 h-4 inline" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 3v12M8 7l4-4 4 4" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M20 16v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2" strokeLinecap="round"/>
                </svg>
                Share
              </span>
              {t('pwa.step1').split('Share')[1] || ''}
            </p>
          </li>
          <li className="flex items-start gap-3">
            <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">2</span>
            <p className="text-sm text-slate-700">{t('pwa.step2')}</p>
          </li>
          <li className="flex items-start gap-3">
            <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">3</span>
            <p className="text-sm text-slate-700">{t('pwa.step3')}</p>
          </li>
        </ol>

        <button
          onClick={onClose}
          className="w-full py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition-colors"
        >
          {t('pwa.gotIt')}
        </button>
      </div>
    </div>
  );
}

export default function PWAInstallButton() {
  const { t } = useTranslation();
  const { state, install } = usePWAInstall();
  const { schoolName } = useBranding();
  const [showIOSModal, setShowIOSModal] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const prevState = useRef<string>('idle');

  useEffect(() => {
    const prev = prevState.current;
    if (state === 'installed' && (prev === 'installing' || prev === 'available')) {
      toast.success(t('pwa.installedTitle', { name: schoolName }), {
        description: t('pwa.installedDesc', { name: schoolName }),
        duration: 5000,
      });
    }
    prevState.current = state;
  }, [state, schoolName, t]);

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
      <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 animate-in slide-in-from-bottom-4 duration-500">
        <button
          onClick={() => setDismissed(true)}
          className="w-8 h-8 rounded-full bg-white/90 backdrop-blur border border-slate-200 shadow-md flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-white transition-all"
          aria-label={t('common.close')}
        >
          <X className="w-4 h-4" />
        </button>

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
          {state === 'installing' ? t('pwa.installing') : t('pwa.install', { name: schoolName })}
        </button>
      </div>

      {showIOSModal && (
        <IOSInstructionsModal
          onClose={() => setShowIOSModal(false)}
          schoolName={schoolName}
        />
      )}
    </>
  );
}
