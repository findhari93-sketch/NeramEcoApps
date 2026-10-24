import { test, expect, type Page } from '@playwright/test';
import { APP_URLS } from '../utils/credentials';
import { assertNoHorizontalOverflow } from '../utils/mobile-helpers';

/**
 * Admin > Demo classes on a phone, and the sidebar badge.
 *
 * The badge counts the desk's calls to make (v2 requests, new or back from Try
 * later), never old v1 registrations the desk does not show. Below 1200px the
 * details replace the list: tapping a student shows their panel at the top with
 * a Back button, and Back returns to the list. Below 600px each row stacks, so
 * nothing scrolls sideways.
 *
 * UI tests read real rows and skip when the runner has no Microsoft session.
 *
 * Run: pnpm test:e2e --project="admin-chrome" --no-deps tests/e2e/demo-desk-mobile-admin.spec.ts
 */

const ADMIN = APP_URLS.admin;

async function open(page: Page) {
  await page.goto(`${ADMIN}/demo-classes`, { waitUntil: 'domcontentloaded' });
  const state = await Promise.race([
    page.getByRole('heading', { name: /Demo classes/ }).first().waitFor({ timeout: 45_000 }).then(() => 'page'),
    page.getByRole('button', { name: 'Sign in with Microsoft' }).waitFor({ timeout: 45_000 }).then(() => 'login'),
  ]).catch(() => 'none');
  test.skip(state !== 'page' || /\/login|microsoftonline/.test(page.url()), 'No Microsoft session on this runner');
}

/** Opens the first tab that has a student in it; skips when every tab is empty. */
async function firstRow(page: Page) {
  const table = page.getByRole('table', { name: 'Demo students' });
  for (const tab of await page.getByRole('tab').all()) {
    if (/\(0\)/.test((await tab.textContent()) ?? '')) continue;
    await tab.click();
    await table.locator('tbody tr').first().waitFor({ timeout: 15_000 });
    return table.locator('tbody tr').first();
  }
  test.skip(true, 'No demo requests on this environment');
  throw new Error('unreachable');
}

test.describe('Demo desk on a phone @admin', () => {
  test.describe.configure({ timeout: 120_000 });

  test('API: the badge never counts more than the desk can show', async ({ request }) => {
    const [badges, desk] = await Promise.all([request.get(`${ADMIN}/api/admin-badges`), request.get(`${ADMIN}/api/demo-requests`)]);
    test.skip(desk.status() !== 200, 'Demo desk API needs a staff session on this runner');
    expect(badges.status()).toBe(200);
    const { demo_classes } = await badges.json();
    const { requests } = await desk.json();
    const newOnDesk = requests.filter((r: { status: string }) => r.status === 'pending').length;
    const callableOnDesk = requests.filter((r: { status: string }) => r.status === 'pending' || r.status === 'contacted').length;
    expect(demo_classes).toBeGreaterThanOrEqual(newOnDesk);
    expect(demo_classes).toBeLessThanOrEqual(callableOnDesk);
  });

  test('375px: rows stack with no sideways scroll', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await open(page);
    const row = await firstRow(page);
    await expect(row.getByRole('link', { name: /^Call / })).toBeInViewport();
    await assertNoHorizontalOverflow(page);
  });

  test('375px: a student opens at the top, Back returns to the list', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await open(page);
    const row = await firstRow(page);
    await row.click();

    const back = page.getByRole('button', { name: /^Back to / });
    await expect(back).toBeVisible();
    await expect(back).toBeInViewport();
    await expect(page.getByRole('button', { name: 'Close details' })).toBeInViewport({ timeout: 15_000 });
    await expect(page.getByRole('table', { name: 'Demo students' })).toBeHidden();
    await assertNoHorizontalOverflow(page);

    await back.click();
    await expect(page).toHaveURL(/\/demo-classes$/);
    await expect(page.getByRole('table', { name: 'Demo students' })).toBeVisible();
  });

  test('375px: the phone Back gesture closes the student', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await open(page);
    await (await firstRow(page)).click();
    await expect(page).toHaveURL(/\?id=/);
    await page.goBack();
    await expect(page).toHaveURL(/\/demo-classes$/);
    await expect(page.getByRole('table', { name: 'Demo students' })).toBeVisible();
  });

  test('1280px: list and details stay side by side', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await open(page);
    await (await firstRow(page)).click();
    await expect(page.getByRole('button', { name: 'Close details' })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('table', { name: 'Demo students' })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Back to / })).toBeHidden();
  });
});
