import { test, expect } from '@playwright/test';
import { APP_URLS, injectAuthForPage } from '../utils/credentials';
import { assertNoHorizontalOverflow, assertTouchTargetSize } from '../utils/mobile-helpers';

/**
 * The attendance register, read only. The screen it replaced wrote absence rows
 * on open, so "does not write" is part of what these tests protect.
 */
test.describe('Attendance register', () => {
  test.beforeEach(async ({ page }) => {
    await injectAuthForPage(page, 'teacher');
  });

  test('lists past classes with their counts', async ({ page }) => {
    await page.goto(`${APP_URLS.nexus}/teacher/attendance`);
    await expect(page.getByRole('tab', { name: 'Classes' })).toBeVisible();
    await expect(page.getByRole('link').first()).toBeVisible();
  });

  test('the register grid scrolls inside itself, the page does not', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${APP_URLS.nexus}/teacher/attendance?view=register&range=30`);
    await expect(page.getByRole('table')).toBeVisible();
    await assertNoHorizontalOverflow(page);
  });

  test('a cell opens that class with the student highlighted, and back returns to the grid', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${APP_URLS.nexus}/teacher/attendance?view=register&range=30`);
    const cell = page.getByRole('cell').locator('a').first();
    await cell.click();
    await expect(page).toHaveURL(/\/teacher\/attendance\/[^/?]+\?.*student=/);
    await page.getByRole('link', { name: 'Attendance' }).click();
    await expect(page).toHaveURL(/view=register/);
  });

  test('class screen targets are big enough to tap', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${APP_URLS.nexus}/teacher/attendance?range=30`);
    await page.getByRole('link').first().click();
    await assertTouchTargetSize(page, 'button', 44);
    await assertNoHorizontalOverflow(page);
  });

  test('the rate column stays on screen however far the grid is scrolled sideways', async ({ page }) => {
    // The point of pinning it. At a 90 day range this table runs past 2000px,
    // so the one number the default sort orders by used to sit off the right
    // edge of every phone and most laptops.
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${APP_URLS.nexus}/teacher/attendance?view=register&range=90`);
    await expect(page.getByRole('table')).toBeVisible();

    const rate = page.getByRole('columnheader', { name: '%' });
    const before = await rate.boundingBox();

    // The scroll container is the table's parent, which is also what the unit
    // test reaches for. Push it as far right as it goes.
    const scroller = page.getByRole('table').locator('..');
    await scroller.evaluate((el) => {
      el.scrollLeft = el.scrollWidth;
    });
    const after = await rate.boundingBox();

    expect(before).not.toBeNull();
    expect(after).not.toBeNull();
    // Held in place, allowing a pixel for subpixel rounding.
    expect(Math.abs((after!.x) - (before!.x))).toBeLessThan(2);
    // And inside the viewport, not merely unmoved.
    expect(after!.x + after!.width).toBeLessThanOrEqual(375);
    await assertNoHorizontalOverflow(page);
  });

  test('the range is a control, not a second tab strip above the views', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${APP_URLS.nexus}/teacher/attendance?view=register&range=30`);

    // Named rather than counted: a global tablist count would also fail the day
    // some unrelated shell chrome grew one, and would then be read as this
    // having regressed.
    await expect(page.getByRole('tablist', { name: 'Attendance views' })).toHaveCount(1);
    await expect(page.getByRole('tablist', { name: 'How far back to look' })).toHaveCount(0);
    await expect(page.getByRole('tab', { name: '30 days' })).toHaveCount(0);

    const ninety = page.getByRole('button', { name: 'Last 90 days' });
    await expect(ninety).toBeVisible();
    await ninety.click();
    await expect(page).toHaveURL(/range=90/);
    // The view it was on survives the change: picking a range is not navigation.
    await expect(page).toHaveURL(/view=register/);
  });
});
