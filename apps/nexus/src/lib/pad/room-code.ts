/**
 * The room-code path: the /pad page where a signed-in student types the six
 * digits shown on the teacher's console.
 *
 * The code only says WHICH session. pad_join_by_code still requires Neram
 * identity plus enrollment, and rate limits failures per user and per IP. The
 * IP is stored only as a keyed hash, so pad_join_attempts never holds an
 * address and a leaked table cannot be reversed by hashing the IPv4 space.
 */

import { createHmac } from 'crypto';

/** Exactly six ASCII digits, ignoring the spaces and dashes a student types, or null. */
export function normalizeRoomCode(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const digits = input.replace(/[\s-]/g, '');
  return /^[0-9]{6}$/.test(digits) ? digits : null;
}

/**
 * The caller's address as the hosting platform reports it. x-real-ip first:
 * Vercel sets it itself, while the leftmost x-forwarded-for entry is whatever
 * the client claimed. Used only as a rate-limit key, and only hashed.
 */
export function clientIp(headers: Headers): string | null {
  const real = headers.get('x-real-ip')?.trim();
  if (real) return real;
  const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || null;
}

/**
 * PAD_IP_HASH_SECRET when set. Otherwise the service role key, which every
 * server that can reach the pad functions already holds; the prefix in hashIp
 * keeps this use of it separate from any other.
 */
export function padIpHashSecret(): string | undefined {
  return process.env.PAD_IP_HASH_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || undefined;
}

/** A keyed hash of the address, or null (which turns only the IP limit off). */
export function hashIp(ip: string | null, secret: string | undefined): string | null {
  if (!ip || !secret) return null;
  return createHmac('sha256', secret).update(`pad-join-ip:${ip}`).digest('base64url').slice(0, 32);
}
