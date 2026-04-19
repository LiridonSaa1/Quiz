/**
 * Whether a user may use the app. Admins disable accounts via `profiles.status` (e.g. inactive).
 */
export function isProfileAccessAllowed(status: string | null | undefined): boolean {
  if (status == null || status === '') return true;
  const s = String(status).toLowerCase().trim();
  return s !== 'inactive' && s !== 'disabled' && s !== 'suspended';
}
