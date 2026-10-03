// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createHmac } from 'crypto';
import { mintVideoToken, verifyVideoToken } from './video-token';
import {
  verifyVideoGrant,
  bytesToBase64url,
  base64urlToBytes,
  constantTimeEqual,
} from '../../../../cloudflare/media-proxy/src/grant';

/**
 * The media Worker verifies grants that Node mints. If the two disagree on a
 * single byte of encoding, every video answers 401 in production, so these
 * vectors pin the cross-runtime contract.
 */

const SECRET = 'cross-runtime-secret-π-value';
const base = { scope: 'recap' as const, refId: 'recap-1', userId: 'stu-1', size: 196_000_000 };

beforeEach(() => {
  process.env.VIDEO_STREAM_SECRET = SECRET;
  delete process.env.IMPERSONATION_JWT_SECRET;
});

afterEach(() => {
  delete process.env.VIDEO_STREAM_SECRET;
});

describe('a Node-minted grant verifies in the Worker', () => {
  it('round trips every claim', async () => {
    const { token, sid } = mintVideoToken(base);
    const payload = await verifyVideoGrant(token, SECRET);
    expect(payload).not.toBeNull();
    expect(payload).toMatchObject({ v: 1, vid: true, scope: 'recap', refId: 'recap-1', userId: 'stu-1', sid, size: 196_000_000 });
    // And the Node verifier agrees on the same token.
    expect(verifyVideoToken(token)).toMatchObject({ refId: 'recap-1' });
  });

  it.each(['recap', 'class', 'foundation'] as const)('accepts the %s scope', async (scope) => {
    const { token } = mintVideoToken({ ...base, scope });
    expect((await verifyVideoGrant(token, SECRET))?.scope).toBe(scope);
  });

  it('handles non-ASCII ids the same way (utf-8 body)', async () => {
    const { token } = mintVideoToken({ ...base, refId: 'வகுப்பு-é-1' });
    expect((await verifyVideoGrant(token, SECRET))?.refId).toBe('வகுப்பு-é-1');
  });

  it('matches a fixed vector computed with Node crypto', async () => {
    // Fixed payload so the vector does not depend on the clock or randomness.
    const payload = { v: 1, vid: true, scope: 'class', refId: 'c-42', userId: 'u-7', sid: 'abc', size: 10, iat: 1, exp: 4_102_444_800 };
    const body = Buffer.from(JSON.stringify(payload), 'utf-8').toString('base64url');
    const sig = createHmac('sha256', SECRET).update(body).digest('base64url');
    const token = `vid_${body}.${sig}`;
    expect(verifyVideoToken(token)).toMatchObject({ refId: 'c-42' });
    expect(await verifyVideoGrant(token, SECRET)).toMatchObject({ refId: 'c-42', scope: 'class' });
  });
});

describe('the Worker rejects what Node rejects', () => {
  it('rejects a token signed with another secret', async () => {
    const { token } = mintVideoToken(base);
    expect(await verifyVideoGrant(token, 'some-other-secret')).toBeNull();
  });

  it('rejects when no secret is configured', async () => {
    const { token } = mintVideoToken(base);
    expect(await verifyVideoGrant(token, undefined)).toBeNull();
  });

  it('rejects an expired grant', async () => {
    const { token } = mintVideoToken({ ...base, ttlSeconds: 600 });
    const later = Math.floor(Date.now() / 1000) + 601;
    expect(await verifyVideoGrant(token, SECRET, later)).toBeNull();
  });

  it('rejects a tampered body', async () => {
    const { token } = mintVideoToken(base);
    const [body, sig] = token.slice(4).split('.');
    const forged = Buffer.from(
      JSON.stringify({ ...JSON.parse(Buffer.from(body, 'base64url').toString()), refId: 'other' }),
    ).toString('base64url');
    expect(await verifyVideoGrant(`vid_${forged}.${sig}`, SECRET)).toBeNull();
  });

  it('rejects a token without the vid claim, even if correctly signed', async () => {
    const body = Buffer.from(JSON.stringify({ v: 1, scope: 'recap', refId: 'r', userId: 'u', exp: 4_102_444_800 })).toString('base64url');
    const sig = createHmac('sha256', SECRET).update(body).digest('base64url');
    expect(await verifyVideoGrant(`vid_${body}.${sig}`, SECRET)).toBeNull();
  });

  it('rejects an unknown scope', async () => {
    const body = Buffer.from(JSON.stringify({ v: 1, vid: true, scope: 'admin', refId: 'r', userId: 'u', exp: 4_102_444_800 })).toString('base64url');
    const sig = createHmac('sha256', SECRET).update(body).digest('base64url');
    expect(await verifyVideoGrant(`vid_${body}.${sig}`, SECRET)).toBeNull();
  });

  it.each([null, undefined, '', 'imp_abc.def', 'vid_', 'vid_.sig', 'vid_nodot'])('rejects malformed %s', async (t) => {
    expect(await verifyVideoGrant(t as string, SECRET)).toBeNull();
  });
});

describe('encoding helpers', () => {
  it('base64url matches Node for every byte value', () => {
    const bytes = new Uint8Array(256).map((_, i) => i);
    expect(bytesToBase64url(bytes)).toBe(Buffer.from(bytes).toString('base64url'));
    expect(Array.from(base64urlToBytes(Buffer.from(bytes).toString('base64url')))).toEqual(Array.from(bytes));
  });

  it('refuses non-base64url input', () => {
    expect(() => base64urlToBytes('a+b/')).toThrow();
  });

  it('compares strings without short-circuiting on length mismatch', () => {
    expect(constantTimeEqual('abc', 'abc')).toBe(true);
    expect(constantTimeEqual('abc', 'abd')).toBe(false);
    expect(constantTimeEqual('abc', 'abcd')).toBe(false);
  });
});
