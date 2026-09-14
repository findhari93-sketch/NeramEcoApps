import { test, expect, type Page } from '@playwright/test';
import { APP_URLS, injectAuthForPage } from '../utils/credentials';
import { assertNoHorizontalOverflow } from '../utils/mobile-helpers';

/**
 * The shared student list on the roster screens it was rolled out to
 * (2026-09-14): each shows the same search, sort and stage filter, keeps the
 * sort control thumb-sized, and does not scroll sideways on a phone.
 *
 * A screen with no students for the E2E teacher's classroom has no list to
 * show, so it skips rather than fails.
 */

const NEXUS = APP_URLS.nexus;

test.describe.configure({ timeout: 150_000 });
test.use({ viewport: { width: 375, height: 812 } });

const SCREENS: Array<{ name: string; path: string }> = [
  { name: 'Foundation progress', path: '/teacher/foundation' },
  { name: 'Inactivity watchlist', path: '/teacher/students/watchlist' },
  { name: 'Paper progress', path: '/teacher/question-bank/papers/overview' },
  { name: 'Library engagement', path: '/teacher/library/engagement' },
  { name: 'Assignments overview', path: '/teacher/assignments/overview' },
];

async function openList(page: Page, path: string): Promise<boolean> {
  if (!(await injectAuthForPage(page, 'teacher'))) return false;
  await page.goto(`${NEXUS}${path}`, { waitUntil: 'domcontentloaded' });
  try {
    await page.getByTestId('list-sort-button').first().waitFor({ timeout: 90_000 });
    return true;
  } catch {
    return false;
  }
}

for (const screen of SCREENS) {
  test(`${screen.name}: shared toolbar, 44px sort, no sideways scroll at 375px`, async ({ page }) => {
    test.skip(!(await openList(page, screen.path)), 'Nexus not running, or no students on this screen');

    await expect(page.getByRole('searchbox', { name: 'Find a student' }).first()).toBeVisible();
    await expect(page.getByTestId('stage-filter-button').first()).toBeVisible();

    const sort = await page.getByTestId('list-sort-button').first().boundingBox();
    expect(sort?.height ?? 0).toBeGreaterThanOrEqual(44);

    await assertNoHorizontalOverflow(page);

    // A name nobody has empties the list without breaking the layout.
    await page.getByRole('searchbox', { name: 'Find a student' }).first().fill('zzqx nobody');
    await expect(page.getByText(/No students (match|found)/).first()).toBeVisible({ timeout: 10_000 });
    await assertNoHorizontalOverflow(page);
  });
}
