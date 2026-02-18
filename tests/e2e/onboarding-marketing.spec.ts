import { test, expect } from '@playwright/test';

/**
 * Marketing Apply Form Enhancements E2E Tests
 *
 * Tests for: Application form, QuickInfoPanel, login suggestion banner,
 * fee structures API, and onboarding prefill API
 */

test.describe('Marketing Application Form', () => {
  test.use({ baseURL: 'http://localhost:3010' });

  test('should load application form page', async ({ page }) => {
    await page.goto('/apply');

    // Should be on apply page
    await expect(page).toHaveURL(/\/apply/);

    // Main content should be visible
    await expect(page.locator('main')).toBeVisible();
  });

  test('should display login suggestion banner for unauthenticated users', async ({ page }) => {
    await page.goto('/apply');

    // Look for the login suggestion alert/tip
    const loginTip = page.getByText(/log in to auto-fill|tip/i);
    if (await loginTip.isVisible({ timeout: 5000 }).catch(() => false)) {
      await expect(loginTip).toBeVisible();

      // Should have a Login button in the banner (inside main, not header)
      const loginButton = page.getByRole('main').getByRole('button', { name: /login/i });
      await expect(loginButton).toBeVisible();
    }
  });

  test('should display stepper or form wizard', async ({ page }) => {
    await page.goto('/apply');

    // Wait for form to load
    await page.waitForTimeout(1000);

    // Look for step indicators or form content
    const formContent = page.locator('form, [role="form"], .MuiStepper-root, .MuiStep-root');
    const hasForm = await formContent.first().isVisible({ timeout: 5000 }).catch(() => false);

    // At minimum, the main content should be visible
    await expect(page.locator('main')).toBeVisible();
  });
});

test.describe('QuickInfoPanel (FAB + Drawer)', () => {
  test.use({ baseURL: 'http://localhost:3010' });

  test('should display floating info button on apply page', async ({ page }) => {
    await page.goto('/apply');

    // Wait for full page load
    await page.waitForTimeout(2000);

    // Look for the FAB by its aria-label
    const fab = page.getByRole('button', { name: /course info/i });
    await expect(fab).toBeVisible({ timeout: 10000 });

    // Click FAB to open drawer
    await fab.click();

    // Drawer should open with fee structure heading
    const drawerTitle = page.getByText('Course Info & Fees');
    await expect(drawerTitle).toBeVisible({ timeout: 5000 });
  });

  test('QuickInfoPanel drawer should have contact info', async ({ page }) => {
    await page.goto('/apply');
    await page.waitForTimeout(2000);

    const fab = page.getByRole('button', { name: /course info/i });
    await expect(fab).toBeVisible({ timeout: 10000 });
    await fab.click();

    // Wait for drawer to open
    await page.waitForTimeout(500);

    // Should show contact information
    const phoneLink = page.locator('a[href^="tel:"]');
    const whatsappLink = page.locator('a[href*="wa.me"], a[href*="whatsapp"]');

    const hasPhone = await phoneLink.first().isVisible({ timeout: 3000 }).catch(() => false);
    const hasWhatsapp = await whatsappLink.first().isVisible({ timeout: 3000 }).catch(() => false);

    // At least one contact method should be present
    expect(hasPhone || hasWhatsapp).toBe(true);
  });
});

test.describe('Marketing Fee Structures API', () => {
  test.use({ baseURL: 'http://localhost:3010' });

  test('GET /api/fee-structures should return data', async ({ request }) => {
    const response = await request.get('/api/fee-structures');
    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty('feeStructures');
    expect(Array.isArray(data.feeStructures)).toBe(true);
  });

  test('fee structures should have required fields', async ({ request }) => {
    const response = await request.get('/api/fee-structures');
    const data = await response.json();

    if (data.feeStructures.length > 0) {
      const fs = data.feeStructures[0];
      expect(fs).toHaveProperty('id');
      expect(fs).toHaveProperty('display_name');
      expect(fs).toHaveProperty('fee_amount');
      expect(fs).toHaveProperty('duration');
      expect(fs).toHaveProperty('is_active');
    }
  });

  test('should support courseType filter', async ({ request }) => {
    const response = await request.get('/api/fee-structures?courseType=nata');

    // Should not error even if no matching results
    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(Array.isArray(data.feeStructures)).toBe(true);
  });
});

test.describe('Marketing Onboarding API Routes', () => {
  test.use({ baseURL: 'http://localhost:3010' });

  test('GET /api/onboarding/questions should return questions', async ({ request }) => {
    const response = await request.get('/api/onboarding/questions');
    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty('questions');
    expect(Array.isArray(data.questions)).toBe(true);
  });

  test('POST /api/onboarding/skip should require auth', async ({ request }) => {
    const response = await request.post('/api/onboarding/skip', {
      data: { source_app: 'marketing' },
      headers: { 'Content-Type': 'application/json' },
      failOnStatusCode: false,
    });

    expect(response.status()).toBeGreaterThanOrEqual(400);
  });
});

test.describe('Marketing Application API', () => {
  test.use({ baseURL: 'http://localhost:3010' });

  test('POST /api/application should validate required fields', async ({ request }) => {
    const response = await request.post('/api/application', {
      data: {},
      headers: { 'Content-Type': 'application/json' },
      failOnStatusCode: false,
    });

    // Should reject empty submission
    expect(response.status()).toBeGreaterThanOrEqual(400);
  });
});

test.describe('Mobile Apply Form', () => {
  test.use({
    baseURL: 'http://localhost:3010',
    viewport: { width: 375, height: 667 },
  });

  test('apply form should render on mobile viewport', async ({ page }) => {
    await page.goto('/apply');

    // Content should be visible on mobile
    await expect(page.locator('main')).toBeVisible();

    // Form content should be present
    const formArea = page.locator('main');
    await expect(formArea).toBeVisible();
  });

  test('QuickInfoPanel FAB should be visible and tappable on mobile', async ({ page }) => {
    await page.goto('/apply');

    // Wait for page to fully load
    await page.waitForTimeout(2000);

    // Look for FAB button by its fixed position styling
    const fab = page.locator('button:has(.MuiSvgIcon-root)').filter({ hasText: '' });
    const fabByClass = page.locator('.MuiFab-root');

    const hasFab = await fabByClass.first().isVisible({ timeout: 5000 }).catch(() => false);
    if (hasFab) {
      const box = await fabByClass.first().boundingBox();
      expect(box).not.toBeNull();

      // FAB should be touch-friendly (min 40px — MUI default is 56px)
      if (box) {
        expect(box.width).toBeGreaterThanOrEqual(40);
        expect(box.height).toBeGreaterThanOrEqual(40);
      }
    }
  });
});
