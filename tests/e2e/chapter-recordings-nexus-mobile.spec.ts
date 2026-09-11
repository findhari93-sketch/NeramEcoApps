import { test, expect, type Page } from '@playwright/test';
import { APP_URLS, injectAuthForPage, getTestAuthToken } from '../utils/credentials';
import { assertNoHorizontalOverflow, assertTouchTargetSize } from '../utils/mobile-helpers';

/**
 * A chapter's Class recordings page, at 375px.
 *
 * It replaces a dialog that had no address: its "Edit" opened a checkpoint editor
 * whose Back dropped the teacher at the Study Materials root, it named a Tamil
 * video "DispForm.aspx", and its Change and Move buttons said nothing about what
 * they did. What these lock down is the journey:
 *   - Setup opens the page and Back returns to Setup; the library menu opens it
 *     and Back returns to the library;
 *   - each language is a tab, and the tab is in the URL, so a refresh keeps it;
 *   - a language with no video says videos come from SharePoint, with both ways in;
 *   - a OneDrive link is refused with its reason before anything is saved;
 *   - none of the new routes answer a student.
 *
 * Most checks use a chapter id no environment has. The tracks API lists every
 * offered language for any chapter, so the tabs, the empty state and the back
 * links can be checked without depending on what data an environment holds.
 * Nothing here saves anything.
 */

const NEXUS = APP_URLS.nexus;
const PHONE = { width: 375, height: 812 };
const COLD_COMPILE_BUDGET = 120_000;
const NO_SUCH_CHAPTER = '00000000-0000-4000-8000-000000000000';
const NO_SUCH_TRACK = '00000000-0000-4000-8000-000000000001';

/** The real Tamil recording's list form link on prod, which lives in a personal OneDrive. */
const ONEDRIVE_LINK =
  'https://nerasmclasses-my.sharepoint.com/personal/haribabu_neramclasses_com/Documents/Forms/DispForm.aspx?ID=10171';

async function openRecordingsPage(page: Page, query = '') {
  await page.goto(`${NEXUS}/teacher/study-materials/${NO_SUCH_CHAPTER}/recordings${query}`, {
    waitUntil: 'domcontentloaded',
  });
  await expect(page.getByRole('heading', { name: 'Class recordings' })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('tab').first()).toBeVisible({ timeout: 60_000 });
}

/** Open a real chapter from the library, following folders a few levels down. */
async function firstChapterId(page: Page): Promise<string | null> {
  await page.goto(`${NEXUS}/teacher/study-materials`, { waitUntil: 'domcontentloaded' });
  for (let depth = 0; depth < 4; depth += 1) {
    await page.waitForTimeout(4000);
    const cards = page.locator('.MuiCardActionArea-root');
    if ((await cards.count()) === 0) return null;
    await cards.first().click();
    await page.waitForTimeout(2500);
    const match = page.url().match(/\/teacher\/study-materials\/([0-9a-f-]{36})(?:[/?#]|$)/i);
    if (match) return match[1];
  }
  return null;
}

test.describe('Class recordings page (mobile)', () => {
  test.setTimeout(COLD_COMPILE_BUDGET);

  test('each language is a tab that says where it stands, and the tab lives in the URL', async ({ browser }) => {
    const context = await browser.newContext({ viewport: PHONE });
    const page = await context.newPage();
    test.skip(!(await injectAuthForPage(page, 'teacher')), 'Nexus test-login unavailable');

    await openRecordingsPage(page);
    const tabs = page.getByRole('tab');
    expect(await tabs.count()).toBeGreaterThanOrEqual(2);
    await expect(page.getByRole('tab', { name: /English/ })).toBeVisible();
    await expect(page.getByRole('tab', { name: /தமிழ்/ })).toBeVisible();
    // The state in words on every tab, never colour alone.
    await expect(page.getByRole('tab', { name: /Not added/ }).first()).toBeVisible();

    await page.getByRole('tab', { name: /தமிழ்/ }).click();
    await expect(page).toHaveURL(/[?&]lang=ta\b/);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('tab', { name: /தமிழ்/ })).toHaveAttribute('aria-selected', 'true', { timeout: 60_000 });

    await assertNoHorizontalOverflow(page);
    await assertTouchTargetSize(page, '[role="tab"]', 44);
    await context.close();
  });

  test('a language with no video says where videos come from, and offers both ways in', async ({ browser }) => {
    const context = await browser.newContext({ viewport: PHONE });
    const page = await context.newPage();
    test.skip(!(await injectAuthForPage(page, 'teacher')), 'Nexus test-login unavailable');

    await openRecordingsPage(page);
    await expect(page.getByText(/Videos are not uploaded to Nexus/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Find video in SharePoint' })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Paste a SharePoint link' })).toBeEnabled();

    await assertNoHorizontalOverflow(page);
    await context.close();
  });

  test('finding a video opens the library picker as a bottom sheet, with a way out', async ({ browser }) => {
    const context = await browser.newContext({ viewport: PHONE });
    const page = await context.newPage();
    test.skip(!(await injectAuthForPage(page, 'teacher')), 'Nexus test-login unavailable');

    await openRecordingsPage(page);
    await page.getByRole('button', { name: 'Find video in SharePoint' }).click();

    const sheet = page.locator('.MuiDrawer-root').last();
    await expect(sheet.getByText(/Choose the .+ class recording/)).toBeVisible({ timeout: 30_000 });
    await expect(sheet.getByText('Not listed here?')).toBeVisible({ timeout: 30_000 });
    await expect(sheet.getByRole('button', { name: 'Paste a SharePoint link' })).toBeVisible();

    await assertNoHorizontalOverflow(page);
    await context.close();
  });

  test('a OneDrive link is refused with its reason, and nothing is saved', async ({ browser }) => {
    const context = await browser.newContext({ viewport: PHONE });
    const page = await context.newPage();
    test.skip(!(await injectAuthForPage(page, 'teacher')), 'Nexus test-login unavailable');

    await openRecordingsPage(page);
    await page.getByRole('button', { name: 'Paste a SharePoint link' }).click();
    await page.getByLabel('SharePoint link').fill(ONEDRIVE_LINK);
    await page.getByRole('button', { name: 'Check link' }).click();

    // OneDrive while the file stays there; "could not be found" once it has been
    // moved into the library, which is the fix this message asks for.
    await expect(page.getByText(/personal OneDrive|could not be found|did not answer/)).toBeVisible({ timeout: 60_000 });
    // Still asking: no "Use this video?" was offered for a refused file.
    await expect(page.getByText(/Use this video for/)).toHaveCount(0);

    await context.close();
  });

  test('Back returns to the chapter Setup tab by default, and to the library when opened from it', async ({ browser }) => {
    const context = await browser.newContext({ viewport: PHONE });
    const page = await context.newPage();
    test.skip(!(await injectAuthForPage(page, 'teacher')), 'Nexus test-login unavailable');

    await openRecordingsPage(page);
    const back = page.getByRole('link', { name: /^Back to/ }).first();
    await expect(back).toHaveAttribute('href', `/teacher/study-materials/${NO_SUCH_CHAPTER}?tab=setup`);

    await openRecordingsPage(page, '?from=library');
    const libraryBack = page.getByRole('link', { name: /^Back to/ }).first();
    await expect(libraryBack).toHaveAttribute('href', /^\/teacher\/study-materials(\?folder=.+)?$/);

    // Done goes the same way.
    await page.getByRole('button', { name: 'Done' }).click();
    await expect(page).toHaveURL(/\/teacher\/study-materials(\?folder=[^&]+)?$/, { timeout: 60_000 });

    await context.close();
  });

  test('a real chapter: Setup opens the page and Back returns to Setup', async ({ browser }) => {
    const context = await browser.newContext({ viewport: PHONE });
    const page = await context.newPage();
    test.skip(!(await injectAuthForPage(page, 'teacher')), 'Nexus test-login unavailable');

    const id = await firstChapterId(page);
    test.skip(!id, 'No chapter in this environment');

    await page.goto(`${NEXUS}/teacher/study-materials/${id}?tab=setup`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Manage' }).first().click({ timeout: 60_000 });
    await expect(page).toHaveURL(new RegExp(`/teacher/study-materials/${id}/recordings`), { timeout: 60_000 });
    await expect(page.getByRole('heading', { name: 'Class recordings' })).toBeVisible();

    // The file name is never a SharePoint page name.
    await expect(page.getByText('DispForm.aspx')).toHaveCount(0);

    await page.getByRole('link', { name: /^Back to/ }).first().click();
    await expect(page).toHaveURL(new RegExp(`/teacher/study-materials/${id}\\?tab=setup`), { timeout: 60_000 });

    await assertNoHorizontalOverflow(page);
    await context.close();
  });

  test('none of the recordings routes answer a student', async ({ request }) => {
    const auth = await getTestAuthToken(request, 'student');
    test.skip(!auth?.testToken, 'Nexus test-login unavailable');
    const headers = { Authorization: `Bearer ${auth!.testToken}`, 'Content-Type': 'application/json' };
    const base = `${NEXUS}/api/study-materials/files/${NO_SUCH_CHAPTER}/video-tracks`;

    const calls = [
      request.get(`${base}?resolve=1`, { headers }),
      request.post(`${base}/resolve-link`, { headers, data: { url: ONEDRIVE_LINK } }),
      request.get(`${base}/${NO_SUCH_TRACK}/preview`, { headers }),
      request.get(`${base}/${NO_SUCH_TRACK}/thumbnail`, { headers }),
      request.post(`${base}/${NO_SUCH_TRACK}/prepare`, { headers, data: {} }),
      request.get(`${NEXUS}/api/sharepoint/thumbnail?drive=b!x&item=y`, { headers }),
    ];
    for (const res of await Promise.all(calls)) {
      expect(res.status(), res.url()).toBe(403);
    }
  });
});
