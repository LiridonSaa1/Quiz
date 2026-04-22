import { authFetch, readApiError } from './apiUrl';

export interface StudentQuizAccessRow {
  id: string;
  title?: string;
  description?: string;
  course_id?: string;
  lesson_id?: string;
  teacher_id?: string;
  type?: string;
  time_limit?: number;
  total_marks?: number;
  pass_mark?: number;
  max_attempts?: number;
  status?: string;
  published?: boolean | string | null;
  settings?: Record<string, unknown> | null;
  created_at?: string;
  updated_at?: string;
}

export async function fetchStudentAccessibleQuizzes(): Promise<StudentQuizAccessRow[]> {
  const res = await authFetch('/api/student/quizzes');
  if (!res.ok) {
    throw new Error(await readApiError(res));
  }

  const json = await res.json().catch(() => ({}));
  return Array.isArray(json?.quizzes) ? json.quizzes : [];
}

export async function fetchStudentAccessibleQuizById(
  quizId: string,
): Promise<StudentQuizAccessRow | null> {
  const targetId = String(quizId || '').trim();
  if (!targetId) return null;

  const quizzes = await fetchStudentAccessibleQuizzes();
  return quizzes.find((row) => String(row?.id || '').trim() === targetId) || null;
}
