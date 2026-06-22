/**
 * Impersonation token for the Nexus "View as Student" feature.
 *
 * A teacher/admin mints one of these (server-side, after authorization) to step
 * into a real student's account. The token is a compact, HMAC-signed JWT-like
 * string. When `verifyMsToken` (apps/nexus/src/lib/ms-verify.ts) sees one, it
 * resolves the request as the *target student* by returning the student's
 * `ms_oid`, so every downstream route scopes to the student with no per-route
 * changes.
 *
 * Signed with Node's built-in crypto (HMAC-SHA256) so we add no dependency.
 * Secret: IMPERSONATION_JWT_SECRET (server-only env var).
 */

import { createHmac, timingSafeEqual } from 'crypto';

/** Recognizable prefix so the token type can be detected without parsing. */
export const IMPERSONATION_TOKEN_PREFIX = 'imp_';

/** Token lifetime in seconds (60 minutes). */
export const IMPERSONATION_TTL_SECONDS = 60 * 60;

export interface ImpersonationTokenPayload {
  /** Schema version, in case the payload shape evolves. */
  v: 1;
  /** Marker claim so verifiers can assert this really is an impersonation token. */
  imp: true;
  /** users.id of the student being impersonated. */
  targetUserId: string;
  /** users.ms_oid of the student — what downstream routes resolve against. */
  targetMsOid: string;
  /** users.id of the teacher/admin who minted the token. */
  impersonatorUserId: string;
  /** Free-text reason, e.g. "Ticket TKT-0042". */
  reason?: string;
  /** Issued-at (epoch seconds). */
  iat: number;
  /** Expiry (epoch seconds). */
  exp: number;
}

export interface SignImpersonationTokenInput {
  targetUserId: string;
  targetMsOid: string;
  impersonatorUserId: string;
  reason?: string;
  /** Override TTL (seconds). Defaults to IMPERSONATION_TTL_SECONDS. */
  ttlSeconds?: number;
}

function getSecret(): string {
  const secret = process.env.IMPERSONATION_JWT_SECRET;
  if (!secret) {
    throw new Error('IMPERSONATION_JWT_SECRET is not configured');
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
 * Mint a signed impersonation token. Authorization (who may impersonate whom)
 * is enforced by the caller (the mint endpoint), not here.
 */
export function signImpersonationToken(input: SignImpersonationTokenInput): {
  token: string;
  expiresAt: string;
} {
  const secret = getSecret();
  const now = Math.floor(Date.now() / 1000);
  const exp = now + (input.ttlSeconds ?? IMPERSONATION_TTL_SECONDS);

  const payload: ImpersonationTokenPayload = {
    v: 1,
    imp: true,
    targetUserId: input.targetUserId,
    targetMsOid: input.targetMsOid,
    impersonatorUserId: input.impersonatorUserId,
    ...(input.reason ? { reason: input.reason } : {}),
    iat: now,
    exp,
  };

  const body = base64urlEncode(JSON.stringify(payload));
  const sig = sign(body, secret);
  const token = `${IMPERSONATION_TOKEN_PREFIX}${body}.${sig}`;

  return { token, expiresAt: new Date(exp * 1000).toISOString() };
}

/** Cheap check used by verifyMsToken to branch before doing crypto work. */
export function isImpersonationToken(token: string | null | undefined): boolean {
  return !!token && token.startsWith(IMPERSONATION_TOKEN_PREFIX);
}

/**
 * Verify an impersonation token's signature and expiry.
 * Returns the payload, or null if the token is not an impersonation token,
 * has a bad signature, is malformed, or is expired.
 */
export function verifyImpersonationToken(
  token: string | null | undefined
): ImpersonationTokenPayload | null {
  if (!isImpersonationToken(token)) return null;
  const secret = getSecret();

  const raw = (token as string).slice(IMPERSONATION_TOKEN_PREFIX.length);
  const dotIndex = raw.indexOf('.');
  if (dotIndex <= 0) return null;

  const body = raw.slice(0, dotIndex);
  const providedSig = raw.slice(dotIndex + 1);
  const expectedSig = sign(body, secret);

  // Constant-time comparison; bail if lengths differ (timingSafeEqual throws).
  const a = Buffer.from(providedSig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  let payload: ImpersonationTokenPayload;
  try {
    payload = JSON.parse(base64urlDecode(body));
  } catch {
    return null;
  }

  if (!payload || payload.imp !== true || !payload.targetMsOid) return null;
  if (typeof payload.exp !== 'number' || payload.exp < Math.floor(Date.now() / 1000)) {
    return null;
  }

  return payload;
}
