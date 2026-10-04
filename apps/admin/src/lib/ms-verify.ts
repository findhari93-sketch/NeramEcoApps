/**
 * Verify a Microsoft access token server-side and return the real caller identity.
 *
 * Mirrors apps/nexus/src/lib/ms-verify.ts. The admin app previously resolved the
 * signed-in staff member from `msOid`/`email` QUERY PARAMETERS, which are
 * attacker-controlled: anyone who could reach the endpoint could name any
 * identity they liked. Identity must come from a token the tenant signed, never
 * from the request's own claims about who is calling.
 */

export interface MsUserInfo {
  oid: string;
  email: string;
  name: string;
}

/** Extract the Bearer token from an Authorization header. */
export function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader?.startsWith('Bearer ')) return null;
  return authHeader.slice('Bearer '.length).trim() || null;
}

/**
 * Resolve the caller by asking Microsoft Graph who the token belongs to.
 * Throws when the header is missing or the token is not valid.
 */
export async function verifyMsToken(authHeader: string | null): Promise<MsUserInfo> {
  const token = extractBearerToken(authHeader);
  if (!token) {
    throw new Error('Missing or invalid Authorization header');
  }

  // E2E only, never in production: `test_<base64 email>`, the same token the
  // Nexus test-login issues and middleware.ts accepts. It names an email; the
  // caller still has to exist as a staff user for /api/auth/me to answer 200.
  if (process.env.NODE_ENV !== 'production' && token.startsWith('test_')) {
    const email = Buffer.from(token.slice('test_'.length), 'base64').toString('utf8');
    if (!email.includes('@')) throw new Error('Malformed test token');
    return { oid: `test-oid:${email.toLowerCase()}`, email, name: 'E2E Test User' };
  }

  const response = await fetch('https://graph.microsoft.com/v1.0/me', {
    cache: 'no-store',
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => 'Unknown error');
    throw new Error(`Invalid Microsoft token: ${response.status} ${detail}`);
  }

  const profile = await response.json();
  return {
    oid: profile.id,
    email: profile.userPrincipalName || profile.mail || '',
    name: profile.displayName || '',
  };
}
