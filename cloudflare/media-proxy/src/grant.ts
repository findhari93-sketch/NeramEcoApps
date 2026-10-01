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
export const STREAM_SCOPES = ['recap', 'class', 'foundation'] as const;
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
  if (typeof payload.exp !== 'number' || payload.exp < nowSeconds) return null;

  return payload;
}
