/**
 * Student question practice, laptop: the paper beside the question.
 *
 * The founder's report on /student/question-bank/questions?exam=JEE_PAPER_2&year=2014:
 * the chip row was cut off at the top, and opening question 18 meant scrolling
 * the whole page down to it, clicking, then scrolling back up because the
 * question pane had scrolled away with the page. Each test below pins one part
 * of the fix:
 *
 *  - the document never scrolls; the rail and the reader scroll on their own
 *  - opening a question far down the list shows it at the top of the reader
 *  - the arrow keys walk the paper, the grid follows, and history stays put
 *  - `?qid=` survives a reload
 *  - an answer turns its grid cell at once, with no refetch
 *  - the chip row sits inside its box and cannot be scrolled out of it
 *
 * The paper is chosen from the exam tree, never hardcoded, and every attempt is
 * answered by a route mock, so no test writes a real attempt.
 *
 * Run: pnpm test:e2e --project=nexus-chrome --no-deps tests/e2e/question-bank/nexus-qb-practice-workspace.spec.ts
 */

import { test, expect, type Page } from '@playwright/test';
import { APP_URLS, getTestAuthToken, injectAuthForPage } from '../../utils/credentials';

const BASE_URL = APP_URLS.nexus;
test.use({ baseURL: BASE_URL, viewport: { width: 1280, height: 800 } });
// The exam tree is a cold, heavy read on a dev server.
test.describe.configure({ timeout: 240_000 });

interface Paper {
  exam: string;
  year: number;
  count: number;
}

/** A paper with at least 20 questions, so "question 18" exists. */
async function pickPaper(page: Page): Promise<Paper | null> {
  const auth = await getTestAuthToken(page.request, 'student');
  const classroomId = auth?.classrooms?.[0]?.id;
  if (!auth || !classroomId) return null;
  const res = await page.request.get(`/api/question-bank/exam-tree?classroom_id=${classroomId}`, {
    headers: { Authorization: `Bearer ${auth.testToken}` },
    timeout: 180_000,
  });
  if (!res.ok()) return null;
  const tree = (await res.json()).data as { exams: { exam_type: string; years: { year: number; count: number }[] }[] };
  for (const exam of tree?.exams ?? []) {
    const year = [...exam.years].sort((a, b) => b.count - a.count).find((y) => y.count >= 20);
    if (year) return { exam: exam.exam_type, year: year.year, count: year.count };
  }
  return null;
}

async function dismissWelcome(page: Page) {
  await page.getByRole('button', { name: 'Skip' }).click({ timeout: 5_000 }).catch(() => {});
}

/** Never write a real attempt: answer every one as wrong. */
async function mockAttempts(page: Page) {
  await page.route('**/api/question-bank/questions/*/attempt', (route) =>
    route.fulfill({
      json: {
        data: {
          isCorrect: false,
          attempt: { id: 'e2e-attempt', created_at: new Date().toISOString(), is_correct: false, selected_answer: 'x' },
        },
      },
    }),
  );
}

async function openPaper(page: Page, paper: Paper, extra = '') {
  await page.goto(`/student/question-bank/questions?exam=${paper.exam}&year=${paper.year}${extra}`, {
    waitUntil: 'domcontentloaded',
  });
  await dismissWelcome(page);
  await expect(page.getByRole('button', { name: /^Question \d+, / }).first()).toBeVisible({ timeout: 120_000 });
}

/** The reader's "Q18 of 30" label. */
function position(page: Page) {
  return page.getByRole('button', { name: /^Q\d+ of \d+\. Jump to a question$/ });
}

let paper: Paper | null | undefined;

test.beforeEach(async ({ page }) => {
  const ok = await injectAuthForPage(page, 'student');
  test.skip(!ok, 'Nexus test-login unavailable');
  if (paper === undefined) paper = await pickPaper(page);
  test.skip(!paper, 'No paper with 20 or more questions on this database');
  await mockAttempts(page);
});

test.describe('Practice workspace at 1280', () => {
  test('the document does not scroll; the panes do, in the grid and in the list', async ({ page }) => {
    await openPaper(page, paper!);
    const measure = () =>
      page.evaluate(() => ({ scroll: document.scrollingElement!.scrollHeight, height: window.innerHeight }));
    for (const view of ['Number grid', 'List with previews']) {
      await page.getByRole('button', { name: view }).click();
      await page.waitForTimeout(300);
      const doc = await measure();
      // A long list once stretched the page to 11,000px through absolutely
      // positioned screen-reader text that escaped the rail's scroll box.
      expect(doc.scroll, view).toBeLessThanOrEqual(doc.height + 1);
    }
  });

  test('a question far down the list opens at the top of the reader, and the page stays put', async ({ page }) => {
    await openPaper(page, paper!);
    await page.getByRole('button', { name: 'List with previews' }).click();
    const rail = page.locator('[data-rail-scroll]');
    await rail.evaluate((el) => el.scrollTo({ top: el.scrollHeight }));

    const row = rail.locator('button[data-qid]').nth(17);
    const qid = await row.getAttribute('data-qid');
    await row.click();

    await expect(page).toHaveURL(new RegExp(`qid=${qid}`));
    const label = position(page);
    await expect(label).toBeVisible();
    const box = await label.boundingBox();
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.y).toBeLessThan(260);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    expect(await page.locator('[data-reader-body]').evaluate((el) => el.scrollTop)).toBe(0);
    await page.screenshot({ path: 'test-results/qb-practice-desktop-q18.png' });
  });

  test('the arrow keys walk the paper, the grid follows, and history does not fill up', async ({ page }) => {
    await openPaper(page, paper!);
    await page.getByRole('button', { name: 'Number grid' }).click();
    const cells = page.locator('[data-roving] button[data-qid]');
    await cells.nth(0).click();
    // Move focus off the grid, which keeps the arrows for itself.
    await page.locator('[data-reader-body]').click({ position: { x: 5, y: 5 } });

    const before = await page.evaluate(() => history.length);
    for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowRight');
    await expect(cells.nth(5)).toHaveAttribute('aria-current', 'true');
    expect(await page.evaluate(() => history.length)).toBe(before);

    // The current cell is inside the rail's visible box.
    const rail = await page.locator('[data-rail-scroll]').boundingBox();
    const cell = await cells.nth(5).boundingBox();
    expect(cell!.y).toBeGreaterThanOrEqual(rail!.y - 1);
    expect(cell!.y + cell!.height).toBeLessThanOrEqual(rail!.y + rail!.height + 1);
  });

  test('a reload keeps the open question', async ({ page }) => {
    await openPaper(page, paper!);
    await page.locator('[data-roving] button[data-qid]').nth(3).click().catch(async () => {
      await page.locator('button[data-qid]').nth(3).click();
    });
    const label = await position(page).textContent();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await dismissWelcome(page);
    await expect(position(page)).toHaveText(label!, { timeout: 120_000 });
  });

  test('an answer turns its cell at once', async ({ page }) => {
    await openPaper(page, paper!);
    await page.getByRole('button', { name: 'Number grid' }).click();
    const cells = page.locator('[data-roving] button[data-qid]');
    // The first multiple-choice question in the paper.
    const count = await cells.count();
    let answered = false;
    for (let i = 0; i < Math.min(count, 10) && !answered; i++) {
      await cells.nth(i).click();
      const option = page.locator('[data-reader-body] [role="radio"]').first();
      if (!(await option.isVisible({ timeout: 10_000 }).catch(() => false))) continue;
      const name = (await cells.nth(i).getAttribute('aria-label'))!;
      const number = name.match(/^Question (\d+)/)![1];
      await option.click();
      await page.getByRole('button', { name: 'Check answer' }).click();
      await expect(page.getByRole('button', { name: `Question ${number}, answered wrong` })).toBeVisible();
      answered = true;
    }
    test.skip(!answered, 'No multiple-choice question in the first ten');
  });

  test('the chip row stays inside its box, even after a wheel over it', async ({ page }) => {
    await openPaper(page, paper!);
    const video = page.getByRole('button', { name: 'Video solutions' });
    const row = video.locator('xpath=..');
    await row.hover();
    await page.mouse.wheel(0, 200);
    const geometry = await row.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return {
        top: r.top,
        bottom: r.bottom,
        scrollTop: el.scrollTop,
        overflow: el.scrollHeight - el.clientHeight,
        chips: Array.from(el.querySelectorAll('.MuiChip-root')).map((c) => {
          const b = c.getBoundingClientRect();
          return { top: b.top, bottom: b.bottom };
        }),
      };
    });
    expect(geometry.scrollTop).toBe(0);
    expect(geometry.overflow).toBeLessThanOrEqual(0);
    for (const chip of geometry.chips) {
      expect(chip.top).toBeGreaterThanOrEqual(geometry.top - 0.5);
      expect(chip.bottom).toBeLessThanOrEqual(geometry.bottom + 0.5);
    }
  });
});

test.describe('Practice workspace, narrower laptops', () => {
  test('1024: the reader keeps a usable width and nothing overflows its pane', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await openPaper(page, paper!);
    const reader = page.getByRole('region', { name: 'Question', exact: true });
    const box = await reader.boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(360);
    for (const name of ['Question', 'Questions']) {
      const overflow = await page
        .getByRole('region', { name, exact: true })
        .evaluate((el) => el.scrollWidth - el.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
    }
  });

  test('920 with the sidebar expanded: still two panes, and the reader is not squeezed', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('nexus_sidebar_state', 'expanded'));
    await page.setViewportSize({ width: 920, height: 800 });
    await openPaper(page, paper!);
    const rail = await page.getByRole('region', { name: 'Questions', exact: true }).boundingBox();
    const reader = await page.getByRole('region', { name: 'Question', exact: true }).boundingBox();
    expect(rail!.width).toBeLessThanOrEqual(300);
    expect(reader!.width).toBeGreaterThanOrEqual(320);
    const overflow = await page
      .getByRole('region', { name: 'Question', exact: true })
      .evaluate((el) => el.scrollWidth - el.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test('? opens the keyboard shortcuts, and the arrows rest while a drawer is open', async ({ page }) => {
    await openPaper(page, paper!);
    await page.locator('[data-reader-body]').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('?');
    await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible();
    await page.keyboard.press('Escape');

    const label = await position(page).textContent();
    await page.locator('.MuiChip-root').filter({ hasText: /^Filters$/ }).first().click();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Escape');
    await expect(position(page)).toHaveText(label!);
  });
});
