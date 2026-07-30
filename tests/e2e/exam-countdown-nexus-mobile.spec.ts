import { test, expect } from '@playwright/test';
import { APP_URLS, injectAuthForPage } from '../utils/credentials';
import { assertNoHorizontalOverflow } from '../utils/mobile-helpers';

/**
 * Exam countdown at 375x812, the primary viewport.
 *
 * Two things are being protected here beyond layout:
 *
 *   1. The greeting-row chip must not push the student dashboard into a
 *      horizontal scroll. It sits next to a classroom name on a 375px line.
 *   2. At a far distance the full-width strip must be ABSENT. That is the design
 *      decision that keeps the countdown from competing with the "Next Up"
 *      Join-class hero, and from putting a permanent coloured banner about an
 *      exam six months away in front of a sixteen year old every day. It is the
 *      part most likely to be simplified away by accident, so it is asserted.
 *
 * Self-skips without the Nexus dev server on :3012.
 */

const NEXUS = APP_URLS.nexus;

test.use({ viewport: { width: 375, height: 812 } });

test.describe('Nexus, exam countdown on mobile', () => {
  test('student dashboard has no horizontal overflow', async ({ page }) => {
    const ok = await injectAuthForPage(page, 'student');
    if (!ok) {
      test.skip(true, 'Nexus dev server / test-login unavailable');
      return;
    }

    await page.goto(`${NEXUS}/student/dashboard`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/Welcome,/)).toBeVisible({ timeout: 30_000 });
    await assertNoHorizontalOverflow(page);
  });

  test('the greeting chip is a 44px touch target when present', async ({ page }) => {
    const ok = await injectAuthForPage(page, 'student');
    if (!ok) {
      test.skip(true, 'Nexus dev server / test-login unavailable');
      return;
    }

    await page.goto(`${NEXUS}/student/dashboard`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/Welcome,/)).toBeVisible({ timeout: 30_000 });

    const chip = page.locator('.MuiChip-root', { hasText: /in about|in \d|JEE|NATA/ });
    if ((await chip.count()) === 0) {
      test.skip(true, 'No exam linked to this classroom, so no countdown chip');
      return;
    }
    // The chip itself is small by MUI default; its wrapper Box carries the 48px
    // minHeight, so the tappable ancestor is what must satisfy the guideline.
    const wrapperBox = await chip.first().locator('xpath=..').boundingBox();
    expect(wrapperBox).toBeTruthy();
    expect(wrapperBox!.height).toBeGreaterThanOrEqual(44);
  });

  test('a far-off exam shows a chip and not the full-width strip', async ({ page }) => {
    const ok = await injectAuthForPage(page, 'student');
    if (!ok) {
      test.skip(true, 'Nexus dev server / test-login unavailable');
      return;
    }

    await page.goto(`${NEXUS}/student/dashboard`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/Welcome,/)).toBeVisible({ timeout: 30_000 });

    // "months to go" or "weeks to go" as a headline means the strip rendered.
    // Beyond 30 days it must not: that copy belongs to the strip variant only.
    const stripHeadline = page.getByText(/^(About )?\d+ months to go$/);
    const chipLabel = page.locator('.MuiChip-root', { hasText: /in about \d+ months/ });

    if ((await chipLabel.count()) > 0) {
      await expect(stripHeadline).toHaveCount(0);
    } else {
      test.skip(true, 'No far-off exam linked, nothing to assert about promotion');
    }
  });

  test('teacher dashboard has no horizontal overflow with the extra tile', async ({ page }) => {
    const ok = await injectAuthForPage(page, 'teacher');
    if (!ok) {
      test.skip(true, 'Nexus dev server / test-login unavailable');
      return;
    }

    await page.goto(`${NEXUS}/teacher/dashboard`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Classes Today')).toBeVisible({ timeout: 30_000 });
    await assertNoHorizontalOverflow(page);
  });

  test('the countdown stat value stays on one or two lines', async ({ page }) => {
    const ok = await injectAuthForPage(page, 'teacher');
    if (!ok) {
      test.skip(true, 'Nexus dev server / test-login unavailable');
      return;
    }

    await page.goto(`${NEXUS}/teacher/dashboard`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Classes Today')).toBeVisible({ timeout: 30_000 });

    // StatCard renders its value at 1.4rem/800. A full sentence there wraps to
    // three lines at 375px, which is why the component passes `value` (short)
    // and never `headline`.
    const value = page.getByText(/^(About )?(\d+ (months|weeks|days)|Tomorrow|Today|Not set|Not confirmed|Done)$/).first();
    if ((await value.count()) === 0) {
      test.skip(true, 'No countdown tile rendered');
      return;
    }
    const box = await value.boundingBox();
    expect(box).toBeTruthy();
    // Two lines of 1.4rem plus leading is comfortably under 80px.
    expect(box!.height).toBeLessThan(80);
  });

  test('exam date manager form is usable at 375px', async ({ page }) => {
    const ok = await injectAuthForPage(page, 'teacher');
    if (!ok) {
      test.skip(true, 'Nexus dev server / test-login unavailable');
      return;
    }

    await page.goto(`${NEXUS}/teacher/documents`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    const addButton = page.getByRole('button', { name: /Add Date/i });
    if ((await addButton.count()) === 0) {
      test.skip(true, 'Exam tracking surface not reachable from this route');
      return;
    }

    await addButton.first().click();
    // The drawer anchors to the bottom on mobile and must scroll internally
    // rather than pushing the page sideways.
    await expect(page.getByText('Add Exam Date')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByLabel(/Date confidence/i)).toBeVisible();
    await assertNoHorizontalOverflow(page);
  });
});
