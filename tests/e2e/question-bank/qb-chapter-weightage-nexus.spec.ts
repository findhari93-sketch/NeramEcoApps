/**
 * Chapter weightage (student QB), E2E.
 *
 * /student/question-bank/[exam]/weightage shows, per section, a "Start with
 * these 10" list, a trends view (chart or list on a laptop, list only on a
 * phone) and a chapter x year heat map, all derived from the live chapter tags.
 *
 * What these pin:
 * - The API refuses callers without a token and a bad exam, and answers staff
 *   with the counts shape the page reads.
 * - The exam page has a door to it, and Back returns there.
 * - Laptop: the three cards render; Chart/List switch exists; a chapter opens a
 *   dialog whose Practise link filters the practice list to that chapter.
 * - Phone (375): no sideways scroll, no Chart switch, the list groups render,
 *   the sheet opens, and the touch targets are 44px.
 * - A short-history section (NATA drawing) gets the plain card, not charts.
 *
 * Read-only. The laptop and phone checks answer the weightage route with
 * tests/fixtures/qb-weightage-jee.json (real prod JEE counts, 1 Oct 2026), so
 * they run the same on staging, which holds almost no JEE questions. The API
 * checks and the NATA check hit the real route.
 *
 * Run: PW_APPS=nexus pnpm test:e2e tests/e2e/question-bank/qb-chapter-weightage-nexus.spec.ts --project=nexus-chrome --no-deps
 */

import { test, expect, type Browser, type Page } from '@playwright/test';
import { APP_URLS, getTestAuthToken, injectAuthForPage } from '../../utils/credentials';
import { assertNoHorizontalOverflow } from '../../utils/mobile-helpers';
import jeeFixture from '../../fixtures/qb-weightage-jee.json';

const NEXUS = APP_URLS.nexus;
const DESKTOP = { width: 1280, height: 900 };
const PHONE = { width: 375, height: 812 };
const JEE_PAGE = `${NEXUS}/student/question-bank/jee-paper-2/weightage`;

test.describe.configure({ mode: 'default', timeout: 180_000 });

async function signedIn(browser: Browser, viewport = DESKTOP) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const ok = await injectAuthForPage(page, 'student');
  return { context, page, ok };
}

/** Serve the JEE fixture for the page's one data request. */
async function mockJee(page: Page) {
  await page.route('**/api/question-bank/weightage?**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: jeeFixture }) }),
  );
}

/** Waits for the page's h1, clearing the student welcome tour if it opens. */
async function openWeightage(page: Page, url = JEE_PAGE) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 150_000 });
  const h1 = page.getByRole('heading', { level: 1, name: 'Chapter weightage' });
  const skip = page.getByRole('button', { name: /^skip$/i });
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (await h1.isVisible().catch(() => false)) break;
    if (await skip.first().isVisible().catch(() => false)) await skip.first().click().catch(() => {});
    await page.waitForTimeout(1_000);
  }
  await expect(h1).toBeVisible();
}

/** Resolves once data has landed: the top-10 card, the thin card, or an info message. */
async function settled(page: Page): Promise<'full' | 'thin' | 'empty'> {
  const top = page.getByRole('heading', { name: /^Start with these \d+$/ });
  const thin = page.getByRole('heading', { name: /tasks in past papers$/ });
  const info = page.getByText(/added to a classroom|No .* past-paper questions/);
  await expect(top.or(thin).or(info).first()).toBeVisible({ timeout: 90_000 });
  if (await top.isVisible()) return 'full';
  if (await thin.isVisible()) return 'thin';
  return 'empty';
}

test.describe('Chapter weightage API', () => {
  test('refuses a caller with no token', async ({ request }) => {
    const res = await request.get(`${NEXUS}/api/question-bank/weightage?exam=JEE_PAPER_2`, { timeout: 150_000 });
    expect([401, 403]).toContain(res.status());
  });

  test('refuses an unknown exam', async ({ request }) => {
    const auth = await getTestAuthToken(request, 'teacher');
    test.skip(!auth, 'Teacher test login unavailable');
    const res = await request.get(`${NEXUS}/api/question-bank/weightage?exam=GATE`, {
      headers: { Authorization: `Bearer ${auth!.testToken}` },
      timeout: 150_000,
    });
    expect(res.status()).toBe(400);
  });

  test('answers staff with papers, totals, cells and chapters', async ({ request }) => {
    const auth = await getTestAuthToken(request, 'teacher');
    test.skip(!auth, 'Teacher test login unavailable');
    const res = await request.get(`${NEXUS}/api/question-bank/weightage?exam=JEE_PAPER_2`, {
      headers: { Authorization: `Bearer ${auth!.testToken}` },
      timeout: 150_000,
    });
    expect(res.status()).toBe(200);
    const { data } = await res.json();
    for (const key of ['papers', 'totals', 'cells', 'chapters']) expect(Array.isArray(data[key])).toBe(true);
    // The section umbrellas are never chapters.
    expect(data.chapters.map((c: { slug: string }) => c.slug)).not.toContain('mathematics');
    expect(data.chapters.map((c: { slug: string }) => c.slug)).not.toContain('aptitude');
  });
});

test.describe('Chapter weightage page', () => {
  test('the exam page links to it and Back returns', async ({ browser }) => {
    const { context, page, ok } = await signedIn(browser);
    test.skip(!ok, 'Student test login unavailable');
    await page.goto(`${NEXUS}/student/question-bank/jee-paper-2`, { waitUntil: 'domcontentloaded', timeout: 150_000 });
    const door = page.getByRole('button', { name: /Chapter weightage/ });
    const skip = page.getByRole('button', { name: /^skip$/i });
    const deadline = Date.now() + 90_000;
    while (Date.now() < deadline && !(await door.isVisible().catch(() => false))) {
      if (await skip.first().isVisible().catch(() => false)) await skip.first().click().catch(() => {});
      await page.waitForTimeout(1_000);
    }
    await door.click();
    await expect(page).toHaveURL(/\/jee-paper-2\/weightage/, { timeout: 60_000 });
    await expect(page.getByRole('heading', { level: 1, name: 'Chapter weightage' })).toBeVisible({ timeout: 60_000 });
    await page.getByRole('link', { name: /back/i }).first().click();
    await expect(page).toHaveURL(/\/question-bank\/jee-paper-2(\?|$)/, { timeout: 60_000 });
    await context.close();
  });

  test('laptop: list, trend chart and history; a chapter opens with a Practise link', async ({ browser }) => {
    const { context, page, ok } = await signedIn(browser);
    test.skip(!ok, 'Student test login unavailable');
    await mockJee(page);
    await openWeightage(page);
    const state = await settled(page);
    test.skip(state !== 'full', `JEE weightage is ${state} for this student`);

    await expect(page.getByRole('heading', { name: 'Trends' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Year by year' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Chart' })).toBeVisible();
    await expect(page.getByRole('img', { name: /how often they are asked/ })).toBeVisible();

    await page.getByRole('button', { name: 'List' }).click();
    await expect(page.getByRole('region', { name: 'Regulars' }).or(page.getByText('Regulars')).first()).toBeVisible();

    // Window switch recomputes the list without breaking it.
    await page.getByRole('button', { name: /^Recent \d+ years$/ }).click();
    await expect(page.getByText(/recent years/).first()).toBeVisible();

    // Open the first chapter of the history table.
    const firstRow = page.locator('tbody th button').first();
    const name = (await firstRow.textContent())?.trim() ?? '';
    await firstRow.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name })).toBeVisible();
    const practise = dialog.getByRole('link', { name: /^Practise \d+ questions?$/ });
    await expect(practise).toHaveAttribute('href', /\/student\/question-bank\/questions\?.*cat=/);
    await expect(practise).toHaveAttribute('href', /back=%2Fstudent%2Fquestion-bank%2Fjee-paper-2%2Fweightage/);
    await dialog.getByRole('button', { name: 'Close' }).click();
    await expect(dialog).toBeHidden();
    await context.close();
  });

  test('phone: no sideways scroll, list-only trends, sheet opens, 44px targets', async ({ browser }) => {
    const { context, page, ok } = await signedIn(browser, PHONE);
    test.skip(!ok, 'Student test login unavailable');
    await mockJee(page);
    await openWeightage(page);
    const state = await settled(page);
    test.skip(state !== 'full', `JEE weightage is ${state} for this student`);

    await assertNoHorizontalOverflow(page);
    await expect(page.getByRole('button', { name: 'Chart' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Trends' })).toBeVisible();

    // Every tickbox and list row is at least 44px tall.
    const heights = await page.evaluate(() =>
      [...document.querySelectorAll('input[type="checkbox"]')]
        .map((i) => (i.parentElement as HTMLElement).getBoundingClientRect().height)
        .concat([...document.querySelectorAll('section button')].map((b) => b.getBoundingClientRect().height)),
    );
    expect(heights.length).toBeGreaterThan(0);
    expect(Math.min(...heights)).toBeGreaterThanOrEqual(44);

    // The heat map scrolls inside its card, never the page.
    await page.getByRole('button', { name: 'Full history' }).click();
    await assertNoHorizontalOverflow(page);

    await page.locator('section button').first().click();
    await expect(page.getByRole('link', { name: /^Practise \d+ questions?$/ })).toBeVisible();
    await context.close();
  });

  test('a short-history section gets the plain card, not charts', async ({ browser }) => {
    const { context, page, ok } = await signedIn(browser);
    test.skip(!ok, 'Student test login unavailable');
    await openWeightage(page, `${NEXUS}/student/question-bank/nata/weightage`);
    const state = await settled(page);
    test.skip(state !== 'thin', `NATA weightage is ${state}; expected a short-history section`);
    await expect(page.getByText(/too few to show a pattern/)).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Year by year' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: /^Practise all \d+/ })).toBeVisible();
    await context.close();
  });
});
