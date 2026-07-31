import { test, expect, type Page } from '@playwright/test';
import { APP_URLS, injectAuthForPage } from '../utils/credentials';
import { assertNoHorizontalOverflow } from '../utils/mobile-helpers';

/**
 * What a student catching up actually sees of a wrapped-up class.
 *
 * The gap this covers: the teacher's full note (the `notes` column, labelled
 * "Detailed description" in the Wrap Up panel) was written on every wrapped-up
 * class and rendered on none of them. ClassDetailPanel showed the title and the
 * short brief only, so the longest and most useful thing a teacher writes was
 * invisible to exactly the student it was written for.
 *
 * Mobile viewport is primary: a student catching up on a missed class is doing
 * it on a phone, and a long note is the single most likely thing to break a
 * narrow layout.
 */

/** Open the first past class that has a wrap-up, or return false. */
async function openAWrappedUpClass(page: Page): Promise<boolean> {
  await page.goto(`${APP_URLS.nexus}/student/timetable`, { waitUntil: 'domcontentloaded' });

  const cards = page.locator('[role="button"][aria-pressed]');
  for (let week = 0; week <= 8; week++) {
    await page.waitForTimeout(1200);
    const count = await cards.count();
    for (let i = 0; i < count; i++) {
      await cards.nth(i).click();
      // The capture block only renders for a past class that has content.
      const notes = page.locator('[data-testid="class-wrapup-notes"]');
      const bullets = page.locator('[data-testid="class-wrapup-bullets"]');
      try {
        await expect(notes.or(bullets).first()).toBeVisible({ timeout: 6000 });
        return true;
      } catch {
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);
      }
    }
    const prev = page.locator('[aria-label^="Previous"]').first();
    if ((await prev.count()) === 0) break;
    await prev.click();
  }
  return false;
}

test.describe('student view of a wrapped-up class', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('shows the teacher full note, not just the one line brief', async ({ page }) => {
    test.skip(!(await injectAuthForPage(page, 'student')), 'No student auth in this environment');
    test.skip(!(await openAWrappedUpClass(page)), 'No wrapped-up class available to read');

    const notes = page.locator('[data-testid="class-wrapup-notes"]');
    if ((await notes.count()) === 0) {
      test.skip(true, 'The available class has bullets but no detailed note');
    }
    await expect(notes).toBeVisible();
    expect((await notes.innerText()).trim().length).toBeGreaterThan(40);
  });

  test('renders the note at 16px or more, so it is readable without zooming', async ({ page }) => {
    test.skip(!(await injectAuthForPage(page, 'student')), 'No student auth in this environment');
    test.skip(!(await openAWrappedUpClass(page)), 'No wrapped-up class available');

    const notes = page.locator('[data-testid="class-wrapup-notes"]');
    if ((await notes.count()) === 0) test.skip(true, 'No detailed note on this class');

    // Under 16px iOS zooms the whole page on focus, and this is long-form reading.
    const size = await notes.locator('p, span, div').first().evaluate(
      (el) => parseFloat(getComputedStyle(el).fontSize),
    );
    expect(size).toBeGreaterThanOrEqual(16);
  });

  test('does not scroll sideways at 375px, however long the note', async ({ page }) => {
    test.skip(!(await injectAuthForPage(page, 'student')), 'No student auth in this environment');
    test.skip(!(await openAWrappedUpClass(page)), 'No wrapped-up class available');
    // A brief imported from a Teams meeting body often carries a bare join URL,
    // which is exactly what forces a drawer to scroll sideways without a wrap rule.
    await assertNoHorizontalOverflow(page);
  });

  test('the Read the full note control is a 44px target and expands', async ({ page }) => {
    test.skip(!(await injectAuthForPage(page, 'student')), 'No student auth in this environment');
    test.skip(!(await openAWrappedUpClass(page)), 'No wrapped-up class available');

    const toggle = page.getByRole('button', { name: /Read the full note/i });
    if ((await toggle.count()) === 0) {
      test.skip(true, 'This note is short enough to render whole, so there is no toggle');
    }
    const box = await toggle.first().boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);

    await toggle.first().click();
    await expect(page.getByRole('button', { name: /Show less/i })).toBeVisible();
  });

  test('never shows a planned versus actual comparison', async ({ page }) => {
    // A deliberate product decision: a student catching up wants to read what
    // happened, not a diff against what was intended. Pinned so a later "helpful"
    // addition has to be a conscious choice.
    test.skip(!(await injectAuthForPage(page, 'student')), 'No student auth in this environment');
    test.skip(!(await openAWrappedUpClass(page)), 'No wrapped-up class available');

    const panel = page.locator('[data-testid="class-wrapup-notes"]').locator('xpath=ancestor::*[3]');
    await expect(panel.getByText(/\bplanned\b/i)).toHaveCount(0);
  });
});
