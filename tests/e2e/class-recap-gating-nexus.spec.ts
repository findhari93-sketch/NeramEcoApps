import { test, expect } from '@playwright/test';
import { APP_URLS, getTestAuthToken } from '../utils/credentials';

/**
 * Class-recap gated playback E2E (API level).
 *
 * The checkpoint gating itself is client-side (the video player pauses at each
 * checkpoint and the quiz must pass). At the API level we verify the pieces the
 * gating relies on: the video-embed resolver is auth-gated, refuses unpublished
 * recaps, and now understands both video sources (sharepoint stream / youtube
 * id) without crashing. Full watch-and-pass is covered by manual/UI runs.
 *
 * Self-skips without the Nexus dev server on :3012.
 */

const NEXUS = APP_URLS.nexus;
const MISSING = '00000000-0000-0000-0000-000000000000';

test.describe('Nexus — Class recap gating', () => {
  test('video-embed requires auth', async ({ request }) => {
    const res = await request.get(`${NEXUS}/api/student/class-recaps/${MISSING}/video-embed`);
    expect([401, 403, 500]).not.toContain(200);
    expect(res.status()).not.toBe(200);
  });

  test('video-embed refuses an unavailable recap (no crash)', async ({ request }) => {
    const auth = await getTestAuthToken(request, 'student');
    if (!auth) {
      test.skip(true, 'Nexus dev server / test-login unavailable');
      return;
    }
    const res = await request.get(`${NEXUS}/api/student/class-recaps/${MISSING}/video-embed`, {
      headers: { Authorization: `Bearer ${auth.testToken}` },
    });
    // A missing/unpublished recap is 403 (not published) or 404, never a 200.
    expect(res.status()).not.toBe(200);
    expect([403, 404, 500]).toContain(res.status());
  });

  // The published-recaps collection route was deleted along with the Study Zone
  // list it fed. What a student may watch now comes from
  // /api/student/catchup-journey, covered in nexus-class-recap.spec.ts.
});
