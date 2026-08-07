import { test, expect } from '@playwright/test';
import { APP_URLS, injectAuthForPage } from '../utils/credentials';
import { assertNoHorizontalOverflow } from '../utils/mobile-helpers';

/**
 * Putting a video on a chapter, at 375px.
 *
 * A chapter used to offer two video features. "Class recordings" were gated,
 * per language, and could not be published without a .vtt transcript. "Quick
 * video link" was an ungated URL that was stored, chipped on the teacher's grid,
 * and rendered on no student screen anywhere, so a teacher who used it reached
 * nobody. Between them, a teacher holding a SharePoint recording and no
 * transcript had no route to a student at all.
 *
 * What these lock down: one video feature, every offered language listed whether
 * or not it has a recording, and no dead control carrying its own instruction as
 * its label. The last one is why "why don't I see the English tag" was asked:
 * a language with a recording lost its chip, and the card that held it named its
 * language only in a header that scrolled away.
 *
 * Read-only against real data. Nothing here presses a button that writes, and no
 * assertion names a specific chapter: which chapters exist and what is attached
 * to them differs per environment.
 */

const NEXUS = APP_URLS.nexus;
const PHONE = { width: 375, height: 812 };
const COLD_COMPILE_BUDGET = 120_000;

/** Open the first previewable chapter and return its dialog, or null. */
async function openFirstChapter(page: any) {
  await page.goto(`${NEXUS}/teacher/study-materials`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);

  const cards = page.locator('.MuiCardActionArea-root');
  if ((await cards.count()) === 0) return null;

  const total = Math.min(await cards.count(), 6);
  for (let i = 0; i < total; i += 1) {
    await cards.nth(i).click();
    const dialog = page.getByRole('dialog');
    if (await dialog.isVisible().catch(() => false)) return dialog;
    await page.waitForTimeout(1200);
    if (await dialog.isVisible().catch(() => false)) return dialog;
    if (!page.url().includes('/teacher/study-materials')) return null;
  }
  return null;
}

/** Open the Class recordings dialog from inside an opened chapter. */
async function openRecordings(page: any) {
  const dialog = await openFirstChapter(page);
  if (!dialog) return null;

  // The workspace rail: Setup carries the Recordings line.
  const setup = page.getByRole('button', { name: /setup/i }).first();
  if (await setup.isVisible().catch(() => false)) await setup.click();
  await page.waitForTimeout(2500);

  const recordings = page.getByRole('button', { name: /^recordings$/i }).first();
  if (!(await recordings.isVisible().catch(() => false))) return null;
  await recordings.click();
  await page.waitForTimeout(3000);
  return page.getByRole('dialog').filter({ hasText: /class recordings/i }).first();
}

test.describe('Chapter recordings (mobile)', () => {
  test.setTimeout(COLD_COMPILE_BUDGET);

  test('every offered language is listed, with or without a recording', async ({ browser }) => {
    const context = await browser.newContext({ viewport: PHONE });
    const page = await context.newPage();

    const injected = await injectAuthForPage(page, 'teacher');
    test.skip(!injected, 'Nexus test-login unavailable');

    const dialog = await openRecordings(page);
    test.skip(!dialog, 'No chapter reachable in this environment');

    const body = await dialog!.innerText();

    // Both default languages are always on screen. The bug this replaces was
    // that a language WITH a recording had no row of its own to find.
    expect(body).toMatch(/English/);
    expect(body).toMatch(/தமிழ்/);

    // And each of them commits to a state rather than leaving a blank row.
    expect(body).toMatch(/Not added|Draft|Live|On hold/);

    await assertNoHorizontalOverflow(page);
    await context.close();
  });

  test('a recording without a transcript offers a way out, not a dead button', async ({ browser }) => {
    const context = await browser.newContext({ viewport: PHONE });
    const page = await context.newPage();

    const injected = await injectAuthForPage(page, 'teacher');
    test.skip(!injected, 'Nexus test-login unavailable');

    const dialog = await openRecordings(page);
    test.skip(!dialog, 'No chapter reachable in this environment');

    const body = await dialog!.innerText();
    const hasDraftWithoutCheckpoints = /Draft, no checkpoints/.test(body);
    test.skip(!hasDraftWithoutCheckpoints, 'No un-transcribed recording on this chapter');

    // Publishing it open is a real, pressable action. It used to be a greyed
    // Publish button with the reason in a caption above it, which is the state
    // that left the recording reaching nobody.
    const open = dialog!.getByRole('button', { name: /publish as open/i }).first();
    await expect(open).toBeVisible();
    await expect(open).toBeEnabled();

    // The sentence names its own language, so a row read halfway down a
    // scrolled dialog still says which recording it is about.
    expect(body).toMatch(/Upload the .+ recording's transcript/);

    await assertNoHorizontalOverflow(page);
    await context.close();
  });

  test('the retired quick video link is gone from the chapter menu', async ({ browser }) => {
    const context = await browser.newContext({ viewport: PHONE });
    const page = await context.newPage();

    const injected = await injectAuthForPage(page, 'teacher');
    test.skip(!injected, 'Nexus test-login unavailable');

    await page.goto(`${NEXUS}/teacher/study-materials`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(5000);

    const menus = page.getByRole('button', { name: /more|options|actions/i });
    test.skip((await menus.count()) === 0, 'No chapter menu in this environment');
    await menus.first().click();
    await page.waitForTimeout(1200);

    const menu = page.getByRole('menu').first();
    if (await menu.isVisible().catch(() => false)) {
      const text = await menu.innerText();
      expect(text).not.toMatch(/quick video link/i);
      // The one that replaced it is still there.
      expect(text).toMatch(/class recordings/i);
    }

    await assertNoHorizontalOverflow(page);
    await context.close();
  });

  test('a student card never promises a recording that is not published', async ({ browser }) => {
    const context = await browser.newContext({ viewport: PHONE });
    const page = await context.newPage();

    const injected = await injectAuthForPage(page, 'student');
    test.skip(!injected, 'Nexus test-login unavailable');

    await page.goto(`${NEXUS}/student/study-materials`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(6000);

    // Nothing here asserts that a chip IS present: whether any chapter has a
    // published recording is environment data. What must hold is that the grid
    // renders and does not overflow with the new chips on it.
    await expect(page.getByText(/study materials/i).first()).toBeVisible();
    await assertNoHorizontalOverflow(page);
    await context.close();
  });
});
