/**
 * Server-side Microsoft token verification for Nexus API routes.
 * Validates the MS access token by calling Graph API /me endpoint.
 *
 * In non-production environments, supports test tokens prefixed with "test_"
 * that bypass Graph API verification for E2E testing.
 *
 * Also supports impersonation tokens ("imp_" prefix) for the "View as Student"
 * feature: a signed token minted by an authorized teacher/admin that resolves
 * the request as the target student (by returning the student's ms_oid), so
 * every downstream route scopes to the student with no per-route changes.
 * Unlike test tokens, impersonation tokens work in production (that is the
 * point) because they are signed and authorized at mint time.
 *
 * Also supports parent session tokens ("par_" prefix). Parents have no
 * Microsoft account and sign in with an admin-issued login id and password;
 * they resolve by a synthetic ms_oid of the form 'parent:<uuid>'. That branch
 * sets `parentUserId` on the result, which getRequestUser treats as a hard
 * refusal so a parent token cannot reach any non-parent route.
 */

import { getSupabaseAdminClient } from '@neram/database';
import {
  isImpersonationToken,
  verifyImpersonationToken,
} from '@/lib/impersonation-token';
import { isParentToken, verifyParentToken } from '@/lib/parent-token';

export interface MsUserInfo {
  oid: string;
  email: string;
  name: string;
  displayName: string;
  /**
   * When the request is impersonated, the users.id of the teacher/admin who
   * minted the token. Routes that don't care can ignore it; /api/auth/me uses
   * it to avoid bumping the impersonated student's last_login_at.
   */
  impersonatorUserId?: string;
  /**
   * Set ONLY by the parent-session branch: the users.id of the signed-in parent.
   *
   * Its presence means "this bearer token belongs to a parent", and every route
   * that is not part of the parent portal must refuse it. That refusal is
   * centralised in getRequestUser (lib/study-materials.ts), which fails closed
   * on this field, so no per-route change is needed. Routes that call
   * verifyMsToken directly must check it themselves.
   *
   * Holding a parent token proves only WHO the parent is. It never proves WHICH
   * child they may see: that is assertParentOf() in lib/parent-auth.ts.
   */
  parentUserId?: string;
}

/**
 * Verify a Microsoft access token and extract user info.
 * Uses the Graph API /me endpoint to validate the token.
 *
 * In non-production: tokens starting with "test_" are decoded as base64 email
 * and the user is looked up directly in Supabase (no Graph API call).
 */
export interface VerifyMsTokenOptions {
  /**
   * Opt in to accepting a parent session token. Defaults to FALSE, so every one
   * of the ~50 routes that calls verifyMsToken directly rejects parents without
   * needing to be edited.
   *
   * This matters because those routes take their scope from the query string
   * (`?classroom=`, `?student=`) and check enrollment, which a parent can never
   * hold. Left open, a parent token would sail past those checks and read any
   * classroom in the school.
   *
   * Only three callers should ever set this: /api/auth/me (which has a dedicated
   * parent branch), getParentUser in lib/parent-auth.ts, and the parent login
   * routes. Everything a parent is allowed to see goes through /api/parent/**,
   * where assertParentOf scopes it to their own child.
   */
  allowParent?: boolean;
}

export async function verifyMsToken(
  authHeader: string | null,
  options: VerifyMsTokenOptions = {}
): Promise<MsUserInfo> {
  if (!authHeader?.startsWith('Bearer ')) {
    throw new Error('Missing or invalid Authorization header');
  }

  const token = authHeader.split(' ')[1];

  // Parent session branch. Parents have no Microsoft account: they sign in with
  // an admin-issued login id and password, and /api/auth/parent/login mints a
  // signed `par_` token. Resolving them by their synthetic ms_oid
  // ('parent:<uuid>') means the existing `.eq('ms_oid', ...)` lookups work
  // unchanged, the same trick the impersonation branch below uses.
  //
  // First because the prefix check is free and this is the cheapest branch to
  // rule out. Works in production (signed, and re-checked against the DB here).
  if (isParentToken(token)) {
    // Fail closed. A route that has not explicitly opted in is not designed for
    // parent scoping, so refuse before doing any work.
    if (!options.allowParent) {
      throw new Error('Parent accounts cannot access this resource.');
    }

    const payload = verifyParentToken(token);
    if (!payload) {
      throw new Error('Invalid or expired parent session');
    }

    const supabase = getSupabaseAdminClient();
    const { data: cred } = await supabase
      .from('nexus_parent_credentials')
      // One literal string: PostgREST's types parse the select at compile time,
      // and a concatenated string widens to `string` and loses all inference.
      .select(
        'parent_user_id, token_version, is_active, parent:users!nexus_parent_credentials_parent_user_id_fkey(id, name, email, ms_oid, user_type)'
      )
      .eq('parent_user_id', payload.parentUserId)
      .maybeSingle();

    // Re-reading the credential row on every request is what makes "Revoke"
    // instant. Without it a revoked parent would keep full access until their
    // 12-hour token happened to expire.
    if (!cred || cred.is_active !== true) {
      throw new Error('Parent access has been revoked');
    }
    if (cred.token_version !== payload.sid) {
      // Password changed or access re-issued since this token was minted.
      throw new Error('Parent session is no longer valid');
    }

    const parent = cred.parent as unknown as {
      id: string;
      name: string | null;
      email: string | null;
      ms_oid: string | null;
      user_type: string | null;
    } | null;

    // Defend against stale tokens exactly as the impersonation branch does.
    if (!parent || parent.user_type !== 'parent' || parent.ms_oid !== payload.parentMsOid) {
      throw new Error('Parent account is no longer valid');
    }

    return {
      oid: parent.ms_oid as string,
      email: parent.email || '',
      name: parent.name || 'Parent',
      displayName: parent.name || 'Parent',
      parentUserId: parent.id,
    };
  }

  // Impersonation token branch ("View as Student"). Resolve the request as the
  // target student so all downstream `.eq('ms_oid', ...)` lookups hit the
  // student. Works in production (signed + authorized at mint time).
  if (isImpersonationToken(token)) {
    const payload = verifyImpersonationToken(token);
    if (!payload) {
      throw new Error('Invalid or expired impersonation token');
    }

    const supabase = getSupabaseAdminClient();
    const { data: student } = await supabase
      .from('users')
      .select('id, name, email, linked_classroom_email, ms_oid')
      .eq('id', payload.targetUserId)
      .single();

    // Defend against stale tokens: the student must still exist and their
    // ms_oid must still match what the token was minted for.
    if (!student || !student.ms_oid || student.ms_oid !== payload.targetMsOid) {
      throw new Error('Impersonation target is no longer valid');
    }

    return {
      oid: student.ms_oid,
      email: student.email || student.linked_classroom_email || '',
      name: student.name || 'Student',
      displayName: student.name || 'Student',
      impersonatorUserId: payload.impersonatorUserId,
    };
  }

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
