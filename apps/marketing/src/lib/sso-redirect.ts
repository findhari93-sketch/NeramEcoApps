/**
 * Where /sso may send a signed-in visitor, with a Firebase custom token in the
 * URL. Anything that is not one of our own hosts falls back to the app, because
 * whoever receives that token can sign in as the visitor.
 *
 * Allowed: https on neramclasses.com or any of its subdomains, and the
 * configured app origin (which is how localhost works in dev).
 */
export function safeSsoRedirect(raw: string | null, appUrl: string): string {
  if (!raw) return appUrl;

  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return appUrl;
  }

  const ownHost =
    target.protocol === 'https:' &&
    (target.hostname === 'neramclasses.com' || target.hostname.endsWith('.neramclasses.com'));

  let appOrigin: string | null = null;
  try {
    appOrigin = new URL(appUrl).origin;
  } catch {
    appOrigin = null;
  }

  return ownHost || target.origin === appOrigin ? target.toString() : appUrl;
}
