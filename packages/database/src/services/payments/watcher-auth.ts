/**
 * Who is posting this bank alert? A watcher proves itself one of two ways:
 *  - HMAC-SHA256 over `timestamp.nonce.rawBody` with its device secret
 *    (the Gmail Apps Script, the observer APK). Timestamp within 5 minutes.
 *  - A per-device static token over TLS (SMS forwarder apps that cannot sign).
 * Replays are caught downstream by the unique inbox (provider, event_id) and
 * the unique source_ref / UTR on credits. Secrets live in the env var
 * PAYMENT_WATCHER_SECRETS as JSON { "<deviceId>": "<secret>" }, never in the repo.
 */
import { createHmac, timingSafeEqual, randomUUID } from 'crypto';

export interface WatcherAuthInput {
  deviceId: string | null | undefined;
  signature: string | null | undefined;
  token: string | null | undefined;
  timestamp: string | null | undefined;
  nonce: string | null | undefined;
  rawBody: string;
  secrets: Record<string, string>;
  now?: Date;
  maxSkewSeconds?: number;
}

export type WatcherAuthResult = { ok: true; deviceId: string; via: 'hmac' | 'token' } | { ok: false; reason: string };

export function signWatcherRequest(secret: string, timestamp: string, nonce: string, rawBody: string): string {
  return createHmac('sha256', secret).update(`${timestamp}.${nonce}.${rawBody}`).digest('hex');
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export function verifyWatcherRequest(input: WatcherAuthInput): WatcherAuthResult {
  const deviceId = (input.deviceId || '').trim();
  const secret = deviceId ? input.secrets[deviceId] : undefined;
  if (!deviceId || !secret) return { ok: false, reason: 'unknown device' };

  if (input.signature) {
    const ts = Number(input.timestamp);
    if (!Number.isFinite(ts)) return { ok: false, reason: 'timestamp missing' };
    const tsMs = ts < 1e12 ? ts * 1000 : ts;
    const now = (input.now || new Date()).getTime();
    const skew = (input.maxSkewSeconds ?? 300) * 1000;
    if (Math.abs(now - tsMs) > skew) return { ok: false, reason: 'timestamp outside the allowed window' };
    if (!input.nonce) return { ok: false, reason: 'nonce missing' };
    const expected = signWatcherRequest(secret, String(input.timestamp), input.nonce, input.rawBody);
    if (!safeEqual(expected, input.signature.trim().toLowerCase())) return { ok: false, reason: 'bad signature' };
    return { ok: true, deviceId, via: 'hmac' };
  }

  if (input.token) {
    if (!safeEqual(secret, input.token.trim())) return { ok: false, reason: 'bad token' };
    return { ok: true, deviceId, via: 'token' };
  }

  return { ok: false, reason: 'no credentials' };
}

/** PAYMENT_WATCHER_SECRETS as a map, or {} when unset or malformed. */
export function watcherSecretsFromEnv(raw: string | undefined): Record<string, string> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed)) if (typeof v === 'string' && v.length >= 16) out[k] = v;
    return out;
  } catch {
    return {};
  }
}

/**
 * The inbox key for a post. Only an authenticated watcher may name its event
 * (device id + its message id), because that key dedupes: an unauthenticated
 * caller who could choose it would make the real alert a "duplicate".
 */
export function inboxEventId(auth: WatcherAuthResult, deviceId: string, messageId: string | null | undefined, fallback: string): string {
  if (!auth.ok) return `unauth:${randomUUID()}`;
  return `${deviceId}:${messageId ? String(messageId).slice(0, 80) : fallback}`;
}

/**
 * Did Gmail itself verify the bank's DKIM signature? Reads the ONE
 * Authentication-Results header the Gmail script sends (the topmost, which is
 * Gmail's own, authserv-id mx.google.com). Any dkim=pass whose signing domain
 * is the bank's exact domain or a subdomain of it counts; a dmarc=fail vetoes.
 * A forwarded or injected header from anyone else never passes.
 */
export function dkimPassFromAuthResults(header: string | null | undefined, domains: string[]): boolean {
  if (!header) return false;
  const text = String(header).replace(/\r?\n[ \t]+/g, ' ').trim();
  const parts = text.split(';').map((p) => p.trim()).filter(Boolean);
  if (!parts.length || parts[0].toLowerCase() !== 'mx.google.com') return false;
  const verdicts = parts.slice(1);
  if (verdicts.some((p) => /^dmarc=fail\b/i.test(p))) return false;
  const allowed = domains.map((d) => d.trim().toLowerCase().replace(/^\.+/, '')).filter(Boolean);
  return verdicts.some((p) => {
    if (!/^dkim=pass\b/i.test(p)) return false;
    const m = p.match(/header\.(?:d|i)=@?([a-z0-9.-]+)/i);
    if (!m) return false;
    const signer = m[1].toLowerCase().replace(/\.$/, '');
    return allowed.some((d) => signer === d || signer.endsWith(`.${d}`));
  });
}
