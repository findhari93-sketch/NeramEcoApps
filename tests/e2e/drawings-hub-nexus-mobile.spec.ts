import { test, expect, type Page } from '@playwright/test';
import { APP_URLS, injectAuthForPage } from '../utils/credentials';
import { assertNoHorizontalOverflow } from '../utils/mobile-helpers';

/**
 * Drawings: one destination, on a phone.
 *
 * Sketchbook and Inspiration used to be two nav items in the same group, which
 * asked everyone to know the difference before they had opened either. They are
 * one hub with tabs now. Two kinds of tab share the bar: Flip through and Class
 * rhythm are the same page switched with ?view=, Inspiration is a link to a
 * route it owns. The interesting cases are all at that seam, so they are tested
 * here rather than inside either feature's own spec.
 *
 * The paths did not move. /teacher/sketchbook and /student/sketchbook are still
 * the hub, because Teams cards, the evening digest and the notification bell
 * point at them, and /student/drawings is a retired tree with live Question
 * Bank pages under it.
 */

const NEXUS = APP_URLS.nexus;

async function open(page: Page, role: 'teacher' | 'student', route: string): Promise<'ok' | 'off' | 'down'> {
  if (!(await injectAuthForPage(page, role))) return 'down';
  await page.goto(`${NEXUS}${route}`, { waitUntil: 'domcontentloaded' });
  try {
    await page.locator('button[aria-label="Open profile menu"]').waitFor({ timeout: 90_000 });
  } catch {
    return 'down';
  }
  const skip = page.getByRole('button', { name: 'Skip' });
  if (await skip.isVisible().catch(() => false)) await skip.click();
  if (await page.getByText(/is coming soon|getting this ready for you/i).first().isVisible().catch(() => false)) return 'off';
  return 'ok';
}

test.describe('Drawings hub on a phone', () => {
  test('a teacher gets one Drawings page carrying every tab', async ({ page }) => {
    test.setTimeout(120_000);
    const state = await open(page, 'teacher', '/teacher/sketchbook');
    test.skip(state === 'down', 'Nexus not running');
    test.skip(state === 'off', 'staff.sketchbook is off in this environment');

    await expect(page.getByRole('heading', { name: 'Drawings', exact: true })).toBeVisible();
    await expect(page.getByRole('tab', { name: /Flip through/ })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Class rhythm' })).toBeVisible();
    await assertNoHorizontalOverflow(page);

    // The bar scrolls internally rather than widening the page, so every tab
    // stays reachable at 375px without the document scrolling sideways.
    for (const name of [/Flip through/, /^Class rhythm$/]) {
      const box = await page.getByRole('tab', { name }).boundingBox();
      expect(box && box.height >= 44, `${name} touch target`).toBe(true);
    }
  });

  test('Class rhythm switches in place and survives a reload', async ({ page }) => {
    test.setTimeout(120_000);
    const state = await open(page, 'teacher', '/teacher/sketchbook');
    test.skip(state === 'down', 'Nexus not running');
    test.skip(state === 'off', 'staff.sketchbook is off in this environment');

    await page.getByRole('tab', { name: 'Class rhythm' }).click();
    await expect(page).toHaveURL(/\/teacher\/sketchbook\?view=rhythm/, { timeout: 30_000 });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('tab', { name: 'Class rhythm', selected: true })).toBeVisible({ timeout: 60_000 });
  });

  test('the evening digest deep link still opens Class rhythm', async ({ page }) => {
    test.setTimeout(120_000);
    const state = await open(page, 'teacher', '/teacher/sketchbook?view=rhythm');
    test.skip(state === 'down', 'Nexus not running');
    test.skip(state === 'off', 'staff.sketchbook is off in this environment');

    await expect(page.getByRole('tab', { name: 'Class rhythm', selected: true })).toBeVisible({ timeout: 60_000 });
  });

  test('Inspiration is a tab that keeps its own route, and the bar comes with it', async ({ page }) => {
    test.setTimeout(120_000);
    const state = await open(page, 'teacher', '/teacher/sketchbook');
    test.skip(state === 'down', 'Nexus not running');
    test.skip(state === 'off', 'staff.sketchbook is off in this environment');

    const tab = page.getByRole('tab', { name: 'Inspiration' });
    test.skip(!(await tab.isVisible().catch(() => false)), 'staff.inspiration is off in this environment');

    await tab.click();
    await expect(page).toHaveURL(/\/teacher\/inspiration/, { timeout: 60_000 });
    // The point of the seam: a tab that navigates must still look like a tab.
    await expect(page.getByRole('heading', { name: 'Drawings', exact: true })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole('tab', { name: 'Inspiration', selected: true })).toBeVisible();
    await expect(page.getByRole('tab', { name: /Flip through/ })).toBeVisible();
    await assertNoHorizontalOverflow(page);
  });

  test('a student gets the same one door, and the reminder link still opens the add sheet', async ({ page }) => {
    test.setTimeout(120_000);
    const state = await open(page, 'student', '/student/sketchbook?add=1');
    test.skip(state === 'down', 'Nexus not running');
    test.skip(state === 'off', 'student.sketchbook is off in this environment');

    await expect(page.getByRole('heading', { name: 'Drawings', exact: true })).toBeVisible();
    // ?add=1 comes from the reminder. It must survive the hub reading ?view=.
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 30_000 });
    await expect(page).not.toHaveURL(/add=1/);
    await assertNoHorizontalOverflow(page);
  });
});
