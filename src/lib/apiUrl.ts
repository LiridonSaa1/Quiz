import { supabase } from '../supabase';
import { monitoredFetch } from './httpClient';

type JsonCacheEntry = {
  expiresAt: number;
  payload: unknown;
};
const authJsonCache = new Map<string, JsonCacheEntry>();
const authJsonInflight = new Map<string, Promise<unknown>>();

/**
 * Prefix for `/api/...` requests.
 * Leave unset when the UI and API share one origin (recommended: `npm run dev` → open the URL printed in the terminal).
 * If you set `VITE_API_BASE_URL`, it must be the exact API origin (scheme + host + port) from that log — e.g. `http://localhost:5002`
 * if Express bound to 5002 because 5000 was busy.
 * Set when the frontend is deployed separately from the API (e.g. `https://api.myapp.com`).
 */
export function apiUrl(path: string): string {
  const s = path.trim();
  // Already an absolute URL (e.g. after a prior apiUrl call) — do not prefix again.
  if (/^https?:\/\//i.test(s)) return s;
  const raw = import.meta.env.VITE_API_BASE_URL;
  const base = typeof raw === 'string' ? raw.replace(/\/$/, '') : '';
  const p = s.startsWith('/') ? s : `/${s}`;
  return `${base}${p}`;
}

/** Read a useful message from a failed fetch (JSON `{ error }` or raw body). */
export async function readApiError(res: Response): Promise<string> {
  const normalizeErrorMessage = (input: string): string => {
    const message = String(input || '');
    const isMissingPaymentsTable =
      message.includes("Could not find the table 'public.payments'") ||
      message.includes("Could not find the table 'payments'");
    if (isMissingPaymentsTable) {
      return "Payments are not available yet because table 'payments' is missing.";
    }
    return message;
  };

  const text = await res.text();
  try {
    const json = text ? JSON.parse(text) : {};
    if (res.status === 404 && json?.path) {
      console.error(`[authFetch] 404 — no API route for: ${json.method ?? '?'} ${json.path}`);
    }
    if (json && typeof json.error === 'string' && json.error) {
      return normalizeErrorMessage(json.error);
    }
    if (json && typeof json.message === 'string' && json.message) {
      return normalizeErrorMessage(json.message);
    }
  } catch {
    /* ignore */
  }
  const trimmed = text?.trim();
  if (trimmed) {
    const normalized = normalizeErrorMessage(trimmed);
    return normalized.length > 500 ? `${normalized.slice(0, 500)}…` : normalized;
  }
  return `Request failed (${res.status} ${res.statusText || ''})`.trim();
}

/**
 * Resolves a usable access token (refreshes once if the session was not hydrated yet).
 */
async function resolveAccessToken(): Promise<string | null> {
  const first = await supabase.auth.getSession();
  let token = first.data.session?.access_token ?? null;
  if (token) return token;

  const refreshed = await supabase.auth.refreshSession();
  if (refreshed.error) return null;
  return refreshed.data.session?.access_token ?? null;
}

/**
 * Authenticated fetch — automatically attaches the current Supabase session JWT as
 * `Authorization: Bearer <token>` so server-side ownership checks can verify the caller.
 * Retries once after `refreshSession()` on 401 (expired token or session not hydrated yet).
 */
export async function authFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const buildHeaders = async (): Promise<Record<string, string>> => {
    const headers: Record<string, string> = {
      ...(init.headers as Record<string, string> | undefined),
    };
    const existingAuth = headers['Authorization'] || headers['authorization'];
    if (!existingAuth) {
      const token = await resolveAccessToken();
      if (token) headers['Authorization'] = `Bearer ${token}`;
    }
    if (init.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
    return headers;
  };

  const url = apiUrl(path);
  let headers = await buildHeaders();
  let res = await monitoredFetch(url, { ...init, headers, credentials: 'same-origin' });

  if (res.status === 401) {
    await supabase.auth.refreshSession();
    headers = await buildHeaders();
    res = await monitoredFetch(url, { ...init, headers, credentials: 'same-origin' });
  }

  return res;
}

type AuthFetchJsonCachedOptions = {
  ttlMs?: number;
  forceRefresh?: boolean;
};

/**
 * Cached authenticated GET JSON helper for hot dashboard/profile endpoints.
 * De-duplicates concurrent requests and reuses response briefly to avoid bursts.
 */
export async function authFetchJsonCached<T = any>(
  path: string,
  options: AuthFetchJsonCachedOptions = {},
): Promise<T> {
  const ttlMs = Math.max(1000, Number(options.ttlMs || 15000));
  const cacheKey = path.trim();

  if (!options.forceRefresh) {
    const cached = authJsonCache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.payload as T;
    }
    const inFlight = authJsonInflight.get(cacheKey);
    if (inFlight) return (await inFlight) as T;
  }

  const loadPromise = (async () => {
    const res = await authFetch(path, { method: 'GET' });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const message = typeof (json as any)?.error === 'string'
        ? (json as any).error
        : `Request failed (${res.status})`;
      throw new Error(message);
    }
    authJsonCache.set(cacheKey, { payload: json, expiresAt: Date.now() + ttlMs });
    return json as T;
  })();

  authJsonInflight.set(cacheKey, loadPromise);
  try {
    return (await loadPromise) as T;
  } finally {
    authJsonInflight.delete(cacheKey);
  }
}
