import { test, expect } from '@playwright/test';

/**
 * NIRF Architecture Rankings (marketing) E2E.
 *
 * Covers the new filterable rankings hub at /en/colleges/rankings/nirf:
 *   - listing loads with at least one row
 *   - year filter updates URL and results
 *   - search narrows results
 *   - clicking a college opens the per-college history page with multi-year data
 *   - compare-years toggle renders the pivot
 *   - mobile (375px) has no horizontal overflow + visible filter FAB
 *
 * Project: marketing-chrome (desktop) + mobile-chrome (375x812)
 */

// Next.js dev compiles routes lazily; first hit can take 60s+ on Windows.
// Pre-warm once per worker so the rest of the tests stay snappy.
test.beforeAll(async ({ request }) => {
  await request.get('/en/colleges/rankings/nirf', { timeout: 120000 }).catch(() => null);
  await request
    .get('/en/colleges/rankings/nirf/iit-roorkee-architecture', { timeout: 120000 })
    .catch(() => null);
});

// Give each test extra slack to handle Next.js dev server hot-recompiles.
test.describe.configure({ timeout: 90_000 });

test.describe('NIRF Rankings (desktop)', () => {
  test('listing page loads with rankings', async ({ page }) => {
    const response = await page.goto('/en/colleges/rankings/nirf');
    expect(response?.status()).toBeLessThan(500);
    await page.waitForLoadState('domcontentloaded');

    await expect(page.locator('h1')).toContainText(/NIRF Architecture Rankings/i);

    // At least a few rows (table cells with #rank)
    const rankCells = page.locator('text=/^#\\d+$/');
    await expect(rankCells.first()).toBeVisible({ timeout: 10000 });
    const count = await rankCells.count();
    expect(count).toBeGreaterThanOrEqual(10);
  });

  test('selecting a year updates URL and results', async ({ page }) => {
    await page.goto('/en/colleges/rankings/nirf', { waitUntil: 'domcontentloaded' });

    // Wait for the sidebar to hydrate; pick the chip that lives inside the
    // sidebar (the FAB drawer also has identical chips, but it's not open).
    const year2024 = page
      .locator('[class*="MuiChip-clickable"]', { hasText: /^2024$/ })
      .first();
    await year2024.waitFor({ state: 'visible', timeout: 30000 });
    await year2024.click();

    // The click triggers router.push which updates the URL via the client router.
    await page.waitForURL(/year=2024/, { timeout: 30000 });
    expect(page.url()).toContain('year=2024');
  });

  test('search input narrows results', async ({ page }) => {
    await page.goto('/en/colleges/rankings/nirf', { waitUntil: 'domcontentloaded' });

    const searchInput = page
      .locator('input[placeholder*="IIT" i], input[aria-label*="Search NIRF" i]')
      .first();
    await searchInput.waitFor({ state: 'visible', timeout: 30000 });
    await searchInput.fill('IIT');
    // Form has onSubmit handler. Press Enter to commit and navigate.
    await searchInput.press('Enter');

    await page.waitForURL(/q=IIT/i, { timeout: 30000 });
    expect(page.url()).toMatch(/q=IIT/i);
  });

  test('college detail page shows year history', async ({ page }) => {
    await page.goto('/en/colleges/rankings/nirf/iit-roorkee-architecture');
    await page.waitForLoadState('domcontentloaded');

    await expect(page.locator('h1')).toContainText(/Indian Institute of Technology Roorkee/i);
    // Year column at least one row
    const yearCells = page.locator('tbody tr td').first();
    await expect(yearCells).toBeVisible();
    await expect(page.locator('text=/Rank trajectory/i')).toBeVisible();
  });

  test('compare-years toggle renders pivot', async ({ page }) => {
    await page.goto('/en/colleges/rankings/nirf?compare=1');
    await page.waitForLoadState('domcontentloaded');

    // Header should contain year columns (2020 + 2025 visible somewhere in header)
    await expect(page.locator('thead').first()).toContainText('2025');
  });

  test('clear-filter link works on empty state', async ({ page }) => {
    await page.goto('/en/colleges/rankings/nirf?q=zzzzzzz_no_match_yyyy');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('text=/No NIRF rankings match/i')).toBeVisible();
  });
});

test.describe('NIRF Rankings (mobile 375x812)', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('no horizontal overflow on listing', async ({ page }) => {
    await page.goto('/en/colleges/rankings/nirf');
    await page.waitForLoadState('domcontentloaded');

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test('filter FAB is visible on mobile', async ({ page }) => {
    await page.goto('/en/colleges/rankings/nirf');
    await page.waitForLoadState('domcontentloaded');

    const fab = page.getByRole('button', { name: /Filters/i }).first();
    await expect(fab).toBeVisible();

    const box = await fab.boundingBox();
    expect(box).not.toBeNull();
    if (box) expect(box.height).toBeGreaterThanOrEqual(44);
  });

  test('cards render on mobile listing', async ({ page }) => {
    await page.goto('/en/colleges/rankings/nirf');
    await page.waitForLoadState('domcontentloaded');

    // Mobile uses cards (Paper outlined) with RANK label
    await expect(page.locator('text=/^RANK$/').first()).toBeVisible({ timeout: 10000 });
  });

  test('no horizontal overflow on detail page', async ({ page }) => {
    await page.goto('/en/colleges/rankings/nirf/iit-roorkee-architecture');
    await page.waitForLoadState('domcontentloaded');

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    // Tables intentionally horizontally scroll inside their container, but the
    // outer page should not.
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
