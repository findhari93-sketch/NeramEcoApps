/**
 * Server-side Microsoft token verification for Nexus API routes.
 * Validates the MS access token by calling Graph API /me endpoint.
 *
 * In non-production environments, supports test tokens prefixed with "test_"
 * that bypass Graph API verification for E2E testing.
 */

import { getSupabaseAdminClient } from '@neram/database';

interface MsUserInfo {
  oid: string;
  email: string;
  name: string;
  displayName: string;
}

/**
 * Verify a Microsoft access token and extract user info.
 * Uses the Graph API /me endpoint to validate the token.
 *
 * In non-production: tokens starting with "test_" are decoded as base64 email
 * and the user is looked up directly in Supabase (no Graph API call).
 */
export async function verifyMsToken(authHeader: string | null): Promise<MsUserInfo> {
  if (!authHeader?.startsWith('Bearer ')) {
    throw new Error('Missing or invalid Authorization header');
  }

  const token = authHeader.split(' ')[1];

  // Test token bypass for E2E testing (non-production only)
  if (process.env.NODE_ENV !== 'production' && token.startsWith('test_')) {
    const email = Buffer.from(token.slice(5), 'base64').toString('utf-8');
    const supabase = getSupabaseAdminClient();
    const { data: user } = await supabase
      .from('users')
      .select('id, name, email, ms_oid')
      .eq('email', email)
      .single();

    if (!user) {
      throw new Error(`Test user not found: ${email}`);
    }

    return {
      oid: user.ms_oid || `test-oid-${user.id}`,
      email: user.email || email,
      name: user.name || 'Test User',
      displayName: user.name || 'Test User',
    };
  }

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
