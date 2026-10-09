import { test, expect, type Locator, type Page } from '@playwright/test';
import { assertNoHorizontalOverflow } from '../utils/mobile-helpers';

/**
 * Demo Class v2 on marketing: pick a day + window, then sign in on "Who is
 * joining?" (Google or phone OTP) and answer only class and language.
 *
 * Runs signed out: everything up to the sign-in choice, the header's demo
 * button, the /apply Help entry, the API guards, the /d/{token} fallback and
 * the removed slot-era endpoints. The signed-in booking runs against staging
 * in demo-class-auth-marketing.spec.ts.
 */

const PHONE = { width: 375, height: 812 };

/** A tap target at least this tall (full-width buttons are always wide enough). */
async function expectTall(locator: Locator, min: number) {
  const box = await locator.boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(min);
}

async function openBooking(page: Page) {
  await page.goto('/demo-class', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => sessionStorage.removeItem('neram_demo_draft'));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'When suits you?' })).toBeVisible({ timeout: 30_000 });
}

test.describe('Demo class booking (marketing)', () => {
  test.describe.configure({ timeout: 120_000 });
  test.describe('phone', () => {
    test.use({ viewport: PHONE });

    test('AC1: day + window, then sign in on step 2 of 2', async ({ page }) => {
      await openBooking(page);
      await assertNoHorizontalOverflow(page);

      const continueBtn = page.getByRole('button', { name: 'Continue' });
      await expect(continueBtn).toBeDisabled();

      await page.getByRole('button', { name: /^Tomorrow,/ }).click();
      await page.getByRole('button', { name: /Evening/ }).click();
      await expect(continueBtn).toBeEnabled();
      await continueBtn.click();

      await expect(page.getByRole('heading', { name: 'Who is joining?' })).toBeVisible();
      await expect(page.getByText('Step 2 of 2')).toBeVisible();
      await expect(page.getByText(/Evening \(6 PM to 8:30 PM\)/)).toBeVisible();
      // Signed out: the sign-in choice comes first, the details after.
      await expect(page.getByRole('button', { name: /Continue with Google/ })).toBeVisible();
      await expect(page.getByLabel('Student name')).toHaveCount(0);
      await assertNoHorizontalOverflow(page);
      await expectTall(page.getByRole('button', { name: /Use my phone number/ }), 48);

      await page.getByRole('button', { name: /Use my phone number/ }).click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await expect(page.getByText('Verify Your Phone', { exact: true })).toBeVisible();
    });

    test('AC2: "any time" skips the day', async ({ page }) => {
      await openBooking(page);
      await page.getByRole('button', { name: /Any time works, just call me/ }).click();
      await page.getByRole('button', { name: 'Continue' }).click();
      await expect(page.getByText('Any time, call me')).toBeVisible();
    });

    test('AC3: the draft survives a reload', async ({ page }) => {
      await openBooking(page);
      await page.getByRole('button', { name: /^Tomorrow,/ }).click();
      await page.getByRole('button', { name: /Morning/ }).click();
      await page.getByRole('button', { name: 'Continue' }).click();
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('heading', { name: 'Who is joining?' })).toBeVisible({ timeout: 30_000 });
      await expect(page.getByText(/Morning/)).toBeVisible();
    });

    test('mobile: the drawer offers the free demo above Join Now', async ({ page }) => {
      await page.goto('/', { waitUntil: 'domcontentloaded' });
      await page.getByRole('button', { name: /open menu/i }).click();
      const demo = page.getByRole('link', { name: 'Free demo class' });
      await expect(demo).toBeVisible();
      await expect(demo).toHaveAttribute('href', /\/demo-class$/);
      await expectTall(demo, 48);
    });

    test('mobile: choices are at least 44px tall', async ({ page }) => {
      await openBooking(page);
      for (const name of [/^Tomorrow,/, /Any time works/]) {
        const box = await page.getByRole('button', { name }).first().boundingBox();
        expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
      }
    });

    test('mobile: lower sections fit the screen', async ({ page }) => {
      await page.goto('/demo-class', { waitUntil: 'domcontentloaded' });
      await page.getByRole('heading', { name: /Why students choose Neram/ }).scrollIntoViewIfNeeded();
      await assertNoHorizontalOverflow(page);
      await expect(page.getByRole('button', { name: 'Book your free demo' }).first()).toBeVisible();
    });
  });

  test('desktop: "Free demo" sits beside Join Now and the header never overflows', async ({ page }) => {
    for (const width of [1440, 1280, 1100]) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto('/', { waitUntil: 'domcontentloaded' });
      const demo = page.getByRole('banner').getByRole('link', { name: 'Free demo', exact: true });
      await expect(demo).toBeVisible();
      await expect(demo).toHaveAttribute('href', /\/demo-class$/);
      await assertNoHorizontalOverflow(page);
    }
    // Too narrow for both: the button steps aside, nothing wraps or scrolls.
    await page.setViewportSize({ width: 1024, height: 800 });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('banner').getByRole('link', { name: 'Free demo', exact: true })).toBeHidden();
    await assertNoHorizontalOverflow(page);
    // Not on the demo page itself.
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/demo-class', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('banner').getByRole('link', { name: 'Free demo', exact: true })).toHaveCount(0);
  });

  test('/apply Help menu books a free demo without losing the application', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/apply', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /help/i }).click();
    const item = page.getByRole('menuitem', { name: 'Book a free demo class' });
    await expect(item).toBeVisible();
    await expect(item).toHaveAttribute('href', /\/demo-class\?from=apply_help$/);
  });

  test('desktop: no overflow and FAQ structured data', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/demo-class', { waitUntil: 'domcontentloaded' });
    await assertNoHorizontalOverflow(page);
    const ld = await page.locator('script[type="application/ld+json"]').allTextContents();
    expect(ld.some((t) => t.includes('FAQPage'))).toBe(true);
  });

  test('API: booking needs a signed-in user', async ({ request }) => {
    const res = await request.post('/api/demo-class/request', { data: { window: 'anytime', name: 'x' } });
    expect(res.status()).toBe(401);
    const mine = await request.get('/api/demo-class/mine');
    expect((await mine.json()).signedIn).toBe(false);
  });

  test('API: public settings never expose host mailboxes', async ({ request }) => {
    const res = await request.get('/api/demo-class/settings');
    const body = await res.json();
    expect(body.settings).not.toHaveProperty('hosts');
    expect(body.settings.schedule?.windows?.length).toBeGreaterThan(0);
  });

  test('slot-era endpoints are gone (status?phone leaked bookings)', async ({ request }) => {
    for (const path of ['/api/demo-class/status?phone=9876543210', '/api/demo-class/slots', '/api/demo-class/register']) {
      const res = await request.get(path);
      expect(res.status(), path).toBe(404);
    }
  });

  test('/d/{unknown token} offers to book', async ({ page }) => {
    await page.goto('/d/notarealtokennotarealtoken', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'We could not find this demo link' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Book a free demo' })).toBeVisible();
  });
});
