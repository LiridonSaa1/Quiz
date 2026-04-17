import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * True when PostgREST reports `quizzes.teacher_id` missing (older DBs only link quizzes via `course_id`).
 */
export function missingQuizzesTeacherIdColumn(err: unknown): boolean {
  const e = err as { message?: string; details?: string; hint?: string; code?: string };
  const hay = `${e?.message || ''} ${e?.details || ''} ${e?.hint || ''}`;
  const low = hay.toLowerCase();
  if (e?.code === 'PGRST204' && low.includes('teacher_id')) return true;
  if (/quizzes\.?teacher_id/i.test(hay) && /does not exist|42703|undefined column/i.test(hay)) return true;
  return false;
}

/**
 * True when PostgREST reports `quizzes.published` missing (older DBs use `status` or no draft flag).
 */
export function missingQuizzesPublishedColumn(err: unknown): boolean {
  const e = err as { message?: string; details?: string; hint?: string; code?: string };
  const hay = `${e?.message || ''} ${e?.details || ''} ${e?.hint || ''}`;
  const low = hay.toLowerCase();
  if (e?.code === 'PGRST204' && low.includes('published')) return true;
  if (/published/i.test(hay) && /schema cache|could not find|does not exist|42703|undefined column/i.test(low)) {
    return true;
  }
  return false;
}

/** True when PostgREST reports `quizzes.settings` missing (older DBs store pass rules in pass_mark only). */
export function missingQuizzesSettingsColumn(err: unknown): boolean {
  const e = err as { message?: string; details?: string; hint?: string; code?: string };
  const hay = `${e?.message || ''} ${e?.details || ''} ${e?.hint || ''}`;
  const low = hay.toLowerCase();
  if (!low.includes('settings') || !/quiz/i.test(low)) return false;
  if (e?.code === 'PGRST204' || e?.code === '42703') return true;
  if (/schema cache|could not find|does not exist|undefined column|column/i.test(low)) return true;
  return false;
}

/**
 * Insert a quiz row, stripping `teacher_id` / `published` / `settings` when those columns are absent.
 */
export async function insertCompatibleQuiz(
  supabase: SupabaseClient,
  basePayload: Record<string, unknown>,
  sessionUserId: string,
): Promise<{ data: { id: string } | null; error: unknown }> {
  let payload: Record<string, unknown> = { ...basePayload };
  if (payload.teacher_id === undefined || payload.teacher_id === null) {
    payload.teacher_id = sessionUserId;
  }

  for (let i = 0; i < 12; i++) {
    const res = await supabase.from('quizzes').insert(payload).select('id').single();
    if (!res.error && res.data?.id) {
      return { data: { id: String(res.data.id) }, error: null };
    }
    const err = res.error;
    if (!err) {
      return { data: null, error: new Error('Quiz insert returned no id') };
    }

    if (missingQuizzesSettingsColumn(err) && 'settings' in payload) {
      const { settings: _s, ...rest } = payload;
      void _s;
      payload = rest;
      continue;
    }
    if (missingQuizzesPublishedColumn(err) && 'published' in payload) {
      const { published: _p, ...rest } = payload;
      void _p;
      payload = rest;
      continue;
    }
    if (missingQuizzesTeacherIdColumn(err) && 'teacher_id' in payload) {
      const { teacher_id: _tid, ...rest } = payload;
      void _tid;
      payload = rest;
      continue;
    }
    if ('settings' in payload && /settings/i.test(String((err as { message?: string })?.message || ''))) {
      const { settings: _s, ...rest } = payload;
      void _s;
      payload = rest;
      continue;
    }
    return { data: null, error: err };
  }
  return { data: null, error: new Error('Quiz insert: max compatibility retries') };
}

/**
 * Update a quiz row with the same column fallbacks as {@link insertCompatibleQuiz} (except teacher_id is not updated here).
 */
export async function updateCompatibleQuiz(
  supabase: SupabaseClient,
  quizId: string,
  basePayload: Record<string, unknown>,
): Promise<{ error: unknown }> {
  let payload: Record<string, unknown> = { ...basePayload };

  for (let i = 0; i < 12; i++) {
    const res = await supabase.from('quizzes').update(payload).eq('id', quizId);
    if (!res.error) {
      return { error: null };
    }
    const err = res.error;

    if (missingQuizzesSettingsColumn(err) && 'settings' in payload) {
      const { settings: _s, ...rest } = payload;
      void _s;
      payload = rest;
      continue;
    }
    if (missingQuizzesPublishedColumn(err) && 'published' in payload) {
      const { published: _p, ...rest } = payload;
      void _p;
      payload = rest;
      continue;
    }
    return { error: err };
  }
  return { error: new Error('Quiz update: max compatibility retries') };
}

function sortQuizRowsByCreatedAt(rows: Record<string, unknown>[]) {
  return [...rows].sort((a, b) => {
    const ta = a.created_at ? new Date(String(a.created_at)).getTime() : 0;
    const tb = b.created_at ? new Date(String(b.created_at)).getTime() : 0;
    return tb - ta;
  });
}

async function fetchQuizzesByCourseIds(supabase: SupabaseClient, courseIds: string[]) {
  if (courseIds.length === 0) return [] as Record<string, unknown>[];
  let res = await supabase
    .from('quizzes')
    .select('*')
    .in('course_id', courseIds)
    .order('created_at', { ascending: false });
  if (res.error) {
    res = await supabase.from('quizzes').select('*').in('course_id', courseIds);
  }
  if (res.error) throw res.error;
  return sortQuizRowsByCreatedAt((res.data ?? []) as Record<string, unknown>[]);
}

/**
 * Loads quizzes for a teacher using `quizzes.teacher_id`, or via `courses.id` → `quizzes.course_id` when that column is absent.
 */
export async function fetchTeacherQuizzesFromSupabase(
  supabase: SupabaseClient,
  scopedIds: string[],
  sessionUserId: string,
): Promise<Record<string, unknown>[]> {
  const byCourses = async () => {
    const { data: crs, error: cErr } = await supabase
      .from('courses')
      .select('id')
      .in('teacher_id', scopedIds);
    if (cErr) throw cErr;
    const courseIds = (crs ?? []).map((c: { id: string }) => c.id).filter(Boolean);
    return fetchQuizzesByCourseIds(supabase, courseIds);
  };

  let res = await supabase
    .from('quizzes')
    .select('*')
    .in('teacher_id', scopedIds)
    .order('created_at', { ascending: false });

  if (res.error && missingQuizzesTeacherIdColumn(res.error)) {
    return byCourses();
  }
  if (res.error) {
    res = await supabase.from('quizzes').select('*').in('teacher_id', scopedIds);
  }
  if (res.error && missingQuizzesTeacherIdColumn(res.error)) {
    return byCourses();
  }
  if (res.error) {
    res = await supabase.from('quizzes').select('*').eq('teacher_id', sessionUserId);
  }
  if (res.error && missingQuizzesTeacherIdColumn(res.error)) {
    return byCourses();
  }
  if (res.error) throw res.error;
  return sortQuizRowsByCreatedAt((res.data ?? []) as Record<string, unknown>[]);
}
