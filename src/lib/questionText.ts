/** Some databases use legacy `question_text`; the repo schema uses `text`. */
export function questionBodyFromRow(row: Record<string, unknown>): string {
  const t = row.text ?? row.question_text;
  if (typeof t === 'string') return t;
  return '';
}
