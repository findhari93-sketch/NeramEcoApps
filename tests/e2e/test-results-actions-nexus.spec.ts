import { test, expect } from '@playwright/test';

/**
 * Acting on a test's results, end to end (API level).
 *
 * The loop this walks is the one the feature was built for: a student sits a
 * paper and gets a question wrong because the stored answer key is wrong, the
 * teacher corrects the key from the results screen, re-grades the attempt that
 * was marked against the old one, then reopens the run and writes to them.
 *
 * API level rather than through the browser, matching tests-hub-nexus.spec.ts:
 * this tenant enforces MFA on every Entra account, so Playwright cannot complete
 * a real Microsoft login. /api/auth/test-login mints the `test_` token instead.
 *
 * That token is deliberately NOT a Microsoft token, so canPostToGraph refuses it
 * and both Teams tiers are skipped. That is the point of the last test here: the
 * message route must still reach the durable in-app bell and must report per
 * channel honestly rather than claiming a send that never happened.
 */

let teacherToken: string;
let studentToken: string;
let classroomId: string;
let studentId: string;
let bankQuestionIds: string[] = [];
let testId: string;
let placementId: string;
let attemptQuestionId: string;
let originalAnswer: string | null = null;
let flippedAnswer: string | null = null;

test.describe('Nexus test results: fix, re-grade, reopen, message', () => {
  test.describe.configure({ mode: 'serial' });
  test.use({ baseURL: 'http://localhost:3012' });

  test('setup: teacher and student in one classroom', async ({ request }) => {
    const t = await request.post('/api/auth/test-login', {
      data: { email: 'e2e-results-teacher@neramclasses.com', role: 'teacher' },
    });
    expect(t.status()).toBe(200);
    const tb = await t.json();
    teacherToken = tb.testToken;
    const teacherClassrooms: Array<{ id: string }> = tb.classrooms || [];
    expect(teacherClassrooms.length).toBeGreaterThan(0);

    const s = await request.post('/api/auth/test-login', {
      data: { email: 'e2e-results-student@neramclasses.com', role: 'student' },
    });
    expect(s.status()).toBe(200);
    const sb = await s.json();
    studentToken = sb.testToken;
    studentId = sb.user?.id || sb.userId;
    expect(studentId, 'the test login must name the student').toBeTruthy();

    const studentClassroomIds = new Set((sb.classrooms || []).map((c: any) => c.id));
    const shared = teacherClassrooms.find((c) => studentClassroomIds.has(c.id));
    expect(shared, 'teacher and student must share a classroom').toBeTruthy();
    classroomId = shared!.id;
  });

  test('setup: compose a paper and place it on the classroom', async ({ request }) => {
    const q = await request.get(
      '/api/question-bank/questions?page=1&page_size=2&question_status=active',
      { headers: { Authorization: `Bearer ${teacherToken}` } },
    );
    expect(q.status()).toBe(200);
    bankQuestionIds = ((await q.json()).data?.questions || []).map((x: any) => x.id);
    expect(bankQuestionIds.length).toBe(2);

    const composed = await request.post('/api/question-bank/tests', {
      headers: { Authorization: `Bearer ${teacherToken}` },
      data: {
        title: 'E2E Results Actions Paper',
        question_ids: bankQuestionIds,
        timer_type: 'none',
        passing_marks: 1,
        is_published: true,
      },
    });
    expect(composed.status()).toBe(201);
    testId = (await composed.json()).data.id;

    const placed = await request.post(`/api/question-bank/tests/${testId}/placements`, {
      headers: { Authorization: `Bearer ${teacherToken}` },
      data: {
        context_type: 'classroom_assignment',
        context_id: classroomId,
        passing_pct: 100,
        available_until: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      },
    });
    expect(placed.status()).toBe(201);
    placementId = (await placed.json()).data.id;
  });

  test('setup: the student sits it and answers the FIRST question wrongly', async ({ request }) => {
    const detail = await request.get(`/api/question-bank/tests/${testId}`, {
      headers: { Authorization: `Bearer ${teacherToken}` },
    });
    expect(detail.status()).toBe(200);
    const questions = (await detail.json()).data.questions;
    attemptQuestionId = questions[0].question_id;
    originalAnswer = questions[0].correct_answer ?? null;
    expect(originalAnswer, 'the seeded question needs an answer key').toBeTruthy();

    // Pick a different option, which is what "0 of 9 got it right" looks like
    // when the stored key disagrees with what was taught.
    const options: Array<{ id: string }> = questions[0].options || [];
    flippedAnswer = options.map((o) => o.id).find((id) => id !== originalAnswer) || null;
    expect(flippedAnswer, 'the question needs at least two options').toBeTruthy();

    const start = await request.post('/api/tests/attempt', {
      headers: { Authorization: `Bearer ${studentToken}` },
      data: { test_id: testId, placement_id: placementId },
    });
    expect([200, 201]).toContain(start.status());

    const submit = await request.post('/api/tests/attempt', {
      headers: { Authorization: `Bearer ${studentToken}` },
      data: {
        test_id: testId,
        placement_id: placementId,
        submit: true,
        answers: { [attemptQuestionId]: flippedAnswer },
      },
    });
    expect([200, 201]).toContain(submit.status());
  });

  test('the results route reports the question nobody got right', async ({ request }) => {
    const res = await request.get(
      `/api/question-bank/tests/${testId}/results?placement_id=${placementId}`,
      { headers: { Authorization: `Bearer ${teacherToken}` } },
    );
    expect(res.status()).toBe(200);
    const body = await res.json();

    const row = body.data.questions.find((q: any) => q.question_id === attemptQuestionId);
    expect(row, 'the sat question must appear in the analysis').toBeTruthy();
    expect(row.correct).toBe(0);
    // The misconception the teacher acts on: everybody picked the same wrong one.
    expect(row.top_wrong_option?.key).toBe(flippedAnswer);
    // The per-option bars on the Questions tab read this.
    expect(row.option_counts?.[flippedAnswer!]).toBe(1);
    // Nobody has checked it with an AI yet.
    expect(row.ai ?? null).toBeNull();
  });

  test('an AI check that changes nothing is still remembered on the question', async ({ request }) => {
    // "Checked, nothing wrong" is what stops a question being sent to an AI
    // again next week, so it must land without a single field changing.
    const res = await request.post(`/api/question-bank/tests/${testId}/question-fixes`, {
      headers: { Authorization: `Bearer ${teacherToken}` },
      data: {
        placement_id: placementId,
        reviews: [{ question_id: attemptQuestionId, verdict: 'hard_but_fair', note: 'Sound question.' }],
        fixes: [],
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.checked).toBe(1);
    expect(body.data.applied).toHaveLength(0);

    const results = await request.get(
      `/api/question-bank/tests/${testId}/results?placement_id=${placementId}`,
      { headers: { Authorization: `Bearer ${teacherToken}` } },
    );
    const row = (await results.json()).data.questions.find((q: any) => q.question_id === attemptQuestionId);
    expect(row.ai?.checks).toBeGreaterThanOrEqual(1);
    expect(row.ai?.last_verdict).toBe('hard_but_fair');
    expect(row.ai?.fixed ?? null).toBeNull();
  });

  test('a non-staff caller cannot fix a question', async ({ request }) => {
    const res = await request.post(`/api/question-bank/tests/${testId}/question-fixes`, {
      headers: { Authorization: `Bearer ${studentToken}` },
      data: { fixes: [{ question_id: attemptQuestionId, fields: { correct_answer: 'a' } }] },
    });
    expect([401, 403]).toContain(res.status());
  });

  test('a question that is not on this test is refused', async ({ request }) => {
    const res = await request.post(`/api/question-bank/tests/${testId}/question-fixes`, {
      headers: { Authorization: `Bearer ${teacherToken}` },
      data: {
        fixes: [
          { question_id: '00000000-0000-0000-0000-000000000000', fields: { correct_answer: 'a' } },
        ],
      },
    });
    expect(res.status()).toBe(400);
  });

  test('the teacher corrects the answer key, and is told what went stale', async ({ request }) => {
    const res = await request.post(`/api/question-bank/tests/${testId}/question-fixes`, {
      headers: { Authorization: `Bearer ${teacherToken}` },
      data: {
        placement_id: placementId,
        reviews: [{ question_id: attemptQuestionId, verdict: 'wrong_key', note: 'The key names the wrong option.' }],
        fixes: [
          {
            question_id: attemptQuestionId,
            fields: { correct_answer: flippedAnswer },
            source: 'ai_review',
          },
        ],
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();

    expect(body.data.applied).toHaveLength(1);
    expect(body.data.applied[0].fields).toContain('correct_answer');
    expect(body.data.answer_key_changed).toContain(attemptQuestionId);
    expect(body.data.fixed_question_ids).toContain(attemptQuestionId);
    // The number that turns "saved" into "saved, and somebody was graded on the
    // old key". Without it the re-grade is never offered.
    expect(body.data.stale_attempts).toBeGreaterThan(0);

    // The question now says what the AI fixed, and what the rate was before.
    const results = await request.get(
      `/api/question-bank/tests/${testId}/results?placement_id=${placementId}`,
      { headers: { Authorization: `Bearer ${teacherToken}` } },
    );
    const row = (await results.json()).data.questions.find((q: any) => q.question_id === attemptQuestionId);
    expect(row.ai?.checks).toBeGreaterThanOrEqual(2);
    expect(row.ai?.fixed?.fields).toContain('correct_answer');
    expect(row.ai?.fixed?.pct_before).toBe(0);
  });

  test('a dry-run re-grade reports the move and writes nothing', async ({ request }) => {
    const preview = await request.post(`/api/question-bank/tests/${testId}/regrade`, {
      headers: { Authorization: `Bearer ${teacherToken}` },
      data: { placement_id: placementId, dry_run: true },
    });
    expect(preview.status()).toBe(200);
    const body = await preview.json();

    expect(body.data.dry_run).toBe(true);
    expect(body.data.summary.changed).toBeGreaterThan(0);
    expect(body.data.summary.moved_up).toBeGreaterThan(0);

    // Nothing was written, so the results route still reports the old score.
    const results = await request.get(
      `/api/question-bank/tests/${testId}/results?placement_id=${placementId}`,
      { headers: { Authorization: `Bearer ${teacherToken}` } },
    );
    const row = (await results.json()).data.rows.find((r: any) => r.student_id === studentId);
    expect(row.best_percentage).toBeLessThan(100);
  });

  test('applying the re-grade moves the recorded score', async ({ request }) => {
    const applied = await request.post(`/api/question-bank/tests/${testId}/regrade`, {
      headers: { Authorization: `Bearer ${teacherToken}` },
      data: { placement_id: placementId, dry_run: false },
    });
    expect(applied.status()).toBe(200);
    expect((await applied.json()).data.dry_run).toBe(false);

    const results = await request.get(
      `/api/question-bank/tests/${testId}/results?placement_id=${placementId}`,
      { headers: { Authorization: `Bearer ${teacherToken}` } },
    );
    const row = (await results.json()).data.rows.find((r: any) => r.student_id === studentId);
    expect(row.best_percentage).toBeGreaterThan(0);
  });

  test('a re-grade that changes nothing is idempotent', async ({ request }) => {
    const again = await request.post(`/api/question-bank/tests/${testId}/regrade`, {
      headers: { Authorization: `Bearer ${teacherToken}` },
      data: { placement_id: placementId, dry_run: false },
    });
    expect(again.status()).toBe(200);
    expect((await again.json()).data.summary.changed).toBe(0);
  });

  test('a re-grade cannot reach a run on another paper', async ({ request }) => {
    const res = await request.post(`/api/question-bank/tests/${testId}/regrade`, {
      headers: { Authorization: `Bearer ${teacherToken}` },
      data: { placement_id: '00000000-0000-0000-0000-000000000000', dry_run: true },
    });
    expect(res.status()).toBe(404);
  });

  test('bulk reopen writes a live window for the selected student', async ({ request }) => {
    const res = await request.post(`/api/tests/runs/${placementId}/access/bulk`, {
      headers: { Authorization: `Bearer ${teacherToken}` },
      data: { student_ids: [studentId], action: 'open' },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.counts.ok).toBe(1);
    expect(body.data.counts.off_roster).toBe(0);

    const results = await request.get(
      `/api/question-bank/tests/${testId}/results?placement_id=${placementId}`,
      { headers: { Authorization: `Bearer ${teacherToken}` } },
    );
    const row = (await results.json()).data.rows.find((r: any) => r.student_id === studentId);
    expect(row.window_open_until, 'the grant must be visible on the roster').toBeTruthy();
  });

  test('bulk reopen narrows to the roster, it never widens', async ({ request }) => {
    // A staff-only route is still not a reason to trust an id.
    const res = await request.post(`/api/tests/runs/${placementId}/access/bulk`, {
      headers: { Authorization: `Bearer ${teacherToken}` },
      data: { student_ids: ['00000000-0000-0000-0000-000000000000'], action: 'open' },
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toMatch(/none of those students/i);
  });

  test('a student cannot reopen a run for anybody', async ({ request }) => {
    const res = await request.post(`/api/tests/runs/${placementId}/access/bulk`, {
      headers: { Authorization: `Bearer ${studentToken}` },
      data: { student_ids: [studentId], action: 'open' },
    });
    expect([401, 403]).toContain(res.status());
  });

  test('the message lands on the Nexus bell and reports per channel honestly', async ({
    request,
  }) => {
    const res = await request.post(`/api/tests/runs/${placementId}/message`, {
      headers: { Authorization: `Bearer ${teacherToken}` },
      data: {
        student_ids: [studentId],
        template: 'regraded',
        subject: 'Your score changed',
        body: 'Hi {name}, your score on {test} is now {score}.',
        channels: { chat: true, activity: true, group: true },
        also_reopen: false,
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();

    // The durable record always lands, whatever Graph did.
    expect(body.data.counts.inapp).toBe(1);
    // A `test_` token is not a Microsoft token, so the two delegated tiers are
    // skipped, and the route says so instead of reporting a silent success.
    expect(body.data.graph_skipped).toBe(true);
    expect(body.data.counts.chat).toBe(0);
    expect(body.data.off_roster).toBe(0);
  });

  test('a message needs both a subject and a body', async ({ request }) => {
    const res = await request.post(`/api/tests/runs/${placementId}/message`, {
      headers: { Authorization: `Bearer ${teacherToken}` },
      data: {
        student_ids: [studentId],
        template: 'custom',
        subject: '',
        body: '',
        channels: { chat: false, activity: false, group: false },
      },
    });
    expect(res.status()).toBe(400);
  });

  test('a student cannot message the class', async ({ request }) => {
    const res = await request.post(`/api/tests/runs/${placementId}/message`, {
      headers: { Authorization: `Bearer ${studentToken}` },
      data: {
        student_ids: [studentId],
        template: 'redo',
        subject: 'x',
        body: 'x',
        channels: { chat: false, activity: false, group: false },
      },
    });
    expect([401, 403]).toContain(res.status());
  });

  test('cleanup: remove the paper this spec created', async ({ request }) => {
    const res = await request.delete(`/api/question-bank/tests/${testId}`, {
      headers: { Authorization: `Bearer ${teacherToken}` },
    });
    expect([200, 204]).toContain(res.status());
  });
});
