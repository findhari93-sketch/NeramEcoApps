import { test, expect, type Page } from '@playwright/test';
import { APP_URLS, injectAuthForPage } from '../utils/credentials';
import { assertNoHorizontalOverflow } from '../utils/mobile-helpers';

/**
 * Students page: finding who joined recently and reading their form (2026-10-16).
 *
 * - Filters > Joined narrows any group to the last 7 or 30 days and shows a chip.
 * - The card menu's "View application form" opens the profile at that section,
 *   expanded on a phone, where it is otherwise a collapsed accordion.
 *
 * Runs against local Nexus (staging DB). With no students in the E2E teacher's
 * classroom there is nothing to check, so it skips rather than fails.
 */

const NEXUS = APP_URLS.nexus;
const DAY = 24 * 60 * 60 * 1000;

test.describe.configure({ timeout: 150_000 });

async function openStudents(page: Page): Promise<boolean> {
  if (!(await injectAuthForPage(page, 'teacher'))) return false;
  await page.goto(`${NEXUS}/teacher/students`, { waitUntil: 'domcontentloaded' });
  try {
    await page.getByRole('button', { name: 'Filters' }).first().waitFor({ timeout: 90_000 });
    return true;
  } catch {
    return false;
  }
}

/** "Joined 18 Aug 2026" on each card, read back as a date. */
async function joinedDates(page: Page): Promise<number[]> {
  const texts = await page.getByText(/^Joined \d{1,2} [A-Z][a-z]{2} \d{4}$/).allTextContents();
  return texts.map((t) => Date.parse(t.replace('Joined ', '')));
}

for (const viewport of [
  { name: 'phone', width: 375, height: 812 },
  { name: 'desktop', width: 1280, height: 900 },
]) {
  test.describe(`Students, ${viewport.name}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test('Joined: Last 30 days narrows the list and shows a removable chip', async ({ page }) => {
      test.skip(!(await openStudents(page)), 'Nexus not running, or the teacher has no classroom');

      await page.getByRole('button', { name: 'Filters' }).first().click();
      await page.getByRole('radio', { name: 'Last 30 days' }).check();
      await page.getByRole('button', { name: 'Done' }).click();

      const chip = page.getByRole('button', { name: /Joined in the last 30 days/ });
      await expect(chip).toBeVisible();

      // Every card left joined inside the window (a day of slack for time zones).
      const cutoff = Date.now() - 31 * DAY;
      for (const joined of await joinedDates(page)) expect(joined).toBeGreaterThanOrEqual(cutoff);

      await assertNoHorizontalOverflow(page);

      // The chip's x clears it.
      await chip.locator('.MuiChip-deleteIcon').click();
      await expect(chip).toHaveCount(0);
    });

    // Staging has no student with a real application (2026-10-16), so the menu test
    // below skips there. This one drives the same deep link for any student.
    test('the #profile-application link lands on that section, open', async ({ page }) => {
      test.skip(!(await openStudents(page)), 'Nexus not running, or the teacher has no classroom');

      const menus = page.getByRole('button', { name: /^Actions for / });
      // count() does not wait, and the roster paints after the toolbar.
      await menus.first().waitFor({ timeout: 60_000 }).catch(() => undefined);
      test.skip((await menus.count()) === 0, 'No students on the roster');
      await menus.first().click();
      await page.getByRole('menuitem', { name: 'Open profile' }).click();
      await expect(page).toHaveURL(/\/teacher\/students\/[0-9a-f-]+$/, { timeout: 30_000 });

      await page.goto(`${page.url()}#profile-application`, { waitUntil: 'domcontentloaded' });
      await page.reload({ waitUntil: 'domcontentloaded' });
      const section = page.locator('#profile-application');
      await expect(section).toBeVisible({ timeout: 60_000 });
      await expect(section).toBeInViewport({ timeout: 10_000 });
      if (viewport.width < 900) {
        await expect(section.getByRole('button', { name: /Application form/ })).toHaveAttribute('aria-expanded', 'true');
      }
      await assertNoHorizontalOverflow(page);
    });

    test('View application form opens the profile at that section', async ({ page }) => {
      test.skip(!(await openStudents(page)), 'Nexus not running, or the teacher has no classroom');

      const menus = page.getByRole('button', { name: /^Actions for / });
      // count() does not wait, and the roster paints after the toolbar.
      await menus.first().waitFor({ timeout: 60_000 }).catch(() => undefined);
      const count = await menus.count();
      test.skip(count === 0, 'No students on the roster');

      let opened = false;
      for (let i = 0; i < Math.min(count, 12) && !opened; i++) {
        await menus.nth(i).click();
        const item = page.getByRole('menuitem', { name: 'View application form' });
        if (await item.isVisible().catch(() => false)) {
          await item.click();
          opened = true;
        } else {
          await page.keyboard.press('Escape');
        }
      }
      test.skip(!opened, 'No student in the first rows has an application form');

      await expect(page).toHaveURL(/\/teacher\/students\/[0-9a-f-]+#profile-application$/, { timeout: 30_000 });
      const section = page.locator('#profile-application');
      await expect(section).toBeVisible({ timeout: 60_000 });
      await expect(section).toBeInViewport();
      if (viewport.width < 900) {
        await expect(section.getByRole('button', { name: /Application form/ })).toHaveAttribute('aria-expanded', 'true');
      }
      await assertNoHorizontalOverflow(page);

      // Back returns to the list, not a dead end.
      await page.getByRole('button', { name: /Back to Students/ }).first().click();
      await expect(page).toHaveURL(/\/teacher\/students(\?|$)/);
    });
  });
}
