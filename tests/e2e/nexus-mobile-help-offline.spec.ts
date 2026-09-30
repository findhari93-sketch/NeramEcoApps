import { test, expect, type Page } from '@playwright/test';
import { assertNoHorizontalOverflow, assertTouchTargetSize } from '../utils/mobile-helpers';

/**
 * The way out for a student who cannot get into Nexus.
 *
 * A student opened the installed app with no connection and got Android's own
 * "Can't connect to the site" box with only OK. Nexus now serves /offline in its
 * place (service worker fallback), and /help lets anyone reach staff without a
 * Microsoft sign-in. These run signed out, because that is the whole point.
 *
 * The service worker itself is off in `next dev`, so the fallback is checked by
 * hand on a production build (see the plan). Here: the screens, their links and
 * the form, at phone width first.
 *
 *   PW_APPS=nexus pnpm test:e2e --project=nexus-mobile --no-deps nexus-mobile-help-offline
 */

test.use({ storageState: { cookies: [], origins: [] } });

const WIDTHS = [375, 768, 1280];

async function atWidth(page: Page, width: number) {
  await page.setViewportSize({ width, height: 812 });
}

test.describe('Nexus offline rescue screen', () => {
  test('explains the problem and offers Try again, WhatsApp and Call', async ({ page }) => {
    await page.goto('/offline');

    await expect(page.getByRole('heading', { level: 1, name: "Can't connect to Nexus" })).toBeVisible();
    await expect(page.getByRole('alert').filter({ hasText: "Can't connect to Nexus" })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Quick fixes' })).toBeVisible();

    const whatsApp = page.getByRole('link', { name: 'WhatsApp us' });
    await expect(whatsApp).toHaveAttribute('href', /^https:\/\/wa\.me\/919176137043\?text=.*Nexus/);
    await expect(page.getByRole('link', { name: 'Call us' })).toHaveAttribute('href', 'tel:+919176137043');

    // Counting down to the next automatic check, announced politely.
    await expect(page.getByText(/Checking again in \d+ seconds/)).toBeVisible();
  });

  test('offers the help form only while the phone is online', async ({ page, context }) => {
    await page.goto('/offline');
    await expect(page.getByRole('link', { name: 'Send a help request with a screenshot' })).toBeVisible();

    await context.setOffline(true);
    await expect(page.getByRole('link', { name: 'Send a help request with a screenshot' })).toBeHidden();
    await expect(page.getByText('Your phone is not connected to the internet.', { exact: false })).toBeVisible();
    await context.setOffline(false);
  });

  for (const width of WIDTHS) {
    test(`fits and has 44px+ targets at ${width}px`, async ({ page }) => {
      await atWidth(page, width);
      await page.goto('/offline');
      await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
      await assertNoHorizontalOverflow(page);
      await assertTouchTargetSize(page, 'main button, a[href^="https://wa.me"], a[href^="tel:"], a[href^="/help"]');
    });
  }
});

test.describe('Nexus help form (no sign-in)', () => {
  test('sends a request and shows the ticket number', async ({ page }) => {
    let sent: Record<string, unknown> | null = null;
    await page.route('**/api/help', async (route) => {
      sent = route.request().postDataJSON();
      await route.fulfill({ json: { ok: true, ticketNumber: 'NERAM-TKT-00123', teams: 'posted' } });
    });

    await page.goto('/help?problem=cant_open&from=%2Fstudent%2Fdashboard');
    await expect(page.getByRole('heading', { level: 1, name: 'Get help' })).toBeVisible();
    await expect(page.getByRole('radio', { name: "Can't open the app" })).toHaveAttribute('aria-checked', 'true');

    await page.getByLabel(/Your name/).fill('Santhosh V');
    await page.getByLabel(/Mobile number/).fill('98765 43210');
    await page.getByLabel(/What happened/).fill('It says cannot connect to the site');
    await page.getByRole('button', { name: 'Send request' }).click();

    await expect(page.getByRole('heading', { name: 'Sent to the Neram team' })).toBeVisible();
    await expect(page.getByText('NERAM-TKT-00123')).toBeVisible();
    await expect(page.getByText('+919876543210', { exact: false })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Done' })).toHaveAttribute('href', '/student/dashboard');

    expect(sent).toMatchObject({ name: 'Santhosh V', phone: '98765 43210', problem: 'cant_open', pageUrl: '/student/dashboard' });
    expect(sent!.device).toEqual(expect.any(String));
  });

  test('shows what is missing next to each field', async ({ page }) => {
    let called = false;
    await page.route('**/api/help', async (route) => {
      called = true;
      await route.fulfill({ json: { ok: true, ticketNumber: 'X', teams: 'posted' } });
    });

    await page.goto('/help');
    await page.getByRole('button', { name: 'Send request' }).click();

    await expect(page.getByText('Please enter your name.')).toBeVisible();
    await expect(page.getByText('Please enter a 10 digit mobile number we can call.')).toBeVisible();
    await expect(page.getByText('Please choose what is wrong.')).toBeVisible();
    expect(called).toBe(false);
  });

  test('falls back to WhatsApp and Call when sending fails', async ({ page }) => {
    await page.route('**/api/help', (route) =>
      route.fulfill({ status: 500, json: { ok: false, error: 'We could not send that. Please WhatsApp or call us instead.' } }),
    );
    await page.goto('/help?problem=cant_sign_in');
    await page.getByLabel(/Your name/).fill('Priya');
    await page.getByLabel(/Mobile number/).fill('9876543210');
    await page.getByRole('button', { name: 'Send request' }).click();

    await expect(page.getByRole('alert').filter({ hasText: 'We could not send that' })).toBeVisible();
    await expect(page.getByText('Or reach us directly')).toBeVisible();
    await expect(page.getByRole('link', { name: 'WhatsApp us' })).toBeVisible();
  });

  test('a crafted ?from= cannot send Back off the site', async ({ page }) => {
    await page.goto('/help?from=https%3A%2F%2Fevil.example');
    await expect(page.getByRole('link', { name: 'Back' })).toHaveAttribute('href', '/login');
  });

  for (const width of WIDTHS) {
    test(`fits and has 44px+ targets at ${width}px`, async ({ page }) => {
      await atWidth(page, width);
      await page.goto('/help');
      await expect(page.getByRole('button', { name: 'Send request' })).toBeVisible();
      await assertNoHorizontalOverflow(page);
      await assertTouchTargetSize(page, 'form button[type="submit"], [role="radio"], a[href^="https://wa.me"], a[href^="tel:"]');
    });
  }
});

test.describe('Ways into /help', () => {
  test('the login page offers "Can\'t sign in? Get help"', async ({ page }) => {
    await page.goto('/login');
    const link = page.getByRole('link', { name: "Can't sign in? Get help" });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('href', '/help?problem=cant_sign_in&from=%2Flogin');
  });
});
