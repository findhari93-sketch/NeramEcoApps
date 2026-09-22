/**
 * Student question practice, phone: the list, then a full-screen reader.
 *
 * Phones used to open a question inside the list, with no way to the next one
 * except collapsing it and scrolling on. The reader is the pattern the JEE
 * practice apps settled on: tap a question, read it full screen, swipe or tap
 * Next, jump by number, and let the phone's Back button close it.
 *
 *  - opening puts `qid` in the address bar; Back closes the reader, not the page
 *  - Next then Back still closes the reader (Next replaces, it does not push)
 *  - the number sheet jumps anywhere in the paper
 *  - a sideways swipe moves to the next question
 *  - reduced motion opens it without the slide
 *  - every control is at least 44 by 44, and nothing overflows the screen
 *
 * Overflow is measured on the elements themselves: `main` hides horizontal
 * overflow, so documentElement.scrollWidth proves nothing here.
 *
 * Run: pnpm test:e2e --project=nexus-mobile --no-deps tests/e2e/question-bank/qb-practice-reader-nexus-mobile.spec.ts
 */

import { test, expect, type Page } from '@playwright/test';
import { APP_URLS, getTestAuthToken, injectAuthForPage } from '../../utils/credentials';

const BASE_URL = APP_URLS.nexus;
test.use({ baseURL: BASE_URL, viewport: { width: 393, height: 851 }, hasTouch: true, isMobile: true });
// The exam tree is a cold, heavy read on a dev server.
test.describe.configure({ timeout: 240_000 });

interface Paper {
  exam: string;
  year: number;
}

let paper: Paper | null | undefined;

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
    if (year) return { exam: exam.exam_type, year: year.year };
  }
  return null;
}

async function openPaper(page: Page) {
  await page.goto(`/student/question-bank/questions?exam=${paper!.exam}&year=${paper!.year}`, {
    waitUntil: 'domcontentloaded',
  });
  await page.getByRole('button', { name: 'Skip' }).click({ timeout: 5_000 }).catch(() => {});
  await page.getByRole('button', { name: 'Number grid' }).click({ timeout: 120_000 });
  await expect(cells(page).first()).toBeVisible({ timeout: 120_000 });
}

const cells = (page: Page) => page.locator('[data-roving] button[data-qid]');
const reader = (page: Page) => page.getByRole('dialog', { name: 'Question reader' });
const position = (page: Page) => reader(page).getByRole('button', { name: /^Q\d+ of \d+\. Jump to a question$/ });

test.beforeEach(async ({ page }) => {
  const ok = await injectAuthForPage(page, 'student');
  test.skip(!ok, 'Nexus test-login unavailable');
  if (paper === undefined) paper = await pickPaper(page);
  test.skip(!paper, 'No paper with 20 or more questions on this database');
  // Never write a real attempt.
  await page.route('**/api/question-bank/questions/*/attempt', (route) =>
    route.fulfill({ json: { data: { isCorrect: false, attempt: { id: 'e2e', created_at: new Date().toISOString() } } } }),
  );
});

test('tapping a question opens the reader, and Back closes it on the list', async ({ page }) => {
  await openPaper(page);
  const cell = cells(page).nth(11);
  const qid = await cell.getAttribute('data-qid');
  await cell.click();
  await expect(reader(page)).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`qid=${qid}`));
  await page.screenshot({ path: 'test-results/qb-practice-mobile-reader.png' });

  await page.goBack();
  await expect(reader(page)).toBeHidden();
  await expect(page).toHaveURL(/\/student\/question-bank\/questions\?/);
  expect(page.url()).not.toContain('qid=');
  // The question just read is on screen, not scrolled away.
  const box = await cells(page).nth(11).boundingBox();
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(851);
});

test('Next, then Back, closes the reader rather than stepping back a question', async ({ page }) => {
  await openPaper(page);
  await cells(page).nth(0).click();
  await expect(position(page)).toHaveText(/^Q1 of/);
  await reader(page).getByRole('button', { name: 'Next question' }).last().click();
  await expect(position(page)).toHaveText(/^Q2 of/);
  await page.goBack();
  await expect(reader(page)).toBeHidden();
  await expect(page).toHaveURL(/\/student\/question-bank\/questions\?/);
});

test('the number sheet jumps anywhere in the paper', async ({ page }) => {
  await openPaper(page);
  await cells(page).nth(0).click();
  await position(page).click();
  const sheet = page.getByRole('heading', { name: 'Jump to a question' });
  await expect(sheet).toBeVisible();
  await page.locator('.MuiDrawer-root [data-roving] button[data-qid]').nth(19).click();
  await expect(position(page)).toHaveText(/^Q20 of/);
});

test('a sideways swipe moves to the next question', async ({ page }) => {
  await openPaper(page);
  await cells(page).nth(0).click();
  await expect(position(page)).toHaveText(/^Q1 of/);
  const body = reader(page).locator('[data-reader-body]');
  await body.evaluate((el) => {
    const touch = (x: number) => new Touch({ identifier: 1, target: el, clientX: x, clientY: 300 });
    el.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, touches: [touch(320)], changedTouches: [touch(320)] }));
    el.dispatchEvent(new TouchEvent('touchend', { bubbles: true, touches: [], changedTouches: [touch(120)] }));
  });
  await expect(position(page)).toHaveText(/^Q2 of/);
});

test('reduced motion opens the reader without the slide', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openPaper(page);
  await cells(page).nth(0).click();
  // The dialog is the Slide's own element, so its inline transition is the slide.
  const transition = await reader(page).evaluate((el) => (el as HTMLElement).style.transition);
  expect(transition === '' || /\b0ms\b/.test(transition)).toBe(true);
});

test('every control is at least 44 by 44, and nothing overflows', async ({ page }) => {
  await openPaper(page);
  // The list screen.
  const list = page.locator('h1').first().locator('xpath=ancestor::header[1]/..');
  expect(await list.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
  for (const cell of await cells(page).all()) {
    const b = await cell.boundingBox();
    if (!b) continue;
    expect(b.width).toBeGreaterThanOrEqual(44);
    expect(b.height).toBeGreaterThanOrEqual(44);
    expect(b.x + b.width).toBeLessThanOrEqual(393 + 0.5);
  }

  // The reader.
  await cells(page).nth(0).click();
  const paperEl = reader(page);
  expect(await paperEl.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
  for (const button of await reader(page).getByRole('button').all()) {
    if (!(await button.isVisible())) continue;
    const b = await button.boundingBox();
    expect(b!.width, await button.getAttribute('aria-label') ?? (await button.textContent()) ?? '').toBeGreaterThanOrEqual(44);
    expect(b!.height).toBeGreaterThanOrEqual(44);
  }
});
