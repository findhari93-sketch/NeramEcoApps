import { test, expect, type Page } from '@playwright/test';
import { APP_URLS, injectAuthForPage } from '../utils/credentials';
import { assertNoHorizontalOverflow } from '../utils/mobile-helpers';

/**
 * The checkpoint editor, and the way in and out of it.
 *
 * Its Back button used to go to the Study Materials root, it had no guard, so
 * any navigation threw away edits, and it lived at an address unrelated to the
 * recording it edited. What these lock down: the old address redirects under
 * the recording, Back returns to Class recordings, and leaving with unsaved
 * changes asks first.
 *
 * The address checks use ids no environment has. The guard check needs a real
 * recording with checkpoints and skips without one. Nothing here saves.
 */

const NEXUS = APP_URLS.nexus;
const PHONE = { width: 375, height: 812 };
const LAPTOP = { width: 1280, height: 800 };
const COLD_COMPILE_BUDGET = 150_000;
const NO_SUCH_CHAPTER = '00000000-0000-4000-8000-000000000000';
const NO_SUCH_TRACK = '00000000-0000-4000-8000-000000000001';

/** A real recording with checkpoints, reached from the library, or null. */
async function openRealEditor(page: Page): Promise<boolean> {
  await page.goto(`${NEXUS}/teacher/study-materials`, { waitUntil: 'domcontentloaded' });
  let chapterId: string | null = null;
  for (let depth = 0; depth < 4 && !chapterId; depth += 1) {
    await page.waitForTimeout(4000);
    const cards = page.locator('.MuiCardActionArea-root');
    if ((await cards.count()) === 0) return false;
    await cards.first().click();
    await page.waitForTimeout(2500);
    chapterId = page.url().match(/\/teacher\/study-materials\/([0-9a-f-]{36})(?:[/?#]|$)/i)?.[1] ?? null;
  }
  if (!chapterId) return false;

  await page.goto(`${NEXUS}/teacher/study-materials/${chapterId}/recordings`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('tab').first()).toBeVisible({ timeout: 60_000 });
  const tabs = page.getByRole('tab');
  for (let i = 0; i < (await tabs.count()); i += 1) {
    await tabs.nth(i).click();
    const review = page.getByRole('button', { name: 'Review checkpoints' }).first();
    if (await review.isVisible().catch(() => false)) {
      await review.click();
      await expect(page).toHaveURL(/\/recordings\/[0-9a-f-]{36}\/checkpoints/, { timeout: 60_000 });
      return true;
    }
  }
  return false;
}

test.describe('Checkpoint editor (mobile)', () => {
  test.setTimeout(COLD_COMPILE_BUDGET);

  test('the old editor address redirects under the recording it belongs to', async ({ browser }) => {
    const context = await browser.newContext({ viewport: PHONE });
    const page = await context.newPage();
    test.skip(!(await injectAuthForPage(page, 'teacher')), 'Nexus test-login unavailable');

    await page.goto(`${NEXUS}/teacher/study-materials/checkpoints/${NO_SUCH_CHAPTER}/${NO_SUCH_TRACK}`, {
      waitUntil: 'domcontentloaded',
    });
    await expect(page).toHaveURL(
      new RegExp(`/teacher/study-materials/${NO_SUCH_CHAPTER}/recordings/${NO_SUCH_TRACK}/checkpoints`),
      { timeout: 60_000 },
    );
    await context.close();
  });

  test('Back goes to Class recordings, not the Study Materials root', async ({ browser }) => {
    const context = await browser.newContext({ viewport: PHONE });
    const page = await context.newPage();
    test.skip(!(await injectAuthForPage(page, 'teacher')), 'Nexus test-login unavailable');

    await page.goto(`${NEXUS}/teacher/study-materials/${NO_SUCH_CHAPTER}/recordings/${NO_SUCH_TRACK}/checkpoints`, {
      waitUntil: 'domcontentloaded',
    });
    const back = page.getByRole('link', { name: /^Back to/ }).first();
    await expect(back).toHaveAttribute('href', new RegExp(`^/teacher/study-materials/${NO_SUCH_CHAPTER}/recordings`), {
      timeout: 60_000,
    });
    await context.close();
  });

  test('leaving with unsaved changes asks first, and Stay keeps the work', async ({ browser }) => {
    const context = await browser.newContext({ viewport: PHONE });
    const page = await context.newPage();
    test.skip(!(await injectAuthForPage(page, 'teacher')), 'Nexus test-login unavailable');
    test.skip(!(await openRealEditor(page)), 'No recording with checkpoints in this environment');

    const title = page.getByLabel('Checkpoint title');
    await expect(title).toBeVisible({ timeout: 60_000 });
    const original = await title.inputValue();
    await title.fill(`${original} (edited by an E2E check, not saved)`);
    await expect(page.getByText('Unsaved changes')).toBeVisible();

    await page.getByRole('link', { name: /^Back to/ }).first().click();
    await expect(page.getByText('Leave without saving?')).toBeVisible();
    await page.getByRole('button', { name: 'Stay' }).click();
    await expect(page).toHaveURL(/\/checkpoints/);
    await expect(title).toHaveValue(`${original} (edited by an E2E check, not saved)`);

    // Put it back, which clears the unsaved state without a save.
    await title.fill(original);
    await expect(page.getByText('All changes saved')).toBeVisible();

    await assertNoHorizontalOverflow(page);
    await context.close();
  });

  test('at laptop width the player and the open checkpoint sit side by side', async ({ browser }) => {
    const context = await browser.newContext({ viewport: LAPTOP });
    const page = await context.newPage();
    test.skip(!(await injectAuthForPage(page, 'teacher')), 'Nexus test-login unavailable');
    test.skip(!(await openRealEditor(page)), 'No recording with checkpoints in this environment');

    const outline = page.getByRole('list', { name: 'Checkpoints' });
    const detail = page.getByRole('heading', { name: /Checkpoint \d+ of \d+/ });
    await expect(detail).toBeVisible({ timeout: 60_000 });
    const left = await outline.boundingBox();
    const right = await detail.boundingBox();
    expect(left && right && right.x > left.x + left.width - 1).toBe(true);

    await context.close();
  });
});
