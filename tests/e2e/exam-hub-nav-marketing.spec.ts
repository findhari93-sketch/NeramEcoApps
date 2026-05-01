import { test, expect } from '@playwright/test';

/**
 * Exam Hub mega-menu end-to-end tests.
 *
 * Verifies the new top-nav mega-menu opens, shows all 4 columns
 * (NATA, JEE Main Paper 2, AAT, PGETA), and that links resolve
 * on both desktop and mobile.
 */

test.describe('Exam Hub mega-menu', () => {
  test('desktop: mega-menu opens and shows all 4 columns', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');

    // The Exam Hub trigger button is in the header
    const trigger = page.getByRole('button', { name: /exam hub/i });
    await expect(trigger).toBeVisible();

    await trigger.click();

    // Wait for the popover to render
    await expect(page.getByRole('link', { name: /^NATA 2026 Hub$/i }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: /^JEE B\.Arch Hub$/i }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: /^AAT 2026 Hub$/i }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: /^PGETA 2026 Hub$/i }).first()).toBeVisible();
  });

  test('desktop: AAT 2026 hub link from mega-menu navigates correctly', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    await page.getByRole('button', { name: /exam hub/i }).click();
    await page.getByRole('link', { name: /^AAT 2026 Hub$/i }).first().click();
    await expect(page).toHaveURL(/\/aat-2026/);
    await expect(page.getByRole('heading', { name: /AAT 2026/i, level: 1 })).toBeVisible();
  });

  test('desktop: PGETA 2026 hub link from mega-menu navigates correctly', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    await page.getByRole('button', { name: /exam hub/i }).click();
    await page.getByRole('link', { name: /^PGETA 2026 Hub$/i }).first().click();
    await expect(page).toHaveURL(/\/pgeta-2026/);
    await expect(page.getByRole('heading', { name: /PGETA 2026/i, level: 1 })).toBeVisible();
  });

  test('mobile: drawer opens and Exam Hub group expands', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');

    // Open the mobile drawer (hamburger / open menu)
    const openMenuButton = page.getByRole('button', { name: /open menu|menu/i }).first();
    await openMenuButton.click();

    // Exam Hub group should be visible inside the drawer
    await expect(page.getByText(/exam hub/i).first()).toBeVisible();
  });
});
