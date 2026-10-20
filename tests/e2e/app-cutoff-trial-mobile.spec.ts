/**
 * Tools App: the NATA cutoff calculator's free trial for signed-out visitors.
 *
 *   AC1: the public page keeps the server-rendered demo, with a
 *        "Use the full calculator free" button (crawlers see the same page)
 *   AC2: a deep link with values (?board=&marks=…) opens the full calculator
 *        filled in, as a trial
 *   AC3: two different calculations are free; the third is blurred behind
 *        the sign-in card, with no number rendered
 *   AC4: "Ask which colleges take …" links to /ask with the score and values
 *   Mobile: no sideways scroll at 375px
 *
 * The trial counter is per device (localStorage), so each test starts clean.
 * Run: pnpm test:e2e tests/e2e/app-cutoff-trial-mobile.spec.ts --project=mobile-chrome --no-deps
 */
import { test, expect, type Page } from '@playwright/test';
import { assertNoHorizontalOverflow } from '../utils/mobile-helpers';

const APP_URL = process.env.E2E_APP_URL || 'http://localhost:3011';
const PAGE = `${APP_URL}/tools/nata/cutoff-calculator`;

test.use({ storageState: { cookies: [], origins: [] } });
// Several full page loads per test on a dev server.
test.setTimeout(150_000);

/** Opens a prefilled link and waits past the 1.2s settle that counts a run. */
async function openRun(page: Page, marks: number) {
  await page.goto(`${PAGE}?board=CBSE&max=500&marks=${marks}&a=50&b=60`, { waitUntil: 'networkidle' });
  await expect(page.getByRole('heading', { name: 'Board Exam Details' }).first()).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(2000);
}

test.describe('Cutoff calculator free trial (guest)', () => {
  test('AC1: the public page keeps the demo and offers the trial', async ({ page, request }) => {
    const html = await (await request.get(PAGE)).text();
    expect(html).toContain('NATA Cutoff Calculator');
    await page.goto(PAGE);
    await expect(page.getByRole('button', { name: 'Use the full calculator free' })).toBeVisible();
    await expect(page.getByText('2 free calculations left, no sign-in needed', { exact: false })).toBeVisible();
  });

  test('AC2 + AC3: two free calculations, the third is locked', async ({ page }) => {
    await openRun(page, 400);
    await expect(page.getByText('Free trial: 1 of 2 calculations left on this device', { exact: false })).toBeVisible();

    await openRun(page, 410);
    await expect(page.getByText('That was your last free calculation on this device', { exact: false })).toBeVisible();
    await expect(page.getByText('You have used your 2 free calculations')).toHaveCount(0);

    await openRun(page, 420);
    // Laptop: the locked card sits beside the inputs. Phone: the result lives on
    // the last step, so the sticky bar hides the number instead.
    await expect(page.getByText('You have used your free calculations', { exact: false })).toBeVisible();
    const lockedCard = page.getByText('You have used your 2 free calculations');
    const stickyLock = page.getByText('Sign in to see', { exact: true });
    await expect(lockedCard.or(stickyLock).first()).toBeVisible();
    // Going back to an earlier calculation stays free.
    await openRun(page, 400);
    await expect(page.getByRole('spinbutton', { name: 'Marks Secured' })).toHaveValue('400');
    await expect(page.getByText('You have used your 2 free calculations')).toHaveCount(0);
    await expect(page.getByText('Sign in to see', { exact: true })).toHaveCount(0);
  });

  test('AC4: the result links to Ask aiArchitek with the score', async ({ page }) => {
    await openRun(page, 450);
    // On a phone the result sits on the last step; the sticky bar jumps there.
    const details = page.getByRole('button', { name: 'See details' });
    if (await details.isVisible()) await details.click();
    const link = page.getByRole('link', { name: /Ask which colleges take \d+ out of 400/ }).first();
    await expect(link).toBeVisible();
    const href = (await link.getAttribute('href')) ?? '';
    expect(href).toMatch(/^\/ask\?q=/);
    expect(href).toContain('board=CBSE');
    expect(href).toContain('marks=450');
  });

  test('mobile: no sideways scroll on the demo or the trial', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(PAGE);
    await assertNoHorizontalOverflow(page);
    await openRun(page, 400);
    await assertNoHorizontalOverflow(page);
  });
});
