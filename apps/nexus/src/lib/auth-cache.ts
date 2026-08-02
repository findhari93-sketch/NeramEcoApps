'use client';

/**
 * The last /api/auth/me answer, kept on the device so the app can draw itself before
 * the network says anything.
 *
 * Nexus used to render a full-screen spinner over every route until three things had
 * happened in series: MSAL imported and initialised, a token was acquired silently,
 * and /api/auth/me came back. None of that produces a different answer from one minute
 * to the next, yet it was paid in full on every reload, and it was the reason a teacher
 * saw "Loading..." before they saw Nexus.
 *
 * So we keep the answer. On the next open the shell paints from this cache on the
 * first frame and the real request runs quietly behind it, which is the difference
 * between a web page and an app.
 *
 * What is deliberately NOT stored here: any token. This is the *result* of being
 * authenticated, never the means. A tampered entry can make the UI draw the wrong
 * menus for a moment and nothing else, because every API call is still verified
 * server-side against a real bearer token.
 */

const KEY = 'nexus_auth_cache_v1';

/**
 * Stale entries are ignored rather than trusted forever. A day is long enough to cover
 * "I open Nexus every morning" and short enough that a role change, a new classroom or
 * a graduated student cannot linger indefinitely on a device that has been shut in a
 * drawer.
 */
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * The subset of /api/auth/me worth replaying. Intentionally loose: this module does not
 * own the payload shape, it only carries it. `useNexusAuth` re-derives capabilities from
 * `staffRole` rather than trusting anything transmitted, and does the same here.
 */
export interface CachedAuthEntry {
  /** Which Microsoft account this belonged to, so a different signer-in is discarded. */
  oid: string | null;
  savedAt: number;
  payload: Record<string, unknown>;
}

/**
 * Read the last good payload, or null if there is none, it is too old, or it cannot be
 * parsed.
 *
 * Safe to call during a `useState` initialiser: it touches only synchronous
 * localStorage and returns null on the server.
 */
export function readCachedAuth(): CachedAuthEntry | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as CachedAuthEntry;
    if (!parsed?.payload || typeof parsed.savedAt !== 'number') return null;
    if (Date.now() - parsed.savedAt > MAX_AGE_MS) {
      window.localStorage.removeItem(KEY);
      return null;
    }

    return parsed;
  } catch {
    // A corrupt or unreadable entry must never be fatal: fall back to the network path.
    return null;
  }
}

/** Store the payload just returned by /api/auth/me. Failures are ignored. */
export function writeCachedAuth(oid: string | null, payload: Record<string, unknown>): void {
  if (typeof window === 'undefined') return;

  try {
    const entry: CachedAuthEntry = { oid, savedAt: Date.now(), payload };
    window.localStorage.setItem(KEY, JSON.stringify(entry));
  } catch {
    // Quota exceeded, or storage blocked in a private window. The app still works,
    // it just goes back to waiting for the network on the next open.
  }
}

/**
 * Forget the cached shell.
 *
 * Call on sign-out, and whenever the signed-in identity turns out not to be the one
 * this entry was written for. A stale shell is only ever cosmetic, but a teacher seeing
 * a flash of somebody else's classrooms is not something to leave to chance, and
 * parents share devices with their children.
 */
export function clearCachedAuth(): void {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* nothing useful to do */
  }
}
