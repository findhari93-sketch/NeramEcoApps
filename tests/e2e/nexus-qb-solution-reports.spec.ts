import { test, expect, type Page, type APIRequestContext } from '@playwright/test';
import { APP_URLS, getTestAuthToken, injectAuthForPage } from '../utils/credentials';
import { assertNoHorizontalOverflow } from '../utils/mobile-helpers';

/**
 * Student reports on a question, end to end: a student reports a mistake, the
 * teacher sees it on the question in its paper and marks it fixed, and the
 * student's own list says Fixed.
 *
 * The student reports through the API (the sheet itself is covered by unit
 * tests, and the student practice screens are being rebuilt in parallel). The
 * question is the first one of a real paper, found through the UI, never a
 * hardcoded id. The report is closed by the test itself, so nothing is left
 * open for staff; the closed row stays on staging as test history.
 *
 * Serial on one teacher page, like the other paper specs: a dev server
 * compiling on demand makes a login per test slower than any timeout.
 */
test.describe.configure({ mode: 'serial', timeout: 240_000 });

test.describe('QB student reports', () => {
  let page: Page;
  let paperUrl = '';
  let questionId = '';
  const note = `E2E report ${Date.now()}`;

  async function studentToken(request: APIRequestContext) {
    const auth = await getTestAuthToken(request, 'student');
    expect(auth, 'student test-login must succeed').not.toBeNull();
    return auth!.testToken;
  }

  test.beforeAll(async ({ browser }, testInfo) => {
    testInfo.setTimeout(240_000);
    page = await browser.newPage();
    expect(await injectAuthForPage(page, 'teacher'), 'teacher test-login must succeed').toBe(true);

    for (let attempt = 0; ; attempt++) {
      try {
        await page.goto(`${APP_URLS.nexus}/teacher/question-bank/papers`, { waitUntil: 'domcontentloaded' });
        break;
      } catch (err) {
        if (attempt >= 2) throw err;
      }
    }
    await expect(page.getByText(/\d+ papers ·/)).toBeVisible({ timeout: 120_000 });
    const row = page.locator('tbody tr').filter({ hasNotText: /drawing/i }).first();
    await expect(row).toBeVisible({ timeout: 60_000 });
    await row.locator('td').first().click();
    await expect(page.getByRole('tab', { name: /Questions \(/ })).toBeVisible({ timeout: 120_000 });

    paperUrl = page.url().split('?')[0];
    const firstRow = page.locator('[data-question-id]').first();
    await expect(firstRow).toBeVisible({ timeout: 60_000 });
    questionId = (await firstRow.getAttribute('data-question-id')) ?? '';
    expect(questionId).not.toBe('');
  });

  test.afterAll(async () => {
    await page?.close();
  });

  test('a student reports a mistake once, and a second report is not filed twice', async ({ request }) => {
    const token = await studentToken(request);
    const post = () =>
      request.post(`${APP_URLS.nexus}/api/question-bank/questions/${questionId}/report`, {
        headers: { Authorization: `Bearer ${token}` },
        data: { target: 'question', reason: 'question_error', note },
      });
    const first = await post();
    expect([200, 201]).toContain(first.status());
    const second = await post();
    expect(second.status()).toBe(200);
    expect((await second.json()).already_open).toBe(true);

    const status = await request.get(
      `${APP_URLS.nexus}/api/question-bank/report-status?question_ids=${questionId}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const body = await status.json();
    expect(body.data[questionId].mine.some((m: { target: string }) => m.target === 'question')).toBe(true);
  });

  test('a student cannot read the paper reports that staff see', async ({ request }) => {
    const token = await studentToken(request);
    const paperId = paperUrl.split('/').pop();
    const res = await request.get(`${APP_URLS.nexus}/api/question-bank/papers/${paperId}/reports`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status()).toBe(403);
  });

  test('the teacher sees the report on the question, from a link straight to it', async () => {
    await page.goto(`${paperUrl}?q=${questionId}`, { waitUntil: 'domcontentloaded' });
    const panel = page.getByRole('region', { name: 'Student reports' });
    await expect(panel).toBeVisible({ timeout: 120_000 });
    await expect(panel.getByText('The question', { exact: true })).toBeVisible();
    await expect(panel.getByText(note)).toBeVisible();
    const filters = page.getByRole('group', { name: 'Filter the question list' });
    await expect(filters.getByRole('button', { name: /^Reported \d+$/ })).toBeVisible();
    await page.screenshot({ path: 'test-results/qb-reports-pane-1280.png' });
  });

  test('mobile 375: the reports panel fits without sideways scroll', async () => {
    await page.setViewportSize({ width: 375, height: 812 });
    await expect(page.getByRole('region', { name: 'Student reports' })).toBeVisible();
    await assertNoHorizontalOverflow(page);
    const fixed = page.getByRole('button', { name: 'Mark fixed' }).first();
    expect((await fixed.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
    await page.screenshot({ path: 'test-results/qb-reports-pane-375.png' });
    await page.setViewportSize({ width: 1280, height: 800 });
  });

  test('the teacher marks it fixed, and the problem leaves the question', async () => {
    const panel = page.getByRole('region', { name: 'Student reports' });
    const card = panel.getByRole('article').filter({ hasText: note });
    await card.getByRole('button', { name: 'Mark fixed' }).click();
    await expect(page.getByText(/^Marked fixed\. \d+ students? told$/)).toBeVisible({ timeout: 60_000 });
    await expect(panel.getByText(note)).toHaveCount(0, { timeout: 60_000 });
  });

  test("the student's own list says it was fixed", async ({ browser }) => {
    const student = await browser.newPage();
    expect(await injectAuthForPage(student, 'student'), 'student test-login must succeed').toBe(true);
    await student.goto(`${APP_URLS.nexus}/student/question-bank/reports`, { waitUntil: 'domcontentloaded' });
    // A first visit opens the welcome tour over the page, which hides the page
    // from role queries until it is dismissed.
    await student.getByRole('button', { name: 'Skip' }).click({ timeout: 30_000 }).catch(() => {});
    const card = student.getByRole('listitem').filter({ hasText: note });
    await expect(card).toBeVisible({ timeout: 120_000 });
    await expect(card.getByText('Fixed', { exact: true })).toBeVisible();
    await student.screenshot({ path: 'test-results/qb-student-reports.png' });
    await student.close();
  });
});
