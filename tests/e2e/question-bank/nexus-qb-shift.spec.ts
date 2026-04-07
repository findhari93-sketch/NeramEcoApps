/**
 * Question Bank Shift (Forenoon/Afternoon) — E2E Tests
 *
 * Tests the shift toggle UI in the bulk upload Paper Info step.
 * Verifies:
 * - Toggle appears only after session is selected
 * - Forenoon/Afternoon buttons appear when toggle is ON
 * - Next button is disabled when toggle is ON but no shift selected
 * - Shift chip appears in Step 2 info bar
 * - Reset behavior on session/exam type change
 *
 * Run: pnpm test:e2e --project=nexus-chrome tests/e2e/question-bank/nexus-qb-shift.spec.ts
 */

import { test, expect } from '@playwright/test';
import { APP_URLS, injectAuthForPage } from '../../utils/credentials';

const BASE_URL = APP_URLS.nexus;

test.use({ baseURL: BASE_URL });

test.describe('QB Bulk Upload - Shift Toggle', () => {
  test.beforeEach(async ({ page }) => {
    // Inject teacher auth
    const authed = await injectAuthForPage(page, 'teacher');
    if (!authed) {
      test.skip();
      return;
    }

    // Navigate to bulk upload page
    await page.goto('/teacher/question-bank/bulk-upload', { waitUntil: 'networkidle' });
  });

  test('shift toggle is hidden until a session is selected', async ({ page }) => {
    // On load, no session is selected, so shift toggle should not exist
    const shiftToggle = page.getByText('This session has separate Forenoon and Afternoon papers');
    await expect(shiftToggle).not.toBeVisible();

    // Select Session 1
    await page.getByRole('button', { name: /Session 1/i }).click();

    // Now the shift toggle should be visible
    await expect(shiftToggle).toBeVisible();
  });

  test('forenoon/afternoon buttons appear when toggle is ON', async ({ page }) => {
    // Select Session 1
    await page.getByRole('button', { name: /Session 1/i }).click();

    // Toggle ON
    const switchElement = page.locator('input[type="checkbox"]').last();
    await switchElement.check();

    // Forenoon and Afternoon buttons should appear
    await expect(page.getByRole('button', { name: /Forenoon/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Afternoon/ })).toBeVisible();
  });

  test('Next button is disabled when toggle is ON but no shift selected', async ({ page }) => {
    // Select Session 1
    await page.getByRole('button', { name: /Session 1/i }).click();

    // Toggle ON
    const switchElement = page.locator('input[type="checkbox"]').last();
    await switchElement.check();

    // Next button should be disabled
    const nextButton = page.getByRole('button', { name: /Next/i });
    await expect(nextButton).toBeDisabled();

    // Select Forenoon
    await page.getByRole('button', { name: /Forenoon/ }).click();

    // Next button should now be enabled
    await expect(nextButton).toBeEnabled();
  });

  test('shift chip appears in Step 2 info bar', async ({ page }) => {
    // Select Session 1
    await page.getByRole('button', { name: /Session 1/i }).click();

    // Toggle ON and select Afternoon
    const switchElement = page.locator('input[type="checkbox"]').last();
    await switchElement.check();
    await page.getByRole('button', { name: /Afternoon/ }).click();

    // Click Next to go to Step 2
    await page.getByRole('button', { name: /Next/i }).click();

    // Verify chips in Step 2 info bar
    await expect(page.getByText('Session 1')).toBeVisible();
    await expect(page.getByText('Afternoon')).toBeVisible();
  });

  test('shift resets when session changes', async ({ page }) => {
    // Select Session 1
    await page.getByRole('button', { name: /Session 1/i }).click();

    // Toggle ON and select Forenoon
    const switchElement = page.locator('input[type="checkbox"]').last();
    await switchElement.check();
    await page.getByRole('button', { name: /Forenoon/ }).click();

    // Change to Session 2
    await page.getByRole('button', { name: /Session 2/i }).click();

    // Shift toggle should be reset (unchecked)
    const shiftToggle = page.getByText('This session has separate Forenoon and Afternoon papers');
    await expect(shiftToggle).toBeVisible();

    // Forenoon/Afternoon buttons should NOT be visible (toggle was reset)
    await expect(page.getByRole('button', { name: /Forenoon/ })).not.toBeVisible();
  });

  test('shift resets when exam type changes', async ({ page }) => {
    // Select Session 1 for JEE
    await page.getByRole('button', { name: /Session 1/i }).click();

    // Toggle ON and select Forenoon
    const switchElement = page.locator('input[type="checkbox"]').last();
    await switchElement.check();

    // Change exam type to NATA
    await page.locator('[role="combobox"]').first().click();
    await page.getByRole('option', { name: /NATA/i }).click();

    // Session and shift should be reset
    await expect(page.getByRole('button', { name: /Forenoon/ })).not.toBeVisible();
  });

  test('works without shift toggle (backward compat)', async ({ page }) => {
    // Select Session 1 without enabling shift toggle
    await page.getByRole('button', { name: /Session 1/i }).click();

    // Next button should be enabled (no shift required)
    const nextButton = page.getByRole('button', { name: /Next/i });
    await expect(nextButton).toBeEnabled();

    // Click Next
    await nextButton.click();

    // Should be on Step 2 with session chip but no shift chip
    await expect(page.getByText('Session 1')).toBeVisible();
    // "Forenoon" or "Afternoon" chip should NOT be present
    await expect(page.locator('[class*="Chip"]').filter({ hasText: 'Forenoon' })).not.toBeVisible();
    await expect(page.locator('[class*="Chip"]').filter({ hasText: 'Afternoon' })).not.toBeVisible();
  });
});
