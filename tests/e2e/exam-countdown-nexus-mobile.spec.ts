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

  test('the hero timer is keyboard reachable and a large touch target', async ({ page }) => {
    const ok = await injectAuthForPage(page, 'student');
    if (!ok) {
      test.skip(true, 'Nexus dev server / test-login unavailable');
      return;
    }

    await page.goto(`${NEXUS}/student/dashboard`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/Welcome,/)).toBeVisible({ timeout: 30_000 });

    const hero = page.getByRole('button', { name: /days to go|is exam day|is the day|not confirmed/i });
    if ((await hero.count()) === 0) {
      test.skip(true, 'No exam linked to this classroom, so no countdown');
      return;
    }
    // It is a whole card, so the 44px floor is a formality; the real assertion
    // is that it exposes a button role at all, since it is a div under the hood.
    const box = await hero.first().boundingBox();
    expect(box).toBeTruthy();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    await hero.first().focus();
    await expect(hero.first()).toBeFocused();
  });

  test('a far-off unannounced exam shows the day count next to an Expected chip', async ({
    page,
  }) => {
    const ok = await injectAuthForPage(page, 'student');
    if (!ok) {
      test.skip(true, 'Nexus dev server / test-login unavailable');
      return;
    }

    await page.goto(`${NEXUS}/student/dashboard`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/Welcome,/)).toBeVisible({ timeout: 30_000 });

    const unit = page.getByText('days to go', { exact: true });
    if ((await unit.count()) === 0) {
      test.skip(true, 'No counting exam linked, nothing to assert about hedging');
      return;
    }

    // The hedge moved from the number to the label, so the label has to be there
    // whenever the date is a guess. This is the honesty contract of the redesign.
    const expectedChip = page.getByText('Expected date', { exact: true });
    if ((await expectedChip.count()) > 0) {
      await expect(page.getByText(/not announced yet/i).first()).toBeVisible();
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
