/**
 * JEE Paper 2B (B.Planning) in the question bank, E2E.
 *
 * Paper 2B shares its Maths and Aptitude with the Paper 2A of the same sitting
 * and adds a Planning section. What these pin:
 * - The exam has its own address and sidebar entry, and its page fits a phone.
 * - Bulk upload offers it, with the "copy Maths and Aptitude" switch.
 * - The copy and move routes are staff only and refuse the wrong paper or an
 *   empty selection, before writing anything.
 * - The weightage route accepts the new exam.
 * - Creating a paper with an unknown exam is a 400, not a DB-constraint 500.
 *
 * Read-only: every write route is called only with input it must refuse.
 *
 * Run: PW_APPS=nexus pnpm test:e2e tests/e2e/question-bank/qb-jee-paper-2b-nexus.spec.ts --project=nexus-chrome --no-deps
 */

import { test, expect, type Browser } from '@playwright/test';
import { APP_URLS, getTestAuthToken, injectAuthForPage } from '../../utils/credentials';
import { assertNoHorizontalOverflow, assertTouchTargetSize } from '../../utils/mobile-helpers';

const NEXUS = APP_URLS.nexus;
const COLD_COMPILE_BUDGET = 150_000;
const DESKTOP = { width: 1280, height: 900 };
const PHONE = { width: 375, height: 812 };

test.describe.configure({ mode: 'default', timeout: COLD_COMPILE_BUDGET });

async function signedInPage(browser: Browser, role: 'teacher' | 'student', viewport = DESKTOP) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const ok = await injectAuthForPage(page, role);
  return { context, page, ok };
}

test.describe('JEE Paper 2B (B.Planning): API guards', () => {
  test('creating a paper with an unknown exam is a 400', async ({ request }) => {
    const token = (await getTestAuthToken(request, 'teacher'))?.testToken;
    test.skip(!token, 'No teacher token in this environment');
    const res = await request.post(`${NEXUS}/api/question-bank/papers`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { exam_type: 'JEE_PAPER_9', year: 2021, session: 'Session 1', parsed_questions: [{}] },
    });
    expect(res.status()).toBe(400);
  });

  test('copy from 2A refuses a paper that is not 2B', async ({ request }) => {
    const token = (await getTestAuthToken(request, 'teacher'))?.testToken;
    test.skip(!token, 'No teacher token in this environment');
    const list = await request.get(`${NEXUS}/api/question-bank/papers?exam_type=JEE_PAPER_2`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const papers = ((await list.json().catch(() => ({})))?.data ?? []) as Array<{ id: string }>;
    test.skip(papers.length === 0, 'No JEE Paper 2 papers in this environment');
    const res = await request.post(`${NEXUS}/api/question-bank/papers/${papers[0].id}/copy-from-2a`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status()).toBe(400);
  });

  test('move to 2B refuses an empty selection', async ({ request }) => {
    const token = (await getTestAuthToken(request, 'teacher'))?.testToken;
    test.skip(!token, 'No teacher token in this environment');
    const res = await request.post(`${NEXUS}/api/question-bank/papers/00000000-0000-0000-0000-000000000000/move-to-2b`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { question_ids: [] },
    });
    expect(res.status()).toBe(400);
  });

  test('a student cannot copy or move', async ({ request }) => {
    const token = (await getTestAuthToken(request, 'student'))?.testToken;
    test.skip(!token, 'No student token in this environment');
    const id = '00000000-0000-0000-0000-000000000000';
    for (const path of ['copy-from-2a', 'move-to-2b']) {
      const res = await request.post(`${NEXUS}/api/question-bank/papers/${id}/${path}`, {
        headers: { Authorization: `Bearer ${token}` },
        data: { question_ids: ['x'] },
      });
      expect(res.status(), path).toBe(403);
    }
  });

  test('without a token the routes answer 401', async ({ request }) => {
    const res = await request.post(`${NEXUS}/api/question-bank/papers/x/copy-from-2a`);
    expect(res.status()).toBe(401);
  });

  test('weightage accepts the new exam', async ({ request }) => {
    const token = (await getTestAuthToken(request, 'teacher'))?.testToken;
    test.skip(!token, 'No teacher token in this environment');
    const res = await request.get(`${NEXUS}/api/question-bank/weightage?exam=JEE_PAPER_2B`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status()).toBe(200);
  });
});

test.describe('JEE Paper 2B (B.Planning): teacher screens', () => {
  test('the exam has its own page in the sidebar', async ({ browser }) => {
    const { context, page, ok } = await signedInPage(browser, 'teacher');
    test.skip(!ok, 'Could not sign in as a teacher');
    await page.goto(`${NEXUS}/teacher/question-bank/jee-paper-2b`);
    await expect(page.getByRole('link', { name: /JEE Paper 2B \(B\.Planning\)/ }).first()).toBeVisible({
      timeout: 60_000,
    });
    await expect(page).toHaveURL(/\/question-bank\/jee-paper-2b/);
    await context.close();
  });

  test('bulk upload offers 2B with the copy switch on', async ({ browser }) => {
    const { context, page, ok } = await signedInPage(browser, 'teacher');
    test.skip(!ok, 'Could not sign in as a teacher');
    await page.goto(`${NEXUS}/teacher/question-bank/bulk-upload?exam=JEE_PAPER_2B`);
    const toggle = page.getByRole('checkbox', { name: /copy Maths and Aptitude from JEE Paper 2/i });
    await expect(toggle).toBeVisible({ timeout: 60_000 });
    await expect(toggle).toBeChecked();
    await context.close();
  });

  test('mobile: the 2B exam page fits a phone', async ({ browser }) => {
    const { context, page, ok } = await signedInPage(browser, 'teacher', PHONE);
    test.skip(!ok, 'Could not sign in as a teacher');
    await page.goto(`${NEXUS}/teacher/question-bank/jee-paper-2b`);
    await page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {});
    await assertNoHorizontalOverflow(page);
    await context.close();
  });

  test('mobile: the bulk upload copy switch is a full-size target', async ({ browser }) => {
    const { context, page, ok } = await signedInPage(browser, 'teacher', PHONE);
    test.skip(!ok, 'Could not sign in as a teacher');
    await page.goto(`${NEXUS}/teacher/question-bank/bulk-upload?exam=JEE_PAPER_2B`);
    const label = page.getByText('Also copy Maths and Aptitude from JEE Paper 2');
    await expect(label).toBeVisible({ timeout: 60_000 });
    await assertNoHorizontalOverflow(page);
    await assertTouchTargetSize(page, 'label:has-text("Also copy Maths and Aptitude")', 44);
    await context.close();
  });
});
