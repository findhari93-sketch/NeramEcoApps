import { test, expect } from '@playwright/test';
import { APP_URLS } from '../utils/credentials';

/**
 * Regression: the catch-up "Watch the recording" link pointed at the wrong route.
 *
 * The guided recap player lives at the SINGULAR /student/class-recap/[recapId].
 * The PLURAL /student/class-recaps is the list page and has no [recapId] child,
 * so linking there 404s. The catch-up page built the plural form, which meant the
 * guided branch was dead and every student silently fell through to the raw
 * YouTube link instead: shareable with anyone, and no proof the class was watched.
 *
 * These assertions are route-resolution only, so they need no seeded recap and no
 * login. The page is a client component, so an unauthenticated request still gets
 * the 200 HTML shell; only a genuinely missing route yields a 404.
 *
 * Self-skips without the Nexus dev server on :3012.
 */

const NEXUS = APP_URLS.nexus;
const ANY_ID = '11111111-2222-3333-4444-555555555555';

test.describe('Nexus — catch-up watch link', () => {
  test('the singular recap player route resolves', async ({ request }) => {
    let res;
    try {
      res = await request.get(`${NEXUS}/student/class-recap/${ANY_ID}`);
    } catch {
      test.skip(true, 'Nexus dev server unavailable on :3012');
      return;
    }
    expect(res.status(), 'the player route must exist').not.toBe(404);
  });

  test('the plural route has no [recapId] child, which is why the singular one is correct', async ({
    request,
  }) => {
    let res;
    try {
      res = await request.get(`${NEXUS}/student/class-recaps/${ANY_ID}`);
    } catch {
      test.skip(true, 'Nexus dev server unavailable on :3012');
      return;
    }
    // Documents the trap. Should this ever start resolving, the two routes have
    // been merged and the guard above needs revisiting.
    expect(res.status(), 'plural + id must stay a 404').toBe(404);
  });

  test('the recap list route (no id) still resolves', async ({ request }) => {
    let res;
    try {
      res = await request.get(`${NEXUS}/student/class-recaps`);
    } catch {
      test.skip(true, 'Nexus dev server unavailable on :3012');
      return;
    }
    expect(res.status()).not.toBe(404);
  });
});
