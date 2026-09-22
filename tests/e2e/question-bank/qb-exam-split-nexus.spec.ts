/**
 * Question Bank split by exam, E2E.
 *
 * The Question Bank used to be one page per surface with the exam chosen by a
 * tab inside it. It is now a sidebar folder, Question Bank > JEE Paper 2 and
 * NATA, each opening its own page, and the teacher page is a to-do list that
 * leads with unfinished papers.
 *
 * What these pin:
 * - /question-bank forwards to an exam page, and old links keep working.
 * - Neither surface shows exam tabs any more.
 * - The sidebar folder lists the exams, and the phone's More sheet does too
 *   (a folder's links would otherwise exist only in a sidebar hidden below 900px).
 * - The teacher's stage cards are the filters and live in the URL, the default
 *   list never includes finished papers, and "Publish these N" sends exactly
 *   the papers on screen.
 * - Back from a paper returns to the exam it belongs to.
 *
 * Read-only against the database. The one write path (publishing) is
 * intercepted with page.route and answered locally, so no paper changes state.
 * Data-adaptive: staging holds only NATA papers, production mostly JEE, so
 * checks that need rows skip with a reason instead of asserting on nothing.
 *
 * Run: PW_APPS=nexus pnpm test:e2e tests/e2e/question-bank/qb-exam-split-nexus.spec.ts --project=nexus-chrome --no-deps
 */

import { test, expect, type Browser, type Page } from '@playwright/test';
import { APP_URLS, getTestAuthToken, injectAuthForPage } from '../../utils/credentials';
import { assertNoHorizontalOverflow } from '../../utils/mobile-helpers';

const NEXUS = APP_URLS.nexus;
const COLD_COMPILE_BUDGET = 150_000;
const DESKTOP = { width: 1280, height: 900 };
const PHONE = { width: 375, height: 812 };

const EXAM_PAGE = /\/question-bank\/(jee-paper-2|nata)(\?|$)/;

test.describe.configure({ mode: 'default', timeout: COLD_COMPILE_BUDGET });

async function appears(locator: ReturnType<Page['locator']>, timeout = 20_000): Promise<boolean> {
  return locator
    .first()
    .waitFor({ state: 'visible', timeout })
    .then(() => true)
    .catch(() => false);
}

/** The student welcome dialog aria-hides the page while it is open. */
async function dismissWelcome(page: Page) {
  const skip = page.getByRole('button', { name: /^skip$/i });
  if (await appears(skip, 3_000)) {
    await skip.first().click().catch(() => {});
    await page.waitForTimeout(300);
  }
}

async function signedInPage(browser: Browser, role: 'teacher' | 'student', viewport = DESKTOP) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const ok = await injectAuthForPage(page, role);
  return { context, page, ok };
}

/**
 * The exam page's h1, once the redirect and the data have landed.
 *
 * The student welcome tour opens on its own delay, often after a short dismiss
 * window has closed, and its Modal aria-hides the page so the heading never
 * resolves. So the wait keeps dismissing it until the heading shows.
 */
async function examHeading(page: Page) {
  const h1 = page.getByRole('heading', { level: 1, name: /^(JEE Paper 2|NATA)$/ });
  const skip = page.getByRole('button', { name: /^skip$/i });
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (await h1.isVisible().catch(() => false)) break;
    if (await skip.first().isVisible().catch(() => false)) {
      await skip.first().click().catch(() => {});
    }
    await page.waitForTimeout(1_000);
  }
  await expect(h1).toBeVisible({ timeout: 5_000 });
  return h1;
}

test.describe('Teacher: one page per exam', () => {
  test('/teacher/question-bank forwards to an exam page with no exam tabs', async ({ browser }) => {
    const { context, page, ok } = await signedInPage(browser, 'teacher');
    test.skip(!ok, 'Nexus test-login unavailable');

    await page.goto(`${NEXUS}/teacher/question-bank`, { waitUntil: 'domcontentloaded' });
    await page.waitForURL(EXAM_PAGE, { timeout: 90_000 });
    await examHeading(page);

    // The old page had "NATA (1)" and "JEE Paper 2 (26)" tabs.
    await expect(page.getByRole('tab', { name: /^(NATA|JEE Paper 2) \(\d+\)$/ })).toHaveCount(0);
    await context.close();
  });

  test('the sidebar folder lists both exams and marks the one open', async ({ browser }) => {
    const { context, page, ok } = await signedInPage(browser, 'teacher');
    test.skip(!ok, 'Nexus test-login unavailable');

    await page.goto(`${NEXUS}/teacher/question-bank/nata`, { waitUntil: 'domcontentloaded' });
    await examHeading(page);

    const nav = page.getByRole('navigation').first();
    const folder = nav.getByRole('button', { name: 'Question Bank', exact: true });
    await expect(folder).toBeVisible();
    await expect(folder).toHaveAttribute('aria-expanded', 'true');

    const nata = nav.getByRole('button', { name: 'NATA', exact: true });
    const jee = nav.getByRole('button', { name: 'JEE Paper 2', exact: true });
    await expect(nata).toHaveAttribute('aria-current', 'page');
    await expect(jee).not.toHaveAttribute('aria-current', 'page');

    await jee.click();
    await page.waitForURL(/\/teacher\/question-bank\/jee-paper-2/, { timeout: 60_000 });
    await expect(page.getByRole('heading', { level: 1, name: 'JEE Paper 2' })).toBeVisible({ timeout: 60_000 });
    await expect(jee).toHaveAttribute('aria-current', 'page');
    await context.close();
  });

  test('stage cards are the filters, and the filter lives in the URL', async ({ browser }) => {
    const { context, page, ok } = await signedInPage(browser, 'teacher');
    test.skip(!ok, 'Nexus test-login unavailable');

    await page.goto(`${NEXUS}/teacher/question-bank/nata`, { waitUntil: 'domcontentloaded' });
    await examHeading(page);

    const cards = page.getByRole('group', { name: /filter papers by what they still need/i });
    await expect(cards).toBeVisible({ timeout: 60_000 });
    const needsAnswers = cards.getByRole('button', { name: /^Needs answer key: \d+ papers?$/ });
    await expect(needsAnswers).toHaveAttribute('aria-pressed', 'false');

    await needsAnswers.click();
    await page.waitForURL(/[?&]stage=needsAnswers/, { timeout: 15_000 });
    await expect(needsAnswers).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('heading', { level: 2, name: 'Needs answer key' })).toBeVisible();

    // Pressing it again clears the filter back to everything unfinished.
    await needsAnswers.click();
    await expect(page).not.toHaveURL(/stage=/, { timeout: 15_000 });
    await expect(page.getByRole('heading', { level: 2, name: 'Still to finish' })).toBeVisible();
    await context.close();
  });

  test('the default list leaves finished papers out', async ({ browser, playwright }) => {
    const api = await playwright.request.newContext();
    const auth = await getTestAuthToken(api, 'teacher');
    test.skip(!auth, 'Nexus test-login unavailable');

    // Find an exam with at least one unfinished paper to look at.
    const res = await api.get(`${NEXUS}/api/question-bank/papers?solutions=1`, {
      headers: { Authorization: `Bearer ${auth!.testToken}` },
    });
    expect(res.status(), 'papers?solutions=1 must answer').toBe(200);
    const papers = ((await res.json()).data ?? []) as { exam_type: string; solvable_count: number }[];
    // The route adds solution counts to every paper when asked.
    for (const p of papers) expect(typeof p.solvable_count).toBe('number');
    await api.dispose();
    const exam = papers.some((p) => p.exam_type === 'JEE_PAPER_2') ? 'jee-paper-2' : 'nata';
    test.skip(papers.length === 0, 'No papers in this environment');

    const { context, page, ok } = await signedInPage(browser, 'teacher');
    test.skip(!ok, 'Nexus test-login unavailable');
    await page.goto(`${NEXUS}/teacher/question-bank/${exam}`, { waitUntil: 'domcontentloaded' });
    await examHeading(page);
    await expect(page.getByRole('heading', { level: 2, name: 'Still to finish' })).toBeVisible({ timeout: 60_000 });

    // "Complete and live" is the chip on a finished paper. It must never be in
    // the default list; the footer link that reveals them says it differently.
    await page.waitForTimeout(1500);
    await expect(page.getByText('Complete and live', { exact: true })).toHaveCount(0);

    const table = page.getByRole('table').filter({ visible: true });
    if (await appears(table, 5_000)) {
      for (const name of ['Paper', 'Next step', 'Progress', 'Qs', 'Students']) {
        await expect(page.getByRole('columnheader', { name, exact: true })).toBeVisible();
      }
    }
    await assertNoHorizontalOverflow(page);
    await context.close();
  });

  test('"Publish these N" sends exactly the papers on screen', async ({ browser }) => {
    const { context, page, ok } = await signedInPage(browser, 'teacher');
    test.skip(!ok, 'Nexus test-login unavailable');

    let sentIds: string[] | null = null;
    // Answered here, never reaching the server: no paper is published.
    await page.route('**/api/question-bank/papers/bulk-publish', async (route) => {
      sentIds = (route.request().postDataJSON() as { paper_ids?: string[] })?.paper_ids ?? null;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { published: sentIds?.length ?? 0, already_visible: 0, skipped: [] } }),
      });
    });

    let found = false;
    for (const exam of ['jee-paper-2', 'nata']) {
      await page.goto(`${NEXUS}/teacher/question-bank/${exam}?stage=readyToPublish`, {
        waitUntil: 'domcontentloaded',
      });
      await examHeading(page);
      const publish = page.getByRole('button', { name: /^Publish these \d+$/ });
      if (await appears(publish, 30_000)) {
        found = true;
        const shown = Number((await publish.textContent())?.match(/\d+/)?.[0] ?? '0');
        await publish.click();
        await expect.poll(() => sentIds?.length ?? -1, { timeout: 15_000 }).toBe(shown);
        await expect(page.getByText(new RegExp(`^${shown} papers? published\\.`))).toBeVisible();
        break;
      }
    }
    test.skip(!found, 'No paper is ready to publish in this environment');
    await context.close();
  });

  test('Bulk Upload opens with the exam already chosen', async ({ browser }) => {
    const { context, page, ok } = await signedInPage(browser, 'teacher');
    test.skip(!ok, 'Nexus test-login unavailable');

    await page.goto(`${NEXUS}/teacher/question-bank/nata`, { waitUntil: 'domcontentloaded' });
    await examHeading(page);
    await page.getByRole('button', { name: 'Bulk Upload', exact: true }).click();
    await page.waitForURL(/\/teacher\/question-bank\/bulk-upload\?exam=NATA/, { timeout: 60_000 });
    await context.close();
  });

  test('Back from a paper returns to that paper\'s exam page', async ({ browser }) => {
    const { context, page, ok } = await signedInPage(browser, 'teacher');
    test.skip(!ok, 'Nexus test-login unavailable');

    let opened = false;
    for (const [slug, label] of [['nata', 'NATA'], ['jee-paper-2', 'JEE Paper 2']] as const) {
      // Every stage, done included, so any paper at all will do.
      for (const stage of ['', '?stage=done']) {
        await page.goto(`${NEXUS}/teacher/question-bank/${slug}${stage}`, { waitUntil: 'domcontentloaded' });
        await examHeading(page);
        const row = page.getByRole('button', { name: /Next step:/ }).filter({ visible: true });
        if (!(await appears(row, 15_000))) continue;
        await row.first().click();
        await page.waitForURL(/\/teacher\/question-bank\/papers\/[^/?]+/, { timeout: 60_000 });
        await page.getByRole('button', { name: `Back to ${label} papers` }).click({ timeout: 90_000 });
        await page.waitForURL(new RegExp(`/teacher/question-bank/${slug}(\\?|$)`), { timeout: 60_000 });
        opened = true;
        break;
      }
      if (opened) break;
    }
    test.skip(!opened, 'No papers in this environment');
    await context.close();
  });
});

test.describe('Teacher: phone', () => {
  test('375px: the exam page fits and its filters are thumb-sized', async ({ browser }) => {
    const { context, page, ok } = await signedInPage(browser, 'teacher', PHONE);
    test.skip(!ok, 'Nexus test-login unavailable');

    await page.goto(`${NEXUS}/teacher/question-bank/nata`, { waitUntil: 'domcontentloaded' });
    await examHeading(page);
    const cards = page.getByRole('group', { name: /filter papers by what they still need/i });
    await expect(cards).toBeVisible({ timeout: 60_000 });

    await assertNoHorizontalOverflow(page);
    const buttons = cards.getByRole('button');
    await expect(buttons).toHaveCount(5);
    for (let i = 0; i < 5; i++) {
      const box = await buttons.nth(i).boundingBox();
      expect(box, `stage card ${i}`).not.toBeNull();
      expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(box!.width).toBeGreaterThanOrEqual(44);
    }
    await context.close();
  });

  test('375px: the More sheet lists both exams under Question Bank', async ({ browser }) => {
    const { context, page, ok } = await signedInPage(browser, 'teacher', PHONE);
    test.skip(!ok, 'Nexus test-login unavailable');

    // An exam page selects the Management panel, whose sheet carries the folder.
    await page.goto(`${NEXUS}/teacher/question-bank/nata`, { waitUntil: 'domcontentloaded' });
    await examHeading(page);

    const more = page.getByRole('button', { name: 'More' });
    test.skip(!(await appears(more, 20_000)), 'Bottom bar not rendered');
    await more.first().click();

    await expect(page.getByText('Question Bank', { exact: true }).filter({ visible: true }).first()).toBeVisible();
    const jee = page.getByText('JEE Paper 2', { exact: true }).filter({ visible: true });
    await expect(jee.first()).toBeVisible();
    await expect(page.getByText('NATA', { exact: true }).filter({ visible: true }).first()).toBeVisible();

    await jee.first().click();
    await page.waitForURL(/\/teacher\/question-bank\/jee-paper-2/, { timeout: 60_000 });
    await context.close();
  });
});

test.describe('Student: one page per exam', () => {
  /** Which exams have a published paper, from the same route the sidebar reads. */
  async function studentQB(playwright: { request: { newContext: () => Promise<any> } }) {
    const api = await playwright.request.newContext();
    try {
      const auth = await getTestAuthToken(api, 'student');
      if (!auth) return null;
      const res = await api.get(`${NEXUS}/api/question-bank/published-exams`, {
        headers: { Authorization: `Bearer ${auth.testToken}` },
      });
      if (!res.ok()) return null;
      const data = (await res.json()).data as { published_exams: string[] };
      return data;
    } finally {
      await api.dispose();
    }
  }

  test('/student/question-bank forwards to an exam page, with no exam tabs', async ({ browser }) => {
    const { context, page, ok } = await signedInPage(browser, 'student');
    test.skip(!ok, 'Nexus test-login unavailable');

    await page.goto(`${NEXUS}/student/question-bank`, { waitUntil: 'domcontentloaded' });
    await page.waitForURL(/\/student\/question-bank\/(jee-paper-2|nata)(\?|$)/, { timeout: 90_000 });
    await dismissWelcome(page);
    await examHeading(page);
    await expect(page.getByRole('tab', { name: /^(NATA|JEE Paper 2) \(\d+\)$/ })).toHaveCount(0);
    await context.close();
  });

  test('the sidebar lists only exams with a published paper', async ({ browser, playwright }) => {
    const access = await studentQB(playwright);
    test.skip(!access, 'Student test-login unavailable');

    const { context, page, ok } = await signedInPage(browser, 'student');
    test.skip(!ok, 'Nexus test-login unavailable');
    await page.goto(`${NEXUS}/student/question-bank/jee-paper-2`, { waitUntil: 'domcontentloaded' });
    await dismissWelcome(page);
    await examHeading(page);

    const nav = page.getByRole('navigation').first();
    await expect(nav.getByRole('button', { name: 'Question Bank', exact: true })).toBeVisible({ timeout: 30_000 });
    const nataListed = access!.published_exams.includes('NATA');
    await expect(nav.getByRole('button', { name: 'NATA', exact: true })).toHaveCount(nataListed ? 1 : 0);
    // JEE Paper 2 is listed when published, and also when nothing is published
    // at all, so the question search always has a door.
    const jeeListed = access!.published_exams.includes('JEE_PAPER_2') || access!.published_exams.length === 0;
    await expect(nav.getByRole('button', { name: 'JEE Paper 2', exact: true })).toHaveCount(jeeListed ? 1 : 0);
    await context.close();
  });

  test('search from an exam page stays in that exam, and Back returns to it', async ({ browser }) => {
    const { context, page, ok } = await signedInPage(browser, 'student');
    test.skip(!ok, 'Nexus test-login unavailable');

    await page.goto(`${NEXUS}/student/question-bank/jee-paper-2`, { waitUntil: 'domcontentloaded' });
    await dismissWelcome(page);
    await examHeading(page);

    await page.getByRole('button', { name: /search every question/i }).click();
    await page.waitForURL(/\/student\/question-bank\/questions\?.*exam=JEE_PAPER_2/, { timeout: 60_000 });

    // The page's own Back button, named after where it goes. Scoped to <main>:
    // the sidebar carries a "JEE Paper 2" link of its own.
    const back = page
      .getByRole('main')
      .getByRole('button', { name: /^(JEE Paper 2|Question Bank)$/ })
      .filter({ visible: true })
      .first();
    await expect(back).toBeVisible({ timeout: 60_000 });
    await back.click();
    await page.waitForURL(/\/student\/question-bank\/jee-paper-2(\?|$)/, { timeout: 60_000 });
    await context.close();
  });

  test('375px: the exam page fits the phone', async ({ browser }) => {
    const { context, page, ok } = await signedInPage(browser, 'student', PHONE);
    test.skip(!ok, 'Nexus test-login unavailable');

    await page.goto(`${NEXUS}/student/question-bank/jee-paper-2`, { waitUntil: 'domcontentloaded' });
    await dismissWelcome(page);
    await examHeading(page);
    await page.waitForTimeout(1500);
    await assertNoHorizontalOverflow(page);
    await context.close();
  });

  test('an unknown exam is a 404, not a blank page', async ({ browser }) => {
    const { context, page, ok } = await signedInPage(browser, 'student');
    test.skip(!ok, 'Nexus test-login unavailable');

    await page.goto(`${NEXUS}/student/question-bank/engineering`, { waitUntil: 'domcontentloaded' });
    await dismissWelcome(page);
    await expect(page.getByText(/could not be found|not found|404/i).first()).toBeVisible({ timeout: 90_000 });
    await context.close();
  });
});
