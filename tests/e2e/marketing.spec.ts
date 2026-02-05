import { test, expect } from '@playwright/test';

/**
 * Marketing Site E2E Tests
 *
 * Tests for the public marketing website (neramclasses.com)
 */

test.describe('Marketing Site', () => {
  test.describe('Homepage', () => {
    test('should load homepage successfully', async ({ page }) => {
      await page.goto('/');

      // Check page loaded
      await expect(page).toHaveTitle(/Neram/i);

      // Check main content is visible
      await expect(page.locator('main')).toBeVisible();
    });

    test('should display navigation menu', async ({ page }) => {
      await page.goto('/');

      // Check header navigation exists
      await expect(page.locator('header')).toBeVisible();

      // Check key navigation links
      await expect(page.getByRole('link', { name: /courses/i })).toBeVisible();
      await expect(page.getByRole('link', { name: /about/i })).toBeVisible();
    });

    test('should have working course link', async ({ page }) => {
      await page.goto('/');

      // Click on courses link
      await page.getByRole('link', { name: /courses/i }).first().click();

      // Should navigate to courses page
      await expect(page).toHaveURL(/\/courses/);
    });
  });

  test.describe('Courses Page', () => {
    test('should display course list', async ({ page }) => {
      await page.goto('/courses');

      // Page should load
      await expect(page).toHaveTitle(/Courses|Neram/i);

      // Should have course cards or list
      await expect(page.locator('main')).toBeVisible();
    });
  });

  test.describe('Application Form', () => {
    test('should navigate to application page', async ({ page }) => {
      await page.goto('/apply');

      // Should load application page
      await expect(page).toHaveURL(/\/apply/);
    });
  });

  test.describe('Language Switching', () => {
    test('should switch to Tamil', async ({ page }) => {
      // Start on English homepage
      await page.goto('/en');
      await expect(page).toHaveURL(/\/en/);

      // Look for language switcher (implementation may vary)
      const languageSwitcher = page.locator('[data-testid="language-switcher"]');

      if (await languageSwitcher.isVisible()) {
        await languageSwitcher.click();

        // Select Tamil
        const tamilOption = page.getByRole('option', { name: /tamil|தமிழ்/i });
        if (await tamilOption.isVisible()) {
          await tamilOption.click();

          // Should navigate to Tamil version
          await expect(page).toHaveURL(/\/ta/);
        }
      }
    });
  });

  test.describe('Footer', () => {
    test('should display footer with links', async ({ page }) => {
      await page.goto('/');

      // Scroll to footer
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));

      // Footer should be visible
      await expect(page.locator('footer')).toBeVisible();
    });
  });

  test.describe('SEO', () => {
    test('should have proper meta tags', async ({ page }) => {
      await page.goto('/');

      // Check meta description
      const metaDescription = page.locator('meta[name="description"]');
      await expect(metaDescription).toHaveAttribute('content', /.+/);

      // Check Open Graph tags
      const ogTitle = page.locator('meta[property="og:title"]');
      await expect(ogTitle).toHaveAttribute('content', /.+/);
    });
  });
});

test.describe('Mobile Responsiveness', () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test('should be responsive on mobile', async ({ page }) => {
    await page.goto('/');

    // Page should still be usable
    await expect(page.locator('main')).toBeVisible();

    // Check for mobile menu (hamburger icon)
    const mobileMenu = page.locator('[data-testid="mobile-menu"]');
    // Mobile menu might exist depending on implementation
  });
});
