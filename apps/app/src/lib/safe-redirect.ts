/**
 * Where the app may send a signed-in visitor, often with a Firebase custom
 * token in the URL. Whoever receives that token can sign in as the visitor,
 * so only our own hosts qualify.
 *
 * Trusted: https on neramclasses.com or any of its subdomains, plus any origin
 * passed in (the configured marketing URL, which is how localhost works in dev).
 * Mirrors apps/marketing/src/lib/sso-redirect.ts.
 */
export function isTrustedRedirect(raw: string | null | undefined, trustedOrigins: string[] = []): boolean {
  if (!raw) return false;

  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return false;
  }

  if (
    target.protocol === 'https:' &&
    (target.hostname === 'neramclasses.com' || target.hostname.endsWith('.neramclasses.com'))
  ) {
    return true;
  }

  return trustedOrigins.some((origin) => {
    try {
      return new URL(origin).origin === target.origin;
    } catch {
      return false;
    }
  });
}

export function safeRedirect(
  raw: string | null | undefined,
  fallback: string,
  trustedOrigins: string[] = []
): string {
  return raw && isTrustedRedirect(raw, trustedOrigins) ? raw : fallback;
}

const MAX_INTERNAL_PATH = 512;

/**
 * A path inside this app to return a visitor to after sign-in, such as
 * `/tools/nata/cutoff-calculator?score=120`. Never gets a sign-in token, so it
 * only has to stay on this origin. Returns null for anything else.
 */
export function safeInternalPath(raw: string | null | undefined): string | null {
  if (!raw || raw.length > MAX_INTERNAL_PATH) return null;
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return null;
  // Control characters and backslashes let browsers read the path as a host.
  if (/[\u0000-\u001f\u007f\\]/.test(raw)) return null;

  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return null;
  }
  if (decoded.startsWith('//') || decoded.startsWith('/\\') || /[\u0000-\u001f\u007f]/.test(decoded)) {
    return null;
  }

  const pathname = raw.split(/[?#]/)[0].toLowerCase();
  if (pathname === '/login' || pathname.startsWith('/login/') || pathname.startsWith('/api/') || pathname === '/api') {
    return null;
  }
  return raw;
}

export type PostAuthTarget =
  | { kind: 'token'; url: string }
  | { kind: 'path'; path: string }
  | { kind: 'dashboard' };

/**
 * Where to send a visitor once they have signed in.
 *
 * 1. Another trusted host (the marketing site): it needs a custom token.
 * 2. A full URL on this same origin: treated as a path, never given a token,
 *    because the visitor is already signed in here.
 * 3. A path inside this app.
 * 4. The dashboard.
 */
export function resolvePostAuthTarget(
  raw: string | null | undefined,
  currentOrigin: string,
  trustedOrigins: string[] = []
): PostAuthTarget {
  if (!raw) return { kind: 'dashboard' };

  if (raw.startsWith('/')) {
    const path = safeInternalPath(raw);
    return path ? { kind: 'path', path } : { kind: 'dashboard' };
  }

  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return { kind: 'dashboard' };
  }

  if (target.origin === currentOrigin) {
    const path = safeInternalPath(`${target.pathname}${target.search}${target.hash}`);
    return path ? { kind: 'path', path } : { kind: 'dashboard' };
  }

  return isTrustedRedirect(raw, trustedOrigins) ? { kind: 'token', url: raw } : { kind: 'dashboard' };
}
