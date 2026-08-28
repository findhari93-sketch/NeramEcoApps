import { test, expect } from '@playwright/test';
import { APP_URLS } from '../utils/credentials';

/**
 * Regression coverage for NXS-0119: a call to verifyMsToken that failed for
 * any reason other than the two special-cased media errors used to fall
 * through video-embed's catch block as a generic 500 carrying the raw
 * message, which RecapPlayer.tsx then rendered verbatim inside the video
 * player (this is what happened with a real expired Microsoft token: the raw
 * Graph error body ended up in the message and, from there, on screen).
 * progress/route.ts had the opposite half of the same gap: it always answered
 * 401 but with a hardcoded status rather than the shared classifier.
 *
 * Both routes now go through apps/nexus/src/lib/api-errors.ts's
 * errorResponse(), which maps an auth failure to 401 with a clean message.
 *
 * This exercises the "Missing or invalid Authorization header" branch of
 * verifyMsToken (ms-verify.ts) rather than a genuinely expired Microsoft
 * token, because that branch is deterministic and network-free (no call to
 * Graph), matching the existing precedent in recap-stream-proxy-nexus.spec.ts.
 * It reaches the identical catch block and error-shaping code in both routes
 * that an expired token does. The specific claim that a real Graph 401 no
 * longer leaks its raw body into the thrown message is covered by the mocked
 * unit test in apps/nexus/src/lib/ms-verify.test.ts.
 */

const NEXUS = APP_URLS.nexus;
const RECAP_ID = '00000000-0000-0000-0000-000000000000';
const VIDEO_EMBED_URL = `${NEXUS}/api/student/class-recaps/${RECAP_ID}/video-embed`;
const PROGRESS_URL = `${NEXUS}/api/student/class-recaps/${RECAP_ID}/progress`;

let serverUp = false;

test.beforeAll(async ({ request }) => {
  try {
    // Generous on purpose. Next compiles an API route on its first request in
    // dev, which on a cold start takes tens of seconds.
    await request.get(VIDEO_EMBED_URL, { timeout: 120_000 });
    serverUp = true;
  } catch {
    serverUp = false;
  }
});

test.beforeEach(() => {
  test.skip(!serverUp, 'Nexus dev server unavailable on :3012');
});

function assertNoRawUpstreamLeak(errorMessage: unknown) {
  expect(typeof errorMessage).toBe('string');
  const message = errorMessage as string;
  expect(message).not.toMatch(/InvalidAuthenticationToken/);
  expect(message).not.toMatch(/Lifetime validation/);
  expect(message).not.toMatch(/graph\.microsoft\.com/i);
}

test.describe('Nexus — class recap error shape on an auth failure', () => {
  test('video-embed answers 401, not a raw 500, when the caller is unauthenticated', async ({
    request,
  }) => {
    const res = await request.get(VIDEO_EMBED_URL);
    expect(res.status()).toBe(401);
    const body = await res.json();
    assertNoRawUpstreamLeak(body.error);
  });

  test('progress heartbeat answers 401, not a raw 500, when the caller is unauthenticated', async ({
    request,
  }) => {
    const res = await request.post(PROGRESS_URL, {
      data: {
        last_video_position_seconds: 1,
        watched_delta_seconds: 1,
        duration_seconds: 100,
      },
    });
    expect(res.status()).toBe(401);
    const body = await res.json();
    assertNoRawUpstreamLeak(body.error);
  });
});
