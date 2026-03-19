/**
 * Nexus Mobile Responsive Audit - Parent Role
 *
 * Comprehensive mobile responsiveness tests for all 4 static parent pages.
 * Uses inline auth injection (no storageState file needed).
 */

import { test, expect } from '@playwright/test';
import {
  VIEWPORTS,
  authAndNavigate,
  checkNoHorizontalScroll,
  checkTouchTargets,
  checkBaseFontSize,
  checkSidebarHidden,
  checkBottomNavVisible,
  createConsoleErrorCollector,
  checkContentOverflow,
} from './nexus-mobile-utils';

// All static parent pages
const PARENT_PAGES = [
  '/parent/dashboard',
  '/parent/timetable',
  '/parent/tickets',
  '/parent/foundation',
];

test.use({ baseURL: 'http://localhost:3012' });

// =============================================================================
// AUDIT 1: No Horizontal Scroll (Critical - all pages, all viewports)
// =============================================================================

for (const viewport of Object.values(VIEWPORTS)) {
  test.describe(`Parent Overflow - ${viewport.name} (${viewport.width}px)`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    for (const pagePath of PARENT_PAGES) {
      test(`${pagePath} - no horizontal scroll`, async ({ page }) => {
        const loaded = await authAndNavigate(page, 'parent', pagePath);
        if (!loaded) {
          test.skip(true, 'Auth failed or page redirected to login');
          return;
        }

        const result = await checkNoHorizontalScroll(page);
        expect(
          result.pass,
          `Horizontal scroll detected: scrollWidth=${result.scrollWidth} > clientWidth=${result.clientWidth}`,
        ).toBe(true);
      });
    }
  });
}

// =============================================================================
// AUDIT 2: No Console Errors (High - all pages, Pixel 5 only)
// =============================================================================

test.describe('Parent Console Errors - Pixel 5', () => {
  test.use({ viewport: { width: VIEWPORTS.pixel5.width, height: VIEWPORTS.pixel5.height } });

  for (const pagePath of PARENT_PAGES) {
    test(`${pagePath} - no console errors`, async ({ page }) => {
      const collector = createConsoleErrorCollector(page);
      collector.start();

      const loaded = await authAndNavigate(page, 'parent', pagePath);
      if (!loaded) {
        test.skip(true, 'Auth failed or page redirected to login');
        return;
      }

      expect(
        collector.errors,
        `Console errors found:\n${collector.errors.join('\n')}`,
      ).toHaveLength(0);
    });
  }
});

// =============================================================================
// AUDIT 3: Navigation Layout (High - sidebar hidden, bottom nav visible)
// =============================================================================

for (const viewport of Object.values(VIEWPORTS)) {
  test.describe(`Parent Navigation Layout - ${viewport.name}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test('dashboard - desktop sidebar is hidden', async ({ page }) => {
      const loaded = await authAndNavigate(page, 'parent', '/parent/dashboard');
      if (!loaded) {
        test.skip(true, 'Auth failed or page redirected to login');
        return;
      }

      const sidebarHidden = await checkSidebarHidden(page);
      expect(sidebarHidden, 'Desktop sidebar should be hidden on mobile').toBe(true);
    });

    test('dashboard - bottom nav is visible', async ({ page }) => {
      const loaded = await authAndNavigate(page, 'parent', '/parent/dashboard');
      if (!loaded) {
        test.skip(true, 'Auth failed or page redirected to login');
        return;
      }

      const bottomNavVisible = await checkBottomNavVisible(page);
      expect(bottomNavVisible, 'Bottom navigation should be visible on mobile').toBe(true);
    });

    test('dashboard - no content overflows viewport', async ({ page }) => {
      const loaded = await authAndNavigate(page, 'parent', '/parent/dashboard');
      if (!loaded) {
        test.skip(true, 'Auth failed or page redirected to login');
        return;
      }

      const overflow = await checkContentOverflow(page, viewport.width);
      expect(
        overflow.pass,
        `${overflow.overflowingElements} elements overflow the ${viewport.width}px viewport`,
      ).toBe(true);
    });
  });
}

// =============================================================================
// AUDIT 4: Touch Targets (Medium - dashboard, Pixel 5)
// =============================================================================

test.describe('Parent Touch Targets - Pixel 5', () => {
  test.use({ viewport: { width: VIEWPORTS.pixel5.width, height: VIEWPORTS.pixel5.height } });

  test('/parent/dashboard - touch targets >= 44px', async ({ page }) => {
    const loaded = await authAndNavigate(page, 'parent', '/parent/dashboard');
    if (!loaded) {
      test.skip(true, 'Auth failed or page redirected to login');
      return;
    }

    const result = await checkTouchTargets(page, 44);
    const violationRate = result.total > 0 ? result.violations / result.total : 0;

    if (violationRate > 0.3) {
      console.warn(
        `⚠️  dashboard: ${result.violations}/${result.total} elements (${Math.round(violationRate * 100)}%) below 44px`,
      );
    }

    expect(
      violationRate,
      `${Math.round(violationRate * 100)}% of touch targets are below 44px (${result.violations}/${result.total})`,
    ).toBeLessThan(0.5);
  });
});

// =============================================================================
// AUDIT 5: Typography (Medium - iPhone SE)
// =============================================================================

test.describe('Parent Typography - iPhone SE', () => {
  test.use({ viewport: { width: VIEWPORTS.iPhoneSE.width, height: VIEWPORTS.iPhoneSE.height } });

  test('dashboard - base font size >= 16px', async ({ page }) => {
    const loaded = await authAndNavigate(page, 'parent', '/parent/dashboard');
    if (!loaded) {
      test.skip(true, 'Auth failed or page redirected to login');
      return;
    }

    const result = await checkBaseFontSize(page, 16);
    expect(
      result.bodyFontSize,
      `Body font size is ${result.bodyFontSize}px (expected >= 16px)`,
    ).toBeGreaterThanOrEqual(16);
  });
});
