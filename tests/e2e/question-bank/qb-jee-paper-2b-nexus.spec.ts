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
 * - B.Arch reads "JEE Paper 2A (B.Arch)", next to "JEE Paper 2B (B.Planning)".
 * - The 2B header counts 2B's own papers, not every JEE question.
 * - "Move to another question bank" is staff only and refuses bad input, and
 *   the exam page opens its "Move questions here" dialog on a phone.
 * - A whole paper moves to another question bank from Edit paper details:
 *   the route refuses an unknown exam or section before writing, and the
 *   dialog previews the new name and fits a phone. Nothing is saved.
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

/** Any paper, for the read-only checks that need a real id. */
async function anyPaperId(request: import('@playwright/test').APIRequestContext, token: string): Promise<string | null> {
  const res = await request.get(`${NEXUS}/api/question-bank/papers`, { headers: { Authorization: `Bearer ${token}` } });
  const papers = ((await res.json().catch(() => ({})))?.data ?? []) as Array<{ id: string }>;
  return papers[0]?.id ?? null;
}

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

  test('moving to another question bank refuses an empty selection or a missing target', async ({ request }) => {
    const token = (await getTestAuthToken(request, 'teacher'))?.testToken;
    test.skip(!token, 'No teacher token in this environment');
    const url = `${NEXUS}/api/question-bank/papers/00000000-0000-0000-0000-000000000000/move-questions`;
    const headers = { Authorization: `Bearer ${token}` };
    const empty = await request.post(url, { headers, data: { question_ids: [], target_exam_type: 'JEE_PAPER_2B' } });
    expect(empty.status()).toBe(400);
    const noTarget = await request.post(url, { headers, data: { question_ids: ['x'] } });
    expect(noTarget.status()).toBe(400);
    const badSection = await request.post(url, {
      headers,
      data: { question_ids: ['x'], target_exam_type: 'JEE_PAPER_2B', section: 'cooking' },
    });
    expect(badSection.status()).toBe(400);
    const missingPaper = await request.post(url, {
      headers,
      data: { question_ids: ['x'], target_exam_type: 'JEE_PAPER_2B', section: 'planning' },
    });
    expect(missingPaper.status()).toBe(404);
  });

  test('the 2B header counts its own papers, not every JEE question', async ({ request }) => {
    const token = (await getTestAuthToken(request, 'teacher'))?.testToken;
    test.skip(!token, 'No teacher token in this environment');
    const headers = { Authorization: `Bearer ${token}` };
    const total = async (query: string) =>
      ((await (await request.get(`${NEXUS}/api/question-bank/stats?${query}`, { headers })).json())?.data
        ?.total_questions ?? -1) as number;
    const papers = ((await (await request.get(`${NEXUS}/api/question-bank/papers`, { headers })).json())?.data ??
      []) as Array<{ exam_type: string }>;
    const twoB = await total('exam_type=JEE_PAPER_2B');
    const allJee = await total('exam_relevance=JEE');
    expect(twoB).toBeGreaterThanOrEqual(0);
    expect(twoB).toBeLessThanOrEqual(allJee);
    if (!papers.some((p) => p.exam_type === 'JEE_PAPER_2B')) expect(twoB).toBe(0);
  });

  test('a student cannot copy or move', async ({ request }) => {
    const token = (await getTestAuthToken(request, 'student'))?.testToken;
    test.skip(!token, 'No student token in this environment');
    const id = '00000000-0000-0000-0000-000000000000';
    for (const path of ['copy-from-2a', 'move-to-2b', 'move-questions']) {
      const res = await request.post(`${NEXUS}/api/question-bank/papers/${id}/${path}`, {
        headers: { Authorization: `Bearer ${token}` },
        data: { question_ids: ['x'] },
      });
      expect(res.status(), path).toBe(403);
    }
  });

  test('without a token the routes answer 401', async ({ request }) => {
    for (const path of ['copy-from-2a', 'move-questions']) {
      const res = await request.post(`${NEXUS}/api/question-bank/papers/x/${path}`);
      expect(res.status(), path).toBe(401);
    }
  });

  test('moving a whole paper refuses an unknown exam or section, before writing', async ({ request }) => {
    const token = (await getTestAuthToken(request, 'teacher'))?.testToken;
    test.skip(!token, 'No teacher token in this environment');
    const id = await anyPaperId(request, token!);
    test.skip(!id, 'No papers in this environment');
    const headers = { Authorization: `Bearer ${token}` };
    const badExam = await request.patch(`${NEXUS}/api/question-bank/papers/${id}`, {
      headers,
      data: { exam_type: 'JEE_PAPER_9' },
    });
    expect(badExam.status()).toBe(400);
    const paper = ((await (await request.get(`${NEXUS}/api/question-bank/papers/${id}`, { headers })).json())?.data
      ?.paper ?? {}) as { exam_type?: string };
    const other = paper.exam_type === 'NATA' ? 'JEE_PAPER_2' : 'NATA';
    const badSection = await request.patch(`${NEXUS}/api/question-bank/papers/${id}`, {
      headers,
      data: { exam_type: other, section_map: { drawing: 'sketching' } },
    });
    expect(badSection.status()).toBe(400);
    // Still where it was.
    const after = ((await (await request.get(`${NEXUS}/api/question-bank/papers/${id}`, { headers })).json())?.data
      ?.paper ?? {}) as { exam_type?: string };
    expect(after.exam_type).toBe(paper.exam_type);
  });

  test('a student cannot move a paper, and no token is a 401', async ({ request }) => {
    const anon = await request.patch(`${NEXUS}/api/question-bank/papers/x`, { data: { exam_type: 'NATA' } });
    expect(anon.status()).toBe(401);
    const token = (await getTestAuthToken(request, 'student'))?.testToken;
    test.skip(!token, 'No student token in this environment');
    const res = await request.patch(`${NEXUS}/api/question-bank/papers/00000000-0000-0000-0000-000000000000`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { exam_type: 'NATA' },
    });
    expect(res.status()).toBe(403);
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
    // B.Arch reads like its B.Planning sibling.
    await expect(page.getByRole('link', { name: /JEE Paper 2A \(B\.Arch\)/ }).first()).toBeVisible();
    await context.close();
  });

  test('"Move questions here" opens on picking the wrongly filed paper', async ({ browser }) => {
    const { context, page, ok } = await signedInPage(browser, 'teacher');
    test.skip(!ok, 'Could not sign in as a teacher');
    await page.goto(`${NEXUS}/teacher/question-bank/jee-paper-2b`);
    await page.getByRole('button', { name: 'Move questions here' }).first().click({ timeout: 60_000 });
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Step 1 of 2')).toBeVisible();
    await expect(dialog.getByRole('heading', { name: /Move questions into JEE Paper 2B \(B\.Planning\)/ })).toBeVisible();
    await expect(dialog.getByLabel('Wrongly filed in')).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Next' })).toBeDisabled();
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

  test('mobile: the move dialog is full screen with full-size controls', async ({ browser }) => {
    const { context, page, ok } = await signedInPage(browser, 'teacher', PHONE);
    test.skip(!ok, 'Could not sign in as a teacher');
    await page.goto(`${NEXUS}/teacher/question-bank/jee-paper-2b`);
    const open = page.getByRole('button', { name: 'Move questions here' }).first();
    await expect(open).toBeVisible({ timeout: 60_000 });
    await assertTouchTargetSize(page, 'button:has-text("Move questions here")', 44);
    await open.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Step 1 of 2')).toBeVisible();
    const box = await dialog.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(PHONE.width - 1);
    await assertNoHorizontalOverflow(page);
    await assertTouchTargetSize(page, '[role="dialog"] button', 44);
    await context.close();
  });

  test('a whole paper can be moved from its More menu, previewing the new name', async ({ browser, request }) => {
    const token = (await getTestAuthToken(request, 'teacher'))?.testToken;
    test.skip(!token, 'No teacher token in this environment');
    const id = await anyPaperId(request, token!);
    test.skip(!id, 'No papers in this environment');
    for (const viewport of [DESKTOP, PHONE]) {
      const { context, page, ok } = await signedInPage(browser, 'teacher', viewport);
      test.skip(!ok, 'Could not sign in as a teacher');
      await page.goto(`${NEXUS}/teacher/question-bank/papers/${id}`);
      await page.getByRole('button', { name: 'More paper actions' }).click({ timeout: 90_000 });
      await page.getByRole('menuitem', { name: /Move paper to another question bank/ }).click();
      const dialog = page.getByRole('dialog');
      await expect(dialog.getByText('Question bank', { exact: true })).toBeVisible();
      const current = (await dialog.getByTestId('paper-details-preview').textContent()) ?? '';
      const target = current.startsWith('NATA') ? /JEE Paper 2B \(B\.Planning\)/ : /^NATA/;
      await dialog.getByRole('radio', { name: target }).check();
      await expect(dialog.getByText('Moves to')).toBeVisible();
      await expect(dialog.getByRole('button', { name: 'Move paper' })).toBeVisible();
      if (viewport === PHONE) {
        expect((await dialog.boundingBox())?.width ?? 0).toBeGreaterThanOrEqual(PHONE.width - 1);
        await assertNoHorizontalOverflow(page);
        await assertTouchTargetSize(page, '[role="dialog"] label:has(input[type="radio"])', 44);
        await assertTouchTargetSize(page, '[role="dialog"] .MuiDialogActions-root button', 44);
      }
      await dialog.getByRole('button', { name: 'Cancel' }).click();
      await expect(dialog).toBeHidden();
      await context.close();
    }
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
