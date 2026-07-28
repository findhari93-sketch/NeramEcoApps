/**
 * Parent session token for the Nexus parent portal.
 *
 * Parents have no Microsoft account. They sign in with an admin-issued login id
 * and password, and the login route mints one of these. When `verifyMsToken`
 * (apps/nexus/src/lib/ms-verify.ts) sees one, it resolves the request as the
 * parent by returning their synthetic `ms_oid` ('parent:<uuid>'), so the
 * existing `.eq('ms_oid', ...)` lookups work with no per-route change.
 *
 * Deliberately a near-copy of lib/impersonation-token.ts: same base64url body,
 * same HMAC-SHA256 signature, same "return null on anything wrong" contract.
 * Signed with Node's built-in crypto so we add no dependency.
 * Secret: PARENT_SESSION_SECRET (server-only env var).
 *
 * One divergence from impersonation, and it matters. An impersonation token
 * lives 60 minutes and is minted by a teacher, so it never needs revoking. A
 * parent session lives 12 hours and staff can revoke access at any time, so the
 * payload carries `sid` (the credential row's token_version at mint time).
 * Bumping token_version invalidates every live session on the next request,
 * which is what makes "Revoke" instant instead of "within 12 hours".
 *
 * Holding a valid parent token proves only WHO the parent is. It never proves
 * WHICH child they may see: that is assertParentOf() in lib/parent-auth.ts, and
 * every route touching child data must call it.
 */

import { createHmac, timingSafeEqual } from 'crypto';

/** Recognizable prefix so the token type can be detected without parsing. */
export const PARENT_TOKEN_PREFIX = 'par_';

/**
 * Token lifetime in seconds (12 hours). Long enough that a parent checking in
 * across an evening is not thrown back to the login form, short enough that a
 * token copied off a shared family phone does not live for weeks.
 */
export const PARENT_SESSION_TTL_SECONDS = 12 * 60 * 60;

export interface ParentTokenPayload {
  /** Schema version, in case the payload shape evolves. */
  v: 1;
  /** Marker claim so verifiers can assert this really is a parent token. */
  par: true;
  /** users.id of the parent. */
  parentUserId: string;
  /** users.ms_oid of the parent ('parent:<uuid>') — what downstream resolves on. */
  parentMsOid: string;
  /**
   * nexus_parent_credentials.token_version at mint time. The verifier in
   * ms-verify.ts re-reads the row and refuses the token if this no longer
   * matches, so a password change or a revoke ends every live session at once.
   */
  sid: number;
  /**
   * Whether the parent still owes us a password change. Carried so the client
   * can route straight to /parent/set-password without a round trip. NOT the
   * enforcement point: the server re-reads the credential row on every request.
   */
  mcp: boolean;
  /** Issued-at (epoch seconds). */
  iat: number;
  /** Expiry (epoch seconds). */
  exp: number;
}

export interface SignParentTokenInput {
  parentUserId: string;
  parentMsOid: string;
  /** nexus_parent_credentials.token_version. */
  tokenVersion: number;
  mustChangePassword: boolean;
  /** Override TTL (seconds). Defaults to PARENT_SESSION_TTL_SECONDS. */
  ttlSeconds?: number;
}

function getSecret(): string {
  const secret = process.env.PARENT_SESSION_SECRET;
  if (!secret) {
    throw new Error('PARENT_SESSION_SECRET is not configured');
  }
  return secret;
}

function base64urlEncode(input: string): string {
  return Buffer.from(input, 'utf-8').toString('base64url');
}

function base64urlDecode(input: string): string {
  return Buffer.from(input, 'base64url').toString('utf-8');
}

function sign(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body).digest('base64url');
}

/**
 * Mint a signed parent session token. Authentication (checking the password) is
 * the caller's job — the login route — not this module's.
 */
export function signParentToken(input: SignParentTokenInput): {
  token: string;
  expiresAt: string;
} {
  const secret = getSecret();
  const now = Math.floor(Date.now() / 1000);
  const exp = now + (input.ttlSeconds ?? PARENT_SESSION_TTL_SECONDS);

  const payload: ParentTokenPayload = {
    v: 1,
    par: true,
    parentUserId: input.parentUserId,
    parentMsOid: input.parentMsOid,
    sid: input.tokenVersion,
    mcp: input.mustChangePassword,
    iat: now,
    exp,
  };

  const body = base64urlEncode(JSON.stringify(payload));
  const sig = sign(body, secret);
  const token = `${PARENT_TOKEN_PREFIX}${body}.${sig}`;

  return { token, expiresAt: new Date(exp * 1000).toISOString() };
}

/** Cheap check used by verifyMsToken to branch before doing crypto work. */
export function isParentToken(token: string | null | undefined): boolean {
  return !!token && token.startsWith(PARENT_TOKEN_PREFIX);
}

/**
 * Verify a parent token's signature and expiry.
 * Returns the payload, or null if the token is not a parent token, has a bad
 * signature, is malformed, or is expired.
 *
 * Note this does NOT check token_version or is_active: those live in the
 * database and are checked by the parent branch of verifyMsToken.
 */
export function verifyParentToken(
  token: string | null | undefined
): ParentTokenPayload | null {
  if (!isParentToken(token)) return null;
  const secret = getSecret();

  const raw = (token as string).slice(PARENT_TOKEN_PREFIX.length);
  const dotIndex = raw.indexOf('.');
  if (dotIndex <= 0) return null;

  const body = raw.slice(0, dotIndex);
  const providedSig = raw.slice(dotIndex + 1);
  const expectedSig = sign(body, secret);

  // Constant-time comparison; bail if lengths differ (timingSafeEqual throws).
  const a = Buffer.from(providedSig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  let payload: ParentTokenPayload;
  try {
    payload = JSON.parse(base64urlDecode(body));
  } catch {
    return null;
  }

  if (!payload || payload.par !== true || !payload.parentMsOid) return null;
  if (typeof payload.parentUserId !== 'string' || !payload.parentUserId) return null;
  // A token with no session version could not be revocation-checked, so refuse it.
  if (typeof payload.sid !== 'number') return null;
  if (typeof payload.exp !== 'number' || payload.exp < Math.floor(Date.now() / 1000)) {
    return null;
  }

  return payload;
}
