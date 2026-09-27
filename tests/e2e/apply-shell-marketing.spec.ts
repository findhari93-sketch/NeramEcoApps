import { test, expect } from '@playwright/test';
import { assertNoHorizontalOverflow, assertTouchTargetSize } from '../utils/mobile-helpers';

/**
 * The application shell: /apply, /pay and /enroll render without the
 * marketing chrome (no nav, no footer, nothing floating), in every locale.
 */
const MARKETING_URL = process.env.E2E_MARKETING_URL || 'http://localhost:3010';

test.describe('Application shell', () => {
  test('the home page keeps the marketing chrome', async ({ page }) => {
    await page.goto(`${MARKETING_URL}/`);
    await expect(page.locator('header.MuiAppBar-root').first()).toBeVisible();
    await expect(page.locator('footer').first()).toBeVisible();
  });

  for (const path of ['/apply', '/ta/apply']) {
    test(`${path} renders inside the application shell`, async ({ page }) => {
      await page.goto(`${MARKETING_URL}${path}`);
      await expect(page.getByRole('banner')).toBeVisible();
      await expect(page.locator('header.MuiAppBar-root')).toHaveCount(0);
      await expect(page.locator('footer.MuiBox-root a[href="/about"], footer a[href^="/colleges"]')).toHaveCount(0);
      await expect(page.getByRole('button', { name: /course info|fees/i })).toHaveCount(0);
      const fixedButtons = await page.evaluate(() =>
        Array.from(document.querySelectorAll('button, a')).filter((el) => getComputedStyle(el).position === 'fixed').length,
      );
      expect(fixedButtons, 'no floating buttons in the shell').toBe(0);
      await expect(page.getByRole('link', { name: /terms|விதிமுறைகள்/i })).toBeVisible();
      await expect(page.getByRole('link', { name: /refund|பணத்திரும்ப/i })).toBeVisible();
    });
  }

  test('shell links keep the Tamil locale', async ({ page }) => {
    await page.goto(`${MARKETING_URL}/ta/apply`);
    await expect(page.locator('footer a[href="/ta/terms"]')).toHaveCount(1);
    await expect(page.locator('footer a[href="/ta/refund-policy"]')).toHaveCount(1);
    await expect(page.locator('a[href="/ta/tools"]')).toHaveCount(1);
  });

  test('/pay?app= renders inside the application shell', async ({ page }) => {
    await page.goto(`${MARKETING_URL}/pay?app=NERAM-0000-00000`);
    await expect(page.getByRole('banner')).toBeVisible();
    await expect(page.locator('header.MuiAppBar-root')).toHaveCount(0);
  });

  test('Help opens a menu with a phone number and the contact page', async ({ page }) => {
    await page.goto(`${MARKETING_URL}/apply`);
    await page.getByRole('button', { name: /help/i }).click();
    await expect(page.getByRole('menuitem', { name: /call us/i })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: /contact/i })).toBeVisible();
  });
});

test.describe('Application shell on a phone', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('no horizontal overflow and 44 px targets', async ({ page }) => {
    await page.goto(`${MARKETING_URL}/apply`);
    await page.getByRole('button', { name: /type it myself/i }).click();
    await assertNoHorizontalOverflow(page);
    await assertTouchTargetSize(page, 'button:visible, a[href]:visible', 44);
  });

  test('exactly one primary button per step, and none while choosing how to start', async ({ page }) => {
    await page.goto(`${MARKETING_URL}/apply`);
    await expect(page.getByRole('button', { name: /type it myself/i })).toBeVisible();
    await expect(page.locator('button.MuiButton-contained:visible')).toHaveCount(0);
    await page.getByRole('button', { name: /type it myself/i }).click();
    await expect(page.locator('button.MuiButton-contained:visible')).toHaveCount(1);
  });

  test('the legal strip is not hidden under the action bar at the end of the page', async ({ page }) => {
    await page.goto(`${MARKETING_URL}/apply`);
    await page.getByRole('button', { name: /type it myself/i }).click();
    await expect(page.locator('input[name="firstName"]')).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const terms = page.locator('footer a[href$="/terms"]');
    await expect(terms).toBeInViewport();
    const box = (await terms.boundingBox())!;
    const hit = await page.evaluate(([x, y]) => {
      const el = document.elementFromPoint(x, y);
      return !!el?.closest('footer a');
    }, [box.x + box.width / 2, box.y + box.height / 2]);
    expect(hit, 'the Terms link receives the tap').toBe(true);
  });
});
