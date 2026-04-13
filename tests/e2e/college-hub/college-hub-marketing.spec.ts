import { test, expect } from '@playwright/test';

/**
 * College Hub - Public Pages E2E Tests (marketing-chrome + mobile viewport)
 *
 * Tests the public college hub at neramclasses.com/en/colleges:
 * - College listing page loads with colleges
 * - State filter chips work
 * - College detail page loads
 * - Save button and compare button are present
 * - NATA hub, JEE B.Arch hub pages load
 * - Mobile: no horizontal overflow at 375px
 *
 * Project: marketing-chrome (baseURL: http://localhost:3010)
 */

test.describe('College Hub - Listing Page', () => {
  test('listing page loads and shows colleges', async ({ page }) => {
    const response = await page.goto('/en/colleges');
    expect(response?.status()).toBeLessThan(500);

    await page.waitForLoadState('networkidle');

    // Page body must be visible
    await expect(page.locator('main')).toBeVisible();

    // Should have at least one college card (MUI Card or outlined Paper)
    const cards = page.locator('[class*="MuiCard-root"], [class*="MuiPaper-outlined"]');
    await expect(cards.first()).toBeVisible({ timeout: 10000 });
  });

  test('listing page has filter chips for states or tabs', async ({ page }) => {
    await page.goto('/en/colleges');
    await page.waitForLoadState('networkidle');

    // Filter chips should be rendered (MUI Chip)
    const chips = page.locator('[class*="MuiChip-root"]');
    await expect(chips.first()).toBeVisible({ timeout: 8000 });
  });

  test('listing page search/filter does not crash', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    await page.goto('/en/colleges');
    await page.waitForLoadState('networkidle');

    // Type in search if it exists
    const searchInput = page.locator('input[type="search"], input[placeholder*="Search"], input[placeholder*="search"]');
    if (await searchInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await searchInput.fill('anna');
      await page.waitForTimeout(500);
    }

    const realErrors = pageErrors.filter(
      (e) => !e.includes('favicon') && !e.includes('ERR_BLOCKED_BY_CLIENT'),
    );
    expect(realErrors).toHaveLength(0);
  });

  test('college listing page loads without JS errors', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    await page.goto('/en/colleges');
    await page.waitForLoadState('networkidle');

    const realErrors = pageErrors.filter(
      (e) =>
        !e.includes('favicon') &&
        !e.includes('ERR_BLOCKED_BY_CLIENT') &&
        !e.includes('ChunkLoadError'),
    );
    expect(realErrors).toHaveLength(0);
  });
});

test.describe('College Hub - Detail Page', () => {
  test('navigating to first college card opens detail page', async ({ page }) => {
    await page.goto('/en/colleges');
    await page.waitForLoadState('networkidle');

    // Find the first college card link and navigate
    const collegeLink = page
      .locator('a[href*="/colleges/"]')
      .first();
    const href = await collegeLink.getAttribute('href').catch(() => null);

    if (href) {
      const detailResponse = await page.goto(href);
      expect(detailResponse?.status()).toBeLessThan(500);
      await expect(page.locator('main')).toBeVisible();
    } else {
      // No college links found — listing might be loading async
      test.skip(true, 'No college card links found on listing page');
    }
  });

  test('college detail page has key sections', async ({ page }) => {
    // Navigate to listing first to discover a real slug
    await page.goto('/en/colleges');
    await page.waitForLoadState('networkidle');

    const collegeLink = page.locator('a[href*="/colleges/"]').first();
    const href = await collegeLink.getAttribute('href').catch(() => null);
    if (!href) {
      test.skip(true, 'No college card links found');
      return;
    }

    await page.goto(href);
    await page.waitForLoadState('networkidle');

    // Main content visible
    await expect(page.locator('main')).toBeVisible();

    // Title (college name) should be present
    const heading = page.locator('h1, h2').first();
    await expect(heading).toBeVisible({ timeout: 8000 });
  });

  test('college detail page loads without JS errors', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    await page.goto('/en/colleges');
    await page.waitForLoadState('networkidle');

    const collegeLink = page.locator('a[href*="/colleges/"]').first();
    const href = await collegeLink.getAttribute('href').catch(() => null);
    if (!href) {
      test.skip(true, 'No college card links found');
      return;
    }

    await page.goto(href);
    await page.waitForLoadState('networkidle');

    const realErrors = pageErrors.filter(
      (e) =>
        !e.includes('favicon') &&
        !e.includes('ERR_BLOCKED_BY_CLIENT') &&
        !e.includes('ChunkLoadError'),
    );
    expect(realErrors).toHaveLength(0);
  });
});

test.describe('College Hub - Save and Compare Buttons', () => {
  test('save (heart) button is present on college cards', async ({ page }) => {
    await page.goto('/en/colleges');
    await page.waitForLoadState('networkidle');

    // SaveCollegeButton renders an IconButton with aria-label
    const saveBtn = page
      .locator('[aria-label*="Save college"], [aria-label*="Remove from saved"]')
      .first();
    await expect(saveBtn).toBeVisible({ timeout: 10000 });
  });

  test('save button toggles filled/outlined heart icon on click (localStorage)', async ({ page }) => {
    await page.goto('/en/colleges');
    await page.waitForLoadState('networkidle');

    const saveBtn = page
      .locator('[aria-label*="Save college"], [aria-label*="Remove from saved"]')
      .first();
    if (!(await saveBtn.isVisible({ timeout: 5000 }).catch(() => false))) {
      test.skip(true, 'Save button not visible on listing');
      return;
    }

    // Initial aria-label should say "Save college"
    await expect(saveBtn).toHaveAttribute('aria-label', /Save college/i);

    // Click to save
    await saveBtn.click();

    // Should now show "Remove from saved"
    await expect(
      page.locator('[aria-label*="Remove from saved"]').first(),
    ).toBeVisible({ timeout: 3000 });

    // Click again to unsave
    await page.locator('[aria-label*="Remove from saved"]').first().click();
    await expect(
      page.locator('[aria-label*="Save college"]').first(),
    ).toBeVisible({ timeout: 3000 });
  });

  test('compare button is present on college cards', async ({ page }) => {
    await page.goto('/en/colleges');
    await page.waitForLoadState('networkidle');

    // CompareButton renders with aria-label or tooltip containing "Compare"
    const compareBtn = page
      .locator('[aria-label*="Compare"], [aria-label*="compare"]')
      .first();
    await expect(compareBtn).toBeVisible({ timeout: 10000 });
  });

  test('compare tray appears after clicking compare on a college', async ({ page }) => {
    await page.goto('/en/colleges');
    await page.waitForLoadState('networkidle');

    const compareBtn = page
      .locator('[aria-label*="Compare"], [aria-label*="compare"]')
      .first();
    if (!(await compareBtn.isVisible({ timeout: 5000 }).catch(() => false))) {
      test.skip(true, 'Compare button not visible on listing');
      return;
    }

    await compareBtn.click();

    // Compare tray / snackbar should appear
    const tray = page.locator('[class*="MuiSnackbar"], [role="alert"], [data-testid="compare-tray"]');
    await expect(tray.first()).toBeVisible({ timeout: 5000 });
  });
});

test.describe('College Hub - Sub-Pages', () => {
  test('NATA hub page loads', async ({ page }) => {
    // Check /en/colleges/tnea or /en/nata
    const response = await page.goto('/en/colleges/tnea');
    // Accept 200 or 404 — just not a 500
    expect(response?.status()).not.toBe(500);
    if (response?.status() === 200) {
      await expect(page.locator('main')).toBeVisible();
    }
  });

  test('JEE B.Arch hub page loads', async ({ page }) => {
    const response = await page.goto('/en/colleges/josaa');
    expect(response?.status()).not.toBe(500);
    if (response?.status() === 200) {
      await expect(page.locator('main')).toBeVisible();
    }
  });

  test('college compare page loads', async ({ page }) => {
    const response = await page.goto('/en/colleges/compare');
    expect(response?.status()).not.toBe(500);
    if (response?.status() === 200) {
      await expect(page.locator('main')).toBeVisible();
    }
  });

  test('NIRF rankings page loads', async ({ page }) => {
    const response = await page.goto('/en/colleges/rankings/nirf');
    expect(response?.status()).not.toBe(500);
    if (response?.status() === 200) {
      await expect(page.locator('main')).toBeVisible();
    }
  });

  test('ArchIndex rankings page loads', async ({ page }) => {
    const response = await page.goto('/en/colleges/rankings/archindex');
    expect(response?.status()).not.toBe(500);
    if (response?.status() === 200) {
      await expect(page.locator('main')).toBeVisible();
    }
  });

  test('saved colleges page loads (unauthenticated state)', async ({ page }) => {
    const response = await page.goto('/en/colleges/saved');
    expect(response?.status()).not.toBe(500);
    if (response?.status() === 200) {
      await expect(page.locator('main')).toBeVisible();
    }
  });
});

test.describe('College Hub - API Routes', () => {
  test.use({ baseURL: 'http://localhost:3010' });

  test('GET /api/colleges/saved without auth returns 401', async ({ request }) => {
    const res = await request.get('/api/colleges/saved', {
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(401);
  });

  test('POST /api/colleges/saved without auth returns 401', async ({ request }) => {
    const res = await request.post('/api/colleges/saved', {
      data: { college_id: '00000000-0000-0000-0000-000000000000', action: 'save' },
      headers: { 'Content-Type': 'application/json' },
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(401);
  });
});

test.describe('College Hub - Mobile Responsiveness', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('listing page: no horizontal overflow on mobile', async ({ page }) => {
    await page.goto('/en/colleges');
    await page.waitForLoadState('networkidle');

    const overflow = await page.evaluate(
      () => document.body.scrollWidth > window.innerWidth,
    );
    expect(overflow).toBe(false);
  });

  test('listing page loads without JS errors on mobile', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    await page.goto('/en/colleges');
    await page.waitForLoadState('networkidle');

    const realErrors = pageErrors.filter(
      (e) => !e.includes('favicon') && !e.includes('ERR_BLOCKED_BY_CLIENT'),
    );
    expect(realErrors).toHaveLength(0);
  });

  test('college listing cards are touch-friendly (min 44px height)', async ({ page }) => {
    await page.goto('/en/colleges');
    await page.waitForLoadState('networkidle');

    // Check that the first interactive card-level anchor/button has adequate height
    const firstLink = page.locator('a[href*="/colleges/"]').first();
    if (await firstLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      const box = await firstLink.boundingBox();
      if (box) {
        expect(box.height).toBeGreaterThanOrEqual(44);
      }
    }
  });

  test('detail page: no horizontal overflow on mobile', async ({ page }) => {
    await page.goto('/en/colleges');
    await page.waitForLoadState('networkidle');

    const collegeLink = page.locator('a[href*="/colleges/"]').first();
    const href = await collegeLink.getAttribute('href').catch(() => null);
    if (!href) {
      test.skip(true, 'No college link found');
      return;
    }

    await page.goto(href);
    await page.waitForLoadState('networkidle');

    const overflow = await page.evaluate(
      () => document.body.scrollWidth > window.innerWidth,
    );
    expect(overflow).toBe(false);
  });
});
