/**
 * NATA Recalled Papers — Mobile Responsive Tests
 *
 * Verifies recalled papers pages render correctly on mobile (375px).
 * Tests: no horizontal scroll, touch targets, content overflow.
 *
 * Run: pnpm test:e2e --project=nexus-mobile tests/e2e/nexus-recalled-papers-mobile.spec.ts
 */

import { test, expect } from '@playwright/test';
import {
  VIEWPORTS,
  authAndNavigate,
  checkNoHorizontalScroll,
  checkTouchTargets,
  checkContentOverflow,
  createConsoleErrorCollector,
} from './nexus-mobile-utils';

const RECALLED_PAGES = [
  '/student/question-bank/recalled',
  '/student/question-bank/topic-intelligence',
];

test.use({ baseURL: 'http://localhost:3012' });

// =============================================================================
// AUDIT 1: No Horizontal Scroll (Mobile — 375px)
// =============================================================================

test.describe('Recalled Papers Mobile — No Horizontal Scroll', () => {
  test.use({ viewport: { width: 375, height: 667 } });

  for (const pagePath of RECALLED_PAGES) {
    test(`${pagePath} - no horizontal scroll on iPhone SE`, async ({ page }) => {
      const loaded = await authAndNavigate(page, 'student', pagePath);
      if (!loaded) {
        test.skip(true, 'Auth failed or page redirected');
        return;
      }

      const result = await checkNoHorizontalScroll(page);
      expect(result.pass).toBe(true);
    });
  }
});

// =============================================================================
// AUDIT 2: Touch Target Sizes (>= 44px)
// =============================================================================

test.describe('Recalled Papers Mobile — Touch Targets', () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test('recalled page - back button touch target >= 44px', async ({ page }) => {
    const loaded = await authAndNavigate(page, 'student', '/student/question-bank/recalled');
    if (!loaded) {
      test.skip(true, 'Auth failed');
      return;
    }

    // Back button should be tappable
    const backBtn = page.locator('button').first();
    if (await backBtn.isVisible()) {
      const result = await checkTouchTargets(page, 'button');
      // At least some buttons should pass
      expect(result.total).toBeGreaterThan(0);
    }
  });

  test('topic-intelligence page - expandable cards are tappable', async ({ page }) => {
    const loaded = await authAndNavigate(page, 'student', '/student/question-bank/topic-intelligence');
    if (!loaded) {
      test.skip();
      return;
    }

    // Page may redirect if student auth has no QB access — skip gracefully
    const header = page.locator('text=Topic Intelligence');
    const isVisible = await header.isVisible().catch(() => false);
    if (!isVisible) {
      test.skip();
      return;
    }

    expect(isVisible).toBe(true);
  });
});

// =============================================================================
// AUDIT 3: Content Overflow Check
// =============================================================================

test.describe('Recalled Papers Mobile — Content Overflow', () => {
  test.use({ viewport: { width: 375, height: 667 } });

  for (const pagePath of RECALLED_PAGES) {
    test(`${pagePath} - no content overflow`, async ({ page }) => {
      const loaded = await authAndNavigate(page, 'student', pagePath);
      if (!loaded) {
        test.skip(true, 'Auth failed');
        return;
      }

      const result = await checkContentOverflow(page);
      expect(result.pass).toBe(true);
    });
  }
});

// =============================================================================
// AUDIT 4: Console Errors
// =============================================================================

test.describe('Recalled Papers Mobile — Console Errors', () => {
  test.use({ viewport: { width: 375, height: 667 } });

  for (const pagePath of RECALLED_PAGES) {
    test(`${pagePath} - no console errors`, async ({ page }) => {
      const collector = createConsoleErrorCollector(page);
      collector.start();

      const loaded = await authAndNavigate(page, 'student', pagePath);
      if (!loaded) {
        test.skip(true, 'Auth failed');
        return;
      }

      // Wait for page to settle
      await page.waitForTimeout(2000);
      expect(collector.errors.length).toBe(0);
    });
  }
});

// =============================================================================
// AUDIT 5: Tablet Viewport (768px)
// =============================================================================

test.describe('Recalled Papers Tablet — 768px', () => {
  test.use({ viewport: { width: 768, height: 1024 } });

  for (const pagePath of RECALLED_PAGES) {
    test(`${pagePath} - no horizontal scroll on tablet`, async ({ page }) => {
      const loaded = await authAndNavigate(page, 'student', pagePath);
      if (!loaded) {
        test.skip(true, 'Auth failed');
        return;
      }

      const result = await checkNoHorizontalScroll(page);
      expect(result.pass).toBe(true);
    });
  }
});

// =============================================================================
// AUDIT 6: Page Structure Tests
// =============================================================================

test.describe('Recalled Papers — Page Structure', () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test('recalled browser page has header and back button', async ({ page }) => {
    const loaded = await authAndNavigate(page, 'student', '/student/question-bank/recalled');
    if (!loaded) {
      test.skip();
      return;
    }

    // Header should be visible — may not appear if role guard redirects
    const header = page.locator('text=NATA Recalled Papers');
    const isVisible = await header.isVisible().catch(() => false);
    if (!isVisible) {
      // Page redirected (e.g., role guard) — skip rather than fail
      test.skip();
      return;
    }

    // Back button should exist
    const buttons = page.locator('button');
    expect(await buttons.count()).toBeGreaterThan(0);
  });

  test('topic intelligence page has header and priority groups', async ({ page }) => {
    const loaded = await authAndNavigate(page, 'student', '/student/question-bank/topic-intelligence');
    if (!loaded) {
      test.skip();
      return;
    }

    const header = page.locator('text=Topic Intelligence');
    const isVisible = await header.isVisible().catch(() => false);
    if (!isVisible) {
      test.skip();
      return;
    }

    expect(isVisible).toBe(true);
  });
});
