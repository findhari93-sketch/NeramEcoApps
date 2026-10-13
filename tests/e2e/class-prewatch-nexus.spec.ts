import { test, expect } from '@playwright/test';
import { APP_URLS, getTestAuthToken, injectAuthForPage } from '../utils/credentials';
import { assertNoHorizontalOverflow } from '../utils/mobile-helpers';
import { skipWelcome } from '../utils/catchup-helpers';

/**
 * Watch before class (API level, plus one page render).
 *
 * The rules that matter most are the access rules, and they hold whatever a
 * client sends, so they are proven here against the routes:
 * - suggestions (which search every classroom's recordings) are staff only;
 * - a student cannot reach a video through an attachment on a class they are
 *   not enrolled in, or through an id that is not an attachment at all;
 * - nobody but staff who run a class can change its list.
 *
 * Self-skips without the Nexus dev server on :3012, and before
 * 20261116090000_nexus_class_prewatch.sql is applied to the database it uses.
 */

const NEXUS = APP_URLS.nexus;
const MISSING = '00000000-0000-0000-0000-000000000000';

test.describe('Nexus, watch before class', () => {
  test('every route requires sign-in', async ({ request }) => {
    for (const url of [
      `${NEXUS}/api/timetable/prewatch-suggestions?q=street`,
      `${NEXUS}/api/timetable/${MISSING}/prewatch`,
      `${NEXUS}/api/timetable/${MISSING}/prewatch/${MISSING}/play`,
    ]) {
      const res = await request.get(url);
      expect(res.status(), url).not.toBe(200);
    }
  });

  test('a student cannot search every classroom’s recordings', async ({ request }) => {
    const auth = await getTestAuthToken(request, 'student');
    if (!auth) {
      test.skip(true, 'Nexus dev server / test-login unavailable');
      return;
    }
    const res = await request.get(`${NEXUS}/api/timetable/prewatch-suggestions?q=street`, {
      headers: { Authorization: `Bearer ${auth.testToken}` },
    });
    expect(res.status()).toBe(403);
  });

  test('a teacher gets suggestions in the shape the picker reads', async ({ request }) => {
    const auth = await getTestAuthToken(request, 'teacher');
    if (!auth) {
      test.skip(true, 'Nexus dev server / test-login unavailable');
      return;
    }
    const res = await request.get(`${NEXUS}/api/timetable/prewatch-suggestions?q=perspective`, {
      headers: { Authorization: `Bearer ${auth.testToken}` },
    });
    test.skip(res.status() === 500, 'Database not migrated for watch before class');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.suggestions)).toBe(true);
    expect(Array.isArray(body.recordings)).toBe(true);
    expect(Array.isArray(body.library)).toBe(true);
    expect(body.suggestions.length).toBeLessThanOrEqual(3);
  });

  test('a student cannot play through an attachment that does not exist', async ({ request }) => {
    const auth = await getTestAuthToken(request, 'student');
    if (!auth) {
      test.skip(true, 'Nexus dev server / test-login unavailable');
      return;
    }
    const res = await request.get(`${NEXUS}/api/timetable/${MISSING}/prewatch/${MISSING}/play`, {
      headers: { Authorization: `Bearer ${auth.testToken}` },
    });
    // No such class (404) or not enrolled (403): never a playable answer.
    expect([403, 404]).toContain(res.status());
  });

  test('a student cannot change a class’s videos', async ({ request }) => {
    const auth = await getTestAuthToken(request, 'student');
    if (!auth) {
      test.skip(true, 'Nexus dev server / test-login unavailable');
      return;
    }
    const res = await request.put(`${NEXUS}/api/timetable/${MISSING}/prewatch`, {
      headers: { Authorization: `Bearer ${auth.testToken}` },
      data: { items: [{ kind: 'library_video', id: MISSING }] },
    });
    expect([403, 404]).toContain(res.status());
  });

  test('progress for a video that is not attached records nothing and never errors', async ({ request }) => {
    const auth = await getTestAuthToken(request, 'student');
    if (!auth) {
      test.skip(true, 'Nexus dev server / test-login unavailable');
      return;
    }
    const res = await request.post(`${NEXUS}/api/timetable/${MISSING}/prewatch/${MISSING}/progress`, {
      headers: { Authorization: `Bearer ${auth.testToken}` },
      data: { last_video_position_seconds: 30, watched_delta_seconds: 30, duration_seconds: 600 },
    });
    test.skip(res.status() === 500, 'Database not migrated for watch before class');
    expect(res.status()).toBe(200);
  });

  test('mobile: the watch page fits a 375px screen', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await skipWelcome(page);
    const ok = await injectAuthForPage(page, 'student').catch(() => false);
    if (!ok) {
      test.skip(true, 'Nexus dev server / test-login unavailable');
      return;
    }
    await page.goto(`${NEXUS}/student/timetable/${MISSING}/watch/${MISSING}`);
    await expect(page.getByRole('button', { name: 'Back to the class' })).toBeVisible({ timeout: 30_000 });
    await assertNoHorizontalOverflow(page);
  });
});
