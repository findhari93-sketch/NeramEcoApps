/**
 * The recordings page's handle on a running library copy, sealed.
 *
 * WHY. Graph answers a copy with a progress address that carries a `tempauth`
 * token in its query string. The one this tenant returned on 2026-09-11 was
 * issued to the Neram Nexus app and listed allfiles.write among its scopes, so
 * that address is a credential and must not reach a browser, a log or
 * sessionStorage. The page gets it sealed with AES-256-GCM and hands the sealed
 * string back; only the server can open it, and a changed, expired or foreign
 * token opens to nothing. That also means the status route can only ever fetch
 * an address it issued itself.
 *
 * The key is derived from AZ_CLIENT_SECRET, which every server that can start a
 * copy already holds, so no new secret is needed. Rotating that secret only
 * orphans copies in flight, and pressing Copy again picks up a finished one.
 *
 * Server only (node:crypto).
 */

import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'crypto';
import { isMonitorUrl } from './library-copy';

export interface CopyOperation {
  /** Graph's progress address for the copy. */
  monitor: string;
  /** The library drive the copy lands in, where the finished file is looked up. */
  destDriveId: string;
}

/** A copy is minutes; a day is plenty and bounds how long a leaked token could matter. */
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_TOKEN_LENGTH = 8192;
const IV_BYTES = 12;
const TAG_BYTES = 16;

function sealingKey(): Buffer | null {
  const secret = process.env.AZ_CLIENT_SECRET;
  if (!secret) return null;
  return Buffer.from(hkdfSync('sha256', secret, 'nexus-library-copy', 'copy-operation-token', 32));
}

const toBase64Url = (buf: Buffer) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromBase64Url = (text: string) => Buffer.from(text.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

export function sealCopyOperation(operation: CopyOperation, now = Date.now()): string {
  const key = sealingKey();
  if (!key) throw new Error('AZ_CLIENT_SECRET is required to seal a copy operation');
  if (!isMonitorUrl(operation.monitor) || !operation.destDriveId) {
    throw new Error('Refusing to seal something that is not a copy progress address');
  }

  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const plain = Buffer.from(
    JSON.stringify({ m: operation.monitor, d: operation.destDriveId, e: now + TOKEN_TTL_MS }),
    'utf8',
  );
  const sealed = Buffer.concat([cipher.update(plain), cipher.final()]);
  return toBase64Url(Buffer.concat([iv, cipher.getAuthTag(), sealed]));
}

/** The operation inside a sealed token, or null for anything this server did not seal, recently. */
export function openCopyOperation(token: string | null | undefined, now = Date.now()): CopyOperation | null {
  if (typeof token !== 'string' || !token || token.length > MAX_TOKEN_LENGTH || !/^[A-Za-z0-9_-]+$/.test(token)) {
    return null;
  }
  const key = sealingKey();
  if (!key) return null;

  try {
    const raw = fromBase64Url(token);
    if (raw.length <= IV_BYTES + TAG_BYTES) return null;
    const decipher = createDecipheriv('aes-256-gcm', key, raw.subarray(0, IV_BYTES));
    decipher.setAuthTag(raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
    const plain = Buffer.concat([decipher.update(raw.subarray(IV_BYTES + TAG_BYTES)), decipher.final()]).toString('utf8');

    const body = JSON.parse(plain) as { m?: unknown; d?: unknown; e?: unknown };
    if (typeof body.m !== 'string' || typeof body.d !== 'string' || typeof body.e !== 'number') return null;
    if (now > body.e || !body.d || !isMonitorUrl(body.m)) return null;
    return { monitor: body.m, destDriveId: body.d };
  } catch {
    // Changed, sealed under another key, or not a token at all.
    return null;
  }
}
