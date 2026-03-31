/**
 * Mobile Testing Helpers (Playwright)
 *
 * Utilities for testing mobile-first UX: overflow detection, touch targets,
 * network simulation, PWA features, and accessibility checks.
 *
 * For Nexus-specific mobile utilities, see ../e2e/nexus-mobile-utils.ts.
 */

import { Page, expect } from '@playwright/test';

/**
 * Verify no horizontal overflow on mobile.
 * Catches the #1 bug — desktop-only layouts that break on 375px.
 */
export async function assertNoHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => {
    return document.documentElement.scrollWidth > document.documentElement.clientWidth;
  });
  expect(overflow, 'Page has horizontal overflow on mobile').toBe(false);
}

/**
 * Verify touch targets are at least 44×44px (WCAG 2.5.5).
 * Students on small Android phones need tappable buttons.
 *
 * @param selector - CSS selector for interactive elements to check
 * @param minSize - Minimum size in pixels (default: 44)
 */
export async function assertTouchTargetSize(
  page: Page,
  selector: string,
  minSize: number = 44,
): Promise<void> {
  const elements = await page.locator(selector).all();
  for (const element of elements) {
    const box = await element.boundingBox();
    if (box) {
      expect(box.width, `Touch target too narrow: ${await element.textContent()}`).toBeGreaterThanOrEqual(minSize);
      expect(box.height, `Touch target too short: ${await element.textContent()}`).toBeGreaterThanOrEqual(minSize);
    }
  }
}

/**
 * Simulate offline mode for PWA testing.
 */
export async function goOffline(page: Page): Promise<void> {
  await page.context().setOffline(true);
}

/**
 * Restore network after offline testing.
 */
export async function goOnline(page: Page): Promise<void> {
  await page.context().setOffline(false);
}

/**
 * Simulate slow 3G (common for students in rural Tamil Nadu, UAE, Saudi).
 * 500 Kbps down, 400ms latency.
 */
export async function simulateSlow3G(page: Page): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    downloadThroughput: (500 * 1024) / 8,
    uploadThroughput: (500 * 1024) / 8,
    latency: 400,
  });
}

/**
 * Wait for PWA service worker to activate.
 */
export async function waitForServiceWorker(page: Page): Promise<void> {
  await page.evaluate(async () => {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.ready;
      return reg.active?.state === 'activated';
    }
    return false;
  });
}

/**
 * Run axe accessibility check on current page.
 * Catches missing labels, low contrast, etc.
 */
export async function checkAccessibility(page: Page): Promise<void> {
  const { injectAxe, checkA11y } = await import('axe-playwright');
  await injectAxe(page);
  await checkA11y(page, undefined, {
    detailedReport: true,
    detailedReportOptions: { html: true },
  });
}
