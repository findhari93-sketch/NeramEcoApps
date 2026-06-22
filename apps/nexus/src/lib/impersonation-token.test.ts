import { describe, it, expect, beforeAll } from 'vitest';
import {
  signImpersonationToken,
  verifyImpersonationToken,
  isImpersonationToken,
  IMPERSONATION_TOKEN_PREFIX,
} from './impersonation-token';

beforeAll(() => {
  process.env.IMPERSONATION_JWT_SECRET = 'test-secret-do-not-use-in-prod';
});

const baseInput = {
  targetUserId: 'student-uuid-1',
  targetMsOid: 'ms-oid-1',
  impersonatorUserId: 'teacher-uuid-1',
  reason: 'Ticket TKT-0001',
};

describe('impersonation token', () => {
  it('round-trips a valid token, preserving claims', () => {
    const { token, expiresAt } = signImpersonationToken(baseInput);

    expect(token.startsWith(IMPERSONATION_TOKEN_PREFIX)).toBe(true);
    expect(isImpersonationToken(token)).toBe(true);
    expect(Date.parse(expiresAt)).toBeGreaterThan(Date.now());

    const payload = verifyImpersonationToken(token);
    expect(payload).not.toBeNull();
    expect(payload!.targetUserId).toBe(baseInput.targetUserId);
    expect(payload!.targetMsOid).toBe(baseInput.targetMsOid);
    expect(payload!.impersonatorUserId).toBe(baseInput.impersonatorUserId);
    expect(payload!.reason).toBe(baseInput.reason);
    expect(payload!.imp).toBe(true);
  });

  it('rejects a non-impersonation token', () => {
    expect(isImpersonationToken('test_abc')).toBe(false);
    expect(isImpersonationToken('eyJhbGciOi...')).toBe(false);
    expect(isImpersonationToken(null)).toBe(false);
    expect(verifyImpersonationToken('not-an-imp-token')).toBeNull();
  });

  it('rejects a tampered payload (signature mismatch)', () => {
    const { token } = signImpersonationToken(baseInput);
    // Flip the last character of the body to corrupt it.
    const raw = token.slice(IMPERSONATION_TOKEN_PREFIX.length);
    const [body, sig] = raw.split('.');
    const tampered =
      IMPERSONATION_TOKEN_PREFIX + body.slice(0, -1) + (body.endsWith('A') ? 'B' : 'A') + '.' + sig;
    expect(verifyImpersonationToken(tampered)).toBeNull();
  });

  it('rejects a token signed with a different secret', () => {
    const { token } = signImpersonationToken(baseInput);
    process.env.IMPERSONATION_JWT_SECRET = 'a-completely-different-secret';
    expect(verifyImpersonationToken(token)).toBeNull();
    process.env.IMPERSONATION_JWT_SECRET = 'test-secret-do-not-use-in-prod';
  });

  it('rejects an expired token', () => {
    const { token } = signImpersonationToken({ ...baseInput, ttlSeconds: -10 });
    expect(verifyImpersonationToken(token)).toBeNull();
  });

  it('throws when the secret is not configured', () => {
    const prev = process.env.IMPERSONATION_JWT_SECRET;
    delete process.env.IMPERSONATION_JWT_SECRET;
    expect(() => signImpersonationToken(baseInput)).toThrow(/IMPERSONATION_JWT_SECRET/);
    process.env.IMPERSONATION_JWT_SECRET = prev;
  });
});
