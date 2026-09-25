import { test, expect, type Page } from '@playwright/test';

/**
 * Lead attribution on the marketing site (2026-09-25).
 *
 * - A campaign landing stores utm_* and gclid in the neram_attribution cookie.
 * - A callback form on another page, in a fresh tab, posts that campaign with
 *   the lead. /api/callback is intercepted, so no test lead reaches the DB.
 * - /sso never forwards a visitor (or a sign-in token) to a foreign host.
 *
 * Run: PW_APPS=marketing pnpm test:e2e tests/e2e/attribution-marketing.spec.ts --project=marketing-chrome --no-deps
 */

const CAMPAIGN = '?utm_source=google&utm_medium=cpc&utm_campaign=tn_authority&gclid=e2eGclid';

async function readAttributionCookie(page: Page) {
  const cookie = (await page.context().cookies()).find((c) => c.name === 'neram_attribution');
  return cookie ? JSON.parse(decodeURIComponent(cookie.value)) : null;
}

test.describe('Marketing lead attribution', () => {
  test('a campaign landing stores the campaign in a first-party cookie', async ({ page }) => {
    await page.goto(`/fees${CAMPAIGN}`);
    await expect.poll(() => readAttributionCookie(page)).toMatchObject({
      utm_source: 'google',
      utm_medium: 'cpc',
      utm_campaign: 'tn_authority',
      gclid: 'e2eGclid',
      landing_page: '/fees',
    });
  });

  test('a callback request from a fresh tab carries the landing campaign', async ({ page, context }) => {
    await page.goto(`/fees${CAMPAIGN}`);
    await expect.poll(() => readAttributionCookie(page)).not.toBeNull();

    const tab = await context.newPage();
    let posted: Record<string, unknown> | null = null;
    await tab.route('**/api/callback', async (route) => {
      posted = route.request().postDataJSON();
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"success":true}' });
    });

    await tab.goto('/counseling/tnea-barch');
    await tab.waitForLoadState('networkidle');
    await tab.getByRole('button', { name: 'Get TNEA Counselling Guidance' }).first().click();
    await tab.getByLabel('Your name').fill('E2E Attribution');
    await tab.getByLabel('Mobile (10-digit Indian)').fill('9000000001');
    await tab.getByRole('button', { name: 'Request Callback' }).click();

    await expect.poll(() => posted).not.toBeNull();
    expect(posted).toMatchObject({
      utm_source: 'google',
      utm_medium: 'cpc',
      utm_campaign: 'tn_authority',
      gclid: 'e2eGclid',
    });
  });

  test('a direct visitor posts no attribution keys', async ({ page }) => {
    let posted: Record<string, unknown> | null = null;
    await page.route('**/api/callback', async (route) => {
      posted = route.request().postDataJSON();
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"success":true}' });
    });

    await page.goto('/counseling/tnea-barch');
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: 'Get TNEA Counselling Guidance' }).first().click();
    await page.getByLabel('Your name').fill('E2E Direct');
    await page.getByLabel('Mobile (10-digit Indian)').fill('9000000002');
    await page.getByRole('button', { name: 'Request Callback' }).click();

    await expect.poll(() => posted).not.toBeNull();
    expect(Object.keys(posted!)).not.toContain('utm_source');
    expect(Object.keys(posted!)).not.toContain('gclid');
  });

  test('/sso refuses to send a visitor to a foreign host', async ({ page }) => {
    const visited: string[] = [];
    await page.route('https://attacker.example/**', async (route) => {
      visited.push(route.request().url());
      await route.fulfill({ status: 200, contentType: 'text/html', body: 'attacker' });
    });
    await page.route('http://localhost:3011/**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'text/html', body: 'app' });
    });

    await page.goto('/sso?redirect=https%3A%2F%2Fattacker.example%2Fsteal');
    // Match on the host: the starting URL itself contains "attacker.example" in ?redirect=
    await page.waitForURL((url) => url.host !== 'localhost:3010', { timeout: 30_000 });

    expect(visited).toEqual([]);
    expect(new URL(page.url()).host).toBe('localhost:3011');
  });
});

test.describe('Marketing lead attribution, mobile', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('mobile: the campaign cookie is set and the page does not overflow', async ({ page }) => {
    await page.goto(`/counseling/tnea-barch${CAMPAIGN}`);
    await expect.poll(() => readAttributionCookie(page)).toMatchObject({ utm_source: 'google' });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
