import { test, expect, type Page } from '@playwright/test';

/**
 * Ads ROI page (admin), with the API mocked.
 * Skips when the runner cannot get past Microsoft sign-in (see the MFA note in CLAUDE.md).
 * Run: pnpm test:e2e --project="admin-chrome" --no-deps tests/e2e/admin-ads-roi.spec.ts
 */

const ADMIN_BASE = 'http://localhost:3013';
const tier = (c: number, s: number) => ({ confirmed: c, said_google_ad: s });
const month = (m: string, over: Record<string, unknown> = {}) => ({
  month: m,
  spend: null,
  spendSource: null,
  signups: tier(0, 0),
  demosBooked: tier(0, 0),
  demosAttended: tier(0, 0),
  joined: tier(0, 0),
  fees: tier(0, 0),
  returnPerRupee: null,
  alsoSaidGoogle: 0,
  people: [],
  ...over,
});
const report = {
  generatedAt: '2026-10-15T00:00:00Z',
  months: [
    month('2026-08'),
    month('2026-09', { alsoSaidGoogle: 3 }),
    month('2026-10', {
      spend: 6480,
      spendSource: 'manual',
      signups: tier(2, 1),
      demosBooked: tier(1, 0),
      alsoSaidGoogle: 10,
      people: [{ userId: 'u1', name: 'Asha', phoneLast4: '3210', tier: 'confirmed', stage: 'demo_booked', demoBooked: true, demoAttended: false, joined: false, feesPaid: 0 }],
    }),
  ],
  total: { spend: 6480, signups: tier(2, 1), demosBooked: tier(1, 0), demosAttended: tier(0, 0), joined: tier(0, 0), fees: tier(0, 0), returnPerRupee: { confirmed: 0, withSaid: 0 }, alsoSaidGoogle: 10 },
};

async function open(page: Page) {
  await page.route('**/api/marketing-ai/roi', (r) => r.fulfill({ json: report }));
  await page.goto(`${ADMIN_BASE}/marketing-ai/roi`);
  const rendered = await page.locator('main h1, h1').first().waitFor({ timeout: 20_000 }).then(() => true, () => false);
  return rendered && !/login|microsoftonline/.test(page.url());
}

test.describe('Ads ROI page', () => {
  test('shows months with both tiers and opens the students behind a number', async ({ page }) => {
    test.skip(!(await open(page)), 'No Microsoft session on this runner');
    await expect(page.getByRole('heading', { name: 'Ads ROI' })).toBeVisible();
    await expect(page.getByText('Not entered')).toBeVisible();
    await expect(page.getByText('Aug 2026')).toHaveCount(0);
    await page.getByRole('button', { name: /Demos booked in Oct 2026/ }).click();
    await expect(page.getByText('Asha, phone ending 3210')).toBeVisible();
  });

  test('saving spend sends the month and amount', async ({ page }) => {
    let body: any = null;
    await page.route('**/api/marketing-ai/roi/spend', async (route) => {
      body = route.request().postDataJSON();
      await route.fulfill({ json: { spend: { '2026-10': 6500 } } });
    });
    test.skip(!(await open(page)), 'No Microsoft session on this runner');
    await page.getByLabel('Month').fill('2026-10');
    await page.getByLabel('Spent (₹)').fill('6500');
    await page.getByRole('button', { name: 'Save spend' }).click();
    await expect.poll(() => body).toEqual({ month: '2026-10', amount: 6500 });
  });

  test('at 1024px the page does not scroll sideways', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 900 });
    test.skip(!(await open(page)), 'No Microsoft session on this runner');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
