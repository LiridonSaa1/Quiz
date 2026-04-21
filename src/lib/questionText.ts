/** Some databases use legacy `question_text`; the repo schema uses `text`. */
export function questionBodyFromRow(row: Record<string, unknown>): string {
  const candidates = [row.text, row.question_text, row.question];
  for (const value of candidates) {
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (trimmed) return trimmed;
  }
  return '';
}
