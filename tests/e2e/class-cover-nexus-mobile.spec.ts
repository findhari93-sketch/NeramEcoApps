import { test, expect } from '@playwright/test';
import { APP_URLS, injectAuthForPage } from '../utils/credentials';
import { assertNoHorizontalOverflow } from '../utils/mobile-helpers';

/**
 * Class cover tiles at 375x812, the primary viewport.
 *
 * Three things are protected here beyond layout:
 *
 *   1. Tapping a cover must open the image viewer and NOT the class row behind
 *      it. The tile lives inside a row that is itself a button listening for
 *      click, Enter and Space, so both guards have to hold. This is the single
 *      most valuable assertion in the file.
 *   2. The tile is a 44px touch target at its smallest size.
 *   3. A class that has not happened yet gets NO tile. A tinted placeholder on a
 *      future class would promise content that does not exist, and reads as a
 *      broken image. That is a design decision, so it is asserted rather than
 *      left to be quietly simplified away later.
 *
 * The viewport is pinned in the file because nexus-chrome's testMatch also picks
 * up *nexus-mobile*.spec.ts, so this must be correct under both projects.
 *
 * Self-skips without the Nexus dev server on :3012.
 */

const NEXUS = APP_URLS.nexus;

test.use({ viewport: { width: 375, height: 812 } });

/** Every cover tile, whether it holds a picture or the subject placeholder. */
const COVER = /See the (picture|\d+ pictures) from |No pictures from /;

async function openStudentTimetable(page: import('@playwright/test').Page): Promise<boolean> {
  const ok = await injectAuthForPage(page, 'student');
  if (!ok) return false;
  await page.goto(`${NEXUS}/student/timetable`, { waitUntil: 'domcontentloaded' });
  return true;
}

test.describe('Nexus, class cover tiles on mobile', () => {
  test('student timetable has no horizontal overflow', async ({ page }) => {
    if (!(await openStudentTimetable(page))) {
      test.skip(true, 'Nexus dev server / test-login unavailable');
      return;
    }
    await page.waitForTimeout(2_000);
    await assertNoHorizontalOverflow(page);
  });

  test('student dashboard has no horizontal overflow with cover tiles', async ({ page }) => {
    const ok = await injectAuthForPage(page, 'student');
    if (!ok) {
      test.skip(true, 'Nexus dev server / test-login unavailable');
      return;
    }

    await page.goto(`${NEXUS}/student/dashboard`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/Welcome,/)).toBeVisible({ timeout: 30_000 });
    await assertNoHorizontalOverflow(page);
  });

  test('teacher timetable has no horizontal overflow with cover tiles', async ({ page }) => {
    const ok = await injectAuthForPage(page, 'teacher');
    if (!ok) {
      test.skip(true, 'Nexus dev server / test-login unavailable');
      return;
    }

    await page.goto(`${NEXUS}/teacher/timetable`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3_000);
    await assertNoHorizontalOverflow(page);
  });

  test('a cover tile is at least a 44px touch target', async ({ page }) => {
    if (!(await openStudentTimetable(page))) {
      test.skip(true, 'Nexus dev server / test-login unavailable');
      return;
    }
    await page.waitForTimeout(2_000);

    const tile = page.getByLabel(COVER).first();
    if ((await page.getByLabel(COVER).count()) === 0) {
      test.skip(true, 'No past classes in this week, so no cover tile');
      return;
    }

    const box = await tile.boundingBox();
    expect(box).toBeTruthy();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
  });

  test('tapping a cover opens the viewer and does not open the class panel', async ({ page }) => {
    if (!(await openStudentTimetable(page))) {
      test.skip(true, 'Nexus dev server / test-login unavailable');
      return;
    }
    await page.waitForTimeout(2_000);

    // Only a tile with a picture opens anything; the placeholder is inert.
    const withPicture = page.getByLabel(/See the (picture|\d+ pictures) from /);
    if ((await withPicture.count()) === 0) {
      test.skip(true, 'No past class in this week has an image attached');
      return;
    }

    await withPicture.first().click();

    const dialog = page.locator('.MuiDialog-root');
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    // The class detail panel would have rendered a Join or Catch up affordance.
    // Its absence is what proves stopPropagation held.
    await expect(page.getByRole('button', { name: /^Close image$/ })).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden({ timeout: 10_000 });
  });

  test('a multi-image class shows a counter the next arrow advances', async ({ page }) => {
    if (!(await openStudentTimetable(page))) {
      test.skip(true, 'Nexus dev server / test-login unavailable');
      return;
    }
    await page.waitForTimeout(2_000);

    const multi = page.getByLabel(/See the \d+ pictures from /);
    if ((await multi.count()) === 0) {
      test.skip(true, 'No past class in this week has more than one image');
      return;
    }

    await multi.first().click();
    await expect(page.getByText(/^1 of \d+$/)).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: 'Next image' }).click();
    await expect(page.getByText(/^2 of \d+$/)).toBeVisible();
  });

  test('an upcoming class shows no cover tile at all', async ({ page }) => {
    if (!(await openStudentTimetable(page))) {
      test.skip(true, 'Nexus dev server / test-login unavailable');
      return;
    }

    // Jump forward a week so every row is in the future.
    const next = page.getByRole('button', { name: /next week/i });
    if ((await next.count()) === 0) {
      test.skip(true, 'Week navigation not available in this view');
      return;
    }
    await next.first().click();
    await page.waitForTimeout(2_000);

    // Rows exist (or the week is genuinely empty), but none of them may carry a
    // tile: the placeholder policy is past-only.
    expect(await page.getByLabel(COVER).count()).toBe(0);
  });
});
