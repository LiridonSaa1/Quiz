import type { SupabaseClient } from '@supabase/supabase-js';

/** Preferred column order for `classes` (newest schema). */
const CLASS_COLUMNS_FULL = [
  'id',
  'name',
  'description',
  'course_id',
  'teacher_id',
  'student_ids',
  'status',
  'start_date',
  'end_date',
  'capacity',
  'created_at',
  'updated_at',
] as const;

/** Columns we may omit when older DBs lack them. */
const DRIFTABLE = new Set<string>([
  'description',
  'capacity',
  'updated_at',
  'student_ids',
  'status',
  'start_date',
  'end_date',
]);

export function extractMissingColumnName(err: unknown): string | null {
  const m = String((err as { message?: string })?.message || '');
  const code = String((err as { code?: string })?.code || '');

  // column "description" of relation "classes" does not exist (Postgres)
  let r = m.match(/column\s+(?:"([^"]+)"|'([^']+)'|(\w+))\s+of\s+relation/i);
  if (r) return String(r[1] || r[2] || r[3] || '').toLowerCase();

  // column classes.updated_at does not exist — table-qualified (Postgres 42703)
  r = m.match(/\bclasses\.([a-zA-Z_][\w]*)\s+does\s+not\s+exist/i);
  if (r) return r[1].toLowerCase();

  // column classes.student_ids does not exist (legacy pattern with leading "column ")
  r = m.match(/column\s+\w+\.([a-zA-Z_][\w]*)\s+does\s+not\s+exist/i);
  if (r) return r[1].toLowerCase();

  // Could not find the 'start_date' column of 'classes' in the schema cache (PostgREST)
  r = m.match(/['"]([a-zA-Z_][\w]*)['"]\s+column\s+of\s+['"]classes['"]/i);
  if (r) return r[1].toLowerCase();
  r = m.match(/find\s+the\s+['"]([a-zA-Z_][\w]*)['"]\s+column/i);
  if (r) return r[1].toLowerCase();

  // 42703 fallback when message format differs slightly
  if (code === '42703' && /\bdoes\s+not\s+exist/i.test(m)) {
    r = m.match(/\bclasses\.([a-zA-Z_][\w]*)\b/i);
    if (r) return r[1].toLowerCase();
  }
  return null;
}

export function isMissingColumnError(err: unknown, columnName: string): boolean {
  const miss = extractMissingColumnName(err);
  if (miss === columnName.toLowerCase()) return true;
  const col = columnName.toLowerCase();
  const m = String((err as { message?: string })?.message || '').toLowerCase();
  const code = String((err as { code?: string })?.code || '');
  if (code === '42703') return m.includes(col);
  if (m.includes(col) && (m.includes('schema cache') || m.includes('does not exist') || m.includes('could not find'))) return true;
  return false;
}

const DEFAULT_CLASS_STATUS = 'upcoming';

export function normalizeClassRow(cls: Record<string, unknown>): Record<string, unknown> {
  const rawStatus = cls.status;
  const status =
    typeof rawStatus === 'string' && rawStatus.trim() !== ''
      ? rawStatus
      : DEFAULT_CLASS_STATUS;
  return {
    ...cls,
    description: cls.description ?? null,
    student_ids: Array.isArray(cls.student_ids) ? cls.student_ids : [],
    status,
    start_date: cls.start_date ?? null,
    end_date: cls.end_date ?? null,
    updated_at: cls.updated_at ?? cls.created_at ?? '',
    capacity:
      cls.capacity != null && cls.capacity !== ''
        ? Number(cls.capacity)
        : 30,
  };
}

async function selectClassesWithFallback(
  run: (selectList: string) => Promise<{ data: unknown; error: unknown }>,
) {
  let cols = [...CLASS_COLUMNS_FULL];
  for (let i = 0; i < 20; i++) {
    const sel = cols.join(', ');
    const res = await run(sel);
    if (!res.error) return res;
    const miss = extractMissingColumnName(res.error);
    if (!miss || !cols.includes(miss) || !DRIFTABLE.has(miss)) return res;
    cols = cols.filter((c) => c !== miss);
  }
  const sel = cols.join(', ');
  return run(sel);
}

export async function selectClassesForTeacher(supabase: SupabaseClient, teacherIds: string[]) {
  return selectClassesWithFallback((sel) =>
    supabase.from('classes').select(sel).in('teacher_id', teacherIds).order('created_at', { ascending: false }),
  );
}

export async function selectAllClassesOrdered(supabase: SupabaseClient) {
  return selectClassesWithFallback((sel) => supabase.from('classes').select(sel).order('created_at', { ascending: false }));
}

export async function saveClassRow(
  supabase: SupabaseClient,
  opts: { mode: 'insert' | 'update'; id?: string; payload: Record<string, unknown> },
) {
  const exec = (p: Record<string, unknown>) =>
    opts.mode === 'update' && opts.id
      ? supabase.from('classes').update(p).eq('id', opts.id)
      : supabase.from('classes').insert(p);

  let payload: Record<string, unknown> = { ...opts.payload };
  for (let i = 0; i < 16; i++) {
    const res = await exec(payload);
    if (!res.error) return res;
    const miss = extractMissingColumnName(res.error);
    if (!miss || !DRIFTABLE.has(miss) || !(miss in payload)) return res;
    const next = { ...payload };
    delete next[miss];
    payload = next;
  }
  return exec(payload);
}
