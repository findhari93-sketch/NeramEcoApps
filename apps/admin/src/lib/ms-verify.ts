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

  const response = await fetch('https://graph.microsoft.com/v1.0/me', {
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
