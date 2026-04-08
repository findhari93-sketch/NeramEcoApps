// packages/database/src/utils/unsubscribe-token.ts

import { createHmac } from 'crypto';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function getSecret(): string {
  const secret = process.env.UNSUBSCRIBE_JWT_SECRET;
  if (!secret) throw new Error('UNSUBSCRIBE_JWT_SECRET environment variable is not set');
  return secret;
}

/**
 * Create a signed unsubscribe token for a user.
 * Token is valid for 30 days.
 */
export function createUnsubscribeToken(userId: string): string {
  const exp = Date.now() + THIRTY_DAYS_MS;
  const payload = `${userId}.${exp}`;
  const sig = createHmac('sha256', getSecret()).update(payload).digest('hex');
  const data = JSON.stringify({ userId, exp, sig });
  return Buffer.from(data).toString('base64url');
}

/**
 * Verify an unsubscribe token.
 * Returns the userId if valid, null if invalid or expired.
 */
export function verifyUnsubscribeToken(token: string): { userId: string } | null {
  try {
    const data = JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));
    const { userId, exp, sig } = data;

    if (!userId || !exp || !sig) return null;
    if (Date.now() > exp) return null;

    const payload = `${userId}.${exp}`;
    const expected = createHmac('sha256', getSecret()).update(payload).digest('hex');

    if (sig !== expected) return null;
    return { userId };
  } catch {
    return null;
  }
}
