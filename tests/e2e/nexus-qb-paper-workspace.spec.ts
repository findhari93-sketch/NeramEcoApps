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
    // It lives in the paper's actions menu now, so it has to be opened to be
    // seen, and it is a menuitem rather than a button.
    await page.getByRole('button', { name: 'More paper actions' }).click();
    await expect(page.getByRole('menuitem', { name: /Upload Answer Key/ })).toBeVisible();
    await page.keyboard.press('Escape');
  });

  /**
   * "Deactivate 90" used to sit in the header on every visit: one click, and
   * every question on the paper is pulled off a live exam. It is behind the
   * actions menu now, and the per-question version is on the selection bar.
   */
  test('the header no longer carries a one-click paper-wide Deactivate', async () => {
    await expect(page.getByRole('button', { name: /^Deactivate \d+$/ })).toHaveCount(0);

    await page.getByRole('button', { name: 'More paper actions' }).click();
    // Only rendered when something is active, so this is a presence check on
    // the menu itself rather than on the fixture's activation state.
    await expect(page.getByRole('menuitem', { name: /Fill in missing sections/ })).toBeVisible();
    await page.keyboard.press('Escape');
  });

  /**
   * The header used to carry a second copy of the list's own filters: a
   * Sections accordion that set the same Section select, and "N need a figure"
   * / "N need a solution" chips that set the same Needs chips. Two controls for
   * one job means reading both to know what the list is showing, and on a phone
   * all of it came before a single question did.
   */
  test('the header does not repeat the filter bar below it', async () => {
    await closeAnyOpenQuestion();
    await expect(page.getByRole('button', { name: /^Sections \(\d+\)$/ })).toHaveCount(0);
    await expect(page.getByText('Tap a section to narrow the list below.')).toHaveCount(0);
    await expect(page.getByText(/\d+ need a (figure|solution)/)).toHaveCount(0);

    // What the filter bar cannot state stays: the Section select lists
    // Unsectioned but never how many, and never that leaving them unset is what
    // stops the paper being scheduled. Presence only, since a fully sectioned
    // fixture is correct and renders nothing.
    const filters = page.getByRole('group', { name: 'Filter the question list' });
    await expect(filters.getByRole('button', { name: /^Figure missing \d+$/ })).toBeVisible();
  });

  test('ticking a row reveals Deactivate next to Delete on the selection bar', async () => {
    await closeAnyOpenQuestion();
    // Named by its tooltip: MUI puts a Tooltip title on the child's aria-label.
    const deactivate = page.getByRole('button', {
      name: /Hide the selected questions from students/i,
    });
    await expect(deactivate).toHaveCount(0);

    await page.getByRole('checkbox', { name: /^Select question / }).first().check();
    await expect(deactivate).toBeVisible({ timeout: 30_000 });
    await expect(
      page.getByRole('button', { name: /never really belonged on this paper/i }),
    ).toBeVisible();

    // Nothing is clicked: this asserts the affordance, and the suite must not
    // pull a real paper's questions off a live exam as a side effect.
    await page.getByRole('button', { name: 'Clear' }).click();
    await expect(deactivate).toHaveCount(0);
  });

  /**
   * The needs filters used to render only in Images mode, so a teacher fixing
   * wording could not narrow the list to outstanding work at all.
   */
  test('the filter bar has one home, above the list, and works in Edit mode', async () => {
    await closeAnyOpenQuestion();
    const filters = page.getByRole('group', { name: 'Filter the question list' });
    await expect(filters).toBeVisible();
    await expect(filters.getByRole('button', { name: /^Figure missing \d+$/ })).toBeVisible();

    // The old "Filtering: X" chip is gone; the Section select reports it now.
    await expect(page.getByText(/^Filtering:/)).toHaveCount(0);
  });

  test('a needs filter narrows the list and says how much of the paper is left', async () => {
    await closeAnyOpenQuestion();
    const filters = page.getByRole('group', { name: 'Filter the question list' });
    await filters.getByRole('button', { name: /^Figure missing \d+$/ }).click();

    // Either every question is in the queue (count unchanged) or some are, in
    // which case the toolbar switches to the "N of M" form. Both are correct;
    // which one depends on the fixture, so accept either rather than pin the
    // seed data.
    await expect(page.getByText(/^\d+( of \d+)? questions?$/)).toBeVisible({ timeout: 30_000 });

    await filters.getByRole('button', { name: /^All \d+$/ }).click();
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

  /**
   * The filter row is one line that scrolls sideways rather than wrapping into
   * a three-row wall. The strip has to clip itself: if it does not, the whole
   * page scrolls horizontally, which is the exact failure this asserts against.
   */
  test('mobile: the filter strip scrolls itself instead of the page', async () => {
    await closeAnyOpenQuestion();
    await page.setViewportSize({ width: 375, height: 812 });
    await assertNoHorizontalOverflow(page);

    const strip = page.getByRole('group', { name: 'Filter the question list' });
    await expect(strip).toBeVisible();
    const overflows = await strip.evaluate((el) => el.scrollWidth > el.clientWidth + 1);
    if (overflows) {
      await strip.evaluate((el) => el.scrollBy({ left: 200 }));
      expect(await strip.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
    }
    await assertNoHorizontalOverflow(page);

    // Thumb targets, not mouse targets: the chips are 44px tall below sm.
    await assertTouchTargetSize(page, '[role="group"][aria-label="Filter the question list"] .MuiChip-root');
  });

  /**
   * The paper's actions sit on the title row now rather than on a row of their
   * own, and are pushed right with `ml: auto`. That is the arrangement most
   * likely to push the page sideways at 375px, so it is the one worth asserting:
   * the group has to wrap as a unit, not stretch the row.
   */
  test('mobile: the header actions wrap instead of widening the page', async () => {
    await closeAnyOpenQuestion();
    await page.setViewportSize({ width: 375, height: 812 });
    await assertNoHorizontalOverflow(page);

    await assertTouchTargetSize(page, '[aria-label="More paper actions"]');
    await assertTouchTargetSize(page, '[aria-label="Back to all papers"]');
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
