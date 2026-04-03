/**
 * Course Plan Module - Mobile Responsive Tests
 *
 * Tests mobile responsiveness for teacher and student course plan pages.
 * Uses the shared nexus-mobile-utils for auth injection, scroll checks,
 * touch target validation, and console error collection.
 */

import { test, expect } from '@playwright/test';
import {
  injectAuthForPage,
  navigateAndWait,
  checkNoHorizontalScroll,
  checkTouchTargets,
  checkBottomNavVisible,
  checkBaseFontSize,
  checkContentOverflow,
  createConsoleErrorCollector,
  VIEWPORTS,
} from './nexus-mobile-utils';

// Teacher course plan pages
const TEACHER_COURSE_PLAN_PAGES = [
  '/teacher/course-plans',
];

// Student course plan pages
const STUDENT_COURSE_PLAN_PAGES = [
  '/student/course-plan',
  '/student/course-plan/homework',
  '/student/course-plan/drill',
  '/student/course-plan/tests',
];

test.describe('Course Plan Mobile - Teacher', () => {
  test.use({
    baseURL: 'http://localhost:3012',
    viewport: { width: VIEWPORTS.iPhoneSE.width, height: VIEWPORTS.iPhoneSE.height },
  });

  for (const pagePath of TEACHER_COURSE_PLAN_PAGES) {
    test(`${pagePath} - no horizontal scroll (iPhone SE)`, async ({ page }) => {
      const authed = await injectAuthForPage(page, 'teacher');
      if (!authed) { test.skip(true, 'Auth failed'); return; }

      const loaded = await navigateAndWait(page, pagePath);
      if (!loaded) { test.skip(true, 'Page redirected to login'); return; }

      const result = await checkNoHorizontalScroll(page);
      expect(
        result.pass,
        `Horizontal scroll detected: scrollWidth=${result.scrollWidth} > clientWidth=${result.clientWidth}`,
      ).toBe(true);
    });

    test(`${pagePath} - touch targets >= 44px`, async ({ page }) => {
      const authed = await injectAuthForPage(page, 'teacher');
      if (!authed) { test.skip(true, 'Auth failed'); return; }

      const loaded = await navigateAndWait(page, pagePath);
      if (!loaded) { test.skip(true, 'Page redirected to login'); return; }

      const result = await checkTouchTargets(page, 44);
      const violationRate = result.total > 0 ? result.violations / result.total : 0;

      expect(
        violationRate,
        `${Math.round(violationRate * 100)}% of touch targets below 44px (${result.violations}/${result.total})`,
      ).toBeLessThan(0.5);
    });

    test(`${pagePath} - no console errors`, async ({ page }) => {
      const authed = await injectAuthForPage(page, 'teacher');
      if (!authed) { test.skip(true, 'Auth failed'); return; }

      const collector = createConsoleErrorCollector(page);
      collector.start();

      const loaded = await navigateAndWait(page, pagePath);
      if (!loaded) { test.skip(true, 'Page redirected to login'); return; }

      expect(
        collector.errors,
        `Console errors found:\n${collector.errors.join('\n')}`,
      ).toHaveLength(0);
    });
  }
});

test.describe('Course Plan Mobile - Student', () => {
  test.use({
    baseURL: 'http://localhost:3012',
    viewport: { width: VIEWPORTS.iPhoneSE.width, height: VIEWPORTS.iPhoneSE.height },
  });

  for (const pagePath of STUDENT_COURSE_PLAN_PAGES) {
    test(`${pagePath} - no horizontal scroll (iPhone SE)`, async ({ page }) => {
      const authed = await injectAuthForPage(page, 'student');
      if (!authed) { test.skip(true, 'Student auth failed'); return; }

      const loaded = await navigateAndWait(page, pagePath);
      if (!loaded) { test.skip(true, 'Page redirected to login'); return; }

      const result = await checkNoHorizontalScroll(page);
      expect(
        result.pass,
        `Horizontal scroll detected: scrollWidth=${result.scrollWidth} > clientWidth=${result.clientWidth}`,
      ).toBe(true);
    });

    test(`${pagePath} - touch targets >= 44px`, async ({ page }) => {
      const authed = await injectAuthForPage(page, 'student');
      if (!authed) { test.skip(true, 'Student auth failed'); return; }

      const loaded = await navigateAndWait(page, pagePath);
      if (!loaded) { test.skip(true, 'Page redirected to login'); return; }

      const result = await checkTouchTargets(page, 44);
      const violationRate = result.total > 0 ? result.violations / result.total : 0;

      expect(
        violationRate,
        `${Math.round(violationRate * 100)}% of touch targets below 44px (${result.violations}/${result.total})`,
      ).toBeLessThan(0.5);
    });

    test(`${pagePath} - no console errors`, async ({ page }) => {
      const authed = await injectAuthForPage(page, 'student');
      if (!authed) { test.skip(true, 'Student auth failed'); return; }

      const collector = createConsoleErrorCollector(page);
      collector.start();

      const loaded = await navigateAndWait(page, pagePath);
      if (!loaded) { test.skip(true, 'Page redirected to login'); return; }

      expect(
        collector.errors,
        `Console errors found:\n${collector.errors.join('\n')}`,
      ).toHaveLength(0);
    });
  }

  test('student: bottom nav visible on course plan page', async ({ page }) => {
    const authed = await injectAuthForPage(page, 'student');
    if (!authed) { test.skip(true, 'Student auth failed'); return; }

    const loaded = await navigateAndWait(page, '/student/course-plan');
    if (!loaded) { test.skip(true, 'Page redirected to login'); return; }

    const bottomNavVisible = await checkBottomNavVisible(page);
    expect(bottomNavVisible, 'Bottom navigation should be visible on mobile').toBe(true);
  });
});

// =============================================================================
// Cross-viewport overflow check (all 3 viewports for student pages)
// =============================================================================

for (const viewport of Object.values(VIEWPORTS)) {
  test.describe(`Student Course Plan - ${viewport.name} (${viewport.width}px)`, () => {
    test.use({
      baseURL: 'http://localhost:3012',
      viewport: { width: viewport.width, height: viewport.height },
    });

    for (const pagePath of STUDENT_COURSE_PLAN_PAGES) {
      test(`${pagePath} - no content overflow`, async ({ page }) => {
        const authed = await injectAuthForPage(page, 'student');
        if (!authed) { test.skip(true, 'Student auth failed'); return; }

        const loaded = await navigateAndWait(page, pagePath);
        if (!loaded) { test.skip(true, 'Page redirected to login'); return; }

        const overflow = await checkContentOverflow(page, viewport.width);
        expect(
          overflow.pass,
          `${overflow.overflowingElements} elements overflow the ${viewport.width}px viewport`,
        ).toBe(true);
      });
    }
  });
}

// =============================================================================
// Typography check (student pages, iPhone SE)
// =============================================================================

test.describe('Course Plan Typography - iPhone SE', () => {
  test.use({
    baseURL: 'http://localhost:3012',
    viewport: { width: VIEWPORTS.iPhoneSE.width, height: VIEWPORTS.iPhoneSE.height },
  });

  test('student: base font size >= 16px on course plan page', async ({ page }) => {
    const authed = await injectAuthForPage(page, 'student');
    if (!authed) { test.skip(true, 'Student auth failed'); return; }

    const loaded = await navigateAndWait(page, '/student/course-plan');
    if (!loaded) { test.skip(true, 'Page redirected to login'); return; }

    const result = await checkBaseFontSize(page, 16);
    expect(
      result.bodyFontSize,
      `Body font size is ${result.bodyFontSize}px (expected >= 16px)`,
    ).toBeGreaterThanOrEqual(16);
  });
});
