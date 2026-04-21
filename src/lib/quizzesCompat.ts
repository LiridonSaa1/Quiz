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
  const withPublished = await supabase
    .from('quizzes')
    .select(selectClause)
    .in('course_id', courseIds)
    .eq('published', true);

  if (!withPublished.error) return withPublished.data || [];

  const fallback = await supabase
    .from('quizzes')
    .select(selectClause)
    .in('course_id', courseIds);
  if (fallback.error) {
    if (!isMissingQuizzesPublishedColumn(withPublished.error)) throw withPublished.error;
    throw fallback.error;
  }
  return fallback.data || [];
}
