import { test, expect } from '@playwright/test';
import { APP_URLS, injectAuthForPage } from '../utils/credentials';
import { assertNoHorizontalOverflow, assertTouchTargetSize } from '../utils/mobile-helpers';

/**
 * The student Study Materials list, at 375px (NXS-0131).
 *
 * On a phone the two-column covers grid cut every chapter title off at about
 * 15 characters, so a student scrolling "Foundation Books" could not tell
 * which chapter was which. A phone with no saved preference now opens on the
 * list: full-width rows, a two-line title, one status line and 44px controls.
 *
 * Read-only against real data. Which folders and chapters exist changes between
 * environments, so nothing here asserts a specific title.
 */

const NEXUS = APP_URLS.nexus;
const PHONE = { width: 375, height: 812 };

test.describe('Nexus student study materials: phone list', () => {
  test('a phone with no saved layout opens on the list', async ({ browser }) => {
    const context = await browser.newContext({ viewport: PHONE });
    const page = await context.newPage();
    const injected = await injectAuthForPage(page, 'student');
    test.skip(!injected, 'Nexus test-login unavailable');

    await page.addInitScript(() => {
      try { window.localStorage.removeItem('nexus:study-view'); } catch { /* ignore */ }
    });
    await page.goto(`${NEXUS}/student/study-materials`, { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('button', { name: 'List view' })).toHaveClass(/Mui-selected/, { timeout: 30_000 });
    await expect(page.locator('.MuiCardActionArea-root')).toHaveCount(0);
    await assertNoHorizontalOverflow(page);
    await context.close();
  });

  test('chapter rows: page-shaped cover, 44px controls, no overflow', async ({ browser }) => {
    const context = await browser.newContext({ viewport: PHONE });
    const page = await context.newPage();
    const injected = await injectAuthForPage(page, 'student');
    test.skip(!injected, 'Nexus test-login unavailable');

    await page.addInitScript(() => {
      try { window.localStorage.setItem('nexus:study-view', 'list'); } catch { /* ignore */ }
    });
    await page.goto(`${NEXUS}/student/study-materials`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);

    // Walk into the first folder, since the top level holds folders only.
    const folder = page.locator('[role="button"][aria-label^="Open folder "]').first();
    test.skip((await folder.count()) === 0, 'No folders visible to this student');
    await folder.click();
    await page.waitForTimeout(4000);

    const rows = page.locator('[role="button"][aria-label^="Open "]:not([aria-label^="Open folder "])');
    test.skip((await rows.count()) === 0, 'First folder has no chapters in this environment');

    const box = await rows.first().boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(72);
    await expect(rows.first().getByText(/Completed|In progress|Not started/)).toBeVisible();

    await assertTouchTargetSize(page, 'button[aria-label="Add to starred"], button[aria-label="Remove from starred"]');
    await assertTouchTargetSize(page, '.MuiToggleButtonGroup-root .MuiToggleButton-root');
    await assertNoHorizontalOverflow(page);
    await context.close();
  });
});
