import type { UserRole } from '../types';

/** Normalize DB / metadata role strings so routing and API checks stay consistent. */
export function normalizeUserRole(raw: string | null | undefined): UserRole {
  const s = String(raw ?? 'student').toLowerCase().trim();
  if (s === 'admin' || s === 'teacher' || s === 'student') return s;
  return 'student';
}
