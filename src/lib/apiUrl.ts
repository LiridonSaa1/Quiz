/**
 * Prefix for `/api/...` requests. Leave unset when the UI and Express share the same origin (`npm run dev` or `npm run preview` after our preview script change).
 * Set `VITE_API_BASE_URL` when the frontend is deployed separately from the API (e.g. `https://api.myapp.com`).
 */
export function apiUrl(path: string): string {
  const raw = import.meta.env.VITE_API_BASE_URL;
  const base = typeof raw === 'string' ? raw.replace(/\/$/, '') : '';
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${base}${p}`;
}

/** Read a useful message from a failed fetch (JSON `{ error }` or raw body). */
export async function readApiError(res: Response): Promise<string> {
  const text = await res.text();
  try {
    const json = text ? JSON.parse(text) : {};
    if (json && typeof json.error === 'string' && json.error) return json.error;
    if (json && typeof json.message === 'string' && json.message) return json.message;
  } catch {
    /* ignore */
  }
  const trimmed = text?.trim();
  if (trimmed) return trimmed.length > 500 ? `${trimmed.slice(0, 500)}…` : trimmed;
  return `Request failed (${res.status} ${res.statusText || ''})`.trim();
}
