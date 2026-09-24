/**
 * Students list header on a phone (375px), after the 2026-09-24 mobile pass.
 *
 *  - the three views (All, By city, Watchlist) fit whole; "Watchlist" was cut
 *    to "Watc" when the strip scrolled;
 *  - Filters, Sort, the layout menu and Select share one row;
 *  - the filter block is not pinned on a phone, where pinned it covered about a
 *    third of the screen while the list scrolled;
 *  - the layout menu switches layouts.
 *
 * Read-only. Run: pnpm test:e2e --project=nexus-chrome --no-deps students-list-nexus-mobile
 */
import { test, expect } from '@playwright/test';
import { injectAuthForPage, APP_URLS } from '../utils/credentials';

const NEXUS = APP_URLS.nexus;

test.use({ viewport: { width: 375, height: 812 } });

test.describe('Students list on a phone', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(120_000);
    const ok = await injectAuthForPage(page, 'teacher');
    test.skip(!ok, 'Teacher test-login unavailable');
    await page.goto(`${NEXUS}/teacher/students`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('tablist', { name: /filter students/i })).toBeVisible({ timeout: 60000 });
  });

  test('the three views fit the phone whole, at 44px', async ({ page }) => {
    const tabs = page.getByRole('tablist', { name: 'Students views' }).getByRole('tab');
    const n = await tabs.count();
    expect(n).toBeGreaterThanOrEqual(2);
    for (let i = 0; i < n; i++) {
      const b = await tabs.nth(i).boundingBox();
      expect(b!.x).toBeGreaterThanOrEqual(0);
      expect(b!.x + b!.width).toBeLessThanOrEqual(375);
      expect(b!.height).toBeGreaterThanOrEqual(44);
    }
    await expect(page.getByRole('tab', { name: 'All Students' })).toHaveAttribute('aria-selected', 'true');
  });

  test('Filters, Sort, layout and Select share one row', async ({ page }) => {
    const layout = page.getByRole('button', { name: 'Change the list layout' });
    await expect(layout).toBeVisible();
    const filters = page.getByRole('button', { name: /^Filters/ }).first();
    const [a, b] = [await filters.boundingBox(), await layout.boundingBox()];
    expect(Math.abs(a!.y - b!.y)).toBeLessThan(8);
    expect(b!.x + b!.width).toBeLessThanOrEqual(375);
  });

  test('the filter block is not pinned on a phone', async ({ page }) => {
    const pinned = await page
      .getByRole('tablist', { name: /filter students/i })
      .evaluate((el) => {
        for (let p: HTMLElement | null = el.parentElement; p; p = p.parentElement) {
          if (getComputedStyle(p).position === 'sticky') return true;
        }
        return false;
      });
    expect(pinned).toBe(false);
  });

  test('the layout menu switches the list layout', async ({ page }) => {
    await page.getByRole('button', { name: 'Change the list layout' }).click();
    const cards = page.getByRole('menuitem', { name: 'Card grid' });
    await expect(cards).toBeVisible();
    // Polled: the menu grows in, so an early measurement is of a scaled box.
    await expect.poll(async () => (await cards.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
    await cards.click();
    await page.getByRole('button', { name: 'Change the list layout' }).click();
    await expect(page.getByRole('menuitem', { name: 'Card grid' })).toHaveClass(/Mui-selected/);
    await page.keyboard.press('Escape');
  });
});
