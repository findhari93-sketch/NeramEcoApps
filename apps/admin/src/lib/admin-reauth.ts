/**
 * One "Sign in again" prompt for the whole admin dashboard.
 *
 * The dashboard decides someone is signed in when MSAL has an account cached in
 * localStorage. That account outlives the token behind it: the SPA refresh token
 * lasts about 24 hours, and the hidden-frame renewal after that fails whenever
 * the browser blocks third-party cookies or Microsoft wants MFA again. The
 * sidebar still shows the name, but no API call can be signed.
 *
 * `requestReauth` is what the fetch wrapper and the profile check call when that
 * happens. Every caller in a burst shares one pending answer; the mounted
 * `SessionExpiredDialog` opens, the user signs in through a popup (a redirect
 * would throw away whatever they were typing), and every waiting call gets the
 * fresh token. With no dialog mounted it answers null at once.
 */

type Listener = (open: boolean) => void;

/** After "Not now", background polls stay quiet this long before asking again. */
const DECLINE_QUIET_MS = 30_000;

let pending: { promise: Promise<string | null>; resolve: (token: string | null) => void } | null = null;
const listeners = new Set<Listener>();
let declinedAt = Number.NEGATIVE_INFINITY;

/** True inside the window MSAL opens for a popup sign-in, which must never prompt. */
function inMsalPopup(): boolean {
  return (
    typeof window !== 'undefined' &&
    !!window.opener &&
    window.opener !== window &&
    typeof window.name === 'string' &&
    window.name.startsWith('msal.')
  );
}

/**
 * Playwright and other automation. Admin E2E signs calls with a test token added
 * at the network layer, so a tokenless call must go out as before rather than
 * wait on a dialog nobody will click.
 */
function automated(): boolean {
  return typeof navigator !== 'undefined' && navigator.webdriver === true;
}

export function requestReauth(now: number = Date.now()): Promise<string | null> {
  if (pending) return pending.promise;
  if (listeners.size === 0 || inMsalPopup() || automated()) return Promise.resolve(null);
  if (now - declinedAt < DECLINE_QUIET_MS) return Promise.resolve(null);

  let resolve!: (token: string | null) => void;
  const promise = new Promise<string | null>((r) => {
    resolve = r;
  });
  pending = { promise, resolve };
  listeners.forEach((l) => l(true));
  return promise;
}

/** The dialog calls this with the new token, or null when the user chose Not now. */
export function finishReauth(token: string | null, now: number = Date.now()): void {
  if (!pending) return;
  const done = pending;
  pending = null;
  if (!token) declinedAt = now;
  listeners.forEach((l) => l(false));
  done.resolve(token);
}

export function subscribeReauth(listener: Listener): () => void {
  listeners.add(listener);
  if (pending) listener(true);
  return () => {
    listeners.delete(listener);
  };
}

export function resetReauthForTests(): void {
  pending = null;
  listeners.clear();
  declinedAt = Number.NEGATIVE_INFINITY;
}
