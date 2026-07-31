/**
 * Short-lived, HMAC-signed grant to stream one specific video.
 *
 * A <video> element cannot send an Authorization header, so the byte proxy has
 * to take its authority from the URL. This is that authority: minted once, by a
 * route that has already done the expensive work of checking who the viewer is
 * and whether they are enrolled, then presented on every range request.
 *
 * Why not just call verifyMsToken in the proxy? Because a single 90 minute
 * recording is hundreds of range requests, and verifyMsToken ends in a call to
 * graph.microsoft.com/v1.0/me. Authorising per chunk would mean a Microsoft
 * round trip per chunk: slow, and a quiet way to get rate limited by Graph.
 * Expensive checks happen once at mint time; the proxy only verifies a local
 * signature, which is microseconds and needs no network.
 *
 * Bound to refId + userId + sid. Deliberately NOT bound to IP, because students
 * watch on phones that change towers and switch between wifi and mobile data
 * mid-video, and an IP-bound token would break playback for exactly the people
 * this feature is for. Not bound to a user-agent hash either: Chrome's media
 * element does not always present the same UA as the page fetch that minted the
 * token. Containment is the 10 minute lifetime plus the audit row written at
 * mint time, which is enough to answer "who was streaming this, and when".
 *
 * Signed with Node's crypto, mirroring impersonation-token.ts, so no dependency.
 */

import { createHmac, timingSafeEqual, randomBytes } from 'crypto';

/** Recognisable prefix so the token type is detectable without parsing. */
export const VIDEO_TOKEN_PREFIX = 'vid_';

/**
 * 10 minutes. Long enough that a normal watch renews only a handful of times,
 * short enough that a leaked URL is stale before it can be shared usefully.
 */
export const VIDEO_TOKEN_TTL_SECONDS = 600;

/** Which table refId points at. Keeps one proxy serving every video surface. */
export type VideoScope = 'recap' | 'class' | 'foundation';

export interface VideoTokenPayload {
  /** Schema version, in case the payload shape evolves. */
  v: 1;
  /** Marker claim so a token of another type cannot be replayed here. */
  vid: true;
  scope: VideoScope;
  /** recapId | scheduledClassId | foundationChapterId. */
  refId: string;
  /** users.id of the viewer, for the audit trail. */
  userId: string;
  /** Random per-mint session id, matching a stream-grant row. */
  sid: string;
  /** Total bytes, so an unsatisfiable range can 416 without a lookup. */
  size: number;
  iat: number;
  exp: number;
}

export interface MintVideoTokenInput {
  scope: VideoScope;
  refId: string;
  userId: string;
  size: number;
  ttlSeconds?: number;
}

/**
 * Falls back to IMPERSONATION_JWT_SECRET so deploying this code before the new
 * env var is set cannot 500 every video request. Set VIDEO_STREAM_SECRET in
 * production: separate secrets mean rotating one does not invalidate the other,
 * and a video grant should never be forgeable by anything that leaked the
 * impersonation secret.
 */
function getSecret(): string {
  const secret = process.env.VIDEO_STREAM_SECRET || process.env.IMPERSONATION_JWT_SECRET;
  if (!secret) {
    throw new Error('VIDEO_STREAM_SECRET is not configured');
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
 * Mint a grant. Authorization (is this person allowed to watch this?) belongs to
 * the caller, which is the only place that has the enrollment context.
 */
export function mintVideoToken(input: MintVideoTokenInput): {
  token: string;
  sid: string;
  expiresAt: string;
} {
  const secret = getSecret();
  const now = Math.floor(Date.now() / 1000);
  const exp = now + (input.ttlSeconds ?? VIDEO_TOKEN_TTL_SECONDS);
  const sid = randomBytes(12).toString('base64url');

  const payload: VideoTokenPayload = {
    v: 1,
    vid: true,
    scope: input.scope,
    refId: input.refId,
    userId: input.userId,
    sid,
    size: input.size,
    iat: now,
    exp,
  };

  const body = base64urlEncode(JSON.stringify(payload));
  const token = `${VIDEO_TOKEN_PREFIX}${body}.${sign(body, secret)}`;

  return { token, sid, expiresAt: new Date(exp * 1000).toISOString() };
}

export function isVideoToken(token: string | null | undefined): boolean {
  return !!token && token.startsWith(VIDEO_TOKEN_PREFIX);
}

/**
 * Verify signature and expiry. Returns null for anything not a currently valid
 * video token: wrong type, tampered, malformed, or expired. Callers treat null
 * as 401 and never as "probably fine".
 */
export function verifyVideoToken(token: string | null | undefined): VideoTokenPayload | null {
  if (!isVideoToken(token)) return null;

  let secret: string;
  try {
    secret = getSecret();
  } catch {
    return null;
  }

  const raw = (token as string).slice(VIDEO_TOKEN_PREFIX.length);
  const dotIndex = raw.indexOf('.');
  if (dotIndex <= 0) return null;

  const body = raw.slice(0, dotIndex);
  const providedSig = raw.slice(dotIndex + 1);
  const expectedSig = sign(body, secret);

  // Constant time, and length-guarded because timingSafeEqual throws on a mismatch.
  const a = Buffer.from(providedSig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  let payload: VideoTokenPayload;
  try {
    payload = JSON.parse(base64urlDecode(body));
  } catch {
    return null;
  }

  if (!payload || payload.vid !== true || !payload.refId || !payload.userId) return null;
  if (!['recap', 'class', 'foundation'].includes(payload.scope)) return null;
  if (typeof payload.exp !== 'number' || payload.exp < Math.floor(Date.now() / 1000)) {
    return null;
  }

  return payload;
}
