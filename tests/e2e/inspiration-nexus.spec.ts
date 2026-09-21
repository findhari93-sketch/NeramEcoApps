import { test, expect, type Page } from '@playwright/test';
import { APP_URLS, TEACHER_ACCOUNT, injectAuthForPage } from '../utils/credentials';
import { createInspirationExemplar, deleteInspirationExemplar } from '../utils/inspiration-fixtures';
import { assertNoHorizontalOverflow } from '../utils/mobile-helpers';

/**
 * Teacher Inspiration on a laptop: the grid spreads out, Hidden toggles, Add exemplar opens.
 *
 * The grid test searches for its own exemplar (seeded in beforeAll, title
 * starts "Qwzx laptop fixture") and waits for a real tile before counting
 * columns: loading skeletons also render inside masonry columns, so counting
 * columns alone could pass on a grid that never loaded.
 */
const NEXUS = APP_URLS.nexus;

test.describe('Teacher Inspiration on a laptop', () => {
  // fullyParallel is on repo-wide; simultaneous test-logins for the same
  // teacher account can 500, so this describe runs its own cases in order
  // on one worker (see inspiration-nexus-mobile.spec.ts for the same fix).
  test.describe.configure({ mode: 'default' });
  test.use({ viewport: { width: 1280, height: 900 } });

  const FIXTURE_TITLE = `Qwzx laptop fixture ${Date.now()}`;
  let teacherToken = '';
  let fixtureId = '';
  let fixtureError = '';

  test.beforeAll(async ({ request }) => {
    const t = await request.post(`${NEXUS}/api/auth/test-login`, { data: { email: TEACHER_ACCOUNT.email, role: 'teacher' } });
    if (t.status() !== 200) {
      fixtureError = `test-login ${t.status()}`;
      return;
    }
    teacherToken = (await t.json()).testToken;
    const fixture = await createInspirationExemplar(request, teacherToken, {
      title: FIXTURE_TITLE,
      brief: 'A travel bag and a hat for the laptop grid test',
    });
    if ('error' in fixture) {
      fixtureError = fixture.error;
      console.log(`[inspiration laptop fixture] ${fixture.error}`);
      return;
    }
    fixtureId = fixture.id;
  });

  test.afterAll(async ({ request }) => {
    if (fixtureId && teacherToken) {
      expect([200, 404]).toContain(await deleteInspirationExemplar(request, teacherToken, fixtureId));
    }
  });

  async function open(page: Page, route = '/teacher/inspiration'): Promise<boolean> {
    const ok = await injectAuthForPage(page, 'teacher');
    if (!ok) return false;
    await page.goto(`${NEXUS}${route}`, { waitUntil: 'domcontentloaded' });
    try {
      await page.locator('button[aria-label="Open profile menu"]').waitFor({ timeout: 90_000 });
    } catch {
      return false;
    }
    return true;
  }

  test('the grid uses the width and nothing scrolls sideways', async ({ page }) => {
    test.setTimeout(150_000);
    test.skip(!teacherToken, 'Nexus not running');
    expect(fixtureId, `the laptop fixture exemplar was not created: ${fixtureError}`).toBeTruthy();
    test.skip(!(await open(page, `/teacher/inspiration?q=${encodeURIComponent(FIXTURE_TITLE)}`)), 'Nexus not running');

    // Inspiration is a tab of the Drawings hub now; the heading is the hub's.
    await expect(page.getByRole('heading', { name: 'Drawings', exact: true })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Inspiration', selected: true })).toBeVisible();
    // A real tile, not a skeleton: the grid has loaded before its columns are counted.
    const tile = page.getByTestId('inspiration-tile').first();
    await expect(tile).toBeVisible({ timeout: 60_000 });
    await expect(tile).toContainText(FIXTURE_TITLE);
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
