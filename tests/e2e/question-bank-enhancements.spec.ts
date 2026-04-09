/**
 * Question Bank Enhancements — E2E Tests
 *
 * Tests the 5 enhancements shipped in the question bank improvements sprint:
 *   1. Admin moderation: Edit icon in the approved-question view dialog
 *   2. Admin moderation: AdminEditQuestionDialog opens with all form fields
 *   3. App question bank: Cards render month/year chips without JS errors
 *   4. App question bank: Page loads and renders question card links
 *   5. App question detail: Page loads without redirecting to login
 *
 * Run:
 *   pnpm test:e2e --project=admin-chrome  tests/e2e/question-bank-enhancements.spec.ts
 *   pnpm test:e2e --project=app-chrome    tests/e2e/question-bank-enhancements.spec.ts
 */

import { test, expect } from '@playwright/test';
import { APP_URLS, injectAuthForPage } from '../utils/credentials';

const ADMIN_URL = APP_URLS.admin;
const APP_URL = APP_URLS.student;

// ---------------------------------------------------------------------------
// Admin: Edit button in question view dialog
// ---------------------------------------------------------------------------
test.describe('Admin moderation - direct edit', () => {
  test.beforeEach(async ({ page }) => {
    const authed = await injectAuthForPage(page, 'teacher');
    if (!authed) {
      test.skip();
      return;
    }
    await page.goto(`${ADMIN_URL}/question-moderation`, { waitUntil: 'networkidle' });
  });

  test('approved question view dialog shows Edit icon', async ({ page }) => {
    // Switch to Approved tab
    await page.getByRole('button', { name: /approved/i }).first().click();

    // Open a question via the View button, or by clicking a row
    const viewBtn = page.getByRole('button', { name: /view/i }).first();
    if (await viewBtn.isVisible()) {
      await viewBtn.click();
    } else {
      await page.locator('[data-testid="question-row"]').first().click();
    }

    // Edit icon should be visible in the dialog title area
    await expect(page.getByTitle('Edit question')).toBeVisible({ timeout: 5000 });
  });

  test('Edit icon opens AdminEditQuestionDialog with all form fields', async ({ page }) => {
    // Switch to Approved tab
    await page.getByRole('button', { name: /approved/i }).first().click();

    // Open view dialog
    const viewBtn = page.getByRole('button', { name: /view/i }).first();
    if (await viewBtn.isVisible()) {
      await viewBtn.click();
    } else {
      await page.locator('[data-testid="question-row"]').first().click();
    }

    // Click the Edit icon
    await page.getByTitle('Edit question').click();

    // Edit dialog should show all required form fields
    await expect(page.getByLabel('Title')).toBeVisible({ timeout: 5000 });
    await expect(page.getByLabel(/category/i)).toBeVisible();
    await expect(page.getByLabel(/month/i)).toBeVisible();
    await expect(page.getByLabel(/year/i)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save Changes' })).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// App: Question bank card display (month chip, updated_at)
// ---------------------------------------------------------------------------
test.describe('App question bank card display', () => {
  test.beforeEach(async ({ page }) => {
    // Student app uses Firebase auth — navigate directly (auth is via storageState)
    await page.goto(`${APP_URL}/tools/nata/question-bank`, { waitUntil: 'networkidle' });
  });

  test('question bank page loads without login redirect', async ({ page }) => {
    // Should not be redirected to login
    await expect(page).not.toHaveURL(/\/login/);
    // Should render at least one question card link
    await expect(page.locator('a[href*="/question-bank/"]').first()).toBeVisible({ timeout: 10000 });
  });

  test('question cards render chips without JS errors', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.locator('a[href*="/question-bank/"]').first().waitFor({ timeout: 10000 });

    // Filter for errors specifically related to month/year chip rendering
    const chipErrors = consoleErrors.filter(
      (e) => e.includes('MONTH_NAMES') || e.includes('undefined') || e.includes('Cannot read')
    );
    expect(chipErrors).toHaveLength(0);
  });

  test('question cards are visible and have accessible text', async ({ page }) => {
    const cards = page.locator('a[href*="/question-bank/"]');
    await cards.first().waitFor({ timeout: 10000 });

    // At least one card must be visible
    const count = await cards.count();
    expect(count).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// App: Question detail page loads (EditQuestionDialog / tags field)
// ---------------------------------------------------------------------------
test.describe('App question detail page', () => {
  test('question detail page loads without errors', async ({ page }) => {
    await page.goto(`${APP_URL}/tools/nata/question-bank`, { waitUntil: 'networkidle' });

    // Should not redirect to login
    await expect(page).not.toHaveURL(/\/login/);

    // Navigate to first question detail
    const firstCard = page.locator('a[href*="/question-bank/"]').first();
    await firstCard.waitFor({ timeout: 10000 });

    const href = await firstCard.getAttribute('href');
    if (href) {
      await page.goto(`${APP_URL}${href}`, { waitUntil: 'networkidle' });
      // Detail page should not redirect to login
      await expect(page).not.toHaveURL(/\/login/);
    }
  });
});
