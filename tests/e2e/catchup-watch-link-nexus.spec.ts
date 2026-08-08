import { test, expect } from '@playwright/test';
import { APP_URLS } from '../utils/credentials';

/**
 * Where a student's class recording lives, and where it does not.
 *
 * Originally a regression guard: the catch-up page built the PLURAL
 * /student/class-recaps/[recapId], which has never had an [recapId] child, so
 * the guided branch 404'd and every student silently fell through to the raw
 * YouTube link instead. Shareable with anyone, and no proof the class was
 * watched.
 *
 * The plural has since been retired for a second reason. It was a list of every
 * recap in the classroom, reachable from the Study Zone, sitting beside Catch-up
 * in the Classroom zone: two doors to the same recording, of which only Catch-up
 * starts the clock. A student who used the Study Zone door did the work and
 * still read as "not started" to their teacher. It now redirects into the
 * workspace, and these tests hold that line: the SINGULAR player must resolve,
 * the plural must not swallow it, and the list must move rather than 404.
 *
 * Route resolution only, so no seeded recap and no login. The pages are client
 * components, so an unauthenticated request still gets the 200 HTML shell; only
 * a genuinely missing route yields a 404.
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
      res = await request.get(`${NEXUS}/student/class-recaps/${ANY_ID}`, { maxRedirects: 0 });
    } catch {
      test.skip(true, 'Nexus dev server unavailable on :3012');
      return;
    }
    // Documents the trap. The redirect below is scoped to the exact path, so a
    // plural WITH an id must still be a dead end rather than quietly landing on
    // catch-up: a shared link that resolves to the wrong screen is worse than
    // one that visibly breaks.
    expect(res.status(), 'plural + id must stay a 404').toBe(404);
  });

  test('the old recap list redirects into the catch-up workspace', async ({ request }) => {
    let res;
    try {
      res = await request.get(`${NEXUS}/student/class-recaps`, { maxRedirects: 0 });
    } catch {
      test.skip(true, 'Nexus dev server unavailable on :3012');
      return;
    }
    // maxRedirects: 0 is load-bearing. Playwright follows redirects by default,
    // so the old assertion (`status !== 404`) passed whether the route was a
    // live page, a redirect, or a redirect to something broken.
    expect([307, 308, 302]).toContain(res.status());
    expect(res.headers()['location']).toContain('/student/catch-up');
  });

  test('the redirect does not swallow the player or Focus Mode', async ({ request }) => {
    let player;
    let focus;
    try {
      player = await request.get(`${NEXUS}/student/class-recap/${ANY_ID}`, { maxRedirects: 0 });
      focus = await request.get(`${NEXUS}/student/focus/recap/${ANY_ID}`, { maxRedirects: 0 });
    } catch {
      test.skip(true, 'Nexus dev server unavailable on :3012');
      return;
    }
    // A redirect sourced on the plural must not catch the singular player, which
    // is where every link already sent to a student points.
    expect([307, 308, 302]).not.toContain(player.status());
    expect([307, 308, 302]).not.toContain(focus.status());
  });
});
