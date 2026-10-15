import { test, expect, type Page } from '@playwright/test';
import { assertNoHorizontalOverflow, assertTouchTargetSize } from '../../utils/mobile-helpers';

/**
 * College page redesign (canvas: Desktop · College page, Mobile · College page):
 * hero with KPI strip, sticky section tabs, admission steps, fees, location,
 * similar colleges, inline admission help form, phone action bar.
 *
 * Public page, no auth. Project: marketing-chrome (baseURL http://localhost:3010).
 * The lead form is only checked for validation; nothing is submitted.
 */

async function firstCollegePath(page: Page): Promise<string> {
  await page.goto('/en/colleges/tamil-nadu');
  const href = await page.locator('article h3 a, ol[aria-label="Colleges"] li a').first().getAttribute('href');
  expect(href).toBeTruthy();
  return href!;
}

function collectErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  return () => errors.filter((e) => !e.includes('favicon') && !e.includes('ERR_BLOCKED_BY_CLIENT'));
}

test.describe('College page: desktop', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('AC1: hero with one H1, summary, quick facts and actions', async ({ page }) => {
    const path = await firstCollegePath(page);
    const errors = collectErrors(page);
    await page.goto(path);
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('#college-summary')).toBeVisible();
    const kpis = page.locator('dl[aria-label="Quick facts"]');
    await expect(kpis).toBeVisible();
    await expect(kpis.getByText('Annual fee')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Get admission help' }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'Report a correction' })).toBeVisible();
    expect(await page.content()).not.toMatch(/N\/A|—/);
    await assertNoHorizontalOverflow(page);
    expect(errors()).toEqual([]);
  });

  test('AC2: section tabs jump to their section and mark it current', async ({ page }) => {
    await page.goto(await firstCollegePath(page));
    const tabs = page.getByRole('navigation', { name: 'On this page' });
    await expect(tabs).toBeVisible();
    await tabs.getByRole('link', { name: 'Location' }).click();
    await expect(page).toHaveURL(/#location$/);
    await expect(page.getByRole('heading', { name: 'Location and contact' })).toBeInViewport();
    await expect(tabs.getByRole('link', { name: 'Location' })).toHaveAttribute('aria-current', 'true');
  });

  test('AC3: admission steps, eligibility and fees render', async ({ page }) => {
    await page.goto(await firstCollegePath(page));
    const admission = page.locator('#admission');
    await expect(admission.getByRole('heading', { name: 'How to get in' })).toBeVisible();
    await expect(admission.locator('ol > li')).toHaveCount(4);
    await expect(admission.getByRole('heading', { name: 'Eligibility' })).toBeVisible();
    await expect(page.locator('#fees').getByText('Fees can differ by quota and category.')).toBeVisible();
  });

  test('AC4: the admission form validates before sending', async ({ page }) => {
    await page.goto(await firstCollegePath(page));
    const form = page.locator('#admission-help');
    await form.getByRole('button', { name: 'Request a call back' }).click();
    await expect(form.getByRole('alert')).toContainText('valid 10-digit mobile number');
    await form.getByLabel('Mobile number').fill('98abc');
    await expect(form.getByLabel('Mobile number')).toHaveValue('98');
  });

  test('AC5: compare from the college page and from similar colleges', async ({ page }) => {
    await page.addInitScript(() => {
      if (!sessionStorage.getItem('__reset')) {
        localStorage.removeItem('neram_compare_colleges');
        sessionStorage.setItem('__reset', '1');
      }
    });
    await page.goto(await firstCollegePath(page));
    const compare = page.getByRole('button', { name: 'Compare', exact: true }).first();
    await compare.click();
    await expect(page.getByRole('button', { name: 'Added to compare' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('compare-tray').first()).toContainText('1 of 4');

    const similar = page.getByRole('button', { name: /^Compare .+ with these$/ });
    if (await similar.count()) {
      await similar.click();
      // The compare page can take a while to compile in dev.
      await expect(page).toHaveURL(/\/colleges\/compare\?slugs=[^,]+,/, { timeout: 20_000 });
    }
  });
});

test.describe('College page: phone (375px)', () => {
  test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });

  test('mobile: action bar replaces the hub nav, no overflow, 44px targets', async ({ page }) => {
    const path = await firstCollegePath(page);
    const errors = collectErrors(page);
    await page.goto(path);
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.getByRole('navigation', { name: 'College hub' })).toHaveCount(0);
    const bar = page.getByRole('link', { name: 'Get admission help' }).last();
    await expect(bar).toBeVisible();
    await assertNoHorizontalOverflow(page);
    await assertTouchTargetSize(page, 'nav[aria-label="On this page"] a');
    await assertTouchTargetSize(page, '#college-faqs .MuiAccordionSummary-root');
    await bar.click();
    await expect(page.locator('#admission-help')).toBeInViewport();
    expect(errors()).toEqual([]);
  });
});
