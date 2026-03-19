/**
 * Nexus Mobile Responsive Audit - Student Role
 *
 * Comprehensive mobile responsiveness tests for all 16 static student pages.
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
  checkFormInputHeights,
  checkContentOverflow,
} from './nexus-mobile-utils';

// All static student pages
const STUDENT_PAGES = [
  '/student/dashboard',
  '/student/timetable',
  '/student/checklist',
  '/student/drawings',
  '/student/tests',
  '/student/questions',
  '/student/modules',
  '/student/foundation',
  '/student/resources',
  '/student/documents',
  '/student/issues',
  '/student/tickets',
  '/student/question-bank',
  '/student/question-bank/questions',
  '/student/profile',
  '/student/guide',
];

test.use({ baseURL: 'http://localhost:3012' });

// =============================================================================
// AUDIT 1: No Horizontal Scroll (Critical - all pages, all viewports)
// =============================================================================

for (const viewport of Object.values(VIEWPORTS)) {
  test.describe(`Student Overflow - ${viewport.name} (${viewport.width}px)`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    for (const pagePath of STUDENT_PAGES) {
      test(`${pagePath} - no horizontal scroll`, async ({ page }) => {
        const loaded = await authAndNavigate(page, 'student', pagePath);
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

test.describe('Student Console Errors - Pixel 5', () => {
  test.use({ viewport: { width: VIEWPORTS.pixel5.width, height: VIEWPORTS.pixel5.height } });

  for (const pagePath of STUDENT_PAGES) {
    test(`${pagePath} - no console errors`, async ({ page }) => {
      const collector = createConsoleErrorCollector(page);
      collector.start();

      const loaded = await authAndNavigate(page, 'student', pagePath);
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
  test.describe(`Student Navigation Layout - ${viewport.name}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test('dashboard - desktop sidebar is hidden', async ({ page }) => {
      const loaded = await authAndNavigate(page, 'student', '/student/dashboard');
      if (!loaded) {
        test.skip(true, 'Auth failed or page redirected to login');
        return;
      }

      const sidebarHidden = await checkSidebarHidden(page);
      expect(sidebarHidden, 'Desktop sidebar should be hidden on mobile').toBe(true);
    });

    test('dashboard - bottom nav is visible', async ({ page }) => {
      const loaded = await authAndNavigate(page, 'student', '/student/dashboard');
      if (!loaded) {
        test.skip(true, 'Auth failed or page redirected to login');
        return;
      }

      const bottomNavVisible = await checkBottomNavVisible(page);
      expect(bottomNavVisible, 'Bottom navigation should be visible on mobile').toBe(true);
    });

    test('dashboard - no content overflows viewport', async ({ page }) => {
      const loaded = await authAndNavigate(page, 'student', '/student/dashboard');
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
// AUDIT 4: Touch Targets (Medium - sample pages, Pixel 5)
// =============================================================================

test.describe('Student Touch Targets - Pixel 5', () => {
  test.use({ viewport: { width: VIEWPORTS.pixel5.width, height: VIEWPORTS.pixel5.height } });

  const samplePages = ['/student/dashboard', '/student/modules'];

  for (const pagePath of samplePages) {
    test(`${pagePath} - touch targets >= 44px`, async ({ page }) => {
      const loaded = await authAndNavigate(page, 'student', pagePath);
      if (!loaded) {
        test.skip(true, 'Auth failed or page redirected to login');
        return;
      }

      const result = await checkTouchTargets(page, 44);
      const violationRate = result.total > 0 ? result.violations / result.total : 0;

      if (violationRate > 0.3) {
        console.warn(
          `⚠️  ${pagePath}: ${result.violations}/${result.total} elements (${Math.round(violationRate * 100)}%) below 44px`,
        );
      }

      expect(
        violationRate,
        `${Math.round(violationRate * 100)}% of touch targets are below 44px (${result.violations}/${result.total})`,
      ).toBeLessThan(0.5);
    });
  }
});

// =============================================================================
// AUDIT 5: Typography (Medium - iPhone SE)
// =============================================================================

test.describe('Student Typography - iPhone SE', () => {
  test.use({ viewport: { width: VIEWPORTS.iPhoneSE.width, height: VIEWPORTS.iPhoneSE.height } });

  test('dashboard - base font size >= 16px', async ({ page }) => {
    const loaded = await authAndNavigate(page, 'student', '/student/dashboard');
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

  test('profile - input font size >= 16px (prevents iOS zoom)', async ({ page }) => {
    const loaded = await authAndNavigate(page, 'student', '/student/profile');
    if (!loaded) {
      test.skip(true, 'Auth failed or page redirected to login');
      return;
    }

    const result = await checkBaseFontSize(page, 16);
    if (result.inputViolations.length > 0) {
      console.warn('⚠️  Input font violations:', result.inputViolations);
    }
    expect(
      result.inputViolations.length,
      `${result.inputViolations.length} inputs have font-size < 16px (causes iOS auto-zoom)`,
    ).toBe(0);
  });
});

// =============================================================================
// AUDIT 6: Form Usability (Medium - iPhone SE)
// =============================================================================

test.describe('Student Form Usability - iPhone SE', () => {
  test.use({ viewport: { width: VIEWPORTS.iPhoneSE.width, height: VIEWPORTS.iPhoneSE.height } });

  test('/student/profile - form input heights >= 40px', async ({ page }) => {
    const loaded = await authAndNavigate(page, 'student', '/student/profile');
    if (!loaded) {
      test.skip(true, 'Auth failed or page redirected to login');
      return;
    }

    const result = await checkFormInputHeights(page, 40);
    if (result.violations > 0) {
      console.warn(`⚠️  profile: ${result.violations}/${result.total} inputs below 40px height`);
    }

    expect(
      result.violations,
      `${result.violations} form inputs are below 40px minimum height`,
    ).toBe(0);
  });
});
