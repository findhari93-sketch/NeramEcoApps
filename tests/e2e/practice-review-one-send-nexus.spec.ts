/**
 * Practice review: one send.
 *
 * On a practice sketch, everything the teacher touches waits for one send, and
 * the bar says what it does: Skip when nothing changed, Send & next once
 * something did (with a quiet Skip beside it), Next and Update & next on a
 * sketch already reviewed. A reaction tap sends nothing on its own. The
 * Inspiration shelf is a line under Feature, not a switch in the bar.
 *
 * Owns its fixture: the test student uploads one sketch, the test teacher
 * reviews it twice, the student deletes it. Only the test student is notified.
 * Runs at 375px (phone first) and 1280px.
 */

import { test, expect, type Page } from '@playwright/test';
import { APP_URLS, getTestAuthToken, injectAuthForPage } from '../utils/credentials';

const NEXUS = APP_URLS.nexus;
const SHOTS = process.env.PW_SHOTS_DIR || 'test-results/practice-review-one-send';
// 1x1 white PNG.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=', 'base64');

let studentToken = '';
let teacherToken = '';
let sketchId = '';

test.use({ storageState: { cookies: [], origins: [] } });

const noSidewaysScroll = async (page: Page) => {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, 'the page scrolls sideways').toBeLessThanOrEqual(0);
};

const atLeast44 = async (page: Page, name: string | RegExp) => {
  const box = await page.getByRole('button', { name, exact: typeof name === 'string' }).first().boundingBox();
  expect(box, `${name} is on screen`).not.toBeNull();
  expect(box!.height, `${name} is a 44px target`).toBeGreaterThanOrEqual(44);
};

/** Fails the test if anything posts a reaction on its own. */
const watchReactionPosts = (page: Page) => {
  const posts: string[] = [];
  page.on('request', (req) => { if (req.method() === 'POST' && /\/api\/sketchbook\/entries\/[^/]+\/react/.test(req.url())) posts.push(req.url()); });
  return posts;
};

const openReview = async (page: Page) => {
  const ok = await injectAuthForPage(page, 'teacher');
  test.skip(!ok, 'Teacher auth injection failed');
  await page.goto(`${NEXUS}/teacher/drawing-reviews/${sketchId}`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('button', { name: 'Wow' })).toBeVisible({ timeout: 90_000 });
};

const reactionOnRow = async (page: Page) => {
  const res = await page.request.get(`${NEXUS}/api/drawing/submissions/${sketchId}`, { headers: { Authorization: `Bearer ${teacherToken}` } });
  const body = await res.json();
  return (body.submission ?? body).reaction as string | null;
};

test.describe('Practice review: one send', () => {
  test.describe.configure({ mode: 'serial', timeout: 180_000 });

  test('setup: the test student uploads a sketch', async ({ request }) => {
    const student = await getTestAuthToken(request, 'student');
    const teacher = await getTestAuthToken(request, 'teacher');
    test.skip(!student || !teacher, 'Nexus dev server or test-login not available');
    studentToken = student!.testToken;
    teacherToken = teacher!.testToken;

    const up = await request.post(`${NEXUS}/api/drawing/upload`, {
      headers: { Authorization: `Bearer ${studentToken}` },
      multipart: { bucket: 'drawing-uploads', file: { name: 'e2e-one-send.png', mimeType: 'image/png', buffer: PNG } },
    });
    expect(up.status()).toBe(200);
    const { url } = await up.json();
    const res = await request.post(`${NEXUS}/api/sketchbook/entries`, {
      headers: { Authorization: `Bearer ${studentToken}` },
      data: { original_image_url: url, caption: 'E2E one send' },
    });
    expect(res.status()).toBe(201);
    sketchId = (await res.json()).sketch.id;
  });

  test.describe('on a phone', () => {
    test.use({ viewport: { width: 375, height: 812 } });

    test('AC1: an untouched sketch offers one button, Skip, and no shelf switch', async ({ page }) => {
      test.skip(!sketchId, 'No sketch');
      await openReview(page);
      await expect(page.getByRole('button', { name: 'Skip', exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: /Send/ })).toHaveCount(0);
      await expect(page.getByRole('checkbox', { name: 'Show in Inspiration' })).toHaveCount(0);
      await atLeast44(page, 'Skip');
      await atLeast44(page, 'Wow');
      await noSidewaysScroll(page);
      await page.screenshot({ path: `${SHOTS}/phone-untouched.png`, fullPage: false });
    });

    test('AC2: a reaction is held, not sent, and turns the bar into Send & next', async ({ page }) => {
      test.skip(!sketchId, 'No sketch');
      const posts = watchReactionPosts(page);
      await openReview(page);
      await page.getByRole('button', { name: 'Wow' }).click();
      await expect(page.getByRole('button', { name: 'Send & next' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Skip without sending' })).toBeVisible();
      await expect(page.getByText(/Goes to .+ with your review/)).toBeVisible();
      await expect(page.getByText('Sent Wow')).toHaveCount(0);
      await atLeast44(page, 'Send & next');
      await atLeast44(page, 'Skip without sending');
      await noSidewaysScroll(page);
      await page.screenshot({ path: `${SHOTS}/phone-changed.png`, fullPage: false });
      expect(posts, 'a reaction tap posted to /react on its own').toHaveLength(0);
      expect(await reactionOnRow(page), 'Wow reached the row before Send').toBeNull();
    });

    test('AC3: Send & next saves the reaction with the review', async ({ page }) => {
      test.skip(!sketchId, 'No sketch');
      const posts = watchReactionPosts(page);
      await openReview(page);
      await page.getByRole('button', { name: 'Wow' }).click();
      const saved = page.waitForResponse((r) => r.url().includes(`/api/drawing/submissions/${sketchId}/review`) && r.request().method() === 'PATCH');
      await page.getByRole('button', { name: 'Send & next' }).click();
      expect((await saved).status()).toBe(200);
      expect(posts).toHaveLength(0);
      expect(await reactionOnRow(page)).toBe('wow');
    });

    test('AC4: a reviewed sketch says Next, and a changed reaction says Update & next', async ({ page }) => {
      test.skip(!sketchId, 'No sketch');
      await openReview(page);
      await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: /Update/ })).toHaveCount(0);
      // The sheet opens locked; a reaction is a change, so it reopens grading.
      await page.getByRole('button', { name: 'Great' }).click();
      await expect(page.getByRole('button', { name: 'Update & next' })).toBeVisible();
      await page.screenshot({ path: `${SHOTS}/phone-update.png`, fullPage: false });
      const saved = page.waitForResponse((r) => r.url().includes(`/api/drawing/submissions/${sketchId}/review`) && r.request().method() === 'PATCH');
      await page.getByRole('button', { name: 'Update & next' }).click();
      expect((await saved).status()).toBe(200);
      expect(await reactionOnRow(page)).toBe('fire');
    });

    test('AC5: Skip without sending leaves a held reaction unsaved', async ({ page }) => {
      test.skip(!sketchId, 'No sketch');
      await openReview(page);
      await page.getByRole('button', { name: 'Nice' }).click();
      await page.getByRole('button', { name: 'Skip without sending' }).click();
      await page.waitForURL((u) => !u.pathname.endsWith(sketchId), { timeout: 60_000 });
      expect(await reactionOnRow(page)).toBe('fire');
    });
  });

  test.describe('on a laptop', () => {
    test.use({ viewport: { width: 1280, height: 800 } });

    test('AC6: the rail fits, and the shelf line opens its own sheet', async ({ page }) => {
      test.skip(!sketchId, 'No sketch');
      await openReview(page);
      await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeVisible();
      await noSidewaysScroll(page);
      const change = page.getByRole('button', { name: 'Change Inspiration shelf setting' });
      if (await change.count()) {
        // A sketch is never scored, so the line must not promise a 4-star rule.
        await expect(page.getByText('Not on the Inspiration shelf (a sketch goes on when you feature it)')).toBeVisible();
        await change.click();
        await expect(page.getByRole('radio', { name: /Automatic.*Off the shelf until you feature it/ })).toBeVisible();
        await expect(page.getByRole('radio', { name: /Always show/ })).toBeVisible();
        await expect(page.getByRole('radio', { name: /Never show/ })).toBeVisible();
        await page.screenshot({ path: `${SHOTS}/laptop-shelf-sheet.png`, fullPage: false });
        await page.getByRole('button', { name: 'Done' }).click();
      } else {
        console.log('[one-send] this sketch has no Inspiration item, so there is no shelf line to open');
      }
      await page.screenshot({ path: `${SHOTS}/laptop.png`, fullPage: false });
    });
  });

  // A student cannot delete a sketch once it has been reviewed (409), so the
  // teacher removes it, the way the other drawing specs clean up.
  test('cleanup: the teacher deletes the sketch', async ({ request }) => {
    test.skip(!sketchId, 'No sketch');
    const res = await request.delete(`${NEXUS}/api/drawing/submissions/${sketchId}`, { headers: { Authorization: `Bearer ${teacherToken}` } });
    expect([200, 204]).toContain(res.status());
  });
});
