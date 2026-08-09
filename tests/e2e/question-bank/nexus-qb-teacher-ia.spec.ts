/**
 * Question Bank teacher navigation and publish state, E2E.
 *
 * The bug behind this file: production had 26 parsed papers and 0 published,
 * and nothing on any teacher screen said so. The paper cards showed
 * `upload_status` ("Parsed in full") and the per question `is_active` toggles,
 * both of which read as "done", while `is_student_visible` lived one tab deep
 * inside a single paper. So the student Question Bank was correctly empty and
 * looked broken.
 *
 * These tests pin the three things that keep that from coming back: every paper
 * says who can see it, publishing is reachable from the list, and every page in
 * the section says where you are standing.
 *
 * Run: pnpm test:e2e --project=nexus-mobile tests/e2e/question-bank/nexus-qb-teacher-ia.spec.ts
 */

import { test, expect, type Page } from '@playwright/test';
import { APP_URLS, injectAuthForPage } from '../../utils/credentials';

test.use({ baseURL: APP_URLS.nexus });

/**
 * Cold compile on a route this suite is the first to touch costs far more than
 * the 30s default, and a budget that expires reads as a product failure rather
 * than a slow dev server. Set per describe: `test.describe.configure` does not
 * reach a sibling describe.
 */
const COLD_COMPILE_BUDGET = 120_000;

/** Auth or skip. Returns false when the saved teacher state is unusable. */
async function signInOrSkip(page: Page): Promise<boolean> {
  const authed = await injectAuthForPage(page, 'teacher');
  if (!authed) {
    test.skip(true, 'No usable teacher auth state');
    return false;
  }
  return true;
}

test.describe('QB teacher: publish state is visible', () => {
  test.describe.configure({ timeout: COLD_COMPILE_BUDGET });

  test.beforeEach(async ({ page }) => {
    if (!(await signInOrSkip(page))) return;
    await page.goto('/teacher/question-bank/papers', { waitUntil: 'domcontentloaded' });
  });

  test('every paper says whether students can see it', async ({ page }) => {
    const heading = page.getByRole('heading', { name: /uploaded papers/i, level: 1 });
    await expect(heading).toBeVisible({ timeout: 60_000 });

    // Either there are papers, each carrying a visibility chip, or the empty
    // state. Asserting on a count alone would pass vacuously on an empty bank.
    const empty = page.getByText(/no papers uploaded yet/i);
    if (await empty.isVisible().catch(() => false)) {
      test.skip(true, 'No papers seeded in this environment');
      return;
    }

    const chips = page.getByText(/^(Live for students|Not published)$/);
    await expect(chips.first()).toBeVisible({ timeout: 30_000 });
  });

  test('the header counts how many papers are live', async ({ page }) => {
    // The number that was missing. "26 papers, 0 live for students" is the whole
    // explanation for an empty student screen, in one line.
    await expect(page.getByText(/\d+ papers · \d+ live for students/)).toBeVisible({
      timeout: 60_000,
    });
  });

  test('an unpublishable paper says why instead of just greying out', async ({ page }) => {
    await page.getByRole('heading', { name: /uploaded papers/i, level: 1 }).waitFor({ timeout: 60_000 });

    const reason = page.getByText(/Nothing for students yet\. Activate a question or link the original PDF\./);
    const disabledPublish = page.getByRole('button', { name: /publish to students/i }).and(page.locator(':disabled'));

    // A disabled Publish button must never appear without its reason beside it.
    if ((await disabledPublish.count()) > 0) {
      await expect(reason.first()).toBeVisible();
    }
  });
});

test.describe('QB teacher: never lost', () => {
  test.describe.configure({ timeout: COLD_COMPILE_BUDGET });

  // Every route in the section. The hub is exempt from needing a back control
  // because it IS the top of the section.
  const ROUTES: { path: string; title: RegExp; isHub?: boolean }[] = [
    { path: '/teacher/question-bank', title: /question bank/i, isHub: true },
    { path: '/teacher/question-bank/questions', title: /questions/i },
    { path: '/teacher/question-bank/papers', title: /uploaded papers/i },
    { path: '/teacher/question-bank/tags', title: /tags and themes/i },
    { path: '/teacher/question-bank/tagging-assistant', title: /tagging assistant/i },
    { path: '/teacher/question-bank/new', title: /add question/i },
    { path: '/teacher/question-bank/bulk-upload', title: /bulk upload/i },
    { path: '/teacher/question-bank/solutions', title: /solution/i },
    { path: '/teacher/question-bank/reports', title: /report/i },
    { path: '/teacher/question-bank/reclassify', title: /re-?classify/i },
    { path: '/teacher/question-bank/drawing-management', title: /drawing/i },
    { path: '/teacher/question-bank/recalled-import', title: /recalled/i },
  ];

  for (const route of ROUTES) {
    test(`${route.path} has exactly one h1 and a way back`, async ({ page }) => {
      if (!(await signInOrSkip(page))) return;
      await page.goto(route.path, { waitUntil: 'domcontentloaded' });

      const h1 = page.getByRole('heading', { level: 1 });
      await expect(h1.first()).toBeVisible({ timeout: 60_000 });
      await expect(h1.first()).toHaveText(route.title);
      // More than one h1 is what made this section feel unmoored: two screens
      // both announced themselves as "Question Bank".
      expect(await h1.count()).toBe(1);

      if (!route.isHub) {
        await expect(page.getByRole('link', { name: /^back to /i })).toBeVisible();
      }
    });
  }

  test('the retired submissions screen is gone', async ({ page }) => {
    if (!(await signInOrSkip(page))) return;
    const res = await page.goto('/teacher/questions', { waitUntil: 'domcontentloaded' });
    // It never held a row and duplicated Recall. A 404 is the correct answer.
    expect(res?.status()).toBe(404);
  });

  test('custom sets redirects rather than 404ing a bookmark', async ({ page }) => {
    if (!(await signInOrSkip(page))) return;
    await page.goto('/teacher/question-bank/sets', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/teacher\/question-bank\/tags/, { timeout: 30_000 });
  });
});

test.describe('QB teacher: the Source filter', () => {
  test.describe.configure({ timeout: COLD_COMPILE_BUDGET });

  test('filtering to past papers narrows the count', async ({ page }) => {
    if (!(await signInOrSkip(page))) return;
    await page.goto('/teacher/question-bank/questions', { waitUntil: 'domcontentloaded' });

    const found = page.getByText(/\d+ found/);
    await expect(found).toBeVisible({ timeout: 60_000 });
    const before = Number((await found.textContent())?.match(/\d+/)?.[0] ?? '0');
    test.skip(before === 0, 'No questions in this environment');

    await page.getByRole('button', { name: /^source$/i }).click();
    await page.getByRole('menuitem', { name: /previous year papers/i }).click();

    // The whole point: past paper questions are a strict subset of the bank, so
    // the count must fall. Production splits 2002 pyq against 3582 total.
    await expect(found).not.toHaveText(`${before} found`, { timeout: 30_000 });
    const after = Number((await found.textContent())?.match(/\d+/)?.[0] ?? '0');
    expect(after).toBeLessThan(before);
  });
});

test.describe('QB teacher: mobile', () => {
  test.describe.configure({ timeout: COLD_COMPILE_BUDGET });

  test('the papers list does not scroll sideways at 375px', async ({ page }) => {
    if (!(await signInOrSkip(page))) return;
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/teacher/question-bank/papers', { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { level: 1 }).first().waitFor({ timeout: 60_000 });

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test('the hub reaches every tool in the section', async ({ page }) => {
    if (!(await signInOrSkip(page))) return;
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/teacher/question-bank', { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { level: 1 }).first().waitFor({ timeout: 60_000 });

    // Seven routes used to have no door at all: the only way in was a typed URL.
    for (const label of [
      /manage papers/i,
      /student progress/i,
      /bulk solutions/i,
      /drawing questions/i,
      /import recalled/i,
      /re-classify topics/i,
      /reported questions/i,
    ]) {
      await expect(page.getByRole('button', { name: label })).toBeVisible();
    }
  });
});
