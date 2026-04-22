export const isMissingQuizzesPublishedColumn = (error: any): boolean => {
  const hay = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase();
  if (error?.code === 'PGRST204' && hay.includes('published')) return true;
  if (error?.code === '42703' && hay.includes('published')) return true;
  return hay.includes('quizzes.published') && (hay.includes('does not exist') || hay.includes('schema cache'));
};

export async function selectPublishedQuizzesCompat(
  supabase: any,
  courseIds: string[],
  selectClause = '*'
): Promise<any[]> {
  if (!courseIds.length) return [];
  const byStatus = await supabase
    .from('quizzes')
    .select(selectClause)
    .in('course_id', courseIds)
    .or('status.eq.published,status.eq.active');

  if (!byStatus.error) return byStatus.data || [];

  const fallback = await supabase
    .from('quizzes')
    .select(selectClause)
    .in('course_id', courseIds);
  if (fallback.error) {
    if (!isMissingQuizzesPublishedColumn(byStatus.error)) throw byStatus.error;
    throw fallback.error;
  }
  return fallback.data || [];
}
