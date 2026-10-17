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

/**
 * Which table refId points at. Keeps one proxy serving every video surface.
 * 'class_original' is a class's untrimmed Teams recording, for a student who
 * opens a part the trim skipped. Mirrors STREAM_SCOPES in the media Worker.
 */
export type VideoScope = 'recap' | 'class' | 'foundation' | 'class_original';
export const VIDEO_SCOPES: readonly VideoScope[] = ['recap', 'class', 'foundation', 'class_original'];

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
 * Verify the signature only, and report expiry separately.
 *
 * An expired grant is still useful for one thing: a <video> keeps requesting
 * the URL it started with, so ten minutes in, the URL's grant has lapsed while
 * the student is still allowed to watch. The player keeps a fresh grant in a
 * cookie, and the stale URL grant names the video and student that cookie must
 * match (see resolveStreamToken). A forged or tampered token is still null.
 */
export function verifyVideoTokenDetailed(
  token: string | null | undefined,
): { payload: VideoTokenPayload; expired: boolean } | null {
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
  if (!VIDEO_SCOPES.includes(payload.scope)) return null;
  if (typeof payload.exp !== 'number') return null;

  return { payload, expired: payload.exp < Math.floor(Date.now() / 1000) };
}

/**
 * Verify signature and expiry. Returns null for anything not a currently valid
 * video token: wrong type, tampered, malformed, or expired. Callers treat null
 * as 401 and never as "probably fine".
 */
export function verifyVideoToken(token: string | null | undefined): VideoTokenPayload | null {
  const result = verifyVideoTokenDetailed(token);
  return result && !result.expired ? result.payload : null;
}

/**
 * How long after it was minted a URL grant may still be topped up by a cookie.
 * Longer than any class, short enough that a URL found in a history file a day
 * later is useless even next to a fresh cookie. Mirrors the media Worker's
 * GRANT_COOKIE_MAX_URL_AGE_SECONDS (cloudflare/media-proxy/src/grant.ts).
 */
export const GRANT_COOKIE_MAX_URL_AGE_SECONDS = 6 * 60 * 60;

/** The byte route and the captions route both sit under this path. */
export const GRANT_COOKIE_PATH = '/api/media';

/** One cookie per video, the same name the media Worker uses. */
export function grantCookieName(grant: Pick<VideoTokenPayload, 'scope' | 'refId'>): string {
  return `vg_${grant.scope}_${grant.refId.replace(/[^A-Za-z0-9-]/g, '')}`;
}

/**
 * Set-Cookie for a fresh grant. SameSite=None plus Partitioned because Nexus
 * also runs as a Teams tab, a cross-site iframe where a Lax cookie is never
 * sent; Partitioned keeps it to that one top-level site.
 */
export function grantCookieHeader(
  grant: Pick<VideoTokenPayload, 'scope' | 'refId' | 'exp'>,
  token: string,
  path: string = GRANT_COOKIE_PATH,
): string {
  const maxAge = Math.max(0, grant.exp - Math.floor(Date.now() / 1000));
  return `${grantCookieName(grant)}=${token}; Max-Age=${maxAge}; Path=${path}; Secure; HttpOnly; SameSite=None; Partitioned`;
}

/**
 * The grant that authorises a request: the URL's own while it lasts, else a
 * fresh one from the cookie, provided it is for the same video and student.
 * `readCookie` is handed the cookie name, so each runtime can use its own
 * cookie API.
 */
export function resolveStreamToken(
  urlToken: string | null | undefined,
  readCookie: (name: string) => string | null | undefined,
): { grant: VideoTokenPayload; token: string; via: 'url' | 'cookie' } | null {
  const fromUrl = verifyVideoTokenDetailed(urlToken);
  if (!fromUrl || !urlToken) return null;
  if (!fromUrl.expired) return { grant: fromUrl.payload, token: urlToken, via: 'url' };
  if (Math.floor(Date.now() / 1000) - fromUrl.payload.iat > GRANT_COOKIE_MAX_URL_AGE_SECONDS) return null;

  const cookieToken = readCookie(grantCookieName(fromUrl.payload)) ?? null;
  const fromCookie = verifyVideoToken(cookieToken);
  if (!fromCookie || !cookieToken) return null;
  if (
    fromCookie.scope !== fromUrl.payload.scope ||
    fromCookie.refId !== fromUrl.payload.refId ||
    fromCookie.userId !== fromUrl.payload.userId ||
    // A different size is a different file (a trimmed copy switched in or out
    // after this stream started); never splice its bytes into this one.
    (fromCookie.size > 0 && fromUrl.payload.size > 0 && fromCookie.size !== fromUrl.payload.size)
  ) {
    return null;
  }
  return { grant: fromCookie, token: cookieToken, via: 'cookie' };
}
