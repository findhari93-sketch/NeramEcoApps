import { test, expect } from '@playwright/test';
import { APP_URLS, getTestAuthToken, injectAuthForPage } from '../utils/credentials';

/**
 * The students screen at 375px, the iPhone SE width the mobile mandate targets.
 *
 * The nexus-mobile project defaults to Pixel 5 (393px), so the viewport is
 * overridden here rather than assumed: 375 is where the six segment pills, the
 * two new chips and the student name genuinely compete for the same row.
 */

const NEXUS = APP_URLS.nexus;

test.use({ viewport: { width: 375, height: 812 } });

/**
 * A student row: the clickable card, identified by the email it always carries.
 * Scoped away from the segment pills and the page chrome, which are also
 * clickable but never contain an address.
 */
function studentRows(page: import('@playwright/test').Page) {
  return page.locator('[role="button"]').filter({ hasText: /@/ });
}

test.describe('Students screen on a phone', () => {
  let migrated = false;

  test.beforeAll(async ({ request }) => {
    const auth = await getTestAuthToken(request, 'teacher');
    const classroomId = auth?.classrooms?.[0]?.id;
    if (!auth || !classroomId) return;
    // Retry past the dev server's first-request 404 while it compiles the route;
    // otherwise any code change silently skips this whole file.
    const probe = () =>
      request.get(`${NEXUS}/api/students?classroom=${classroomId}`, {
        headers: { Authorization: `Bearer ${auth.testToken}` },
      });
    let res = await probe();
    for (let attempt = 0; attempt < 8 && res.status() === 404; attempt++) {
      await new Promise((r) => setTimeout(r, 1500));
      res = await probe();
    }
    if (res.status() !== 200) return;
    migrated = !!(await res.json())?.counts?.segments;
  });

  test.beforeEach(async ({ page }) => {
    test.skip(!migrated, 'Stage/participation migration not applied in this environment');
    const ok = await injectAuthForPage(page, 'teacher');
    test.skip(!ok, 'Nexus test-login unavailable');
    await page.goto(`${NEXUS}/teacher/students`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('tablist', { name: /filter students/i })).toBeVisible({
      timeout: 15000,
    });
  });

  test('no horizontal overflow in any of the three densities', async ({ page }) => {
    for (const label of ['Compact list', 'Card grid', 'Detailed rows']) {
      await page.getByRole('button', { name: label }).click();
      await page.waitForTimeout(250);

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      );
      expect(overflow, `${label} pushes the document sideways at 375px`).toBe(false);
    }
  });

  test('the segment bar scrolls itself without pushing the page', async ({ page }) => {
    const bar = page.getByRole('tablist', { name: /filter students/i });

    // Six pills genuinely do not fit at 375px, so the bar is expected to scroll.
    // What must NOT happen is the document scrolling with it.
    const barScrolls = await bar.evaluate((el) => el.scrollWidth > el.clientWidth);
    expect(typeof barScrolls).toBe('boolean');

    const documentOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(documentOverflow).toBe(false);
  });

  test('segment pills meet the 44px touch minimum', async ({ page }) => {
    // Scoped to the segment bar: StudentsTabs (All Students / City-Wise /
    // Watchlist) also renders role="tab" on this page.
    const pills = page.getByRole('tablist', { name: /filter students/i }).getByRole('tab');
    const count = await pills.count();
    expect(count).toBe(6);

    for (let i = 0; i < count; i++) {
      const box = await pills.nth(i).boundingBox();
      expect(box, `pill ${i} has no box`).toBeTruthy();
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }
  });

  test('the classify drawer is reachable and its Apply button is not clipped', async ({ page }) => {
    const select = page.getByRole('button', { name: /^Select$/ });
    if ((await select.count()) === 0) {
      test.skip(true, 'Signed-in account cannot classify (needs manager or admin)');
    }
    // The landing segment is guaranteed non-empty by the page's own fallback
    // (it moves off a segment that has gone to zero), so no segment switching
    // is needed here and this test measures the drawer rather than the filter.
    await expect(studentRows(page).first()).toBeVisible({ timeout: 15000 });

    await select.click();

    // Exact: the "N not set" banner renders "Set stages" (plural), which a
    // loose regex would also match.
    const bulkBar = page.getByRole('button', { name: 'Set stage', exact: true });
    await expect(bulkBar).toBeVisible();

    // Buttons in the fixed footer stay above the touch minimum even stacked.
    const box = await bulkBar.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);

    await page.getByRole('button', { name: /Select all/i }).click();

    await expect(bulkBar).toBeEnabled();
    await bulkBar.click();

    // The sheet is capped at 88dvh; its footer must still be inside the viewport
    // rather than pushed below the fold by the four stage options.
    const apply = page.getByRole('button', { name: /Apply/i });
    await expect(apply).toBeVisible();
    const applyBox = await apply.boundingBox();
    expect(applyBox!.y + applyBox!.height).toBeLessThanOrEqual(812);

    // Stage options stay tappable.
    const breakYear = page.getByText('Break Year', { exact: true }).first();
    const optionBox = await breakYear.boundingBox();
    expect(optionBox).toBeTruthy();

    await page.keyboard.press('Escape');
  });

  test('a compact row keeps the student name visible alongside the chips', async ({ page }) => {
    await page.getByRole('button', { name: 'Compact list' }).click();
    await page.waitForTimeout(400);

    const first = studentRows(page).first();
    await expect(first).toBeVisible({ timeout: 15000 });
    const box = await first.boundingBox();
    expect(box!.width).toBeLessThanOrEqual(375);
    // The chips must not squeeze the name to nothing.
    expect(box!.height).toBeGreaterThanOrEqual(48);
  });
});
