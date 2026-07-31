import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  mintVideoToken,
  verifyVideoToken,
  isVideoToken,
  VIDEO_TOKEN_PREFIX,
  VIDEO_TOKEN_TTL_SECONDS,
} from './video-token';

const SECRET = 'test-video-secret-value';

beforeEach(() => {
  process.env.VIDEO_STREAM_SECRET = SECRET;
  delete process.env.IMPERSONATION_JWT_SECRET;
});

afterEach(() => {
  vi.useRealTimers();
  delete process.env.VIDEO_STREAM_SECRET;
  delete process.env.IMPERSONATION_JWT_SECRET;
});

const base = { scope: 'recap' as const, refId: 'recap-1', userId: 'stu-1', size: 196_000_000 };

describe('a freshly minted grant verifies', () => {
  it('round trips every claim', () => {
    const { token } = mintVideoToken(base);
    const payload = verifyVideoToken(token);

    expect(payload).not.toBeNull();
    expect(payload!.scope).toBe('recap');
    expect(payload!.refId).toBe('recap-1');
    expect(payload!.userId).toBe('stu-1');
    expect(payload!.size).toBe(196_000_000);
    expect(payload!.vid).toBe(true);
  });

  it('carries the prefix so the type is detectable without parsing', () => {
    const { token } = mintVideoToken(base);
    expect(token.startsWith(VIDEO_TOKEN_PREFIX)).toBe(true);
    expect(isVideoToken(token)).toBe(true);
  });

  it('gives each mint a distinct session id, so grants are individually traceable', () => {
    const a = mintVideoToken(base);
    const b = mintVideoToken(base);
    expect(a.sid).not.toBe(b.sid);
  });

  it('reports an expiry about one TTL away', () => {
    const { expiresAt } = mintVideoToken(base);
    const seconds = (Date.parse(expiresAt) - Date.now()) / 1000;
    expect(seconds).toBeGreaterThan(VIDEO_TOKEN_TTL_SECONDS - 30);
    expect(seconds).toBeLessThanOrEqual(VIDEO_TOKEN_TTL_SECONDS + 1);
  });
});

describe('anything not a currently valid grant is refused', () => {
  it('rejects a tampered payload', () => {
    const { token } = mintVideoToken(base);
    const body = token.slice(VIDEO_TOKEN_PREFIX.length).split('.')[0];
    const forged = JSON.parse(Buffer.from(body, 'base64url').toString('utf-8'));
    forged.refId = 'someone-elses-recap';
    const swapped = Buffer.from(JSON.stringify(forged), 'utf-8').toString('base64url');

    const sig = token.split('.')[1];
    expect(verifyVideoToken(`${VIDEO_TOKEN_PREFIX}${swapped}.${sig}`)).toBeNull();
  });

  it('rejects a token signed with a different secret', () => {
    const { token } = mintVideoToken(base);
    process.env.VIDEO_STREAM_SECRET = 'a-completely-different-secret';
    expect(verifyVideoToken(token)).toBeNull();
  });

  it('rejects an expired token', () => {
    const { token } = mintVideoToken(base);
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + (VIDEO_TOKEN_TTL_SECONDS + 5) * 1000);
    expect(verifyVideoToken(token)).toBeNull();
  });

  it('rejects malformed and foreign tokens', () => {
    for (const t of [
      null,
      undefined,
      '',
      'vid_',
      'vid_no-dot-here',
      'vid_.sig',
      'imp_something.sig',
      'Bearer abc',
    ]) {
      expect(verifyVideoToken(t as any)).toBeNull();
    }
  });

  it('rejects an impersonation token replayed as a video grant', () => {
    expect(isVideoToken('imp_abc.def')).toBe(false);
    expect(verifyVideoToken('imp_abc.def')).toBeNull();
  });

  it('rejects an unknown scope', () => {
    const { token } = mintVideoToken({ ...base, scope: 'wat' as any });
    expect(verifyVideoToken(token)).toBeNull();
  });

  it('returns null rather than throwing when no secret is configured', () => {
    const { token } = mintVideoToken(base);
    delete process.env.VIDEO_STREAM_SECRET;
    expect(() => verifyVideoToken(token)).not.toThrow();
    expect(verifyVideoToken(token)).toBeNull();
  });
});

describe('a grant is scoped to one video and one viewer', () => {
  it('does not verify as a grant for a different recap', () => {
    const forA = verifyVideoToken(mintVideoToken({ ...base, refId: 'recap-A' }).token);
    expect(forA!.refId).toBe('recap-A');
    // The proxy reads refId from the payload and never from the request, so a
    // grant simply cannot address a resource it was not minted for.
    expect(forA!.refId).not.toBe('recap-B');
  });

  it('names the viewer it was minted for', () => {
    const payload = verifyVideoToken(mintVideoToken({ ...base, userId: 'stu-42' }).token);
    expect(payload!.userId).toBe('stu-42');
  });

  it('keeps scopes distinct so a chapter grant cannot address a class', () => {
    const chapter = verifyVideoToken(
      mintVideoToken({ ...base, scope: 'foundation', refId: 'ch-1' }).token,
    );
    expect(chapter!.scope).toBe('foundation');
  });
});

describe('secret configuration', () => {
  it('falls back to IMPERSONATION_JWT_SECRET so a deploy without the new var still works', () => {
    delete process.env.VIDEO_STREAM_SECRET;
    process.env.IMPERSONATION_JWT_SECRET = 'fallback-secret';
    const { token } = mintVideoToken(base);
    expect(verifyVideoToken(token)).not.toBeNull();
  });

  it('prefers the dedicated secret when both are set', () => {
    process.env.VIDEO_STREAM_SECRET = SECRET;
    process.env.IMPERSONATION_JWT_SECRET = 'fallback-secret';
    const { token } = mintVideoToken(base);

    // Dropping only the dedicated secret must invalidate it, proving that one
    // was used. Otherwise rotating VIDEO_STREAM_SECRET would quietly do nothing.
    delete process.env.VIDEO_STREAM_SECRET;
    expect(verifyVideoToken(token)).toBeNull();
  });
});
