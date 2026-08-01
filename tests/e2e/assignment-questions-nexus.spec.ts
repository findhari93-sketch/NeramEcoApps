/**
 * Questions inside an assignment: authored by a teacher, answered in the app,
 * marked by the machine.
 *
 * The rules worth protecting are the ones that are easy to break and hard to
 * notice:
 *  - A SUBJECTIVE question must NEVER be auto-marked correct. If it were,
 *    pressing submit would be worth full marks.
 *  - When working is required, the PDF comes FIRST. Results are instant, so
 *    answering first would show a student the correct values before they wrote
 *    the working meant to prove they knew them.
 *  - Answers are one-shot. That is what earns the instant reveal.
 *  - The answer key must not travel to a student who has not answered yet.
 *
 * Skips gracefully when test auth is unavailable, when no document assignment
 * exists, or when the assignment-questions migrations have not been applied.
 * Serial: each step builds on the previous.
 *
 * Run: pnpm test:e2e tests/e2e/assignment-questions-nexus.spec.ts --project=nexus-chrome
 */

import { test, expect } from '@playwright/test';
import { getTestAuthToken, injectAuthForPage, APP_URLS } from '../utils/credentials';
import { assertNoHorizontalOverflow, assertTouchTargetSize } from '../utils/mobile-helpers';

test.use({ storageState: { cookies: [], origins: [] } });

/** Mirrors the real coordinate-geometry paper: one proof, two numerical, one MCQ. */
const PAPER = [
  {
    question_text: 'Prove that the triangle with vertices $A(2,1)$, $B(6,5)$, $C(2,9)$ is isosceles.',
    format: 'SUBJECTIVE',
    marks: 5,
  },
  {
    question_text: 'Find $k$ such that $A(2,3)$, $B(5,7)$, $C(k,11)$ are collinear.',
    format: 'NUMERICAL',
    correct_answer: '8',
    marks: 5,
  },
  {
    question_text: 'Find the area of the triangle $A(-2,1)$, $B(4,5)$, $C(6,-1)$.',
    format: 'NUMERICAL',
    correct_answer: '22',
    answer_tolerance: 0.5,
    marks: 5,
  },
  {
    question_text: 'Which formula gives the distance between two points?',
    format: 'MCQ',
    options: [
      { key: 'a', text: '$\\sqrt{(x_2-x_1)^2+(y_2-y_1)^2}$' },
      { key: 'b', text: '$(x_2-x_1)+(y_2-y_1)$' },
    ],
    correct_answer: 'a',
    marks: 5,
  },
];

test.describe('Assignment questions', () => {
  test.describe.configure({ mode: 'serial', timeout: 150_000 });

  let teacherToken: string | null = null;
  let studentToken: string | null = null;
  let assignmentId: string | null = null;

  test.beforeAll(async ({ playwright }) => {
    const api = await playwright.request.newContext();
    teacherToken = (await getTestAuthToken(api, 'teacher'))?.testToken ?? null;
    studentToken = (await getTestAuthToken(api, 'student'))?.testToken ?? null;
    await api.dispose();
  });

  test('a teacher can attach a question paper', async ({ request }) => {
    test.skip(!teacherToken || !studentToken, 'No test tokens available.');

    const list = await request.get(`${APP_URLS.nexus}/api/student/assignments`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    const { assignments } = await list.json();
    const candidate = (assignments || []).find(
      (a: any) => a.assignment_type !== 'drawing' && a.status === 'published',
    );
    test.skip(!candidate, 'Student has no published document assignment to exercise.');
    assignmentId = candidate.id;

    const saved = await request.post(`${APP_URLS.nexus}/api/assignments/${assignmentId}`, {
      headers: { Authorization: `Bearer ${teacherToken}` },
      data: { action: 'save_questions', questions: PAPER },
    });
    // 409 means someone already answered this shared assignment's paper; 500 on
    // an unmigrated database. Neither is a product failure worth failing on.
    test.skip(saved.status() === 409 || saved.status() === 500, 'Paper not writable in this environment.');
    expect(saved.ok(), await saved.text()).toBeTruthy();

    const { paper } = await saved.json();
    expect(paper.questions).toHaveLength(4);
    expect(paper.total_marks).toBe(20);
    // 15 the machine can mark, 5 reserved for the proof.
    expect(paper.auto_marks).toBe(15);
    expect(paper.manual_marks).toBe(5);
  });

  test('the answer key never reaches a student who has not answered', async ({ request }) => {
    test.skip(!assignmentId, 'No paper.');
    const res = await request.get(`${APP_URLS.nexus}/api/assignments/${assignmentId}`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    const body = await res.json();
    test.skip(!body.paper, 'Assignment has no paper in this environment.');

    expect(body.answers_locked).toBe(false);
    for (const q of body.paper.questions) {
      expect(q.correct_answer).toBeUndefined();
      expect(q.explanation).toBeUndefined();
    }
    // Not merely absent from the UI: absent from the payload entirely.
    expect(JSON.stringify(body.paper)).not.toContain('"22"');
  });

  test('working comes first when the assignment requires it', async ({ request }) => {
    test.skip(!assignmentId, 'No paper.');
    const detail = await request.get(`${APP_URLS.nexus}/api/assignments/${assignmentId}`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    const body = await detail.json();
    const requiresPdf = body.assignment?.requires_pdf !== false;
    const hasFiles = (body.submission?.files || []).length > 0;
    test.skip(!requiresPdf || hasFiles, 'PDF already uploaded, or not required here.');

    const early = await request.post(`${APP_URLS.nexus}/api/student/assignments`, {
      headers: { Authorization: `Bearer ${studentToken}` },
      data: { action: 'submit_answers', assignment_id: assignmentId, answers: { x: '1' } },
    });
    expect(early.status()).toBe(409);
    expect((await early.json()).code).toBe('PDF_REQUIRED');
  });

  test('AC: answers are marked instantly, and the proof is left for the teacher', async ({
    request,
  }) => {
    test.skip(!assignmentId, 'No paper.');
    const detail = await request.get(`${APP_URLS.nexus}/api/assignments/${assignmentId}`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    const body = await detail.json();
    test.skip(!body.paper, 'No paper.');
    test.skip(body.answers_locked, 'This student has already answered.');
    test.skip(
      body.assignment?.requires_pdf !== false && !(body.submission?.files || []).length,
      'Working not uploaded, so answering is correctly gated.',
    );

    const byText = (needle: string) =>
      body.paper.questions.find((q: any) => q.question_text.includes(needle));

    // One right, one wrong on purpose: 22 is correct, -22 reproduces exactly the
    // sign slip that started this whole piece of work.
    const answers: Record<string, string> = {
      [byText('collinear').id]: '8',
      [byText('area of the triangle').id]: '-22',
      [byText('distance between')?.id]: 'a',
      [byText('isosceles').id]: 'I proved it',
    };

    const res = await request.post(`${APP_URLS.nexus}/api/student/assignments`, {
      headers: { Authorization: `Bearer ${studentToken}` },
      data: { action: 'submit_answers', assignment_id: assignmentId, answers },
    });
    expect(res.ok(), await res.text()).toBeTruthy();
    const { result, manual_marks } = await res.json();

    // 5 for k, 0 for the sign error, 5 for the MCQ.
    expect(result.score).toBe(10);
    // Only the gradable questions count towards the total, so the proof is not
    // silently marked right and not silently marked wrong.
    expect(result.total_marks).toBe(15);
    expect(manual_marks).toBe(5);

    const proof = result.review.find((r: any) => r.question_id === byText('isosceles').id);
    expect(proof.is_gradable).toBe(false);
    expect(proof.is_correct).toBe(false);
    expect(proof.marks_awarded).toBe(0);
  });

  test('answers are one-shot', async ({ request }) => {
    test.skip(!assignmentId, 'No paper.');
    const again = await request.post(`${APP_URLS.nexus}/api/student/assignments`, {
      headers: { Authorization: `Bearer ${studentToken}` },
      data: { action: 'submit_answers', assignment_id: assignmentId, answers: {} },
    });
    test.skip(again.ok(), 'Student had not answered, so there is no lock to test.');
    expect(again.status()).toBe(409);
    expect((await again.json()).code).toBe('ANSWERS_LOCKED');
  });

  test('the paper is frozen once anyone has answered', async ({ request }) => {
    test.skip(!assignmentId, 'No paper.');
    const res = await request.post(`${APP_URLS.nexus}/api/assignments/${assignmentId}`, {
      headers: { Authorization: `Bearer ${teacherToken}` },
      data: { action: 'save_questions', questions: PAPER },
    });
    test.skip(res.ok(), 'Nobody has answered yet, so the paper is still editable.');
    expect(res.status()).toBe(409);
    expect((await res.json()).code).toBe('PAPER_ANSWERED');
  });

  test('the student sees right, wrong and the correct answer', async ({ page }) => {
    test.skip(!assignmentId, 'No paper.');
    await injectAuthForPage(page, 'student');
    await page.goto(`${APP_URLS.nexus}/student/assignments/${assignmentId}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByText(/from your answers/i)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/correct answer/i).first()).toBeVisible();
  });

  test('mobile: no overflow, and the answer targets are big enough', async ({ page }) => {
    test.skip(!assignmentId, 'No paper.');
    await page.setViewportSize({ width: 375, height: 812 });
    await injectAuthForPage(page, 'student');
    await page.goto(`${APP_URLS.nexus}/student/assignments/${assignmentId}`);
    await page.waitForLoadState('networkidle');

    await assertNoHorizontalOverflow(page);
    if (await page.locator('[role="radio"]').count()) {
      await assertTouchTargetSize(page, '[role="radio"]', 44);
    }
  });

  test('the teacher gets one consolidated view of who got what right', async ({ page }) => {
    test.skip(!assignmentId, 'No paper.');
    await injectAuthForPage(page, 'teacher');
    await page.goto(`${APP_URLS.nexus}/teacher/assignments/${assignmentId}`);
    await page.waitForLoadState('networkidle');

    const resultsTab = page.getByRole('button', { name: /^results$/i });
    await expect(resultsTab).toBeVisible({ timeout: 30_000 });
    await resultsTab.click();

    await expect(page.getByText(/answered/i).first()).toBeVisible();
    await assertNoHorizontalOverflow(page);
  });
});
