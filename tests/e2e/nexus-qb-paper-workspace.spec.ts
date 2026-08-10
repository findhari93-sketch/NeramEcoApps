import { test, expect, type Page } from '@playwright/test';
import { APP_URLS, injectAuthForPage } from '../utils/credentials';
import { assertNoHorizontalOverflow, assertTouchTargetSize } from '../utils/mobile-helpers';

/**
 * The merged Questions view on a Question Bank paper.
 *
 * Serial, on one shared page, deliberately. A per-test beforeEach logged in and
 * reloaded the papers list seven times, and a Next dev server compiles routes on
 * demand and slows down as it goes: by the fourth test the list took longer to
 * appear than any sane timeout allows, and every test failed in setup rather
 * than on an assertion. One login and one navigation for the whole suite keeps
 * the run honest about what it is testing.
 *
 * The paper id is never hardcoded: it is discovered by opening the papers list
 * and picking a paper that actually has parsed questions, so the spec keeps
 * working after a reseed.
 */
test.describe.configure({ mode: 'serial', timeout: 240_000 });

test.describe('QB paper workspace', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();

    // Assert rather than ignore: injectAuthForPage returns false when
    // /api/auth/test-login fails, and an unauthenticated run then fails later
    // with a selector timeout that looks like a broken component.
    const authed = await injectAuthForPage(page, 'teacher');
    expect(authed, 'test-login must succeed, check NODE_ENV and .env.test').toBe(true);

    // injectAuthForPage leaves the browser on /login, which fires its own
    // client-side redirect once mounted. A navigation started in that window is
    // cancelled as ERR_ABORTED, so retry rather than fail on the race.
    for (let attempt = 0; ; attempt++) {
      try {
        await page.goto(`${APP_URLS.nexus}/teacher/question-bank/papers`, {
          waitUntil: 'domcontentloaded',
        });
        break;
      } catch (err) {
        if (attempt >= 2) throw err;
      }
    }

    // This subtitle only renders once the list data has arrived, so waiting on
    // it turns "dev server still fetching" into an explicit wait rather than a
    // selector timeout that points at the wrong thing.
    await expect(page.getByText(/\d+ papers ·/)).toBeVisible({ timeout: 120_000 });

    // Pick a paper that actually has parsed questions, not merely the first
    // card. The newest fixture on staging is a 96-question drawing paper whose
    // card reads "0 total": nothing to edit, and 96 KaTeX rows make the page
    // slow enough to time out. "[1-9].. total" is the honest requirement here,
    // and it stays true across environments without naming a fixture.
    const card = page
      .locator('div.MuiPaper-root')
      .filter({ hasText: /[1-9]\d* total ·/ })
      .first();

    // The cards are a Paper with an onClick, not a link or a button, so there is
    // no role to select them by. Clicking the exam chip inside the card bubbles
    // to that same onClick, which is the one stable handle available.
    await card.getByText(/^(JEE Paper 2|NATA)$/).first().click();

    await expect(page.getByRole('tab', { name: /Questions \(/ })).toBeVisible({
      timeout: 120_000,
    });
  });

  test.afterAll(async () => {
    await page?.close();
  });

  /** Back to the list view of the workspace, whatever the previous test left open. */
  async function closeAnyOpenQuestion() {
    const close = page.getByRole('button', { name: 'Close question' });
    if (await close.isVisible().catch(() => false)) await close.click();
  }

  test('AC1: Answer Key is gone and Questions is the only editing tab', async () => {
    await expect(page.getByRole('tab', { name: 'Answer Key' })).toHaveCount(0);
    await expect(page.getByRole('tab', { name: /Questions \(/ })).toBeVisible();
  });

  test('AC5: the bulk answer-key upload survived the tab it used to live in', async () => {
    // It was launched from inside the Answer Key tab, which no longer exists.
    await expect(page.getByRole('button', { name: /Upload Answer Key/ })).toBeVisible();
  });

  test('AC2: opening a question loads it into the pane', async () => {
    await page.getByRole('button', { name: /^Open question / }).first().click();
    await expect(page.getByText(/^\d+ of \d+$/)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByLabel('Question text')).toBeVisible();
  });

  test('AC4: next and previous walk the paper', async () => {
    // Opens whichever question is first rather than one named "1". Position is
    // counted in paper order, so the pane reads "1 of N" for the first row
    // whatever that question's printed number is, and a paper whose numbering
    // starts elsewhere (or is absent) is still a valid subject for this test.
    await closeAnyOpenQuestion();
    await page.getByRole('button', { name: /^Open question / }).first().click();
    await expect(page.getByText(/^1 of \d+$/)).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Next question' }).click();
    await expect(page.getByText(/^2 of \d+$/)).toBeVisible({ timeout: 30_000 });
  });

  /**
   * Only the editor preview is asserted here, not typesetting in the list.
   * Whether a list row renders KaTeX depends entirely on whether that paper's
   * questions contain maths, and the seeded NATA papers contain none, so
   * asserting it here would test the fixture rather than the code. Typesetting
   * in the row is covered deterministically by PaperQuestionRow.test.tsx, which
   * feeds it a stem that does contain maths.
   */
  test('AC3: LaTeX is previewed in the editor as you type', async () => {
    const field = page.getByLabel('Question text');
    await expect(field).toBeVisible({ timeout: 30_000 });
    // Typed, not saved: this asserts the live preview, and the suite must not
    // rewrite a real question's text as a side effect.
    await field.fill('Check $\\frac{1}{2}$ renders');
    await expect(page.getByTestId('math-preview').locator('.katex').first()).toBeVisible({
      timeout: 30_000,
    });
  });

  test('zero console errors while editing', async () => {
    const errors: string[] = [];
    const listener = (m: { type: () => string; text: () => string }) => {
      if (m.type() === 'error') errors.push(m.text());
    };
    page.on('console', listener as never);
    await page.getByRole('button', { name: 'Next question' }).click();
    await expect(page.getByText(/^\d+ of \d+$/)).toBeVisible({ timeout: 30_000 });
    page.off('console', listener as never);
    expect(errors).toEqual([]);
  });

  test('mobile: the pane opens as a full-screen sheet with no horizontal overflow', async () => {
    await closeAnyOpenQuestion();
    await page.setViewportSize({ width: 375, height: 812 });
    await assertNoHorizontalOverflow(page);

    await page.getByRole('button', { name: /^Open question / }).first().click();
    await expect(page.getByText(/^\d+ of \d+$/)).toBeVisible({ timeout: 30_000 });
    await assertNoHorizontalOverflow(page);
    // The helper takes a page and a selector, not a locator.
    await assertTouchTargetSize(page, '[aria-label="Next question"]');

    await page.getByRole('button', { name: 'Close question' }).click();
    await expect(page.getByLabel('Question text')).toHaveCount(0);
  });
});
