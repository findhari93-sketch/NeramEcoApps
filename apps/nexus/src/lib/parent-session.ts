/**
 * Client-side storage for a parent's signed-in session.
 *
 * Mirrors readStoredImpersonation in hooks/useNexusAuth.tsx, with one
 * deliberate difference: localStorage rather than sessionStorage.
 *
 * Impersonation is a 60-minute staff tool where a per-tab session is a feature.
 * A parent checks in once a week from a phone, and being thrown back to the
 * login form every time they open a new tab would make the portal feel broken.
 * This does not widen the XSS blast radius: MSAL already keeps its tokens in
 * localStorage on the same origin.
 */

export const PARENT_SESSION_KEY = 'nexus_parent_session';

export interface StoredParentSession {
  /** The `par_` bearer token. */
  token: string;
  /** ISO timestamp. Checked on every read, so an expired session self-clears. */
  expiresAt: string;
  parent: { id: string; name: string | null };
  /** True until the parent replaces the admin-issued temporary password. */
  mustChangePassword: boolean;
}

export function readParentSession(): StoredParentSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(PARENT_SESSION_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as StoredParentSession;
    if (!parsed?.token || !parsed?.expiresAt || !parsed?.parent?.id) return null;

    if (Date.parse(parsed.expiresAt) <= Date.now()) {
      localStorage.removeItem(PARENT_SESSION_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writeParentSession(session: StoredParentSession): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(PARENT_SESSION_KEY, JSON.stringify(session));
  } catch {
    /* storage full or blocked: the session simply will not persist */
  }
}

export function clearParentSession(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(PARENT_SESSION_KEY);
  } catch {
    /* ignore */
  }
}
