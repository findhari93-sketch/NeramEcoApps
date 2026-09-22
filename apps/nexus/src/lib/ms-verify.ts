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

import { createHash } from 'crypto';
import { getSupabaseAdminClient } from '@neram/database';
import {
  isImpersonationToken,
  verifyImpersonationToken,
} from '@/lib/impersonation-token';
import { isParentToken, verifyParentToken } from '@/lib/parent-token';
import { isTeamsSsoToken, verifyTeamsSsoToken, TeamsSsoError } from '@/lib/teams-sso';
import { TtlCache } from '@/lib/ttl-cache';
import { ApiError, describeError } from '@/lib/api-errors';

/**
 * Microsoft or the database could not answer, so nothing is known about the token.
 *
 * These are 503s, never the 401 messages below. A 401 is what makes useAuthFetch
 * start a sign-in redirect and what drops a teacher out of View as Student, so an
 * outage classed as one signed people out mid-edit (PERF-0013, PERF-0014).
 */
const MICROSOFT_UNAVAILABLE = 'Microsoft sign-in check is unavailable. Try again.';
const SESSION_CHECK_UNAVAILABLE = 'Could not verify the session. Try again.';

/** PostgREST's "no rows" from `.single()`: a real answer, unlike a failed read. */
const NO_ROWS = 'PGRST116';

/**
 * Resolved identities for Microsoft access tokens we have already checked with Graph.
 *
 * Every authed request used to spend a full HTTPS round trip to graph.microsoft.com
 * just to learn who the caller was, on the large majority of routes, before the route
 * began its own work. From India that is a serial 150-400ms added to everything.
 *
 * Five minutes is a deliberate ceiling on staleness: a token revoked at Entra keeps
 * working for at most that long, and never past the token's own `exp`. It was one
 * minute, which the bell and badge pollers (both every 60s) outran on almost every
 * poll, so each one paid a Graph round trip, the call that stalled into 524s (perf
 * audit PERF-0009, 2026-09-21; the user accepted the longer window). The fact being
 * cached, which Microsoft account this token belongs to, cannot change during that
 * token's life anyway. Tokens whose expiry cannot be read keep the old minute.
 *
 * Keyed on a hash of the token, never the token itself, so an inspected heap or a
 * logged cache key cannot be replayed as a credential.
 */
const IDENTITY_TTL_MS = 5 * 60_000;
const OPAQUE_TOKEN_TTL_MS = 60_000;
const graphIdentityCache = new TtlCache<MsUserInfo>(IDENTITY_TTL_MS);

/**
 * The token's own expiry in epoch ms, read from its JWT payload, or null when it is not
 * a readable JWT. Only ever used to shorten the cache window; the identity itself comes
 * from Graph, never from this unverified payload.
 */
function tokenExpiresAtMs(token: string): number | null {
  const payload = token.split('.')[1];
  if (!payload) return null;
  try {
    const exp = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))?.exp;
    return typeof exp === 'number' ? exp * 1000 : null;
  } catch {
    return null;
  }
}
/** How long the Graph /me check may take before the request fails instead of hanging. */
const GRAPH_TIMEOUT_MS = 8_000;

function tokenKey(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Test seam. Resets the module-level identity cache between cases. */
export function __clearGraphIdentityCache(): void {
  graphIdentityCache.clear();
}

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
    const { data: cred, error: credError } = await supabase
      .from('nexus_parent_credentials')
      // One literal string: PostgREST's types parse the select at compile time,
      // and a concatenated string widens to `string` and loses all inference.
      .select(
        'parent_user_id, token_version, is_active, parent:users!nexus_parent_credentials_parent_user_id_fkey(id, name, email, ms_oid, user_type)'
      )
      .eq('parent_user_id', payload.parentUserId)
      .maybeSingle();

    // A failed read is not a missing row. Read as one, a database blip told the
    // parent their access had been revoked.
    if (credError) {
      console.error(`[ms-verify] parent credential read failed: ${describeError(credError)}`);
      throw new ApiError(SESSION_CHECK_UNAVAILABLE, 503);
    }

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
    const { data: student, error: studentError } = await supabase
      .from('users')
      .select('id, name, email, linked_classroom_email, ms_oid')
      .eq('id', payload.targetUserId)
      .single();

    // `.single()` reports a missing student as PGRST116, which is a real answer
    // and falls through to the refusal below. Anything else is a failed read, and
    // refusing on it ended the teacher's View as Student over a database blip.
    if (studentError && studentError.code !== NO_ROWS) {
      console.error(`[ms-verify] impersonation target read failed: ${describeError(studentError)}`);
      throw new ApiError(SESSION_CHECK_UNAVAILABLE, 503);
    }

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

  // Teams tab single sign-on (the Answer Pad side panel). The token is issued to
  // this app rather than to Graph, so Graph cannot check it; teams-sso.ts
  // validates it locally. Only a token whose audience is this app takes this
  // path, so every other token behaves exactly as before. Not cached: the check
  // is a local signature verification, and a cached identity could outlive a
  // token that expires inside the TTL.
  if (isTeamsSsoToken(token)) {
    try {
      const identity = await verifyTeamsSsoToken(token);
      return {
        oid: identity.oid,
        email: identity.email,
        name: identity.name || identity.email,
        displayName: identity.name || identity.email,
      };
    } catch (err) {
      // Logged, not returned, for the same reason as the Graph failure below.
      if (err instanceof TeamsSsoError) {
        console.error(`[ms-verify] Teams SSO token rejected: ${err.message}`);
        throw new Error('Invalid Microsoft token: 401');
      }
      // Anything else (the signing keys could not be fetched, the network failed)
      // says nothing about the token.
      console.error(`[ms-verify] Teams SSO check unavailable: ${describeError(err)}`);
      throw new ApiError(MICROSOFT_UNAVAILABLE, 503);
    }
  }

  // Real Microsoft users land here, so this is the hot path for the whole app.
  // Everything above returns before this point, which is why only this branch is
  // cached: the parent branch deliberately re-reads its credential row every time so
  // that "Revoke" takes effect at once, and the impersonation and test branches are
  // rare and already local.
  const cacheKey = tokenKey(token);
  const cached = graphIdentityCache.get(cacheKey);
  if (cached) return cached;

  // A deadline, because nearly every route verifies through this call before doing
  // anything else. Without one, a Graph call that stalls holds the whole request open
  // for as long as the platform allows; behind Cloudflare that surfaced as 524s on the
  // bell and badge pollers. A healthy call takes well under a second from sin1.
  // A timer rather than AbortSignal.timeout, so tests can drive it with fake timers.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GRAPH_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
  } catch (err) {
    if (controller.signal.aborted) {
      console.error(`[ms-verify] Graph token check timed out after ${GRAPH_TIMEOUT_MS}ms`);
      throw new ApiError('Microsoft identity check timed out', 503);
    }
    console.error(`[ms-verify] Graph token check could not connect: ${describeError(err)}`);
    throw new ApiError(MICROSOFT_UNAVAILABLE, 503);
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    // Failures are never cached. A token rejected once may be accepted a moment later
    // (a clock skew, a transient Graph 5xx), and caching the rejection would strand a
    // signed-in teacher for the length of the TTL.
    //
    // The raw Graph body is logged, not thrown: it once ended up verbatim in a
    // route's JSON response and from there rendered as literal text inside a
    // student's video player.
    console.error(`[ms-verify] Graph token check failed: ${response.status} ${errorText}`);
    // Throttling and server faults are Graph's trouble, not the token's.
    if (response.status === 429 || response.status >= 500) {
      throw new ApiError(MICROSOFT_UNAVAILABLE, 503);
    }
    throw new Error(`Invalid Microsoft token: ${response.status}`);
  }

  const profile = await response.json();

  const identity: MsUserInfo = {
    oid: profile.id,
    email: profile.userPrincipalName || profile.mail || '',
    name: profile.displayName || '',
    displayName: profile.displayName || '',
  };

  const expiresAt = tokenExpiresAtMs(token);
  const ttl = expiresAt === null ? OPAQUE_TOKEN_TTL_MS : Math.min(IDENTITY_TTL_MS, expiresAt - Date.now());
  if (ttl > 0) graphIdentityCache.set(cacheKey, identity, ttl);
  return identity;
}

/**
 * Extract the Bearer token from an Authorization header.
 */
export function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader?.startsWith('Bearer ')) return null;
  return authHeader.split(' ')[1];
}
