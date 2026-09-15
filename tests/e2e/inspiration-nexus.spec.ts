import { test, expect, type Page } from '@playwright/test';
import { APP_URLS, injectAuthForPage } from '../utils/credentials';
import { assertNoHorizontalOverflow } from '../utils/mobile-helpers';

/** Teacher Inspiration on a laptop: the grid spreads out, Hidden toggles, Add exemplar opens. */
const NEXUS = APP_URLS.nexus;

test.describe('Teacher Inspiration on a laptop', () => {
  // fullyParallel is on repo-wide; simultaneous test-logins for the same
  // teacher account can 500, so this describe runs its own cases in order
  // on one worker (see inspiration-nexus-mobile.spec.ts for the same fix).
  test.describe.configure({ mode: 'default' });
  test.use({ viewport: { width: 1280, height: 900 } });

  async function open(page: Page): Promise<boolean> {
    const ok = await injectAuthForPage(page, 'teacher');
    if (!ok) return false;
    await page.goto(`${NEXUS}/teacher/inspiration`, { waitUntil: 'domcontentloaded' });
    try {
      await page.locator('button[aria-label="Open profile menu"]').waitFor({ timeout: 90_000 });
    } catch {
      return false;
    }
    return true;
  }

  test('the grid uses the width and nothing scrolls sideways', async ({ page }) => {
    test.setTimeout(120_000);
    test.skip(!(await open(page)), 'Nexus not running');
    await expect(page.getByRole('heading', { name: 'Inspiration', exact: true })).toBeVisible();
    await expect(page.getByTestId('masonry-column').first()).toBeVisible();
    expect(await page.getByTestId('masonry-column').count()).toBeGreaterThanOrEqual(3);
    await assertNoHorizontalOverflow(page);
  });

  test('Hidden is a filter that lives in the URL', async ({ page }) => {
    test.setTimeout(120_000);
    test.skip(!(await open(page)), 'Nexus not running');
    await page.getByRole('button', { name: 'Hidden' }).click();
    await expect(page).toHaveURL(/scope=hidden/);
    await page.getByRole('button', { name: 'Hidden' }).click();
    await expect(page).not.toHaveURL(/scope=hidden/);
  });

  test('Add exemplar opens a form that will not save without a drawing and a type', async ({ page }) => {
    test.setTimeout(120_000);
    test.skip(!(await open(page)), 'Nexus not running');
    await page.getByRole('button', { name: 'Add exemplar' }).click();
    const dialog = page.getByRole('dialog', { name: 'Add an exemplar' });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel('Title').fill('Only a title');
    await expect(dialog.getByRole('button', { name: 'Add to Inspiration' })).toBeDisabled();
  });
});
