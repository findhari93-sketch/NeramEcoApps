/**
 * Verify a Nexus `vid_` streaming grant with WebCrypto.
 *
 * This is a byte-for-byte port of verifyVideoToken in
 * apps/nexus/src/lib/video-token.ts, which mints with Node's crypto:
 *
 *   token = "vid_" + body + "." + sig
 *   body  = base64url(utf8(JSON.stringify(payload)))      (no padding)
 *   sig   = base64url(HMAC-SHA256(key = utf8(secret), msg = utf8(body)))
 *
 * The signature is computed over the base64url BODY STRING, not over the JSON,
 * so the Worker never has to reproduce Node's JSON serialisation. Cross-runtime
 * agreement is pinned by apps/nexus/src/lib/media-proxy-grant.test.ts, which
 * mints with the Node code and verifies here.
 *
 * Pure: no Worker globals beyond crypto.subtle, TextEncoder and atob, all of
 * which Node 20+ also provides, so the same module runs under Vitest.
 */

export const VIDEO_TOKEN_PREFIX = 'vid_';

/** Scopes the Worker will serve bytes for. Mirrors VideoScope in video-token.ts. */
export const STREAM_SCOPES = ['recap', 'class', 'foundation', 'class_original'] as const;
export type StreamScope = (typeof STREAM_SCOPES)[number];

export interface VideoGrantPayload {
  v: 1;
  vid: true;
  scope: StreamScope;
  refId: string;
  userId: string;
  sid: string;
  size: number;
  iat: number;
  exp: number;
}

const encoder = new TextEncoder();

/** Imported keys are reusable; importing per request would be wasted work. */
const keyCache = new Map<string, Promise<CryptoKey>>();

function hmacKey(secret: string): Promise<CryptoKey> {
  let key = keyCache.get(secret);
  if (!key) {
    key = crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    keyCache.set(secret, key);
  }
  return key;
}

/** Bytes to unpadded base64url, the same alphabet Node's 'base64url' emits. */
export function bytesToBase64url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Unpadded base64url to bytes. Throws on characters outside the alphabet. */
export function base64urlToBytes(input: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(input)) throw new Error('not base64url');
  const b64 = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

/** Constant-time string comparison (for equal lengths). */
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function signBody(body: string, secret: string): Promise<string> {
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(body));
  return bytesToBase64url(new Uint8Array(sig));
}

/**
 * A grant with a valid signature, and whether it has expired.
 *
 * Expiry is reported rather than refused because one caller needs an expired
 * grant: a <video> keeps requesting the URL it was given, so after ten minutes
 * the URL's grant is stale even though the student is still allowed to watch.
 * The player keeps a fresh grant in a cookie (see grantCookieName), and the
 * stale URL grant is what says which video and which student that cookie must
 * match. A forged or tampered token is still null.
 */
export async function verifyVideoGrantDetailed(
  token: string | null | undefined,
  secret: string | undefined,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): Promise<{ payload: VideoGrantPayload; expired: boolean } | null> {
  if (!secret) return null;
  if (!token || !token.startsWith(VIDEO_TOKEN_PREFIX)) return null;

  const raw = token.slice(VIDEO_TOKEN_PREFIX.length);
  const dot = raw.indexOf('.');
  if (dot <= 0) return null;

  const body = raw.slice(0, dot);
  const provided = raw.slice(dot + 1);

  let expected: string;
  try {
    expected = await signBody(body, secret);
  } catch {
    return null;
  }
  if (!constantTimeEqual(provided, expected)) return null;

  let payload: VideoGrantPayload;
  try {
    payload = JSON.parse(new TextDecoder().decode(base64urlToBytes(body)));
  } catch {
    return null;
  }

  if (!payload || payload.vid !== true || !payload.refId || !payload.userId) return null;
  if (!(STREAM_SCOPES as readonly string[]).includes(payload.scope)) return null;
  if (typeof payload.exp !== 'number') return null;

  return { payload, expired: payload.exp < nowSeconds };
}

/**
 * Returns the payload of a currently valid grant, or null for anything else:
 * wrong type, tampered, malformed, unknown scope, or expired. Callers treat
 * null as 401 and never as "probably fine".
 *
 * @param nowSeconds injectable clock for tests; defaults to the wall clock.
 */
export async function verifyVideoGrant(
  token: string | null | undefined,
  secret: string | undefined,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): Promise<VideoGrantPayload | null> {
  const result = await verifyVideoGrantDetailed(token, secret, nowSeconds);
  return result && !result.expired ? result.payload : null;
}

/**
 * How long after it was minted a URL grant may still be topped up by a cookie.
 * Longer than any class, short enough that a URL found in a history file a day
 * later is useless even to someone holding a fresh cookie for the same video.
 */
export const GRANT_COOKIE_MAX_URL_AGE_SECONDS = 6 * 60 * 60;

/** One cookie per video, so two videos open in two tabs do not overwrite each other. */
export function grantCookieName(grant: Pick<VideoGrantPayload, 'scope' | 'refId'>): string {
  return `vg_${grant.scope}_${grant.refId.replace(/[^A-Za-z0-9-]/g, '')}`;
}

/**
 * The Set-Cookie value for a fresh grant.
 *
 * SameSite=None and Partitioned because Nexus also runs as a tab inside
 * Microsoft Teams, where the page is a cross-site iframe and a Lax cookie would
 * never be sent. Partitioned (CHIPS) keeps it inside that one top-level site, so
 * it is not a tracking cookie and third-party cookie blocking leaves it alone.
 * HttpOnly: no script needs to read it, the browser just has to send it with
 * the <video> element's range requests.
 */
export function grantCookieHeader(
  grant: Pick<VideoGrantPayload, 'scope' | 'refId' | 'exp'>,
  token: string,
  path: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): string {
  const maxAge = Math.max(0, grant.exp - nowSeconds);
  return `${grantCookieName(grant)}=${token}; Max-Age=${maxAge}; Path=${path}; Secure; HttpOnly; SameSite=None; Partitioned`;
}

/** One cookie's value out of a Cookie header, or null. */
export function readCookie(header: string | null | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim() || null;
  }
  return null;
}

/**
 * The grant that authorises this request: the URL's own while it lasts, else a
 * fresh one from the cookie, provided the cookie is for the same video and the
 * same student as the URL. Returns the token to forward too, because the source
 * lookup in Nexus verifies it again and an expired one would be refused there.
 */
export async function resolveStreamGrant(
  urlToken: string | null | undefined,
  cookieHeader: string | null | undefined,
  secret: string | undefined,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): Promise<{ grant: VideoGrantPayload; token: string; via: 'url' | 'cookie' } | null> {
  const fromUrl = await verifyVideoGrantDetailed(urlToken, secret, nowSeconds);
  if (!fromUrl || !urlToken) return null;
  if (!fromUrl.expired) return { grant: fromUrl.payload, token: urlToken, via: 'url' };
  if (nowSeconds - fromUrl.payload.iat > GRANT_COOKIE_MAX_URL_AGE_SECONDS) return null;

  const cookieToken = readCookie(cookieHeader, grantCookieName(fromUrl.payload));
  const fromCookie = await verifyVideoGrant(cookieToken, secret, nowSeconds);
  if (!fromCookie || !cookieToken) return null;
  if (
    fromCookie.scope !== fromUrl.payload.scope ||
    fromCookie.refId !== fromUrl.payload.refId ||
    fromCookie.userId !== fromUrl.payload.userId ||
    // A different size is a different file: the recording was swapped for its
    // trimmed copy (or back) after this stream started. Its bytes must never
    // reach a <video> that is part way through the other file.
    (fromCookie.size > 0 && fromUrl.payload.size > 0 && fromCookie.size !== fromUrl.payload.size)
  ) {
    return null;
  }
  return { grant: fromCookie, token: cookieToken, via: 'cookie' };
}
