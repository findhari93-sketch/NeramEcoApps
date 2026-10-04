/**
 * The protected layout cannot show anything until it knows the student's
 * profile (phone verified, onboarding done). That check is a round trip to
 * /api/auth/register-user on every hard load. Within one tab session the
 * answer rarely changes, so the last confirmed profile is kept here, keyed by
 * Firebase uid, and the shell paints from it while the check revalidates.
 *
 * sessionStorage only: it dies with the tab and is cleared on sign-out.
 */

const PREFIX = 'neram_registered_user:';
const MAX_AGE_MS = 12 * 60 * 60 * 1000;

interface Entry<T> {
  savedAt: number;
  user: T;
}

export function parseRegisteredUser<T>(raw: string | null, now = Date.now()): T | null {
  if (!raw) return null;
  try {
    const entry = JSON.parse(raw) as Entry<T>;
    if (!entry || typeof entry.savedAt !== 'number' || !entry.user) return null;
    if (now - entry.savedAt > MAX_AGE_MS) return null;
    return entry.user;
  } catch {
    return null;
  }
}

export function readRegisteredUser<T>(uid: string): T | null {
  try {
    return parseRegisteredUser<T>(window.sessionStorage.getItem(PREFIX + uid));
  } catch {
    return null;
  }
}

export function writeRegisteredUser<T>(uid: string, user: T): void {
  try {
    const entry: Entry<T> = { savedAt: Date.now(), user };
    window.sessionStorage.setItem(PREFIX + uid, JSON.stringify(entry));
  } catch {
    // Storage blocked or full: the next load just waits for the network.
  }
}

export function clearRegisteredUsers(): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < window.sessionStorage.length; i++) {
      const key = window.sessionStorage.key(i);
      if (key?.startsWith(PREFIX)) keys.push(key);
    }
    keys.forEach((key) => window.sessionStorage.removeItem(key));
  } catch {
    // Nothing to clear.
  }
}
