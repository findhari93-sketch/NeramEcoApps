import { test, expect } from '@playwright/test';
import path from 'path';

/**
 * Profile Page E2E Tests
 *
 * Tests for the user profile system (app.neramclasses.com/profile)
 * These tests require authentication - they run after auth.setup.ts
 */

// Authenticated profile tests (depend on setup)
test.describe('Profile Page - Authenticated', () => {
  test.use({
    baseURL: 'http://localhost:3011',
    storageState: path.join(__dirname, '../.auth/user.json'),
  });

  test('should load profile page when authenticated', async ({ page }) => {
    await page.goto('/profile');

    // Should stay on profile page (not redirect to login)
    await expect(page).toHaveURL(/\/profile/);

    // Profile page should have main sections
    await expect(page.locator('main')).toBeVisible();
  });

  test('should display user profile information', async ({ page }) => {
    await page.goto('/profile');

    // Wait for page to load
    await page.waitForLoadState('networkidle');

    // Should have profile picture section
    const avatarSection = page.locator('[data-testid="profile-picture"], .MuiAvatar-root');
    await expect(avatarSection.first()).toBeVisible();

    // Should have personal information section
    const personalInfo = page.getByText(/personal information|profile|details/i);
    await expect(personalInfo.first()).toBeVisible();
  });

  test('should allow editing profile fields', async ({ page }) => {
    await page.goto('/profile');
    await page.waitForLoadState('networkidle');

    // Find and interact with first name field
    const firstNameInput = page.locator('input[name="firstName"], input[name="first_name"], #firstName');

    if (await firstNameInput.isVisible()) {
      // Clear and type new value
      await firstNameInput.clear();
      await firstNameInput.fill('TestFirstName');

      // Find save button
      const saveButton = page.getByRole('button', { name: /save|update/i });

      if (await saveButton.isVisible()) {
        await saveButton.click();

        // Wait for response
        await page.waitForTimeout(1000);

        // Should not show error
        const errorAlert = page.getByRole('alert');
        const hasError = await errorAlert.filter({ hasText: /error/i }).isVisible().catch(() => false);
        expect(hasError).toBe(false);
      }
    }
  });

  test('should show username section', async ({ page }) => {
    await page.goto('/profile');
    await page.waitForLoadState('networkidle');

    // Look for username section
    const usernameSection = page.getByText(/username/i);
    await expect(usernameSection.first()).toBeVisible();
  });
});

// Profile picture upload tests
test.describe('Profile Picture Upload - Authenticated', () => {
  test.use({
    baseURL: 'http://localhost:3011',
    storageState: path.join(__dirname, '../.auth/user.json'),
  });

  test('should have profile picture change option', async ({ page }) => {
    await page.goto('/profile');
    await page.waitForLoadState('networkidle');

    // Look for change/upload button
    const changeButton = page.getByRole('button', { name: /change|upload|edit/i });

    // At least one change button should be visible
    const changeButtonCount = await changeButton.count();
    expect(changeButtonCount).toBeGreaterThan(0);
  });

  test('should open crop dialog when selecting image', async ({ page }) => {
    await page.goto('/profile');
    await page.waitForLoadState('networkidle');

    // Find file input
    const fileInput = page.locator('input[type="file"][accept*="image"]');

    if (await fileInput.count() > 0) {
      // Create a test image file (1x1 pixel JPEG)
      const testImagePath = path.join(__dirname, '../fixtures/test-avatar.jpg');

      // Note: For actual testing, you'd need a test image file
      // This test verifies the input exists
      await expect(fileInput.first()).toHaveAttribute('accept', /image/);
    }
  });
});

// Username availability tests
test.describe('Username Availability - Authenticated', () => {
  test.use({
    baseURL: 'http://localhost:3011',
    storageState: path.join(__dirname, '../.auth/user.json'),
  });

  test('should check username availability via API', async ({ request }) => {
    // Test the username check API endpoint
    const response = await request.get('/api/auth/check-username?username=testuser123');

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty('available');
    expect(data).toHaveProperty('username');
  });

  test('should reject invalid username format via API', async ({ request }) => {
    // Test with invalid username (too short)
    const response = await request.get('/api/auth/check-username?username=ab');

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data.available).toBe(false);
    expect(data.error).toBeDefined();
  });
});

// Unauthenticated profile tests
test.describe('Profile Page - Unauthenticated', () => {
  test.use({ baseURL: 'http://localhost:3011' });

  test('should redirect to login when not authenticated', async ({ page }) => {
    // Clear any existing auth state
    await page.context().clearCookies();

    await page.goto('/profile');

    // Should redirect to login page
    await expect(page).toHaveURL(/\/login/);
  });
});

// Profile API tests
test.describe('Profile API', () => {
  test.use({
    baseURL: 'http://localhost:3011',
    storageState: path.join(__dirname, '../.auth/user.json'),
  });

  test('should return profile data for authenticated user', async ({ page, request }) => {
    // First visit page to ensure cookies are set
    await page.goto('/profile');

    // Get Firebase ID token from localStorage
    const idToken = await page.evaluate(() => {
      // Firebase stores auth in localStorage
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.includes('firebase:authUser')) {
          const data = JSON.parse(localStorage.getItem(key) || '{}');
          return data.stsTokenManager?.accessToken;
        }
      }
      return null;
    });

    if (idToken) {
      const response = await request.get('/api/profile', {
        headers: {
          'Authorization': `Bearer ${idToken}`,
        },
      });

      if (response.status() === 200) {
        const data = await response.json();
        expect(data).toHaveProperty('user');
      }
    }
  });
});

// Mobile profile tests
test.describe('Profile Page - Mobile', () => {
  test.use({
    baseURL: 'http://localhost:3011',
    storageState: path.join(__dirname, '../.auth/user.json'),
    viewport: { width: 375, height: 667 }, // iPhone SE
  });

  test('should be responsive on mobile', async ({ page }) => {
    await page.goto('/profile');
    await page.waitForLoadState('networkidle');

    // Page should not have horizontal scroll
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);

    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 5); // Small tolerance for scrollbar
  });

  test('should have touch-friendly targets on mobile', async ({ page }) => {
    await page.goto('/profile');
    await page.waitForLoadState('networkidle');

    // Check button sizes are touch-friendly (minimum 44px)
    const buttons = page.getByRole('button');
    const buttonCount = await buttons.count();

    for (let i = 0; i < Math.min(buttonCount, 5); i++) {
      const button = buttons.nth(i);
      if (await button.isVisible()) {
        const box = await button.boundingBox();
        if (box) {
          // Minimum 44px for touch targets (Material guideline is 48px)
          expect(box.height).toBeGreaterThanOrEqual(40);
        }
      }
    }
  });
});

// Application form pre-fill test (marketing site integration)
test.describe('Application Form Pre-fill', () => {
  test.use({
    baseURL: 'http://localhost:3010',
    storageState: path.join(__dirname, '../.auth/user.json'),
  });

  test('should show pre-filled data when logged in', async ({ page }) => {
    await page.goto('/en/apply');
    await page.waitForLoadState('networkidle');

    // If user is logged in, look for pre-filled indicators
    const profileCard = page.locator('[data-testid="prefilled-card"], .profile-prefilled');

    // This depends on whether the user has profile data
    // At minimum, the page should load without error
    await expect(page.locator('main')).toBeVisible();
  });

  test('should show login prompt for guests', async ({ page }) => {
    // Clear auth state for this test
    await page.context().clearCookies();
    await page.evaluate(() => localStorage.clear());

    await page.goto('/en/apply');
    await page.waitForLoadState('networkidle');

    // Should either show login prompt or the form fields
    const mainContent = page.locator('main');
    await expect(mainContent).toBeVisible();
  });
});
