import { test, expect, type Page } from '@playwright/test';
import { assertNoHorizontalOverflow } from '../utils/mobile-helpers';

/**
 * Demo Class v2 on marketing: pick a day + window, add details, sign in last.
 *
 * Runs signed out: everything up to the sign-in gate, the API guards, the
 * /d/{token} fallback and the removed slot-era endpoints. Booking itself needs a
 * Firebase session and the 20261110 migrations, and is covered by the admin
 * spec plus a manual staging pass.
 */

const PHONE = { width: 375, height: 812 };

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

    test('AC1: day + window, details, then the sign-in gate', async ({ page }) => {
      await openBooking(page);
      await assertNoHorizontalOverflow(page);

      const continueBtn = page.getByRole('button', { name: 'Continue' });
      await expect(continueBtn).toBeDisabled();

      await page.getByRole('button', { name: /^Tomorrow,/ }).click();
      await page.getByRole('button', { name: /Evening/ }).click();
      await expect(continueBtn).toBeEnabled();
      await continueBtn.click();

      await expect(page.getByRole('heading', { name: 'Who is joining?' })).toBeVisible();
      await page.getByLabel('Student name').fill('E2E Demo Student');
      await page.getByRole('button', { name: 'Class 12' }).click();
      await expect(page.getByRole('switch', { name: /A parent will join too/ }).or(page.getByLabel('A parent will join too'))).toBeChecked();
      await page.getByRole('button', { name: 'Continue' }).click();

      await expect(page.getByRole('heading', { name: 'Get your demo link' })).toBeVisible();
      await expect(page.getByText(/Evening \(6 PM to 8:30 PM\)/)).toBeVisible();
      await expect(page.getByText(/with a parent/)).toBeVisible();

      await page.getByRole('button', { name: 'Sign in to get your demo link' }).click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await expect(page.getByRole('dialog').getByText(/Continue with Google/)).toBeVisible();
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
      await page.getByLabel('Student name').fill('Draft Keeper');
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('heading', { name: 'Who is joining?' })).toBeVisible({ timeout: 30_000 });
      await expect(page.getByLabel('Student name')).toHaveValue('Draft Keeper');
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
