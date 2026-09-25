const HANDSHAKE_PARAMS = ['authToken', 'sso', 'signedOut'];

/**
 * The URL marketing's /sso sends the visitor back to. Keeps the query string,
 * so campaign params (utm_*, gclid) survive the round trip, and drops the SSO
 * handshake params so a retry does not replay them.
 */
export function ssoReturnUrl(href: string): string {
  const url = new URL(href);
  for (const param of HANDSHAKE_PARAMS) url.searchParams.delete(param);
  return url.toString();
}
