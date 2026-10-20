/**
 * Shared by the ingest routes: authenticate the watcher from the request
 * headers, load the watcher and method settings, and hash a client address.
 */
import { createHash } from 'crypto';
import type { NextRequest } from 'next/server';
import { verifyWatcherRequest, watcherSecretsFromEnv, type WatcherAuthResult } from '@neram/database/payments';

export const DEVICE_HEADER = 'x-neram-device';
export const SIGNATURE_HEADER = 'x-neram-signature';
export const TOKEN_HEADER = 'x-neram-token';
export const TIMESTAMP_HEADER = 'x-neram-timestamp';
export const NONCE_HEADER = 'x-neram-nonce';

export function authenticateWatcher(request: NextRequest, rawBody: string): WatcherAuthResult {
  const h = request.headers;
  return verifyWatcherRequest({
    deviceId: h.get(DEVICE_HEADER),
    signature: h.get(SIGNATURE_HEADER),
    token: h.get(TOKEN_HEADER),
    timestamp: h.get(TIMESTAMP_HEADER),
    nonce: h.get(NONCE_HEADER),
    rawBody,
    secrets: watcherSecretsFromEnv(process.env.PAYMENT_WATCHER_SECRETS),
  });
}

/** A stable id for a message the watcher did not name: sender + text + minute. */
export function fallbackEventId(parts: (string | null | undefined)[]): string {
  return createHash('sha256').update(parts.map((p) => p || '').join('|')).digest('hex').slice(0, 40);
}

export function ipHash(request: NextRequest): string | null {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || '';
  return ip ? createHash('sha256').update(ip).digest('hex').slice(0, 32) : null;
}
