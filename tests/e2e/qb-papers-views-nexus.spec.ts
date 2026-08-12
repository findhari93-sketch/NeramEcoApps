import { test, expect, type Page } from '@playwright/test';
import { injectAuthForPage, APP_URLS } from '../utils/credentials';

/**
 * The two vertical-space fixes on the teacher Question Bank:
 * the papers list gained Table / Grid / Cards plus search and status filters,
 * and the paper workspace now claims the viewport height instead of about half
 * of it.
 *
 * Everything here is read-only apart from the view preference in localStorage,
 * so it runs against whatever papers the environment happens to have. Specs
 * that need a known paper seed one; these assert on layout, which does not care.
 */

const LIST_URL = `${APP_URLS.nexus}/teacher/question-bank/papers`;

/**
 * Playwright's 30s default is a dev-server timeout, not an app timeout: the
 * first hit on a route compiles it, and the paper workspace pulls in KaTeX,
 * pdf.js and the whole question-bank tree. Run alone, that alone blows 30s.
 */
test.describe.configure({ timeout: 150_000 });

/** The list renders client-side after its fetch; wait for either outcome. */
async function waitForList(page: Page) {
  await page.waitForFunction(
    () =>
      !!document.querySelector('[aria-label="Paper list layout"]') ||
      document.body.innerText.includes('No papers uploaded yet'),
    undefined,
    { timeout: 60_000 },
  );
}

async function openFirstPaper(page: Page): Promise<boolean> {
  await waitForList(page);
  const toggle = page.locator('[aria-label="Paper list layout"]');
  if (!(await toggle.count())) return false;

  await page.locator('button[aria-label="Table view"]').click();
  const firstRow = page.locator('tbody tr[role="button"]').first();
  if (!(await firstRow.count())) return false;

  await firstRow.click();
  await page.waitForURL(/\/teacher\/question-bank\/papers\/[^/]+$/, { timeout: 60_000 });
  await page.waitForFunction(
    () => !!document.querySelector('button[aria-label="Enter focus mode"]'),
    undefined,
    { timeout: 60_000 },
  );
  return true;
}

test.describe('Question Bank papers: views and workspace height', () => {
  test.beforeEach(async ({ page }) => {
    const ok = await injectAuthForPage(page, 'teacher');
    expect(ok, 'teacher auth injection').toBe(true);
  });

  test('the view choice survives a reload', async ({ page }) => {
    await page.goto(LIST_URL, { waitUntil: 'domcontentloaded' });
    await waitForList(page);
    test.skip(!(await page.locator('[aria-label="Paper list layout"]').count()), 'no papers in this environment');

    await page.locator('button[aria-label="Grid view"]').click();
    await expect(page.locator('button[aria-label="Grid view"]')).toHaveClass(/Mui-selected/);
    expect(await page.evaluate(() => localStorage.getItem('nexus:qbPapers:view'))).toBe('grid');

    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForList(page);
    // The restore happens in an effect after mount, never during render, so the
    // first paint is the default and this settles a tick later.
    await expect(page.locator('button[aria-label="Grid view"]')).toHaveClass(/Mui-selected/);
  });

  test('a status filter narrows the list and Clear filters restores it', async ({ page }) => {
    await page.goto(LIST_URL, { waitUntil: 'domcontentloaded' });
    await waitForList(page);
    test.skip(!(await page.locator('[aria-label="Paper list layout"]').count()), 'no papers in this environment');

    await page.locator('button[aria-label="Table view"]').click();
    const before = await page.locator('tbody tr[role="button"]').count();

    // A search that cannot match anything must show the "no match" empty state,
    // not the "upload your first paper" one.
    await page.getByLabel('Search papers').fill('zzzznotapaper');
    await expect(page.getByText('No papers match these filters')).toBeVisible();
    await expect(page.getByText('No papers uploaded yet')).toHaveCount(0);

    await page.getByRole('button', { name: 'Clear filters' }).click();
    await expect(page.locator('tbody tr[role="button"]')).toHaveCount(before);
  });

  test('no horizontal overflow on a phone in any view', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(LIST_URL, { waitUntil: 'domcontentloaded' });
    await waitForList(page);
    test.skip(!(await page.locator('[aria-label="Paper list layout"]').count()), 'no papers in this environment');

    for (const view of ['Table view', 'Grid view', 'Detailed cards']) {
      await page.locator(`button[aria-label="${view}"]`).click();
      await page.waitForTimeout(300);
      const { scrollW, clientW } = await page.evaluate(() => ({
        scrollW: document.documentElement.scrollWidth,
        clientW: document.documentElement.clientWidth,
      }));
      expect(scrollW, `${view} overflows at 375px`).toBeLessThanOrEqual(clientW + 1);
    }

    // The table is gated at md: below it the same rows render as compact cards.
    await page.locator('button[aria-label="Table view"]').click();
    await expect(page.locator('table')).toHaveCount(0);
  });

  test('the workspace fills the viewport and the page itself does not scroll', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(LIST_URL, { waitUntil: 'domcontentloaded' });
    test.skip(!(await openFirstPaper(page)), 'no papers in this environment');

    const metrics = await page.evaluate(() => {
      const panes = Array.from(document.querySelectorAll<HTMLElement>('*')).filter((el) => {
        const style = getComputedStyle(el);
        return style.overflowY === 'auto' && el.clientHeight > 200;
      });
      return {
        docScrollH: document.documentElement.scrollHeight,
        docClientH: document.documentElement.clientHeight,
        tallestPane: Math.max(0, ...panes.map((p) => p.clientHeight)),
      };
    });

    // The page must not grow past the window: the panes scroll, not the document.
    expect(metrics.docScrollH).toBeLessThanOrEqual(metrics.docClientH + 2);
    // The old layout left the panes roughly half the window. Anything above 60%
    // of an 800px viewport means the chrome above them is no longer winning.
    expect(metrics.tallestPane).toBeGreaterThan(metrics.docClientH * 0.6);
  });

  test('focus mode toggles, and Escape leaves focus before clearing the question', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(LIST_URL, { waitUntil: 'domcontentloaded' });
    test.skip(!(await openFirstPaper(page)), 'no papers in this environment');

    // Open a question, which is what gives Escape something to clear.
    // Not the j shortcut: `step` looks the current id up in the list first, so
    // with nothing selected there is no index to move from and j is a no-op.
    // It navigates between questions, it does not enter the list.
    const firstQuestion = page.locator('[role="button"][aria-label^="Open question"]').first();
    await firstQuestion.click();
    await expect(page.getByText(/\d+ of \d+/).first()).toBeVisible();

    await page.locator('button[aria-label="Enter focus mode"]').click();
    const exit = page.locator('button[aria-label="Leave focus mode"]');
    await expect(exit).toBeVisible();

    // Escape backs out one layer at a time. The workspace also binds Escape to
    // close the editor; the shell's capture-phase handler has to win while focus
    // is on, or one keypress would do both.
    await page.keyboard.press('Escape');
    await expect(page.locator('button[aria-label="Enter focus mode"]')).toBeVisible();
    await expect(page.getByText(/\d+ of \d+/).first()).toBeVisible();

    // With focus off, Escape belongs to the workspace again.
    await page.keyboard.press('Escape');
    await expect(page.getByText(/\d+ of \d+/)).toHaveCount(0);
  });
});
