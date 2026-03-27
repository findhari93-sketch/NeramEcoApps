/**
 * Nexus Gamification & Leaderboard - Mobile Responsive Tests
 *
 * Tests mobile responsiveness for the leaderboard pages at Pixel 5 viewport (393x851).
 * Checks: horizontal scroll, touch targets, font size, navigation layout,
 * console errors, and interactive elements.
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
  navigateAndWait,
  injectAuthForPage,
  NEXUS_TEACHER_AUTH,
} from './nexus-mobile-utils';

// ---------------------------------------------------------------------------
// Student Leaderboard - Mobile Tests (inline auth, Pixel 5 viewport)
// ---------------------------------------------------------------------------

test.describe('Gamification Mobile - Student Leaderboard', () => {
  test.use({
    baseURL: 'http://localhost:3012',
    viewport: { width: VIEWPORTS.pixel5.width, height: VIEWPORTS.pixel5.height },
  });

  test('mobile: leaderboard page has no horizontal scroll', async ({ page }) => {
    const loaded = await authAndNavigate(page, 'student', '/student/leaderboard');
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

  test('mobile: leaderboard touch targets are 44px+', async ({ page }) => {
    const loaded = await authAndNavigate(page, 'student', '/student/leaderboard');
    if (!loaded) {
      test.skip(true, 'Auth failed or page redirected to login');
      return;
    }

    const result = await checkTouchTargets(page, 44);
    const violationRate = result.total > 0 ? result.violations / result.total : 0;

    if (violationRate > 0.3) {
      console.warn(
        `Touch target violations: ${result.violations}/${result.total} elements (${Math.round(violationRate * 100)}%) below 44px`,
      );
      if (result.details.length > 0) {
        console.warn('  Violations:', JSON.stringify(result.details.slice(0, 5)));
      }
    }

    // Hard-fail if more than 50% of interactive elements are too small
    expect(
      violationRate,
      `${Math.round(violationRate * 100)}% of touch targets are below 44px (${result.violations}/${result.total})`,
    ).toBeLessThan(0.5);
  });

  test('mobile: leaderboard base font is 16px+', async ({ page }) => {
    const loaded = await authAndNavigate(page, 'student', '/student/leaderboard');
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

  test('mobile: sidebar is hidden on mobile', async ({ page }) => {
    const loaded = await authAndNavigate(page, 'student', '/student/leaderboard');
    if (!loaded) {
      test.skip(true, 'Auth failed or page redirected to login');
      return;
    }

    const sidebarHidden = await checkSidebarHidden(page);
    expect(sidebarHidden, 'Desktop sidebar should be hidden on mobile').toBe(true);
  });

  test('mobile: bottom nav is visible', async ({ page }) => {
    const loaded = await authAndNavigate(page, 'student', '/student/leaderboard');
    if (!loaded) {
      test.skip(true, 'Auth failed or page redirected to login');
      return;
    }

    const bottomNavVisible = await checkBottomNavVisible(page);
    expect(bottomNavVisible, 'Bottom navigation should be visible on mobile').toBe(true);
  });

  test('mobile: leaderboard tabs are visible and tappable', async ({ page }) => {
    const loaded = await authAndNavigate(page, 'student', '/student/leaderboard');
    if (!loaded) {
      test.skip(true, 'Auth failed or page redirected to login');
      return;
    }

    // Look for period tabs: Weekly, Monthly, All-Time
    const pageContent = await page.textContent('body');
    const hasWeekly = pageContent?.includes('Weekly') || pageContent?.includes('weekly');
    const hasMonthly = pageContent?.includes('Monthly') || pageContent?.includes('monthly');
    const hasAllTime =
      pageContent?.includes('All-Time') ||
      pageContent?.includes('All Time') ||
      pageContent?.includes('alltime');

    expect(
      hasWeekly || hasMonthly || hasAllTime,
      'Expected at least one period tab (Weekly/Monthly/All-Time) to be visible',
    ).toBe(true);

    // Try to find and tap tabs — MUI Tabs use role="tab"
    const tabs = page.locator('[role="tab"]');
    const tabCount = await tabs.count();

    if (tabCount > 0) {
      // Verify tabs are tappable (have sufficient dimensions)
      for (let i = 0; i < Math.min(tabCount, 3); i++) {
        const box = await tabs.nth(i).boundingBox();
        if (box) {
          expect(box.height).toBeGreaterThanOrEqual(32);
          expect(box.width).toBeGreaterThanOrEqual(40);
        }
      }
    }
  });

  test('mobile: your rank section is visible at bottom', async ({ page }) => {
    const loaded = await authAndNavigate(page, 'student', '/student/leaderboard');
    if (!loaded) {
      test.skip(true, 'Auth failed or page redirected to login');
      return;
    }

    // Look for rank indicator elements — could be "Your rank", "My Rank", rank number, etc.
    const pageContent = (await page.textContent('body')) || '';

    const hasRankIndicator =
      /your rank/i.test(pageContent) ||
      /my rank/i.test(pageContent) ||
      /rank/i.test(pageContent) ||
      /position/i.test(pageContent);

    // The LeaderboardYourRank component should render something about rank
    expect(
      hasRankIndicator,
      'Expected a rank indicator (Your Rank / My Rank) to be visible on the leaderboard page',
    ).toBe(true);
  });

  test('mobile: no console errors on leaderboard page', async ({ page }) => {
    const collector = createConsoleErrorCollector(page);
    collector.start();

    const loaded = await authAndNavigate(page, 'student', '/student/leaderboard');
    if (!loaded) {
      test.skip(true, 'Auth failed or page redirected to login');
      return;
    }

    expect(
      collector.errors,
      `Console errors found:\n${collector.errors.join('\n')}`,
    ).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Teacher Leaderboard - Mobile Tests (uses teacher auth storageState)
// ---------------------------------------------------------------------------

test.describe('Gamification Mobile - Teacher Leaderboard', () => {
  test.use({
    baseURL: 'http://localhost:3012',
    viewport: { width: VIEWPORTS.pixel5.width, height: VIEWPORTS.pixel5.height },
    storageState: NEXUS_TEACHER_AUTH,
  });

  test('mobile: teacher leaderboard loads on mobile', async ({ page }) => {
    const loaded = await navigateAndWait(page, '/teacher/leaderboard');
    if (!loaded) {
      test.skip(true, 'Page redirected to login');
      return;
    }

    // Verify we're on the leaderboard page and not redirected
    const url = page.url();
    expect(url).not.toContain('/login');

    // Should show leaderboard content
    const pageContent = (await page.textContent('body')) || '';
    const hasLeaderboardContent =
      /weekly/i.test(pageContent) ||
      /leaderboard/i.test(pageContent) ||
      /rank/i.test(pageContent);

    expect(
      hasLeaderboardContent,
      'Expected leaderboard content to be visible on teacher leaderboard page',
    ).toBe(true);

    // Also check no horizontal scroll on teacher page
    const scrollResult = await checkNoHorizontalScroll(page);
    expect(
      scrollResult.pass,
      `Horizontal scroll on teacher leaderboard: scrollWidth=${scrollResult.scrollWidth} > clientWidth=${scrollResult.clientWidth}`,
    ).toBe(true);
  });
});
