import { test, expect } from '@playwright/test';
import { APP_URLS, injectAuthForPage } from '../utils/credentials';
import { assertNoHorizontalOverflow } from '../utils/mobile-helpers';

/**
 * Working a chapter from inside it, at 375px.
 *
 * The teacher's open chapter was read-only: attaching a test, attaching
 * recordings and seeing who was studying all lived behind the grid card's menu,
 * so answering "does this chapter work" meant closing the document first. On
 * production every chapter had been opened by students and not one had ever
 * been completed, and nothing on any screen said why.
 *
 * What these lock down: a teacher gets four tabs rather than two, the document
 * is still what opens first, Setup states the chapter's condition in words, and
 * the Students tab reports which language the cohort watched in, a number the
 * report has always returned and nothing has ever drawn.
 *
 * Read-only against real data. Nothing here presses a button that writes, and
 * nothing asserts a specific chapter's contents, because which chapters exist
 * and what is attached to them is data that changes between environments.
 */

const NEXUS = APP_URLS.nexus;
const PHONE = { width: 375, height: 812 };
const COLD_COMPILE_BUDGET = 120_000;

/** Open the first previewable chapter in the browser and return its dialog. */
async function openFirstChapter(page: any) {
  await page.goto(`${NEXUS}/teacher/study-materials`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);

  const cards = page.locator('.MuiCardActionArea-root');
  if ((await cards.count()) === 0) return null;

  // Folders and files share this control, and a folder navigates instead of
  // opening a dialog. Walk them until one produces a dialog.
  const total = Math.min(await cards.count(), 6);
  for (let i = 0; i < total; i += 1) {
    await cards.nth(i).click();
    const dialog = page.getByRole('dialog');
    if (await dialog.isVisible().catch(() => false)) return dialog;
    await page.waitForTimeout(1200);
    if (await dialog.isVisible().catch(() => false)) return dialog;
    // A folder: go back up and try the next thing.
    if (!page.url().includes('/teacher/study-materials')) return null;
  }
  return null;
}

test.describe('Chapter workspace (mobile)', () => {
  test.setTimeout(COLD_COMPILE_BUDGET);

  test('a teacher gets four tabs and still lands on the document', async ({ browser }) => {
    const context = await browser.newContext({ viewport: PHONE });
    const page = await context.newPage();

    const injected = await injectAuthForPage(page, 'teacher');
    test.skip(!injected, 'Nexus test-login unavailable');

    const dialog = await openFirstChapter(page);
    test.skip(!dialog, 'No previewable study file in this environment');

    await expect(dialog!).toBeVisible({ timeout: 20_000 });

    // Four, not two. A student sees Document and Comments only, which is why
    // Setup and Students are the assertion rather than the count alone.
    await expect(dialog!.getByRole('button', { name: /^Setup$/ })).toBeVisible();
    await expect(dialog!.getByRole('button', { name: /^Students$/ })).toBeVisible();
    await expect(dialog!.getByRole('button', { name: /^Comments$/ })).toBeVisible();

    // Opening a chapter is still reading it. Setup is one tap away, not in the
    // way: the Doc tab is the pressed one.
    await expect(dialog!.getByRole('button', { name: /^Doc$/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await assertNoHorizontalOverflow(page);
    await context.close();
  });

  test('Setup names the chapter s condition rather than only offering buttons', async ({ browser }) => {
    const context = await browser.newContext({ viewport: PHONE });
    const page = await context.newPage();

    const injected = await injectAuthForPage(page, 'teacher');
    test.skip(!injected, 'Nexus test-login unavailable');

    const dialog = await openFirstChapter(page);
    test.skip(!dialog, 'No previewable study file in this environment');
    await expect(dialog!).toBeVisible({ timeout: 20_000 });

    await dialog!.getByRole('button', { name: /^Setup$/ }).click();

    // All four lines, always, so the checklist keeps its shape between
    // chapters and a teacher can scan a folder of them.
    for (const line of ['Test', 'Recordings', 'Quick video link', 'Download']) {
      await expect(dialog!.getByText(line, { exact: true })).toBeVisible({ timeout: 20_000 });
    }

    // The sentence that makes the whole rail worth opening. Either the chapter
    // has a test or it says, in words, that nobody can finish it.
    const body = await dialog!.innerText();
    expect(/Attached\.|cannot complete this chapter/i.test(body)).toBe(true);

    // Every action is a real touch target, not an icon squeezed into a row.
    const buttons = dialog!.locator('button');
    for (let i = 0; i < Math.min(await buttons.count(), 12); i += 1) {
      const box = await buttons.nth(i).boundingBox();
      if (box && box.height > 0) expect(box.height).toBeGreaterThanOrEqual(36);
    }

    await assertNoHorizontalOverflow(page);
    await context.close();
  });

  test('Students reports which language the cohort watched in', async ({ browser }) => {
    const context = await browser.newContext({ viewport: PHONE });
    const page = await context.newPage();

    const injected = await injectAuthForPage(page, 'teacher');
    test.skip(!injected, 'Nexus test-login unavailable');

    const dialog = await openFirstChapter(page);
    test.skip(!dialog, 'No previewable study file in this environment');
    await expect(dialog!).toBeVisible({ timeout: 20_000 });

    await dialog!.getByRole('button', { name: /^Students$/ }).click();

    // The line this whole tab exists for. "not watched N" is always present,
    // including on a chapter with no recordings, because zero watchers is the
    // answer rather than the absence of one.
    await expect(dialog!.getByText(/Watched in/i)).toBeVisible({ timeout: 25_000 });
    await expect(dialog!.getByText(/not watched \d+/i)).toBeVisible();

    // The way through to filtering, sorting and Message, which deliberately
    // stay on the full page rather than being rebuilt in a 360px rail.
    await expect(dialog!.getByRole('button', { name: /open the full report/i })).toBeVisible();

    await assertNoHorizontalOverflow(page);
    await context.close();
  });

  test('a student still sees two tabs, and no teacher data', async ({ browser }) => {
    const context = await browser.newContext({ viewport: PHONE });
    const page = await context.newPage();

    const injected = await injectAuthForPage(page, 'student');
    test.skip(!injected, 'Nexus test-login unavailable');

    await page.goto(`${NEXUS}/student/study-materials`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(5000);

    const cards = page.locator('.MuiCardActionArea-root');
    test.skip((await cards.count()) === 0, 'No study files visible to this student');
    await cards.first().click();

    const dialog = page.getByRole('dialog');
    if (!(await dialog.isVisible().catch(() => false))) {
      test.skip(true, 'First tile was a folder in this environment');
    }

    // The rail is opt-in. Passing no `manage` has to leave the student viewer
    // exactly as it was, which is the thing most likely to break silently.
    await expect(dialog.getByRole('button', { name: /^Document$/ })).toBeVisible();
    await expect(dialog.getByRole('button', { name: /^Setup$/ })).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: /^Students$/ })).toHaveCount(0);

    await assertNoHorizontalOverflow(page);
    await context.close();
  });
});
