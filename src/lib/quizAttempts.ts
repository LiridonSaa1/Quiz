import { SupabaseClient } from '@supabase/supabase-js';

export interface NormalizedQuizAttempt {
  id: string;
  quiz_id: string;
  student_id: string;
  teacher_id: string | null;
  score: number;
  total_points: number;
  score_percent: number;
  passed: boolean;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  created_at: string | null;
  answers: Record<string, any>;
  raw: any;
}

const toText = (value: unknown) => (value === null || value === undefined ? '' : String(value));

const toNumber = (value: unknown, fallback = 0) => {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const getScorePercent = (scoreValue: unknown, totalPointsValue: unknown) => {
  const score = toNumber(scoreValue, 0);
  const totalPoints = toNumber(totalPointsValue, 0);

  if (totalPoints > 0) {
    return clamp(Math.round((score / totalPoints) * 100), 0, 100);
  }
  if (score >= 0 && score <= 1) {
    return clamp(Math.round(score * 100), 0, 100);
  }
  return clamp(Math.round(score), 0, 100);
};

const getDateForSort = (attempt: { completed_at?: string | null; created_at?: string | null; started_at?: string | null }) =>
  attempt.completed_at || attempt.created_at || attempt.started_at || '';

const isAttemptsTableMissing = (error: any) => {
  const haystack = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase();
  return (
    (error?.code === 'PGRST205' && haystack.includes('public.attempts')) ||
    (error?.code === '42P01' && haystack.includes('attempts')) ||
    haystack.includes("could not find the table 'public.attempts'") ||
    (haystack.includes('public.attempts') && haystack.includes('schema cache')) ||
    (haystack.includes('perhaps you meant') && haystack.includes('quiz_attempts'))
  );
};

const isMissingColumnError = (error: any) => {
  const haystack = `${error?.message || ''} ${error?.details || ''}`.toLowerCase();
  return error?.code === 'PGRST204' || haystack.includes('could not find the') || haystack.includes('column');
};

const normalizeAttempt = (row: any, passingScore = 50): NormalizedQuizAttempt => {
  const rawScore = toNumber(row?.score, 0);
  const totalPointsRaw = toNumber(row?.total_points, 0);
  const totalPoints = totalPointsRaw > 0 ? totalPointsRaw : 100;
  const scorePercent = getScorePercent(rawScore, totalPointsRaw);
  const score = totalPointsRaw > 0 ? rawScore : Math.round((scorePercent / 100) * totalPoints);
  const passed = typeof row?.passed === 'boolean' ? row.passed : scorePercent >= passingScore;

  return {
    id: toText(row?.id),
    quiz_id: toText(row?.quiz_id),
    student_id: toText(row?.student_id),
    teacher_id: row?.teacher_id ? toText(row.teacher_id) : null,
    score,
    total_points: totalPoints,
    score_percent: scorePercent,
    passed,
    status: toText(row?.status) || (row?.completed_at ? 'completed' : 'in_progress'),
    started_at: row?.started_at || row?.created_at || null,
    completed_at: row?.completed_at || row?.created_at || row?.started_at || null,
    created_at: row?.created_at || row?.completed_at || row?.started_at || null,
    answers: row?.answers && typeof row.answers === 'object' ? row.answers : {},
    raw: row,
  };
};

export const normalizeAttempts = (rows: any[], passingScoreByQuiz: Record<string, number> = {}) => {
  return (rows || [])
    .map((row) => normalizeAttempt(row, passingScoreByQuiz[toText(row?.quiz_id)] ?? 50))
    .sort((a, b) => getDateForSort(b).localeCompare(getDateForSort(a)));
};

export const fetchAttemptRowsByQuizIds = async (supabase: SupabaseClient, quizIds: string[]) => {
  if (!quizIds.length) return [];

  const modern = await supabase.from('quiz_attempts').select('*').in('quiz_id', quizIds);
  if (!modern.error) return modern.data || [];
  if (!isAttemptsTableMissing(modern.error)) throw modern.error;

  const legacy = await supabase.from('attempts').select('*').in('quiz_id', quizIds);
  if (legacy.error) throw legacy.error;
  return legacy.data || [];
};

export const fetchAttemptRowsByStudentId = async (supabase: SupabaseClient, studentId: string) => {
  const modern = await supabase.from('quiz_attempts').select('*').eq('student_id', studentId);
  if (modern.error) throw modern.error;
  return modern.data || [];
};

export const deleteAttemptRowsByQuizId = async (supabase: SupabaseClient, quizId: string) => {
  const modern = await supabase.from('quiz_attempts').delete().eq('quiz_id', quizId);
  if (!modern.error) return;
  if (!isAttemptsTableMissing(modern.error)) throw modern.error;

  const legacy = await supabase.from('attempts').delete().eq('quiz_id', quizId);
  if (legacy.error) throw legacy.error;
};

export const fetchAttemptRowById = async (supabase: SupabaseClient, attemptId: string) => {
  const modern = await supabase.from('quiz_attempts').select('*').eq('id', attemptId).maybeSingle();
  if (!modern.error) return modern.data || null;
  if (!isAttemptsTableMissing(modern.error)) throw modern.error;

  const legacy = await supabase.from('attempts').select('*').eq('id', attemptId).maybeSingle();
  if (legacy.error) throw legacy.error;
  return legacy.data || null;
};

export const insertAttemptWithFallback = async (
  supabase: SupabaseClient,
  payload: {
    quiz_id: string;
    student_id: string;
    teacher_id?: string;
    score: number;
    total_points: number;
    passed: boolean;
    started_at: string;
    completed_at: string;
    answers: Record<string, any>;
  },
) => {
  const modernPayloadExtended = {
    quiz_id: payload.quiz_id,
    student_id: payload.student_id,
    score: payload.score,
    total_points: payload.total_points,
    passed: payload.passed,
    started_at: payload.started_at,
    completed_at: payload.completed_at,
    answers: payload.answers,
  };

  const modernExtended = await supabase.from('quiz_attempts').insert(modernPayloadExtended).select().single();
  if (!modernExtended.error) return modernExtended.data;
  if (!isMissingColumnError(modernExtended.error) && !isAttemptsTableMissing(modernExtended.error)) {
    throw modernExtended.error;
  }

  if (isMissingColumnError(modernExtended.error)) {
    const modernMinimal = await supabase
      .from('quiz_attempts')
      .insert({
        quiz_id: payload.quiz_id,
        student_id: payload.student_id,
        score: payload.score,
      })
      .select()
      .single();

    if (!modernMinimal.error) return modernMinimal.data;
    if (!isAttemptsTableMissing(modernMinimal.error)) throw modernMinimal.error;
  }

  const legacy = await supabase.from('attempts').insert(payload).select().single();
  if (legacy.error) throw legacy.error;
  return legacy.data;
};
