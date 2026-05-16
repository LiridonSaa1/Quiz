const STORAGE_KEY = (uid: string) => `quizmaster_welcomed_v1_${uid}`;

export function hasSeenWelcome(userId: string): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY(userId)) === '1';
  } catch {
    return true;
  }
}

export function markWelcomeSeen(userId: string): void {
  try {
    localStorage.setItem(STORAGE_KEY(userId), '1');
  } catch {}
}
