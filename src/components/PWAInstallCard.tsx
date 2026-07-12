import React, { useState } from 'react';
import { Download, Smartphone, CheckCircle2, MonitorSmartphone, Share2, Chrome, Info } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { useBranding } from '../lib/useBranding';
import { IOSInstructionsModal } from './PWAInstallButton';
import { cn } from '../lib/utils';

function ManualInstallModal({ onClose, schoolName }: { onClose: () => void; schoolName: string }) {
  return (
    <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative z-10 w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6 animate-in slide-in-from-bottom-4 duration-300"
        onClick={e => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          aria-label="Close"
        >
          ✕
        </button>

        <div className="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center mb-4">
          <Download className="w-6 h-6 text-white" />
        </div>

        <h2 className="text-base font-bold text-slate-900 mb-1">Install {schoolName || 'App'}</h2>
        <p className="text-sm text-slate-500 mb-5">Follow the steps for your browser:</p>

        <div className="space-y-4">
          <div className="p-3 rounded-xl bg-blue-50 border border-blue-100">
            <p className="text-xs font-bold text-blue-700 mb-1.5">Chrome / Edge (Desktop &amp; Android)</p>
            <ol className="space-y-1">
              <li className="text-xs text-blue-700">1. Click the <strong>⋮</strong> menu (three dots, top right)</li>
              <li className="text-xs text-blue-700">2. Choose <strong>"Install App"</strong> or <strong>"Add to Home Screen"</strong></li>
              <li className="text-xs text-blue-700">3. Confirm in the dialog</li>
            </ol>
          </div>

          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
            <p className="text-xs font-bold text-slate-700 mb-1.5">Safari (iPhone / iPad)</p>
            <ol className="space-y-1">
              <li className="text-xs text-slate-600">1. Tap the <strong>Share</strong> icon (box with arrow)</li>
              <li className="text-xs text-slate-600">2. Scroll down and tap <strong>"Add to Home Screen"</strong></li>
              <li className="text-xs text-slate-600">3. Tap <strong>Add</strong></li>
            </ol>
          </div>

          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
            <p className="text-xs font-bold text-slate-700 mb-1.5">Firefox (Android)</p>
            <ol className="space-y-1">
              <li className="text-xs text-slate-600">1. Tap the <strong>⋮</strong> menu</li>
              <li className="text-xs text-slate-600">2. Tap <strong>"Add to Home Screen"</strong></li>
            </ol>
          </div>
        </div>

        <button
          onClick={onClose}
          className="w-full mt-5 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition-colors"
        >
          Got it
        </button>
      </div>
    </div>
  );
}

/**
 * A self-contained "Install App" card for use inside Settings pages.
 * Shows the current PWA install state and lets the user install from here.
 * Always shows an install button regardless of browser state.
 */
export default function PWAInstallCard() {
  const { state, install, swReady } = usePWAInstall();
  const { schoolName } = useBranding();
  const [showIOSModal, setShowIOSModal] = useState(false);
  const [showManualModal, setShowManualModal] = useState(false);

  const handleInstall = async () => {
    if (state === 'ios') { setShowIOSModal(true); return; }
    if (state === 'available') { await install(); return; }
    setShowManualModal(true);
  };

  const isInstalled = state === 'installed';
  const isAvailable = state === 'available' || state === 'ios';
  const isInstalling = state === 'installing';
  const isIdle = state === 'idle' || state === 'unsupported';

  return (
    <>
      <div className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
            <MonitorSmartphone className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">Install App</h3>
            <p className="text-xs text-slate-500 mt-0.5">Add {schoolName || 'this app'} to your home screen</p>
          </div>
          {/* Status badge */}
          <div className="ml-auto">
            {isInstalled ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold border border-emerald-200">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Installed
              </span>
            ) : isAvailable ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 text-xs font-bold border border-indigo-200">
                <Download className="w-3.5 h-3.5" />
                Available
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-50 text-slate-500 text-xs font-semibold border border-slate-200">
                <Smartphone className="w-3.5 h-3.5" />
                {swReady ? 'PWA Ready' : 'Browser App'}
              </span>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="px-5 py-4 flex items-center justify-between gap-4">
          <div className="flex-1">
            {isInstalled ? (
              <p className="text-sm text-slate-600 leading-relaxed">
                <span className="font-semibold text-emerald-700">{schoolName}</span> is already installed on this device. Open it directly from your home screen.
              </p>
            ) : isAvailable ? (
              <p className="text-sm text-slate-600 leading-relaxed">
                Install <span className="font-semibold">{schoolName}</span> for a faster, full-screen experience — works offline and launches instantly.
              </p>
            ) : (
              <p className="text-sm text-slate-500 leading-relaxed">
                Install <span className="font-semibold text-slate-700">{schoolName || 'this app'}</span> on your device for the best experience — full-screen, works offline, and launches instantly.
              </p>
            )}
          </div>

          {!isInstalled && (
            <button
              onClick={handleInstall}
              disabled={isInstalling}
              className={cn(
                'shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white transition-all',
                'disabled:opacity-50 disabled:cursor-not-allowed active:scale-95',
              )}
              style={{ background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)', boxShadow: '0 4px 14px rgba(99,102,241,0.3)' }}
            >
              {isInstalling ? (
                <span className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
              ) : state === 'ios' ? (
                <Share2 className="w-4 h-4" />
              ) : isIdle ? (
                <Info className="w-4 h-4" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              {isInstalling ? 'Installing…' : state === 'ios' ? 'How to Install' : isIdle ? 'How to Install' : 'Install App'}
            </button>
          )}
        </div>

        {/* iOS step hint */}
        {state === 'ios' && !showIOSModal && (
          <div className="px-5 pb-4">
            <div className="flex items-start gap-2 p-3 rounded-xl bg-blue-50 border border-blue-100">
              <Share2 className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
              <p className="text-xs text-blue-700">
                On iPhone/iPad: tap the <strong>Share</strong> icon in Safari, then choose <strong>"Add to Home Screen"</strong>.
              </p>
            </div>
          </div>
        )}

        {/* Idle hint */}
        {isIdle && (
          <div className="px-5 pb-4">
            <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 border border-amber-100">
              <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700">
                Your browser hasn't prompted for install yet. Click <strong>"How to Install"</strong> for manual instructions, or try refreshing the page.
              </p>
            </div>
          </div>
        )}
      </div>

      {showIOSModal && (
        <IOSInstructionsModal
          onClose={() => setShowIOSModal(false)}
          schoolName={schoolName || 'App'}
        />
      )}

      {showManualModal && (
        <ManualInstallModal
          onClose={() => setShowManualModal(false)}
          schoolName={schoolName || 'App'}
        />
      )}
    </>
  );
}
