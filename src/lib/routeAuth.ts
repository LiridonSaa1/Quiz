export type AuthCaller = {
  userId: string;
  role: string;
};

const normalizeRole = (role: string | null | undefined) =>
  String(role || "").toLowerCase().trim();

export function isAdmin(caller: AuthCaller): boolean {
  return normalizeRole(caller.role) === "admin";
}

export function isTeacher(caller: AuthCaller): boolean {
  return normalizeRole(caller.role) === "teacher";
}

export function canAccessTeacherCourses(caller: AuthCaller, requestedUserId: string): boolean {
  const normalizedRequested = String(requestedUserId || "").trim();
  if (!normalizedRequested) return false;
  if (isAdmin(caller)) return true;
  if (!isTeacher(caller)) return false;
  return caller.userId === normalizedRequested;
}

export function isAdminSeedAllowed(nodeEnv: string | undefined): boolean {
  return String(nodeEnv || "").toLowerCase().trim() === "development";
}
