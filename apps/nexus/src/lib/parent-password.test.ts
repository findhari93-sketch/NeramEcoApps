import { describe, it, expect } from 'vitest';
import {
  hashPassword,
  verifyPassword,
  burnPasswordTime,
  validatePasswordPolicy,
  nextLockoutState,
  isLockedOut,
  MAX_FAILED_ATTEMPTS,
  LOCKOUT_MINUTES,
  PASSWORD_MIN_LENGTH,
  type LockoutState,
} from './parent-password';

describe('parent password hashing', () => {
  it('round-trips a password', async () => {
    const stored = await hashPassword('correct horse7');
    expect(await verifyPassword('correct horse7', stored)).toBe(true);
  });

  it('rejects the wrong password', async () => {
    const stored = await hashPassword('correct horse7');
    expect(await verifyPassword('correct horse8', stored)).toBe(false);
    expect(await verifyPassword('', stored)).toBe(false);
  });

  it('stores a parseable, self-describing format', async () => {
    const stored = await hashPassword('abcd1234');
    const parts = stored.split('$');
    expect(parts).toHaveLength(4);
    expect(parts[0]).toBe('scrypt');
    expect(parts[1]).toBe('N=16384,r=8,p=1');
    expect(parts[2].length).toBeGreaterThan(0);
    expect(parts[3].length).toBeGreaterThan(0);
  });

  it('salts, so the same password hashes differently every time', async () => {
    const a = await hashPassword('same-password1');
    const b = await hashPassword('same-password1');
    expect(a).not.toBe(b);
    // Both still verify.
    expect(await verifyPassword('same-password1', a)).toBe(true);
    expect(await verifyPassword('same-password1', b)).toBe(true);
  });

  it('returns false rather than throwing on a malformed stored value', async () => {
    // A corrupted row must deny access, not 500 the login route.
    for (const bad of [
      '',
      'not-a-hash',
      'scrypt$N=16384,r=8,p=1$onlythreeparts',
      'bcrypt$N=16384,r=8,p=1$c2FsdA$aGFzaA',
      'scrypt$N=0,r=8,p=1$c2FsdA$aGFzaA',
      'scrypt$N=16384,r=8,p=1$$aGFzaA',
      'scrypt$bogus$c2FsdA$aGFzaA',
      'scrypt$N=16384,r=8,p=1,x=9$c2FsdA$aGFzaA',
    ]) {
      await expect(verifyPassword('anything1', bad)).resolves.toBe(false);
    }
  });

  it('burnPasswordTime resolves without throwing', async () => {
    await expect(burnPasswordTime()).resolves.toBeUndefined();
  });
});

describe('validatePasswordPolicy', () => {
  const id = 'arun.p4821';

  it('accepts a reasonable password', () => {
    expect(validatePasswordPolicy('tuesday7rain', id)).toBeNull();
    expect(validatePasswordPolicy('Amma2026!', id)).toBeNull();
  });

  it('rejects anything shorter than the minimum', () => {
    expect(validatePasswordPolicy('ab1', id)).toMatch(new RegExp(`${PASSWORD_MIN_LENGTH}`));
    expect(validatePasswordPolicy('', id)).not.toBeNull();
    // Exactly at the boundary is fine.
    expect(validatePasswordPolicy('abcdefg1', id)).toBeNull();
  });

  it('requires both a letter and a number', () => {
    expect(validatePasswordPolicy('alllettershere', id)).toMatch(/letter and one number/);
    expect(validatePasswordPolicy('1234567890', id)).not.toBeNull();
  });

  it('rejects common passwords', () => {
    expect(validatePasswordPolicy('password123', id)).toMatch(/easy to guess/);
    expect(validatePasswordPolicy('Password123', id)).toMatch(/easy to guess/);
    expect(validatePasswordPolicy('neram123', id)).toMatch(/easy to guess/);
  });

  it('rejects a password containing the login id', () => {
    expect(validatePasswordPolicy('arun.p4821', id)).toMatch(/login ID/);
    expect(validatePasswordPolicy('xxarun.p4821xx', id)).toMatch(/login ID/);
    expect(validatePasswordPolicy('ARUN.P4821a', id)).toMatch(/login ID/);
  });

  it('rejects an absurdly long password', () => {
    expect(validatePasswordPolicy('a1'.repeat(200), id)).toMatch(/too long/);
  });

  it('tolerates an empty login id', () => {
    expect(validatePasswordPolicy('tuesday7rain', '')).toBeNull();
  });
});

describe('lockout state machine', () => {
  const now = new Date('2026-07-29T10:00:00.000Z');
  const clean: LockoutState = { failed_attempts: 0, locked_until: null };

  it('counts failures below the threshold without locking', () => {
    let state: LockoutState = clean;
    for (let i = 1; i < MAX_FAILED_ATTEMPTS; i++) {
      state = nextLockoutState(state, 'failure', now);
      expect(state.failed_attempts).toBe(i);
      expect(state.locked_until).toBeNull();
      expect(isLockedOut(state, now).locked).toBe(false);
    }
  });

  it('locks on the Nth failure', () => {
    let state: LockoutState = clean;
    for (let i = 0; i < MAX_FAILED_ATTEMPTS; i++) {
      state = nextLockoutState(state, 'failure', now);
    }
    expect(state.locked_until).not.toBeNull();

    const check = isLockedOut(state, now);
    expect(check.locked).toBe(true);
    expect(check.retryAfterSeconds).toBe(LOCKOUT_MINUTES * 60);
  });

  it('clears the counter when it locks, so an expired lock grants a fresh set', () => {
    let state: LockoutState = clean;
    for (let i = 0; i < MAX_FAILED_ATTEMPTS; i++) {
      state = nextLockoutState(state, 'failure', now);
    }
    expect(state.failed_attempts).toBe(0);
  });

  it('a success resets everything, including an active lock', () => {
    const locked = {
      failed_attempts: 3,
      locked_until: new Date(now.getTime() + 60_000).toISOString(),
    };
    expect(nextLockoutState(locked, 'success', now)).toEqual({
      failed_attempts: 0,
      locked_until: null,
    });
  });

  it('treats a lock exactly at expiry as released', () => {
    const state = { failed_attempts: 0, locked_until: now.toISOString() };
    expect(isLockedOut(state, now).locked).toBe(false);
    // One millisecond earlier it is still locked.
    const justBefore = new Date(now.getTime() - 1);
    expect(isLockedOut(state, justBefore).locked).toBe(true);
  });

  it('treats a past lock as expired with no cleanup job', () => {
    const state = {
      failed_attempts: 0,
      locked_until: new Date(now.getTime() - 60_000).toISOString(),
    };
    expect(isLockedOut(state, now)).toEqual({ locked: false, retryAfterSeconds: 0 });
  });

  it('treats an unparseable locked_until as not locked', () => {
    expect(isLockedOut({ failed_attempts: 0, locked_until: 'garbage' }, now).locked).toBe(false);
  });

  it('rounds retryAfterSeconds up, so it is never reported as 0 while locked', () => {
    const state = {
      failed_attempts: 0,
      locked_until: new Date(now.getTime() + 1).toISOString(),
    };
    const check = isLockedOut(state, now);
    expect(check.locked).toBe(true);
    expect(check.retryAfterSeconds).toBe(1);
  });

  it('tolerates a negative or missing failure counter', () => {
    expect(nextLockoutState({ failed_attempts: -3, locked_until: null }, 'failure', now))
      .toEqual({ failed_attempts: 1, locked_until: null });
  });
});
