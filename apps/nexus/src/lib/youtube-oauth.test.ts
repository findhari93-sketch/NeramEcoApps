import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  buildConsentUrl,
  isTokenExpired,
  exchangeCode,
  refreshAccessToken,
  getUploadAccessToken,
  YouTubeAuthError,
  YOUTUBE_SCOPES,
} from './youtube-oauth';

/**
 * The grant the whole backup depends on.
 *
 * Two setup mistakes here fail silently and only surface days later, so both are
 * pinned by a test: a consent URL missing access_type=offline returns no refresh
 * token at all, and one missing prompt=consent returns no NEW refresh token when
 * the account has already granted the scope, which makes re-keying impossible
 * without revoking by hand at myaccount.google.com.
 */

const ENV = {
  YOUTUBE_UPLOAD_CLIENT_ID: 'client-id',
  YOUTUBE_UPLOAD_CLIENT_SECRET: 'client-secret',
  YOUTUBE_UPLOAD_REDIRECT_URI: 'https://nexus.example/api/admin/youtube-oauth/callback',
};

beforeEach(() => {
  Object.assign(process.env, ENV);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('buildConsentUrl', () => {
  it('asks for offline access, or Google returns no refresh token at all', () => {
    expect(buildConsentUrl('st4te')).toContain('access_type=offline');
  });

  it('forces a fresh consent, or a re-key silently returns no refresh token', () => {
    expect(buildConsentUrl('st4te')).toContain('prompt=consent');
  });

  it('requests upload and readonly', () => {
    const url = new URL(buildConsentUrl('st4te'));
    const scope = url.searchParams.get('scope');
    // readonly is what makes the 1-unit privacy promotion check possible.
    for (const s of YOUTUBE_SCOPES) expect(scope).toContain(s);
  });

  it('carries the CSRF state and the exact registered redirect', () => {
    const url = new URL(buildConsentUrl('st4te'));
    expect(url.searchParams.get('state')).toBe('st4te');
    expect(url.searchParams.get('redirect_uri')).toBe(ENV.YOUTUBE_UPLOAD_REDIRECT_URI);
  });

  it('refuses to build anything when the client is not configured', () => {
    delete process.env.YOUTUBE_UPLOAD_CLIENT_ID;
    expect(() => buildConsentUrl('s')).toThrow(/YOUTUBE_UPLOAD_CLIENT_ID/);
  });
});

describe('isTokenExpired', () => {
  it('treats a missing or unparseable expiry as expired', () => {
    expect(isTokenExpired(null)).toBe(true);
    expect(isTokenExpired('not a date')).toBe(true);
  });

  it('expires early by the skew, so a token cannot die mid-upload', () => {
    const inTwoMinutes = new Date(Date.now() + 120_000).toISOString();
    expect(isTokenExpired(inTwoMinutes, 300)).toBe(true);
    expect(isTokenExpired(inTwoMinutes, 30)).toBe(false);
  });

  it('accepts a comfortably fresh token', () => {
    expect(isTokenExpired(new Date(Date.now() + 3600_000).toISOString())).toBe(false);
  });
});

describe('exchangeCode and refreshAccessToken', () => {
  const tokenResponse = (over: Record<string, unknown> = {}) =>
    new Response(JSON.stringify({
      access_token: 'at', refresh_token: 'rt', scope: YOUTUBE_SCOPES.join(' '),
      expires_in: 3599, ...over,
    }), { status: 200 });

  it('posts form-encoded, as the token endpoint requires', async () => {
    const f = vi.fn(async () => tokenResponse());
    await exchangeCode('code123', f as any);

    const init = (f.mock.calls[0] as any)[1];
    expect(init.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
    expect(String(init.body)).toContain('grant_type=authorization_code');
    expect(String(init.body)).toContain('code=code123');
  });

  it('turns expires_in into an absolute instant', async () => {
    const f = vi.fn(async () => tokenResponse({ expires_in: 60 }));
    const out = await exchangeCode('c', f as any);
    expect(new Date(out.expiresAt).getTime()).toBeGreaterThan(Date.now());
    expect(new Date(out.expiresAt).getTime()).toBeLessThanOrEqual(Date.now() + 61_000);
  });

  it('surfaces invalid_grant verbatim, because callers branch on it', async () => {
    const f = vi.fn(async () =>
      new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 }));
    await expect(refreshAccessToken('rt', f as any)).rejects.toThrow('invalid_grant');
  });
});

describe('getUploadAccessToken', () => {
  function makeSupabase(row: any) {
    const updates: any[] = [];
    return {
      updates,
      supabase: {
        from: () => ({
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: row, error: null }) }),
          }),
          update: (v: any) => { updates.push(v); return { eq: async () => ({ error: null }) }; },
        }),
      } as any,
    };
  }

  it('reuses a cached token rather than paying for an exchange', async () => {
    const { supabase } = makeSupabase({
      refresh_token: 'rt',
      access_token: 'cached',
      access_token_expires_at: new Date(Date.now() + 3600_000).toISOString(),
      revoked_at: null,
    });
    const f = vi.fn();

    expect(await getUploadAccessToken(supabase, f as any)).toBe('cached');
    expect(f).not.toHaveBeenCalled();
  });

  it('refreshes and caches when the stored token is stale', async () => {
    const { supabase, updates } = makeSupabase({
      refresh_token: 'rt', access_token: 'old',
      access_token_expires_at: new Date(Date.now() - 1000).toISOString(),
      revoked_at: null,
    });
    const f = vi.fn(async () => new Response(JSON.stringify({
      access_token: 'fresh', scope: 'x', expires_in: 3600,
    }), { status: 200 }));

    expect(await getUploadAccessToken(supabase, f as any)).toBe('fresh');
    expect(updates[0].access_token).toBe('fresh');
  });

  it('marks the grant revoked on invalid_grant and says so', async () => {
    const { supabase, updates } = makeSupabase({
      refresh_token: 'rt', access_token: null, access_token_expires_at: null, revoked_at: null,
    });
    const f = vi.fn(async () =>
      new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 }));

    await expect(getUploadAccessToken(supabase, f as any)).rejects.toMatchObject({ revoked: true });
    // The sweep reads revoked to stop WITHOUT burning any class's attempt cap.
    expect(updates[0].revoked_at).toBeTruthy();
  });

  it('reports "not connected" as revoked, so the sweep stops instead of retrying', async () => {
    const { supabase } = makeSupabase(null);
    await expect(getUploadAccessToken(supabase, vi.fn() as any))
      .rejects.toMatchObject({ revoked: true });
  });

  it('refuses an already-revoked grant without calling Google', async () => {
    const { supabase } = makeSupabase({
      refresh_token: 'rt', access_token: 'x',
      access_token_expires_at: new Date(Date.now() + 3600_000).toISOString(),
      revoked_at: new Date().toISOString(),
    });
    const f = vi.fn();
    await expect(getUploadAccessToken(supabase, f as any)).rejects.toBeInstanceOf(YouTubeAuthError);
    expect(f).not.toHaveBeenCalled();
  });
});
