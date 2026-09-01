/**
 * Remember where someone was going, across a Microsoft sign-in.
 *
 * The problem this exists for: a student taps an assignment link in a Teams
 * message while signed out. RoleGuard sends them to /login, MSAL's redirectUri
 * is the site ORIGIN rather than /login, so the round trip lands them on the
 * root, and the root routes purely by role. They end up on the Study Zone home
 * page and the assignment they were sent to is gone. Every shared link was
 * silently broken for anyone not already signed in.
 *
 * Two carriers, because there are two sign-in flows:
 *   - `?next=` on the login URL, for the popup flow, which returns to /login.
 *   - this sessionStorage stash, for the redirect flow, which does not.
 * Both are validated through isSafeInternalPath before anything navigates.
 *
 * Pure and client-only: every function is a no-op when there is no window, so
 * it is safe to call during a server render.
 */

const KEY = 'nexus_return_path';

/**
 * How long a remembered path stays good.
 *
 * Long enough to survive a slow sign-in with an MFA prompt, short enough that a
 * path abandoned yesterday cannot hijack tomorrow's ordinary login and drop
 * someone somewhere they did not ask to go.
 */
const TTL_MS = 10 * 60 * 1000;

/**
 * Is this a path we are willing to navigate to after sign-in?
 *
 * The value reaches us from a query parameter on a URL anyone can paste, so
 * this is the open-redirect guard. Only a site-relative path survives:
 *
 *   - must start with exactly one '/', which rejects `//evil.com` (a
 *     protocol-relative URL that browsers happily treat as another origin) and
 *     any bare word.
 *   - must carry no scheme, which rejects `javascript:` and `data:`.
 *   - must carry no backslash, which some browsers normalise to '/' and which
 *     would otherwise smuggle `/\evil.com` past the check above.
 *
 * A query string and a fragment are fine: '/student/assignments/x?tab=brief' is
 * exactly the kind of link this feature shares.
 */
export function isSafeInternalPath(path: unknown): path is string {
  if (typeof path !== 'string') return false;
  const p = path.trim();
  if (p.length === 0 || p.length > 2048) return false;
  if (!p.startsWith('/')) return false;
  if (p.startsWith('//')) return false;
  if (p.includes('\\')) return false;
  // Control characters, including the newline and tab a browser would strip
  // before parsing, which is how `/\njavascript:...` gets through naive checks.
  if (/[\u0000-\u001F\u007F]/.test(p)) return false;
  return true;
}

/** Stash a path to return to after sign-in. Unsafe or absent values are ignored. */
export function rememberReturnPath(path: unknown): void {
  if (typeof window === 'undefined') return;
  if (!isSafeInternalPath(path)) return;
  // Never remember the login screens themselves: doing so turns a bounced
  // sign-in into a loop that returns to /login forever.
  if (path === '/' || path.startsWith('/login') || path.startsWith('/parent/login')) return;
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify({ path, at: Date.now() }));
  } catch {
    // Private mode, or storage disabled. The ?next= param is the other carrier.
  }
}

/**
 * Read the stashed path and clear it, so it is used exactly once.
 *
 * Single-use is the point: without the clear, every subsequent visit to the
 * root during the session would bounce to the same assignment.
 */
export function takeReturnPath(): string | null {
  if (typeof window === 'undefined') return null;
  let raw: string | null = null;
  try {
    raw = window.sessionStorage.getItem(KEY);
    if (raw !== null) window.sessionStorage.removeItem(KEY);
  } catch {
    return null;
  }
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as { path?: unknown; at?: unknown };
    const at = typeof parsed.at === 'number' ? parsed.at : 0;
    if (Date.now() - at > TTL_MS) return null;
    return isSafeInternalPath(parsed.path) ? parsed.path : null;
  } catch {
    // Anything unparseable is treated as absent rather than trusted.
    return null;
  }
}

/**
 * Build the login URL that carries the destination.
 *
 * Both carriers are written here so a caller cannot set one and forget the
 * other, which would leave exactly one of the two sign-in flows broken and be
 * very hard to notice.
 */
export function loginUrlWithReturn(loginPath: string, currentPath: unknown): string {
  if (!isSafeInternalPath(currentPath)) return loginPath;
  rememberReturnPath(currentPath);
  const sep = loginPath.includes('?') ? '&' : '?';
  return `${loginPath}${sep}next=${encodeURIComponent(currentPath)}`;
}
