import { supabase } from '../supabase';

/**
 * Auth user id plus any `teachers` row ids linked to that user.
 * Matches server `getTeacherIdCandidates` + /api/teacher/courses scoping.
 */
export async function resolveTeacherIdCandidates(sessionUserId: string): Promise<string[]> {
  const teacherIdCandidates = new Set<string>([sessionUserId]);
  const teachersRes = await supabase
    .from('teachers')
    .select('id,user_id')
    .or(`id.eq.${sessionUserId},user_id.eq.${sessionUserId}`)
    .limit(2);
  if (!teachersRes.error) {
    (teachersRes.data || []).forEach((row: { id?: string; user_id?: string }) => {
      if (row?.id) teacherIdCandidates.add(String(row.id));
      if (row?.user_id) teacherIdCandidates.add(String(row.user_id));
    });
  }
  return [...teacherIdCandidates];
}
