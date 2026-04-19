/**
 * PostgREST / Postgres errors when `courses.student_ids` is missing from the DB.
 * Code may be string or number; message may live on details/hint.
 */
export function isMissingCoursesStudentIdsError(error: unknown): boolean {
  if (error == null || typeof error !== 'object') return false;
  const e = error as {
    code?: string | number;
    message?: string;
    details?: string;
    hint?: string;
  };
  const hay = `${e.message || ''} ${e.details || ''} ${e.hint || ''}`.toLowerCase();
  const code = e.code != null ? String(e.code) : '';
  if (code === '42703' || code === 'PGRST204' || e.code === 42703) {
    if (hay.includes('student_ids')) return true;
  }
  if (!hay.includes('student_ids')) return false;
  if (code === '42703' || code === 'PGRST204' || e.code === 42703) return true;
  if (hay.includes('courses.student_ids')) return true;
  if (hay.includes('does not exist') || hay.includes('could not find') || hay.includes('schema cache')) {
    return true;
  }
  return false;
}
