/**
 * Tokens for college update links. Server only (node:crypto).
 *
 * Contract shared with apps/marketing (/college-update/<token>):
 *   token      = 32 random bytes, base64url, no padding (43 characters)
 *   token_hash = sha256 hex of the token string (utf8)
 * Only the hash is stored, so a link can never be shown again after it is made.
 */
import { createHash, randomBytes } from 'crypto';

export function newToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function updateLinkUrl(marketingOrigin: string, token: string): string {
  return `${marketingOrigin.replace(/\/+$/, '')}/college-update/${token}`;
}
