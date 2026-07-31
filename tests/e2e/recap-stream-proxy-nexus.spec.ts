import { test, expect } from '@playwright/test';
import { APP_URLS } from '../utils/credentials';

/**
 * The byte proxy is the boundary that stops class recordings being shareable.
 * These assert the properties that boundary has to hold, at the level they can
 * be checked without a seeded recording: it refuses anything that is not a
 * currently valid grant, and it never hands back a Microsoft URL.
 *
 * Range semantics (the 206, the chunk cap, the 416) are covered exhaustively in
 * apps/nexus/src/lib/http-range.test.ts, which can test every edge without a
 * 196 MB file. What a unit test cannot cover is that the ROUTE refuses
 * unauthenticated callers, so that is what lives here.
 *
 * Reachability is probed ONCE, in beforeAll. Per-test try/catch was tried and
 * removed: it conflated "server is down" with "this request errored", and since
 * Playwright throws on a redirect when maxRedirects is 0, the redirect test
 * skipped itself in exactly the case it was written to catch.
 */

const NEXUS = APP_URLS.nexus;
const PROXY = `${NEXUS}/api/media/recording`;

let serverUp = false;

test.beforeAll(async ({ request }) => {
  try {
    // Generous on purpose. Next compiles an API route on its FIRST request in
    // dev, which on a cold start takes tens of seconds, and a short timeout here
    // reads that as "server is down" and silently skips the whole file. A skip
    // that looks like a pass is worse than a failure.
    await request.get(`${NEXUS}/api/media/recording`, { timeout: 120_000 });
    serverUp = true;
  } catch {
    serverUp = false;
  }
});

test.beforeEach(() => {
  test.skip(!serverUp, 'Nexus dev server unavailable on :3012');
});

test.describe('Nexus — recording byte proxy', () => {
  test('refuses a request with no grant', async ({ request }) => {
    const res = await request.get(PROXY);
    expect(res.status()).toBe(401);
  });

  test('refuses a token of another type replayed as a grant', async ({ request }) => {
    const res = await request.get(`${PROXY}?vt=imp_forged.signature`);
    expect(res.status()).toBe(401);
  });

  test('refuses a grant whose payload was forged', async ({ request }) => {
    const forged = Buffer.from(
      JSON.stringify({
        v: 1,
        vid: true,
        scope: 'recap',
        refId: 'anything',
        userId: 'someone',
        sid: 'x',
        size: 100,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 600,
      }),
      'utf-8',
    ).toString('base64url');

    // Writing a valid-looking payload is not enough: the HMAC is the authority.
    const res = await request.get(`${PROXY}?vt=vid_${forged}.notarealsignature`);
    expect(res.status()).toBe(401);
  });

  test('refuses an expired grant', async ({ request }) => {
    const expired = Buffer.from(
      JSON.stringify({
        v: 1,
        vid: true,
        scope: 'recap',
        refId: 'anything',
        userId: 'someone',
        sid: 'x',
        size: 100,
        iat: Math.floor(Date.now() / 1000) - 7200,
        exp: Math.floor(Date.now() / 1000) - 3600,
      }),
      'utf-8',
    ).toString('base64url');

    const res = await request.get(`${PROXY}?vt=vid_${expired}.sig`);
    expect(res.status()).toBe(401);
  });

  test('a refusal never leaks a Microsoft URL', async ({ request }) => {
    const res = await request.get(`${PROXY}?vt=vid_bogus.sig`, {
      headers: { Range: 'bytes=0-1023' },
    });
    const body = await res.text();
    for (const host of [
      /sharepoint\.com/i,
      /graph\.microsoft\.com/i,
      /1drv\.(ms|com)/i,
      /blob\.core\.windows\.net/i,
    ]) {
      expect(body).not.toMatch(host);
    }
  });

  test('never redirects the browser to the upstream source', async ({ request }) => {
    // A 302 to Microsoft would hand the client the exact URL this proxy exists
    // to withhold. maxRedirects: 0 makes Playwright throw rather than follow, so
    // this is deliberately NOT wrapped: a throw here is a real failure.
    const res = await request.get(`${PROXY}?vt=vid_bogus.sig`, { maxRedirects: 0 });
    expect([301, 302, 303, 307, 308]).not.toContain(res.status());
    expect(res.headers()['location'] ?? '').not.toMatch(/sharepoint|microsoft|windows\.net/i);
  });

  test('the recap embed resolver requires auth', async ({ request }) => {
    const res = await request.get(
      `${NEXUS}/api/student/class-recaps/00000000-0000-0000-0000-000000000000/video-embed`,
    );
    expect(res.status()).not.toBe(200);
  });
});
