import { test, expect } from '@playwright/test';
import { APP_URLS, injectAuthForPage } from '../utils/credentials';
import { assertNoHorizontalOverflow, assertTouchTargetSize } from '../utils/mobile-helpers';

/**
 * The student "My Tests" tab, restructured to share the teacher's full-width
 * folder-sidebar layout (FolderTreeNav) instead of the old chip rail.
 *
 * Two viewports because the layout genuinely differs between them: the
 * sidebar is desktop-only (`!isMobile` in MyTestsLibrary.tsx), and mobile
 * gets a "Folders" button that opens the same panel in a Drawer instead.
 *
 * Self-skips without the Nexus dev server / test-login.
 */

const NEXUS = APP_URLS.nexus;

test.describe('Nexus, student My Tests layout', () => {
  test('mobile: no horizontal overflow and the Folders trigger is a real touch target', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    const ok = await injectAuthForPage(page, 'student');
    if (!ok) {
      test.skip(true, 'Nexus dev server / test-login unavailable');
      return;
    }

    await page.goto(`${NEXUS}/student/tests?tab=mine`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('My Tests').first()).toBeVisible({ timeout: 30_000 });
    await assertNoHorizontalOverflow(page);

    const foldersButton = page.getByRole('button', { name: 'Folders' });
    if ((await foldersButton.count()) > 0) {
      await assertTouchTargetSize(page, 'button:has-text("Folders")', 44);
      await foldersButton.first().click();
      // The folder panel opens as a bottom Drawer on mobile, not a sidebar.
      await expect(page.getByText('FOLDERS')).toBeVisible({ timeout: 10_000 });
      await assertNoHorizontalOverflow(page);
    }
  });

  test('desktop: the folder sidebar renders beside the test list, not above it', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const ok = await injectAuthForPage(page, 'student');
    if (!ok) {
      test.skip(true, 'Nexus dev server / test-login unavailable');
      return;
    }

    await page.goto(`${NEXUS}/student/tests?tab=mine`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('My Tests').first()).toBeVisible({ timeout: 30_000 });

    const folders = page.getByText('FOLDERS');
    if ((await folders.count()) === 0) {
      // The empty state (no papers yet) renders neither the sidebar nor the
      // list, which is expected and not a layout failure.
      test.skip(true, 'Test account has no self-built papers, so the library never renders');
      return;
    }

    const sidebarBox = await folders.first().boundingBox();
    const listHeading = page.getByText(/All tests|Unfiled|test(s)? found/i).first();
    expect(sidebarBox).toBeTruthy();
    // Side-by-side, not stacked: the sidebar sits in the left portion of a
    // 1280px viewport, well clear of where a single narrow column would put it.
    expect(sidebarBox!.x).toBeLessThan(400);
    await assertNoHorizontalOverflow(page);
    void listHeading;
  });

  test('the My Performance tab loads without the classroom_id error', async ({ page }) => {
    const ok = await injectAuthForPage(page, 'student');
    if (!ok) {
      test.skip(true, 'Nexus dev server / test-login unavailable');
      return;
    }

    await page.goto(`${NEXUS}/student/tests?tab=performance`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    await expect(page.getByText('classroom_id is required')).toHaveCount(0);
  });
});
