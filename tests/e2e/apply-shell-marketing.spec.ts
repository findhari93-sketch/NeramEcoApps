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
    // The wordmark: the shell's only link outside the legal strip. It replaces an
    // assertion on the Tools link, which lived in the form body and was removed on
    // 2026-10-04 so the funnel stops offering a free product to someone already
    // filling in the form. A link in the body was never a shell link anyway.
    await expect(page.locator('header a[href="/ta"]')).toHaveCount(1);
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

  test('the header offers Log in on /apply and it opens the sign-in dialog', async ({ page }) => {
    await page.goto(`${MARKETING_URL}/apply`);
    const login = page.getByRole('banner').getByRole('button', { name: /log in/i });
    await expect(login).toBeVisible();
    await login.click();
    await expect(page.getByRole('dialog')).toBeVisible();
  });

  test('/pay has no Log in button, because nothing there registers one', async ({ page }) => {
    await page.goto(`${MARKETING_URL}/pay?app=NERAM-0000-00000`);
    await expect(page.getByRole('banner')).toBeVisible();
    await expect(page.getByRole('banner').getByRole('button', { name: /log in/i })).toHaveCount(0);
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

  test('the header and the action bar stick while the step scrolls', async ({ page }) => {
    await page.goto(`${MARKETING_URL}/apply`);
    await page.getByRole('button', { name: /type it myself/i }).click();
    await expect(page.locator('input[name="firstName"]')).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 600));
    await page.waitForTimeout(300);
    const banner = (await page.getByRole('banner').boundingBox())!;
    expect(Math.round(banner.y), 'the header stays at the top').toBe(0);
    const cta = (await page.locator('button.MuiButton-contained:visible').first().boundingBox())!;
    expect(cta.y + cta.height, 'the primary button rides the bottom edge').toBeLessThanOrEqual(812);
    expect(cta.y, 'the primary button is on screen').toBeGreaterThan(400);
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
