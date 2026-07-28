import { describe, it, expect, beforeAll } from 'vitest';
import {
  signParentToken,
  verifyParentToken,
  isParentToken,
  PARENT_TOKEN_PREFIX,
} from './parent-token';

beforeAll(() => {
  process.env.PARENT_SESSION_SECRET = 'test-secret-do-not-use-in-prod';
});

const baseInput = {
  parentUserId: 'parent-uuid-1',
  parentMsOid: 'parent:9f2c0000-0000-0000-0000-000000000001',
  tokenVersion: 3,
  mustChangePassword: false,
};

/** Rebuild a token from a hand-crafted payload, signed with the real secret. */
function forgeSignedToken(payload: Record<string, unknown>): string {
  const { createHmac } = require('crypto') as typeof import('crypto');
  const body = Buffer.from(JSON.stringify(payload), 'utf-8').toString('base64url');
  const sig = createHmac('sha256', process.env.PARENT_SESSION_SECRET!)
    .update(body)
    .digest('base64url');
  return `${PARENT_TOKEN_PREFIX}${body}.${sig}`;
}

describe('parent token', () => {
  it('round-trips a valid token, preserving claims', () => {
    const { token, expiresAt } = signParentToken(baseInput);

    expect(token.startsWith(PARENT_TOKEN_PREFIX)).toBe(true);
    expect(isParentToken(token)).toBe(true);
    expect(Date.parse(expiresAt)).toBeGreaterThan(Date.now());

    const payload = verifyParentToken(token);
    expect(payload).not.toBeNull();
    expect(payload!.parentUserId).toBe(baseInput.parentUserId);
    expect(payload!.parentMsOid).toBe(baseInput.parentMsOid);
    expect(payload!.sid).toBe(3);
    expect(payload!.mcp).toBe(false);
    expect(payload!.par).toBe(true);
  });

  it('carries mustChangePassword through as mcp', () => {
    const { token } = signParentToken({ ...baseInput, mustChangePassword: true });
    expect(verifyParentToken(token)!.mcp).toBe(true);
  });

  it('does not mistake other token types for a parent token', () => {
    expect(isParentToken('imp_abc')).toBe(false);
    expect(isParentToken('test_abc')).toBe(false);
    expect(isParentToken('eyJhbGciOi...')).toBe(false);
    expect(isParentToken(null)).toBe(false);
    expect(isParentToken(undefined)).toBe(false);
    expect(verifyParentToken('not-a-par-token')).toBeNull();
  });

  it('rejects a tampered payload (signature mismatch)', () => {
    const { token } = signParentToken(baseInput);
    const raw = token.slice(PARENT_TOKEN_PREFIX.length);
    const [body, sig] = raw.split('.');
    const tampered =
      PARENT_TOKEN_PREFIX + body.slice(0, -1) + (body.endsWith('A') ? 'B' : 'A') + '.' + sig;
    expect(verifyParentToken(tampered)).toBeNull();
  });

  it('rejects a token signed with a different secret', () => {
    const { token } = signParentToken(baseInput);
    process.env.PARENT_SESSION_SECRET = 'a-completely-different-secret';
    expect(verifyParentToken(token)).toBeNull();
    process.env.PARENT_SESSION_SECRET = 'test-secret-do-not-use-in-prod';
  });

  it('rejects an expired token', () => {
    const { token } = signParentToken({ ...baseInput, ttlSeconds: -10 });
    expect(verifyParentToken(token)).toBeNull();
  });

  it('does not throw when the signature length differs (timingSafeEqual guard)', () => {
    const { token } = signParentToken(baseInput);
    const [body] = token.slice(PARENT_TOKEN_PREFIX.length).split('.');
    // A signature of the wrong LENGTH makes timingSafeEqual throw unless guarded.
    expect(() => verifyParentToken(`${PARENT_TOKEN_PREFIX}${body}.short`)).not.toThrow();
    expect(verifyParentToken(`${PARENT_TOKEN_PREFIX}${body}.short`)).toBeNull();
  });

  it('rejects a well-signed token that is missing the par marker', () => {
    // An attacker who somehow obtained the secret still cannot pass off an
    // impersonation-shaped payload as a parent session.
    const token = forgeSignedToken({
      v: 1,
      imp: true,
      parentUserId: 'parent-uuid-1',
      parentMsOid: 'parent:abc',
      sid: 1,
      exp: Math.floor(Date.now() / 1000) + 600,
    });
    expect(verifyParentToken(token)).toBeNull();
  });

  it('rejects a well-signed token with no session version', () => {
    // Without sid the token could never be revocation-checked, so it must fail
    // closed rather than grant an unrevokable session.
    const token = forgeSignedToken({
      v: 1,
      par: true,
      parentUserId: 'parent-uuid-1',
      parentMsOid: 'parent:abc',
      exp: Math.floor(Date.now() / 1000) + 600,
    });
    expect(verifyParentToken(token)).toBeNull();
  });

  it('rejects a well-signed token with no parentUserId', () => {
    const token = forgeSignedToken({
      v: 1,
      par: true,
      parentMsOid: 'parent:abc',
      sid: 1,
      exp: Math.floor(Date.now() / 1000) + 600,
    });
    expect(verifyParentToken(token)).toBeNull();
  });

  it('rejects a malformed body that is not JSON', () => {
    const { createHmac } = require('crypto') as typeof import('crypto');
    const body = Buffer.from('not-json-at-all', 'utf-8').toString('base64url');
    const sig = createHmac('sha256', process.env.PARENT_SESSION_SECRET!)
      .update(body)
      .digest('base64url');
    expect(verifyParentToken(`${PARENT_TOKEN_PREFIX}${body}.${sig}`)).toBeNull();
  });

  it('rejects a token with no dot separator', () => {
    expect(verifyParentToken(`${PARENT_TOKEN_PREFIX}nodothere`)).toBeNull();
  });

  it('throws when the secret is not configured', () => {
    const prev = process.env.PARENT_SESSION_SECRET;
    delete process.env.PARENT_SESSION_SECRET;
    expect(() => signParentToken(baseInput)).toThrow(/PARENT_SESSION_SECRET/);
    process.env.PARENT_SESSION_SECRET = prev;
  });
});
