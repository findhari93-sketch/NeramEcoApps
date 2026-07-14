import { test, expect } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';
import { APP_URLS, injectAuthForPage } from '../utils/credentials';
import { assertNoHorizontalOverflow } from '../utils/mobile-helpers';

/**
 * Teacher Study Materials — grid/list view toggle + in-app file preview.
 *
 * These are the two teacher-facing additions that bring the page to parity with
 * the student browser:
 *   - a Grid/List layout toggle whose choice is remembered (localStorage), and
 *   - clicking a file opens the same StudyFileViewer students use (preview),
 *     instead of the old teacher page where files could only be managed via the
 *     ... menu with no way to open them.
 *
 * The preview test needs at least one uploaded file, which is environment
 * dependent (SharePoint-backed), so it locates a file via the folders API and
 * self-skips if none exist. The whole suite self-skips without the Nexus dev
 * server / test-login on :3012.
 */

const NEXUS = APP_URLS.nexus;
const PAGE = `${NEXUS}/teacher/study-materials`;

// The dev server compiles the route on first hit, so the first render can take a while.
const HEADING_TIMEOUT = 20_000;

/** Walk root + up to two folder levels to find the first folder that holds a file. */
async function findFileLocation(
  request: APIRequestContext,
): Promise<{ folderId: string | null; title: string } | null> {
  const get = async (parent?: string) => {
    const res = await request.get(`${NEXUS}/api/study-materials/folders${parent ? `?parent=${parent}` : ''}`);
    return res.ok() ? await res.json() : null;
  };
  const root = await get();
  if (!root) return null;
  if (root.files?.length) return { folderId: null, title: root.files[0].title };
  for (const f of root.folders || []) {
    const lvl1 = await get(f.id);
    if (lvl1?.files?.length) return { folderId: f.id, title: lvl1.files[0].title };
    for (const sub of lvl1?.folders || []) {
      const lvl2 = await get(sub.id);
      if (lvl2?.files?.length) return { folderId: sub.id, title: lvl2.files[0].title };
    }
  }
  return null;
}

test.describe('Nexus — Teacher Study Materials', () => {
  test('grid/list view toggle switches and is remembered across reloads', async ({ page }) => {
    test.setTimeout(60_000);
    const ok = await injectAuthForPage(page, 'teacher');
    if (!ok) {
      test.skip(true, 'Nexus dev server / test-login unavailable');
      return;
    }

    await page.goto(PAGE, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Study Materials' })).toBeVisible({ timeout: HEADING_TIMEOUT });

    const gridBtn = page.getByRole('button', { name: 'Grid view' });
    const listBtn = page.getByRole('button', { name: 'List view' });
    await expect(gridBtn).toBeVisible();
    await expect(listBtn).toBeVisible();

    // Default is grid.
    await expect(gridBtn).toHaveAttribute('aria-pressed', 'true');

    // Switch to list — the choice is persisted immediately.
    await listBtn.click();
    await expect(listBtn).toHaveAttribute('aria-pressed', 'true');
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem('nexus:study-view')))
      .toBe('list');

    // Reload — the list layout is restored from localStorage.
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Study Materials' })).toBeVisible({ timeout: HEADING_TIMEOUT });
    await expect(page.getByRole('button', { name: 'List view' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('clicking a file opens the in-app preview (parity with students)', async ({ page }) => {
    test.setTimeout(60_000);
    const ok = await injectAuthForPage(page, 'teacher');
    if (!ok) {
      test.skip(true, 'Nexus dev server / test-login unavailable');
      return;
    }

    // page.request now carries the teacher auth header (set by injectAuthForPage).
    const loc = await findFileLocation(page.request);
    if (!loc) {
      test.skip(true, 'No study-materials files present to preview');
      return;
    }

    await page.goto(`${PAGE}${loc.folderId ? `?folder=${loc.folderId}` : ''}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Study Materials' })).toBeVisible({ timeout: HEADING_TIMEOUT });
    await page.waitForLoadState('networkidle').catch(() => undefined);

    // The file title renders as an h6 heading inside the clickable card; clicking it
    // bubbles to the card action and opens the viewer. Allow for dev first-hit compile.
    const fileHeading = page.getByRole('heading', { name: loc.title, exact: true }).first();
    await expect(fileHeading).toBeVisible({ timeout: 20_000 });
    await fileHeading.click();

    // The shared viewer opens as a dialog with a Close control.
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Close' })).toBeVisible();

    // Closing returns to the browser.
    await dialog.getByRole('button', { name: 'Close' }).click();
    await expect(dialog).toBeHidden();
  });

  // The organise controls (drag handles + Move to folder / Move up / Move down) are asserted for
  // presence only. We deliberately do NOT execute a move or reorder here: the local dev server can
  // point at the production database, so persisting a reorder would mutate real teaching materials.
  test('reorder + move controls are present in the file menu', async ({ page }) => {
    test.setTimeout(60_000);
    const ok = await injectAuthForPage(page, 'teacher');
    if (!ok) {
      test.skip(true, 'Nexus dev server / test-login unavailable');
      return;
    }

    const loc = await findFileLocation(page.request);
    if (!loc || !loc.folderId) {
      test.skip(true, 'No study-materials file inside a folder to organise');
      return;
    }

    await page.goto(`${PAGE}?folder=${loc.folderId}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Study Materials' })).toBeVisible({ timeout: HEADING_TIMEOUT });
    await page.waitForLoadState('networkidle').catch(() => undefined);

    // Switch to list view, where each file row exposes an accessible "File actions" button.
    await page.getByRole('button', { name: 'List view' }).click();

    // Always-on drag handles are rendered.
    await expect(page.getByLabel('Drag to reorder or move').first()).toBeVisible({ timeout: 20_000 });

    // Open the first file's ... menu and confirm the new organise actions exist.
    await page.getByRole('button', { name: 'File actions' }).first().click();
    const menu = page.getByRole('menu');
    await expect(menu.getByRole('menuitem', { name: 'Move to folder...' })).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: 'Move up' })).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: 'Move down' })).toBeVisible();
  });

  test('Move to folder picker opens and lists folders, then cancels without changes', async ({ page }) => {
    test.setTimeout(60_000);
    const ok = await injectAuthForPage(page, 'teacher');
    if (!ok) {
      test.skip(true, 'Nexus dev server / test-login unavailable');
      return;
    }

    const loc = await findFileLocation(page.request);
    if (!loc || !loc.folderId) {
      test.skip(true, 'No study-materials file inside a folder to organise');
      return;
    }

    await page.goto(`${PAGE}?folder=${loc.folderId}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Study Materials' })).toBeVisible({ timeout: HEADING_TIMEOUT });
    await page.waitForLoadState('networkidle').catch(() => undefined);
    await page.getByRole('button', { name: 'List view' }).click();

    await page.getByRole('button', { name: 'File actions' }).first().click();
    await page.getByRole('menuitem', { name: 'Move to folder...' }).click();

    // The picker dialog opens and lists folders; the file's own folder is flagged "Current".
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 20_000 });
    await expect(dialog.getByText('Current').first()).toBeVisible();

    // Cancel: no move is persisted.
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();
  });
});

test.describe('Nexus — Teacher Study Materials (mobile)', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('view toggle renders and no horizontal overflow at 375px', async ({ page }) => {
    test.setTimeout(60_000);
    const ok = await injectAuthForPage(page, 'teacher');
    if (!ok) {
      test.skip(true, 'Nexus dev server / test-login unavailable');
      return;
    }

    await page.goto(PAGE, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Study Materials' })).toBeVisible({ timeout: HEADING_TIMEOUT });
    await expect(page.getByRole('button', { name: 'Grid view' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'List view' })).toBeVisible();
    await assertNoHorizontalOverflow(page);
  });
});
