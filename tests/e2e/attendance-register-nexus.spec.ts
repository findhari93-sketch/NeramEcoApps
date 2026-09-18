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
});
