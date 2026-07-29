/**
 * The student Library search surface, on a phone.
 *
 * Search is now the point of this screen, so the field has to be reachable
 * without hunting for an icon, usable without iOS zooming the page, and it has
 * to say something useful when it finds nothing.
 *
 * Read-only: navigates and asserts, creates no data.
 *
 * Run: pnpm test:e2e tests/e2e/library-search-nexus-mobile.spec.ts --project=nexus-mobile --no-deps
 */

import { test, expect } from '@playwright/test';
import { injectAuthForPage } from '../utils/credentials';
import { assertNoHorizontalOverflow, assertTouchTargetSize } from '../utils/mobile-helpers';

test.use({ baseURL: 'http://localhost:3012', viewport: { width: 375, height: 812 } });

const SEARCH_FIELD = 'input[aria-label="Search the class library"]';

/**
 * Sign in and open a Library page, or skip when test auth is not configured.
 *
 * Marks the first-run welcome tour as already seen. It is a modal MUI Dialog, so
 * it traps focus: without this, a keypress aimed at the search field never
 * reaches it and every interaction test times out. Setting the flag puts the
 * page in the state a returning student is actually in, which is what these
 * tests are about. See WelcomeOrientation.tsx.
 *
 * Waits on the search field rather than networkidle: a failing RSC prefetch in
 * dev keeps the network busy indefinitely, so networkidle never settles.
 */
async function openLibrary(page: import('@playwright/test').Page, path: string) {
  const authed = await injectAuthForPage(page, 'student');
  test.skip(!authed, 'Test auth not configured');
  await page.addInitScript(() => {
    window.localStorage.setItem('nexus_welcome_seen_v1', new Date().toISOString());
  });
  await page.goto(path);
  await page.locator(SEARCH_FIELD).waitFor({ state: 'visible', timeout: 60_000 });
}

test.describe('Library search on mobile', () => {
  test.describe.configure({ timeout: 120_000 });

  test('the search field is on the home screen, not behind an icon', async ({ page }) => {
    await openLibrary(page, '/student/library');
    const field = page.locator(SEARCH_FIELD);
    await expect(field).toBeVisible();

    // Above the fold on a 375x812 phone, so a student never scrolls to search.
    const box = await field.boundingBox();
    expect(box, 'search field should be laid out').toBeTruthy();
    expect(box!.y).toBeLessThan(400);
  });

  test('the field uses 16px text, so iOS does not zoom the page on focus', async ({ page }) => {
    await openLibrary(page, '/student/library');
    const fontSize = await page
      .locator(SEARCH_FIELD)
      .evaluate((el) => parseFloat(window.getComputedStyle(el).fontSize));
    expect(fontSize).toBeGreaterThanOrEqual(16);
  });

  test('typing a topic and pressing Enter shows results', async ({ page }) => {
    await openLibrary(page, '/student/library');
    await page.locator(SEARCH_FIELD).fill('perspective');
    await page.locator(SEARCH_FIELD).press('Enter');

    await page.waitForURL(/\/student\/library\/search/, { timeout: 30_000 });
    // Either results or an honest empty state, never a blank screen or a crash.
    await expect(
      page.getByText(/result|Nothing found|comes closest/i).first(),
    ).toBeVisible({ timeout: 30_000 });
  });

  test('a query with no match offers topics instead of a dead end', async ({ page }) => {
    await openLibrary(page, '/student/library/search?q=zzzznotarealtopic');
    await expect(page.getByText(/Nothing found/i)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/Try one of these instead/i)).toBeVisible();
  });

  test('the empty state invites a search rather than showing nothing', async ({ page }) => {
    await openLibrary(page, '/student/library/search');
    await expect(page.getByText(/Search by topic, or pick one below/i)).toBeVisible();
  });

  test('no horizontal overflow at 375px on home or search', async ({ page }) => {
    await openLibrary(page, '/student/library');
    await assertNoHorizontalOverflow(page);

    await openLibrary(page, '/student/library/search?q=perspective');
    await assertNoHorizontalOverflow(page);
  });

  test('filter and topic chips are big enough to tap', async ({ page }) => {
    await openLibrary(page, '/student/library');
    // 34px tall chips in a 44px row: MUI pads the row, so check the tap target
    // the browser actually reports rather than the visual chip height.
    await assertTouchTargetSize(page, '.MuiChip-root', 32);
  });

  test('the page loads without console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() !== 'error') return;
      const text = msg.text();
      // Known dev/test noise, matching the nexus-mobile audit's ignore list.
      if (/favicon|ResizeObserver|hydration|MSAL|msal|ChunkLoadError|Download the React DevTools/i.test(text)) return;
      errors.push(text);
    });

    await openLibrary(page, '/student/library');
    expect(errors, `console errors: ${errors.join(' | ')}`).toHaveLength(0);
  });
});
