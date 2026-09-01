import { test, expect } from '@playwright/test';
import { APP_URLS, getTestAuthToken } from '../utils/credentials';

/**
 * Nexus assignment share E2E (API + redirect level).
 *
 * Covers the three things this feature added: a short shareable link, a share
 * payload that knows who has not submitted, and a deep link that survives being
 * opened by somebody who is not signed in.
 *
 * What is asserted, and what deliberately is not:
 *
 *  - Graph is not reachable from CI, and the test-login token is `test_`
 *    prefixed, which the POST handler rejects on purpose with a 400 telling the
 *    teacher to copy the message instead. That refusal IS asserted: it is the
 *    guard that stops a fake success being reported.
 *  - No Teams card is asserted, because none is attempted.
 *  - The /a/<slug> redirect is followed in a blank browser context only as far
 *    as the sign-in bounce. The student page itself is MFA-gated behind a real
 *    Microsoft login, so what CI can honestly observe is that the destination
 *    survives as far as /login?next=, not that the assignment renders.
 *
 * Runs without a browser login (the teacher UI login is MFA-gated) and
 * self-skips when the Nexus dev server / test-login is unavailable.
 *
 * Prerequisites (otherwise self-skips): Nexus dev server on :3012.
 */

const NEXUS = APP_URLS.nexus;
const API = `${NEXUS}/api/assignments`;

/** Stable, greppable title. Never Date.now(): leftovers must be findable. */
const TITLE = 'E2E share, assignment link';

test.describe('Nexus — Assignment share', () => {
  test.describe.configure({ mode: 'serial' });

  let token = '';
  let classroomId = '';
  let assignmentId = '';
  let slug = '';

  const authed = (extra: Record<string, string> = {}) => ({
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    ...extra,
  });

  test('setup: teacher token, a classroom, and a published assignment', async ({ request }) => {
    const auth = await getTestAuthToken(request, 'teacher');
    if (!auth) {
      test.skip(true, 'Nexus dev server / test-login unavailable');
      return;
    }
    token = auth.testToken;
    classroomId = auth.classrooms?.[0]?.id || auth.classrooms?.[0]?.classroom_id || '';
    expect(token).toBeTruthy();
    if (!classroomId) {
      test.skip(true, 'Teacher has no classroom to create an assignment in');
      return;
    }

    const res = await request.post(API, {
      headers: authed(),
      data: {
        action: 'create',
        classroom_id: classroomId,
        assignment_type: 'document',
        title: TITLE,
        instructions: 'Created by the share E2E. Safe to delete.',
      },
    });
    expect(res.status()).toBe(200);
    assignmentId = (await res.json()).assignment.id;
  });

  test('a draft can be inspected but refuses to post, because students cannot open it', async ({
    request,
  }) => {
    if (!assignmentId) return;

    const get = await request.get(`${API}/${assignmentId}/share`, { headers: authed() });
    expect(get.status()).toBe(200);
    const body = await get.json();
    expect(body.isDraft).toBe(true);

    // 409, not a silent success: posting a draft link sends the whole class at
    // a page that shows them nothing.
    const post = await request.post(`${API}/${assignmentId}/share`, {
      headers: authed(),
      data: { includeNames: true },
    });
    expect(post.status()).toBe(409);
    expect((await post.json()).error).toMatch(/publish/i);
  });

  test('the share payload carries a short link and the not-submitted list', async ({ request }) => {
    if (!assignmentId) return;

    const publish = await request.post(`${API}/${assignmentId}`, {
      headers: authed(),
      data: { action: 'publish' },
    });
    expect(publish.status()).toBe(200);

    const res = await request.get(`${API}/${assignmentId}/share`, { headers: authed() });
    expect(res.status()).toBe(200);
    const body = await res.json();

    expect(body.isDraft).toBe(false);
    expect(body.title).toBe(TITLE);

    // The short link, not the 36-character UUID path.
    expect(body.shareUrl).toMatch(/\/a\/[0-9a-f]{6,32}$/);
    expect(body.shareUrl).not.toContain(assignmentId);
    slug = body.shareUrl.split('/a/')[1];

    // Nobody has submitted a brand new assignment, so everyone on the roster is
    // pending and the two counts must agree.
    expect(Array.isArray(body.pending)).toBe(true);
    expect(body.submittedCount + body.pending.length).toBe(body.totalCount);
    expect(body.pending.length).toBe(body.totalCount);
  });

  test('the slug is stable, so an old Teams message keeps resolving', async ({ request }) => {
    if (!assignmentId || !slug) return;
    const again = await request.get(`${API}/${assignmentId}/share`, { headers: authed() });
    expect((await again.json()).shareUrl.split('/a/')[1]).toBe(slug);
  });

  test('the short link redirects to the student assignment page', async ({ request }) => {
    if (!slug) return;
    const res = await request.get(`${NEXUS}/a/${slug}`, { maxRedirects: 0 });
    expect(res.status()).toBe(302);
    expect(res.headers()['location']).toContain(`/student/assignments/${assignmentId}`);
  });

  test('an unknown or malformed slug lands on the assignment list, never a 404', async ({
    request,
  }) => {
    // A months-old link whose assignment was deleted must still put the student
    // somewhere they can find their work.
    for (const code of ['deadbeef', 'not-a-slug', '../../etc/passwd']) {
      const res = await request.get(`${NEXUS}/a/${encodeURIComponent(code)}`, { maxRedirects: 0 });
      expect(res.status()).toBe(302);
      expect(res.headers()['location']).toContain('/student/assignments');
    }
  });

  test('posting to Teams refuses a non-Microsoft token instead of faking success', async ({
    request,
  }) => {
    if (!assignmentId) return;
    // The test-login token is `test_` prefixed. Handing it to Graph earns a 401,
    // so the route must say so and point at the copy button rather than
    // reporting a post that never happened.
    const res = await request.post(`${API}/${assignmentId}/share`, {
      headers: authed(),
      data: { includeNames: true, targets: ['channel', 'chat'] },
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toMatch(/Microsoft sign-in/i);
  });

  test('a student may not read the share payload', async ({ request }) => {
    if (!assignmentId) return;
    const auth = await getTestAuthToken(request, 'student');
    if (!auth) {
      test.skip(true, 'Student test-login unavailable');
      return;
    }
    const res = await request.get(`${API}/${assignmentId}/share`, {
      headers: { Authorization: `Bearer ${auth.testToken}` },
    });
    // Never 200: the payload names every classmate who has not submitted.
    expect(res.status()).toBeGreaterThanOrEqual(400);
  });

  test('an unauthenticated caller gets nothing', async ({ request }) => {
    if (!assignmentId) return;
    const res = await request.get(`${API}/${assignmentId}/share`);
    expect(res.status()).toBeGreaterThanOrEqual(400);
  });

  test('a signed-out visitor keeps the destination through sign-in', async ({ browser }) => {
    if (!slug) return;
    // The default 30s is not enough: this is the first test to render a student
    // page, and a dev server compiles that route on demand. The wait below is
    // for a client-side redirect that cannot begin until that compile finishes.
    test.setTimeout(150_000);

    // The bug this feature had to fix before any shared link was worth sending:
    // RoleGuard pushed a signed-out visitor to /login with no memory of where
    // they were headed, and MSAL returns to the site ROOT rather than /login, so
    // the round trip dropped them on their dashboard. Every link shared into a
    // Teams group was useless to anyone not already signed in.
    //
    // An explicit blank context, NOT the `page` fixture: this project sets
    // storageState to the saved teacher session, so the default page arrives
    // already signed in and would never reach the guard this test is about.
    // Clearing cookies is not enough either, because MSAL keeps its session in
    // local storage.
    const context = await browser.newContext({ storageState: undefined });
    const page = await context.newPage();
    try {
      await page.goto(`${NEXUS}/a/${slug}`);

      // RoleGuard runs client-side, once the auth check settles.
      await page.waitForURL(/\/login\?next=/, { timeout: 60_000 });

      const next = new URL(page.url()).searchParams.get('next');
      expect(next).toBe(`/student/assignments/${assignmentId}`);

      // The second carrier. The query parameter covers the popup flow, which
      // returns to /login; this stash covers the redirect flow, which does not.
      const stashed = await page.evaluate(() =>
        window.sessionStorage.getItem('nexus_return_path'),
      );
      expect(stashed).toBeTruthy();
      expect(JSON.parse(stashed as string).path).toBe(`/student/assignments/${assignmentId}`);
    } finally {
      await context.close();
    }
  });

  test('cleanup: remove the assignment', async ({ request }) => {
    if (!assignmentId) return;
    await request.delete(`${API}/${assignmentId}`, { headers: authed() });
  });
});
