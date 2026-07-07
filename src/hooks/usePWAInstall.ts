import { useCallback, useEffect, useRef, useState } from 'react';

export type PWAInstallState =
  | 'idle'
  | 'available'
  | 'ios'
  | 'installing'
  | 'installed'
  | 'unsupported';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isSafari(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
}

function isInStandaloneMode(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    ('standalone' in window.navigator && (window.navigator as { standalone?: boolean }).standalone === true)
  );
}

export function usePWAInstall() {
  const deferredPrompt = useRef<BeforeInstallPromptEvent | null>(null);
  const [state, setState] = useState<PWAInstallState>('idle');
  const [swReady, setSwReady] = useState(false);

  useEffect(() => {
    // Already installed as standalone — hide everything
    if (isInStandaloneMode()) {
      setState('installed');
      return;
    }

    // iOS Safari: show instructions modal (no beforeinstallprompt)
    if (isIOS() && isSafari()) {
      setState('ios');
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      deferredPrompt.current = e as BeforeInstallPromptEvent;
      setState('available');
    };

    window.addEventListener('beforeinstallprompt', handler);

    // App installed event
    window.addEventListener('appinstalled', () => {
      deferredPrompt.current = null;
      setState('installed');
    });

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
    };
  }, []);

  // Service worker registration status
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then(() => setSwReady(true)).catch(() => {});
    }
  }, []);

  const install = useCallback(async () => {
    if (!deferredPrompt.current) return;
    setState('installing');
    try {
      await deferredPrompt.current.prompt();
      const { outcome } = await deferredPrompt.current.userChoice;
      if (outcome === 'accepted') {
        setState('installed');
      } else {
        setState('available');
      }
    } catch {
      setState('available');
    } finally {
      deferredPrompt.current = null;
    }
  }, []);

  return { state, install, swReady };
}
