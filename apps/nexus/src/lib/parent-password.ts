/**
 * Password hashing and lockout policy for admin-issued parent logins.
 *
 * Nexus is a Microsoft-auth app and has never stored a password before. The
 * monorepo has no bcrypt, argon2, jose or jsonwebtoken in any workspace
 * package.json, so this uses Node's built-in `crypto.scrypt` and adds no
 * dependency, for the same reason lib/impersonation-token.ts uses built-in HMAC.
 * scrypt is memory-hard, which is what makes a stolen hash expensive to attack.
 *
 * This module is deliberately pure: no database, no clock except what callers
 * pass in. That is what lets the lockout state machine be unit-tested exactly.
 *
 * NOTE: the login route that uses this must stay on the Node runtime. No Nexus
 * API route currently sets `runtime = 'edge'`; scrypt is unavailable there.
 */

import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'crypto';
import { promisify } from 'util';

const scrypt = promisify(scryptCb) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: { N: number; r: number; p: number }
) => Promise<Buffer>;

/**
 * N=16384, r=8, p=1 is the standard interactive-login parameter set. Memory
 * cost is 128 * N * r = 16 MB, comfortably under Node's 32 MB scrypt default,
 * and takes roughly 50-100ms per hash on Vercel's serverless CPU.
 */
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 } as const;
const KEY_LENGTH = 64;
const SALT_BYTES = 16;
const ALGORITHM_TAG = 'scrypt';

export const PASSWORD_MIN_LENGTH = 8;

function paramString(): string {
  return `N=${SCRYPT_PARAMS.N},r=${SCRYPT_PARAMS.r},p=${SCRYPT_PARAMS.p}`;
}

/**
 * Hash a plaintext password.
 * Stored format: `scrypt$N=16384,r=8,p=1$<salt_b64url>$<hash_b64url>`
 * The parameters are embedded so they can be raised later without invalidating
 * every existing password: verify reads them from the stored string.
 */
export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const derived = await scrypt(plain, salt, KEY_LENGTH, { ...SCRYPT_PARAMS });
  return [
    ALGORITHM_TAG,
    paramString(),
    salt.toString('base64url'),
    derived.toString('base64url'),
  ].join('$');
}

function parseStored(stored: string): {
  salt: Buffer;
  hash: Buffer;
  params: { N: number; r: number; p: number };
} | null {
  const parts = stored.split('$');
  if (parts.length !== 4) return null;
  const [tag, paramPart, saltPart, hashPart] = parts;
  if (tag !== ALGORITHM_TAG) return null;

  const params = { N: 0, r: 0, p: 0 };
  for (const kv of paramPart.split(',')) {
    const [k, v] = kv.split('=');
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) return null;
    if (k === 'N') params.N = n;
    else if (k === 'r') params.r = n;
    else if (k === 'p') params.p = n;
    else return null;
  }
  if (!params.N || !params.r || !params.p) return null;

  try {
    const salt = Buffer.from(saltPart, 'base64url');
    const hash = Buffer.from(hashPart, 'base64url');
    if (salt.length === 0 || hash.length === 0) return null;
    return { salt, hash, params };
  } catch {
    return null;
  }
}

/**
 * Verify a plaintext password against a stored hash.
 * Returns false (never throws) on a malformed stored value, so a corrupted row
 * denies access rather than crashing the login route into a 500.
 */
export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  const parsed = parseStored(stored);
  if (!parsed) return false;

  let derived: Buffer;
  try {
    derived = await scrypt(plain, parsed.salt, parsed.hash.length, parsed.params);
  } catch {
    return false;
  }

  if (derived.length !== parsed.hash.length) return false;
  return timingSafeEqual(derived, parsed.hash);
}

/**
 * Spend roughly the same CPU as a real verification, then discard it.
 *
 * The login route calls this when the login id does not exist. Without it, an
 * unknown id returns in ~1ms and a known id in ~80ms, which lets anyone
 * enumerate valid parent login ids by timing alone.
 */
export async function burnPasswordTime(): Promise<void> {
  await scrypt('dummy-password-for-timing', randomBytes(SALT_BYTES), KEY_LENGTH, {
    ...SCRYPT_PARAMS,
  });
}

/**
 * Passwords that show up at the top of every breach corpus. Kept short and
 * India-relevant on purpose: this is a last-ditch guard against the worst
 * choices, not a substitute for the length rule.
 */
const COMMON_PASSWORDS = new Set([
  '12345678', '123456789', '1234567890', 'password', 'password1', 'password123',
  'qwerty123', 'abc12345', 'iloveyou', 'welcome1', 'admin123', 'letmein1',
  'p@ssw0rd', 'passw0rd', 'football', 'sunshine', 'princess', 'monkey12',
  'india123', 'bharat123', 'chennai1', 'krishna1', 'ganesh12', 'student1',
  'parent123', 'neram123', 'nexus123', 'neramclasses', 'class123', 'school123',
]);

/**
 * Validate a parent-chosen password.
 * Returns null when acceptable, otherwise a message written for a non-technical
 * reader (these are parents, not developers).
 */
export function validatePasswordPolicy(password: string, loginId: string): string | null {
  if (!password || password.length < PASSWORD_MIN_LENGTH) {
    return `Use at least ${PASSWORD_MIN_LENGTH} characters.`;
  }
  if (password.length > 200) {
    return 'That password is too long. Use 200 characters or fewer.';
  }
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return 'Include at least one letter and one number.';
  }

  const lowered = password.toLowerCase();
  if (COMMON_PASSWORDS.has(lowered)) {
    return 'That password is too easy to guess. Please pick another one.';
  }

  const id = (loginId || '').toLowerCase();
  if (id && (lowered === id || lowered.includes(id))) {
    return 'Your password cannot contain your login ID.';
  }

  return null;
}

// ── Lockout state machine ───────────────────────────────────────────────────
// Pure and clock-injected so every boundary is testable. The counters live in
// nexus_parent_credentials; this module only decides what they become next.

export const MAX_FAILED_ATTEMPTS = 5;
export const LOCKOUT_MINUTES = 15;

export interface LockoutState {
  failed_attempts: number;
  locked_until: string | null;
}

/**
 * Given the current counters and what just happened, return the counters to
 * store. A success always clears the lock: a parent who remembers their
 * password should not stay locked out.
 */
export function nextLockoutState(
  current: LockoutState,
  outcome: 'success' | 'failure',
  now: Date
): LockoutState {
  if (outcome === 'success') {
    return { failed_attempts: 0, locked_until: null };
  }

  const attempts = Math.max(0, current.failed_attempts || 0) + 1;

  if (attempts >= MAX_FAILED_ATTEMPTS) {
    const until = new Date(now.getTime() + LOCKOUT_MINUTES * 60 * 1000);
    // Reset the counter alongside the lock, so serving the lockout and then
    // expiring it gives the parent a fresh set of attempts rather than locking
    // again on their very next mistake.
    return { failed_attempts: 0, locked_until: until.toISOString() };
  }

  return { failed_attempts: attempts, locked_until: current.locked_until ?? null };
}

/**
 * Is this account currently locked, and for how much longer?
 * A `locked_until` in the past is treated as expired, so no cleanup job is
 * needed to release a lock.
 */
export function isLockedOut(
  state: LockoutState,
  now: Date
): { locked: boolean; retryAfterSeconds: number } {
  if (!state.locked_until) return { locked: false, retryAfterSeconds: 0 };

  const until = Date.parse(state.locked_until);
  if (!Number.isFinite(until) || until <= now.getTime()) {
    return { locked: false, retryAfterSeconds: 0 };
  }

  return {
    locked: true,
    retryAfterSeconds: Math.ceil((until - now.getTime()) / 1000),
  };
}
