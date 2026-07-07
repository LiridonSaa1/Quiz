type SchemaErrorLike = {
  code?: string | number;
  message?: string;
  details?: string;
  hint?: string;
};

const toHaystack = (error: unknown) => {
  const e = error as SchemaErrorLike | null | undefined;
  return `${e?.message || ''} ${e?.details || ''} ${e?.hint || ''}`.toLowerCase();
};

export function isMissingNotificationsColumnError(error: unknown, column: string): boolean {
  const e = error as SchemaErrorLike | null | undefined;
  const code = e?.code != null ? String(e.code) : '';
  const hay = toHaystack(error);
  const needle = column.toLowerCase();

  if (!hay.includes(needle)) return false;
  if (code === '42703' || code === 'PGRST204') return true;
  if (hay.includes(`notifications.${needle}`)) return true;
  return hay.includes('notifications') && /does not exist|could not find|schema cache|column/i.test(hay);
}

export function buildLegacyNotificationMessage(title: string, message: string): string {
  const cleanTitle = String(title || '').trim();
  const cleanMessage = String(message || '').trim();
  if (cleanTitle && cleanMessage) return `${cleanTitle}: ${cleanMessage}`;
  return cleanTitle || cleanMessage;
}
