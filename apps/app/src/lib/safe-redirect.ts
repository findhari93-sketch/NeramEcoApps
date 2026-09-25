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
