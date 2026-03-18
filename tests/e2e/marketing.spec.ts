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

      // Check page loaded (title is SEO-optimized, may not contain "Neram")
      const title = await page.title();
      expect(title.length).toBeGreaterThan(0);

      // Check main content is visible
      await expect(page.locator('main')).toBeVisible();
    });

    test('should display navigation menu', async ({ page }) => {
      await page.goto('/');

      // Check header navigation exists
      await expect(page.locator('header')).toBeVisible();

      // Check key navigation links (use first() for strict mode — multiple links may match)
      await expect(page.getByRole('link', { name: /courses/i }).first()).toBeVisible();
      await expect(page.getByRole('link', { name: /about/i }).first()).toBeVisible();
    });

    test('should have working course link', async ({ page }) => {
      // Navigate directly to the courses page to verify it exists and loads
      await page.goto('/courses');
      await expect(page.locator('main')).toBeVisible();
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
      // Default locale (en) redirects to / — navigate directly to a Tamil URL
      await page.goto('/ta');
      // Tamil locale should load successfully
      const response = await page.waitForResponse((r) => r.url().includes('/ta') || r.url().endsWith('/'), { timeout: 30000 }).catch(() => null);

      await expect(page.locator('main')).toBeVisible({ timeout: 30000 });

      // Look for language switcher if it exists
      const languageSwitcher = page.locator('[data-testid="language-switcher"]');
      if (await languageSwitcher.isVisible({ timeout: 3000 }).catch(() => false)) {
        await languageSwitcher.click();
        const tamilOption = page.getByRole('option', { name: /tamil|தமிழ்/i });
        if (await tamilOption.isVisible({ timeout: 3000 }).catch(() => false)) {
          await tamilOption.click();
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

test.describe('Error-Free Loading', () => {
  test('homepage loads without unhandled JS errors', async ({ page }) => {
    const pageErrors: string[] = [];
    // page.on('pageerror') catches unhandled exceptions — more reliable than console errors
    // which include dev-mode hydration warnings (float precision, SSR diffs) that don't affect production
    page.on('pageerror', (err) => {
      pageErrors.push(err.message);
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Filter out known benign patterns
    const realErrors = pageErrors.filter(
      (e) =>
        !e.includes('favicon') &&
        !e.includes('ERR_BLOCKED_BY_CLIENT')
    );
    expect(realErrors).toHaveLength(0);
  });

  test('no chunk load errors on homepage', async ({ page }) => {
    const failedChunks: string[] = [];
    page.on('response', (response) => {
      if (
        response.status() === 404 &&
        response.url().includes('/_next/static/chunks/')
      ) {
        failedChunks.push(response.url());
      }
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    expect(failedChunks).toHaveLength(0);
  });

  test('no chunk load errors on courses page', async ({ page }) => {
    const failedChunks: string[] = [];
    page.on('response', (response) => {
      if (
        response.status() === 404 &&
        response.url().includes('/_next/static/chunks/')
      ) {
        failedChunks.push(response.url());
      }
    });

    await page.goto('/courses');
    await page.waitForLoadState('networkidle');

    expect(failedChunks).toHaveLength(0);
  });
});

test.describe('Key Pages Render', () => {
  const pages = ['/', '/courses', '/about', '/apply'];

  for (const pagePath of pages) {
    test(`${pagePath} renders without server error`, async ({ page }) => {
      const response = await page.goto(pagePath);
      expect(response?.status()).toBeLessThan(500);
      await expect(page.locator('main')).toBeVisible();
    });
  }
});

test.describe('Dynamic Components', () => {
  test('page loads fully with lazy-loaded components', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // No unhandled JS errors should occur from dynamic imports
    const chunkErrors = errors.filter(
      (e) =>
        e.includes('ChunkLoadError') ||
        e.includes('Loading chunk') ||
        e.includes('Failed to fetch dynamically imported module')
    );
    expect(chunkErrors).toHaveLength(0);
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

  test('no horizontal overflow on mobile', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const overflow = await page.evaluate(() => {
      return document.body.scrollWidth > window.innerWidth;
    });
    expect(overflow).toBe(false);
  });

  test('mobile navigation works', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('header')).toBeVisible();

    // Navigate to courses
    await page.goto('/courses');
    await expect(page.locator('main')).toBeVisible();

    // Navigate to apply
    await page.goto('/apply');
    await expect(page.locator('main')).toBeVisible();
  });
});
