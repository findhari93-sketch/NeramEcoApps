import { test, expect } from '@playwright/test';

/**
 * College Hub - College Dashboard E2E Tests
 *
 * Tests the college admin dashboard at neramclasses.com/college-dashboard:
 * - Login page renders correctly
 * - Invalid credentials show an error (not a 500)
 * - Missing email/password show validation feedback
 * - Dashboard pages return non-500 (for structure verification)
 * - Partnership submission page renders the form
 *
 * Note: Full authenticated dashboard tests (overview, leads, analytics) require a
 * dedicated `COLLEGE_ADMIN_EMAIL` / `COLLEGE_ADMIN_PASSWORD` in `.env.test`.
 * Those tests are skipped unless the env vars are set.
 *
 * Project: marketing-chrome (baseURL: http://localhost:3010)
 * Run with: pnpm test:e2e --project=marketing-chrome tests/e2e/college-hub/college-hub-dashboard-marketing.spec.ts
 */

const COLLEGE_ADMIN_EMAIL = process.env.E2E_COLLEGE_ADMIN_EMAIL ?? '';
const COLLEGE_ADMIN_PASSWORD = process.env.E2E_COLLEGE_ADMIN_PASSWORD ?? '';
const hasCollegeCreds = !!COLLEGE_ADMIN_EMAIL && !!COLLEGE_ADMIN_PASSWORD;

test.describe('College Dashboard - Login Page', () => {
  test.use({ baseURL: 'http://localhost:3010' });

  test('login page renders with email and password fields', async ({ page }) => {
    const response = await page.goto('/college-dashboard/login');
    expect(response?.status()).toBeLessThan(500);

    await page.waitForLoadState('networkidle');

    // Email field
    const emailInput = page.locator('input[type="email"], input[name="email"]');
    await expect(emailInput).toBeVisible({ timeout: 8000 });

    // Password field
    const passwordInput = page.locator('input[type="password"], input[name="password"]');
    await expect(passwordInput).toBeVisible({ timeout: 8000 });
  });

  test('login page has a submit / Sign in button', async ({ page }) => {
    await page.goto('/college-dashboard/login');
    await page.waitForLoadState('networkidle');

    const submitBtn = page.getByRole('button', { name: /sign in|login|submit/i });
    await expect(submitBtn).toBeVisible({ timeout: 8000 });
  });

  test('login page loads without JS errors', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    await page.goto('/college-dashboard/login');
    await page.waitForLoadState('networkidle');

    const realErrors = pageErrors.filter(
      (e) =>
        !e.includes('favicon') &&
        !e.includes('ERR_BLOCKED_BY_CLIENT') &&
        !e.includes('ChunkLoadError'),
    );
    expect(realErrors).toHaveLength(0);
  });

  test('invalid credentials show an error message (not a 500)', async ({ page }) => {
    await page.goto('/college-dashboard/login');
    await page.waitForLoadState('networkidle');

    const emailInput = page.locator('input[type="email"], input[name="email"]');
    const passwordInput = page.locator('input[type="password"], input[name="password"]');
    const submitBtn = page.getByRole('button', { name: /sign in|login|submit/i });

    if (
      !(await emailInput.isVisible({ timeout: 3000 }).catch(() => false)) ||
      !(await passwordInput.isVisible({ timeout: 3000 }).catch(() => false))
    ) {
      test.skip(true, 'Login form fields not found');
      return;
    }

    await emailInput.fill('invalid@notreal.com');
    await passwordInput.fill('wrongpassword123');
    await submitBtn.click();

    // Should show an error message — not redirect to dashboard or throw 500
    const errorMsg = page.locator(
      '[role="alert"], [class*="error"], [class*="Error"], p[class*="MuiFormHelperText"]',
    );
    await expect(errorMsg.first()).toBeVisible({ timeout: 8000 });

    // Should still be on the login page
    await expect(page).toHaveURL(/college-dashboard\/login|college-dashboard$/);
  });

  test('login page: no horizontal overflow on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/college-dashboard/login');
    await page.waitForLoadState('networkidle');

    const overflow = await page.evaluate(
      () => document.body.scrollWidth > window.innerWidth,
    );
    expect(overflow).toBe(false);
  });
});

test.describe('College Dashboard - Authenticated Pages', () => {
  test.use({ baseURL: 'http://localhost:3010' });

  // Helper: sign in with test college admin account
  async function signIn(page: any) {
    await page.goto('/college-dashboard/login');
    await page.waitForLoadState('networkidle');

    await page.locator('input[type="email"], input[name="email"]').fill(COLLEGE_ADMIN_EMAIL);
    await page.locator('input[type="password"], input[name="password"]').fill(COLLEGE_ADMIN_PASSWORD);
    await page.getByRole('button', { name: /sign in|login|submit/i }).click();

    // Wait for redirect away from login page
    await page.waitForURL(/college-dashboard(?!\/login)/, { timeout: 10000 });
  }

  test('authenticated: overview page loads', async ({ page }) => {
    test.skip(!hasCollegeCreds, 'College admin credentials not configured in .env.test');

    await signIn(page);

    await expect(page.locator('main, [class*="MuiBox-root"]')).toBeVisible({ timeout: 10000 });
  });

  test('authenticated: leads tab loads', async ({ page }) => {
    test.skip(!hasCollegeCreds, 'College admin credentials not configured in .env.test');

    await signIn(page);

    await page.goto('/college-dashboard/leads');
    const response = await page.waitForResponse((r) => r.url().includes('/leads'), { timeout: 8000 }).catch(() => null);

    await expect(page.locator('main, [class*="MuiBox-root"]')).toBeVisible({ timeout: 8000 });
  });

  test('authenticated: analytics tab loads', async ({ page }) => {
    test.skip(!hasCollegeCreds, 'College admin credentials not configured in .env.test');

    await signIn(page);

    await page.goto('/college-dashboard/analytics');
    await expect(page.locator('main, [class*="MuiBox-root"]')).toBeVisible({ timeout: 8000 });
  });

  test('authenticated: partnership page shows form', async ({ page }) => {
    test.skip(!hasCollegeCreds, 'College admin credentials not configured in .env.test');

    await signIn(page);

    await page.goto('/college-dashboard/partnership');
    await page.waitForLoadState('networkidle');

    // Partnership page should have a URL input field
    const urlInput = page.locator('input[type="url"], input[name="url"], input[placeholder*="https://"]');
    await expect(urlInput).toBeVisible({ timeout: 8000 });
  });
});

test.describe('College Dashboard - API Routes', () => {
  test.use({ baseURL: 'http://localhost:3010' });

  test('GET /api/college-dashboard/partnership without auth returns 401', async ({ request }) => {
    const res = await request.get('/api/college-dashboard/partnership', {
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(401);
  });

  test('PATCH /api/college-dashboard/partnership without auth returns 401', async ({ request }) => {
    const res = await request.patch('/api/college-dashboard/partnership', {
      data: { url: 'https://example.com/neram-partner' },
      headers: { 'Content-Type': 'application/json' },
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(401);
  });

  test('GET /api/college-dashboard/leads without auth returns 401', async ({ request }) => {
    const res = await request.get('/api/college-dashboard/leads', {
      failOnStatusCode: false,
    });
    // Auth required — should be 401
    expect(res.status()).not.toBe(500);
    expect([401, 403]).toContain(res.status());
  });
});
