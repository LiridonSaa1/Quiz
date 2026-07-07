import React, { useEffect, useRef, useState } from 'react';
import { apiUrl } from '../lib/apiUrl';

type Status = 'checking' | 'online' | 'offline';

const POLL_INTERVAL_MS = 15_000;
const CHECK_TIMEOUT_MS = 5_000;

async function pingBackend(): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);
  try {
    const res = await fetch(apiUrl('/api/health'), {
      signal: controller.signal,
      cache: 'no-store',
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export default function BackendStatus() {
  const [status, setStatus] = useState<Status>('checking');
  const [showTooltip, setShowTooltip] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const check = async () => {
    const ok = await pingBackend();
    setStatus(ok ? 'online' : 'offline');
  };

  useEffect(() => {
    check();
    intervalRef.current = setInterval(check, POLL_INTERVAL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  if (status === 'checking') return null;

  const isOnline = status === 'online';

  return (
    <div
      className="relative flex items-center"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <button
        onClick={check}
        className="flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium transition-all cursor-default select-none"
        style={{
          background: isOnline ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
          color: isOnline ? '#16a34a' : '#dc2626',
        }}
        aria-label={isOnline ? 'Server online' : 'Server offline'}
      >
        <span className="relative flex h-2 w-2">
          {isOnline && (
            <span
              className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
              style={{ background: '#22c55e' }}
            />
          )}
          <span
            className="relative inline-flex rounded-full h-2 w-2"
            style={{ background: isOnline ? '#22c55e' : '#ef4444' }}
          />
        </span>
        <span className="hidden sm:inline">
          {isOnline ? 'Online' : 'Offline'}
        </span>
      </button>

      {showTooltip && (
        <div className="absolute right-0 top-full mt-2 z-50 w-44 rounded-lg shadow-lg border text-xs p-2.5 pointer-events-none"
          style={{
            background: '#fff',
            borderColor: isOnline ? '#bbf7d0' : '#fecaca',
            color: '#374151',
          }}
        >
          <p className="font-semibold mb-0.5" style={{ color: isOnline ? '#15803d' : '#b91c1c' }}>
            {isOnline ? 'Server is reachable' : 'Server unreachable'}
          </p>
          <p className="text-slate-400">
            {isOnline
              ? 'All systems operational.'
              : 'Try refreshing the page. If this persists, the server may be restarting.'}
          </p>
        </div>
      )}
    </div>
  );
}
