/**
 * Server-side Microsoft token verification for Nexus API routes.
 * Validates the MS access token by calling Graph API /me endpoint.
 */

interface MsUserInfo {
  oid: string;
  email: string;
  name: string;
  displayName: string;
}

/**
 * Verify a Microsoft access token and extract user info.
 * Uses the Graph API /me endpoint to validate the token.
 */
export async function verifyMsToken(authHeader: string | null): Promise<MsUserInfo> {
  if (!authHeader?.startsWith('Bearer ')) {
    throw new Error('Missing or invalid Authorization header');
  }

  const token = authHeader.split(' ')[1];

  const response = await fetch('https://graph.microsoft.com/v1.0/me', {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new Error(`Invalid Microsoft token: ${response.status} ${errorText}`);
  }

  const profile = await response.json();

  return {
    oid: profile.id,
    email: profile.userPrincipalName || profile.mail || '',
    name: profile.displayName || '',
    displayName: profile.displayName || '',
  };
}

/**
 * Extract the Bearer token from an Authorization header.
 */
export function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader?.startsWith('Bearer ')) return null;
  return authHeader.split(' ')[1];
}
