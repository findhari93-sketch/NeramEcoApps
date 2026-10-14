import { test, expect, type Page } from '@playwright/test';
import { assertNoHorizontalOverflow, assertTouchTargetSize } from '../../utils/mobile-helpers';

/**
 * College Hub Phase 3 (Claude Design canvas): category pages on the shared
 * directory, the Colleges mega menu, and the phone browse panel on /colleges.
 *
 * Public pages, no auth. Project: marketing-chrome (baseURL http://localhost:3010).
 */

const COA = '/en/colleges/accreditation/coa-approved';

function collectErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  return () => errors.filter((e) => !e.includes('favicon') && !e.includes('ERR_BLOCKED_BY_CLIENT'));
}

test.describe('Category pages: desktop', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('AC1: COA page keeps its H1, locks the category and explains it', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto(COA);
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('h1')).toHaveText('COA Approved Architecture Colleges');
    const rail = page.getByRole('region', { name: 'Filters' });
    await expect(rail.getByText('COA approved only')).toBeVisible();
    // The page's own filter is not offered again.
    await expect(rail.getByRole('switch')).toHaveCount(0);

    await page.getByRole('button', { name: 'Why COA approval matters' }).click();
    await expect(page.getByText('You need a degree from an approved college to register as an architect')).toBeVisible();

    const related = page.getByRole('navigation', { name: 'Related categories' });
    await expect(related.getByRole('link')).not.toHaveCount(0);
    await expect(related.getByRole('link', { name: 'COA approved', exact: true })).toHaveCount(0);
    await assertNoHorizontalOverflow(page);
    expect(errors()).toEqual([]);
  });

  test('AC2: state filter narrows the list and unlocks cities', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto(COA);
    const rail = page.getByRole('region', { name: 'Filters' });
    await expect(rail.getByText('Pick one state to filter by city.')).toBeVisible();
    // A tick before hydration never reaches the URL, so retry until it does.
    const tn = rail.getByRole('checkbox', { name: /^Tamil Nadu \d+$/ });
    await expect(async () => {
      await tn.setChecked(false);
      await tn.check();
      await expect(page).toHaveURL(/state=tamil-nadu/, { timeout: 3000 });
    }).toPass({ timeout: 60_000 });
    await expect(rail.getByText('Pick one state to filter by city.')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Remove filter: Tamil Nadu' })).toBeVisible();
    for (const t of await page.locator('article p').filter({ hasText: /, / }).first().allTextContents()) expect(t).toContain('Tamil Nadu');
  });

  test('AC3: long lists page with "Show N more colleges"', async ({ page }) => {
    await page.goto(COA);
    const cards = page.locator('ol[aria-label="Colleges"] > li article');
    const before = await cards.count();
    const more = page.getByRole('button', { name: /^Show \d+ more college/ });
    if (await more.count()) {
      await more.click();
      await expect.poll(() => cards.count()).toBeGreaterThan(before);
    } else {
      expect(before).toBeLessThanOrEqual(24);
    }
  });

  test('AC4: city page has no state filter and locks the city', async ({ page }) => {
    await page.goto('/en/colleges/city/chennai');
    const rail = page.getByRole('region', { name: 'Filters' });
    await expect(rail.getByText(/^City: /)).toBeVisible();
    await expect(rail.getByRole('group', { name: 'State' })).toHaveCount(0);
  });

  test('AC5: every category route renders the directory', async ({ page }) => {
    // Four routes; each may compile on first hit in dev.
    test.setTimeout(240_000);
    for (const path of ['/en/colleges/type/government', '/en/colleges/fees/below-3-lakhs', '/en/colleges/tnea', '/en/colleges/accreditation/naac-a-plus']) {
      const res = await page.goto(path);
      expect(res?.status(), path).toBe(200);
      await expect(page.locator('h1'), path).toHaveCount(1);
      await expect(page.getByRole('region', { name: 'Filters' }).getByText('This page shows'), path).toBeVisible();
      expect(await page.content(), path).not.toMatch(/will be updated soon|N\/A/);
    }
  });

  test('AC6: Colleges mega menu searches and links to real pages', async ({ page }) => {
    await page.goto('/en/colleges/tamil-nadu');
    await page.getByRole('button', { name: /^Colleges/ }).first().click();
    const menu = page.getByRole('region', { name: 'Colleges menu' });
    await expect(menu).toBeVisible();
    await expect(menu.getByRole('navigation', { name: 'Your tools' }).getByRole('link')).toHaveCount(4);
    // No emoji left in the menu.
    expect(await menu.textContent()).not.toMatch(/\p{Extended_Pictographic}/u);
    await menu.getByLabel('Search colleges').fill('anna');
    await menu.getByLabel('Search colleges').press('Enter');
    // The URL changes when the navigation commits; a cold /colleges compile takes ~10s in dev.
    await expect(page).toHaveURL(/\/colleges\?q=anna#browse$/, { timeout: 20000 });
  });
});

test.describe('Category pages and browse: phone (375px)', () => {
  test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });

  test('mobile: category header with state chips', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto(COA);
    await expect(page.locator('h1')).toHaveCount(1);
    const chips = page.getByRole('list', { name: 'Filter by state' });
    await expect(chips.getByRole('button', { name: 'All India' })).toHaveAttribute('aria-pressed', 'true');
    await chips.getByRole('button', { name: 'Tamil Nadu' }).click();
    await expect(page).toHaveURL(/state=tamil-nadu/);
    await expect(page.getByText(/^Showing \d+ in Tamil Nadu$/)).toBeVisible();
    await assertNoHorizontalOverflow(page);
    await assertTouchTargetSize(page, 'ul[aria-label="Filter by state"] button', 36);
    expect(errors()).toEqual([]);
  });

  test('mobile: browse panel on /colleges switches between state, exam and rankings', async ({ page }) => {
    await page.goto('/en/colleges');
    const panel = page.getByRole('region', { name: 'Browse colleges' });
    await expect(panel).toBeVisible();
    await expect(panel.getByRole('navigation', { name: 'Colleges by state' }).getByRole('link').first()).toBeVisible();
    await panel.getByRole('button', { name: 'Exam' }).click();
    await expect(panel.getByRole('link', { name: /NATA colleges/ })).toBeVisible();
    await panel.getByRole('button', { name: 'Rankings' }).click();
    await expect(panel.getByRole('link', { name: /COA approved/ })).toBeVisible();
    await assertNoHorizontalOverflow(page);
    await assertTouchTargetSize(page, 'section[aria-labelledby="mobile-browse-title"] a');
  });

  test('desktop does not show the phone browse panel', async ({ browser }) => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.goto('/en/colleges');
    await expect(page.getByRole('region', { name: 'Browse colleges' })).toBeHidden();
    await page.close();
  });
});
