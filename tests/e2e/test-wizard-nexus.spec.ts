import { test, expect } from '@playwright/test';

/**
 * The one test wizard, API level.
 *
 * Mirrors tests-hub-nexus.spec.ts in style. The three things worth proving here
 * are the three that were previously impossible to get wrong quietly:
 *
 *   1. Publish is ONE call. The old flow created a test and then placed it, and
 *      a failure between the two left a test the teacher believed was assigned.
 *   2. A refused placement is REPORTED, not fatal. A chapter that already holds
 *      a test must not cost the teacher the test they just built.
 *   3. The cost estimate quotes a model that is actually billable, so the rupee
 *      figure beside the Generate button cannot be fiction.
 */

let teacherToken: string;
let studentToken: string;
let classroomId: string;
let bankQuestionIds: string[] = [];
let publishedTestId: string;

test.describe('Nexus test wizard', () => {
  test.describe.configure({ mode: 'serial' });
  test.use({ baseURL: 'http://localhost:3012' });

  test('setup: teacher and student in one classroom, with bank questions', async ({ request }) => {
    const t = await request.post('/api/auth/test-login', {
      data: { email: 'e2e-wizard-teacher@neramclasses.com', role: 'teacher' },
    });
    expect(t.status()).toBe(200);
    const tb = await t.json();
    teacherToken = tb.testToken;

    const s = await request.post('/api/auth/test-login', {
      data: { email: 'e2e-wizard-student@neramclasses.com', role: 'student' },
    });
    expect(s.status()).toBe(200);
    const sb = await s.json();
    studentToken = sb.testToken;

    const studentClassroomIds = new Set((sb.classrooms || []).map((c: any) => c.id));
    const shared = (tb.classrooms || []).find((c: any) => studentClassroomIds.has(c.id));
    expect(shared, 'teacher and student must share a classroom').toBeTruthy();
    classroomId = shared.id;

    const q = await request.get('/api/question-bank/questions?page=1&page_size=3&question_status=active', {
      headers: { Authorization: `Bearer ${teacherToken}` },
    });
    expect(q.status()).toBe(200);
    const qb = await q.json();
    bankQuestionIds = (qb.data?.questions || []).map((x: any) => x.id);
    expect(bankQuestionIds.length).toBeGreaterThan(0);
  });

  test('the usage chip data only arrives when asked for', async ({ request }) => {
    const without = await request.get('/api/question-bank/questions?page=1&page_size=3&question_status=active', {
      headers: { Authorization: `Bearer ${teacherToken}` },
    });
    const w = await without.json();
    expect(w.data.questions[0].used_in_tests).toBeUndefined();

    const withUsage = await request.get(
      '/api/question-bank/questions?page=1&page_size=3&question_status=active&include_usage=1',
      { headers: { Authorization: `Bearer ${teacherToken}` } },
    );
    const u = await withUsage.json();
    // Zero is a real answer meaning unused, so the assertion is on the type.
    expect(typeof u.data.questions[0].used_in_tests).toBe('number');
  });

  test('the cost estimate quotes a billable model and a real budget verdict', async ({ request }) => {
    const res = await request.post('/api/question-bank/tests/generate/estimate', {
      headers: { Authorization: `Bearer ${teacherToken}` },
      data: { mode: 'topic', count: 15, formats: ['MCQ'], steer_chars: 0 },
    });
    expect(res.status()).toBe(200);
    const { data } = await res.json();

    expect(data.model).toBeTruthy();
    // Retired models are the failure this guards: a quote against a model Google
    // has shut down is a number for a call that can never happen.
    expect(data.model).not.toMatch(/gemini-(1\.5|2\.0)/);
    expect(data.tokensOut).toBeGreaterThan(0);
    expect(typeof data.allowed).toBe('boolean');
    expect(data.feature_id).toBe('nexus.test-wizard-generate');
    if (data.costInr !== null) expect(data.costInr).toBeGreaterThan(0);
  });

  test('a PDF run is quoted against the document tier, not the standard one', async ({ request }) => {
    const res = await request.post('/api/question-bank/tests/generate/estimate', {
      headers: { Authorization: `Bearer ${teacherToken}` },
      data: { mode: 'pdf', count: 15, formats: ['MCQ'], page_count: 42 },
    });
    const { data } = await res.json();
    expect(data.feature_id).toBe('nexus.test-wizard-generate-doc');
    expect(data.tier).toBe('document');
  });

  test('publish builds the test and places it in one call', async ({ request }) => {
    const res = await request.post('/api/question-bank/tests/publish', {
      headers: { Authorization: `Bearer ${teacherToken}` },
      data: {
        title: 'E2E wizard test',
        source: 'bank',
        test_kind: 'classroom_assigned',
        rules: { timed: false, durationMinutes: 30, marksPerQuestion: 1, attempts: null, passPct: 60, shuffle: true },
        questions: bankQuestionIds.map((id) => ({ bank_question_id: id, action: 'reuse' })),
        placements: [
          { context_type: 'classroom_assignment', context_id: classroomId, passing_pct: 60, gating: {} },
        ],
        publish: true,
      },
    });
    expect(res.status()).toBe(201);
    const { data } = await res.json();
    publishedTestId = data.test_id;

    expect(data.question_count).toBe(bankQuestionIds.length);
    // Bank questions are referenced, never re-authored. A non-zero `created`
    // here would mean the wizard duplicated the bank on every reuse.
    expect(data.created).toBe(0);
    expect(data.placements).toHaveLength(1);
    expect(data.placements[0].ok).toBe(true);
  });

  test('the published test is reachable and the student can see it', async ({ request }) => {
    const detail = await request.get(`/api/question-bank/tests/${publishedTestId}`, {
      headers: { Authorization: `Bearer ${teacherToken}` },
    });
    expect(detail.status()).toBe(200);

    // /api/tests is scoped to a classroom and 400s without one.
    const list = await request.get(`/api/tests?classroom=${classroomId}`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    expect(list.status()).toBe(200);
    const body = await list.json();
    const rows = body.data || body.tests || [];
    expect(rows.some((t: any) => t.id === publishedTestId)).toBe(true);
  });

  test('a refused placement is reported, and never loses the test', async ({ request }) => {
    const res = await request.post('/api/question-bank/tests/publish', {
      headers: { Authorization: `Bearer ${teacherToken}` },
      data: {
        title: 'E2E wizard refused placement',
        source: 'bank',
        rules: { timed: false, durationMinutes: 30, marksPerQuestion: 1, attempts: null, passPct: 60, shuffle: true },
        questions: bankQuestionIds.map((id) => ({ bank_question_id: id, action: 'reuse' })),
        // class_test is deliberately not a generic context: it has its own route
        // that writes gating the generic one knows nothing about.
        placements: [{ context_type: 'class_test', context_id: classroomId }],
        publish: true,
      },
    });
    // 201, not 500. The test exists; only the placement was refused.
    expect(res.status()).toBe(201);
    const { data } = await res.json();
    expect(data.test_id).toBeTruthy();
    expect(data.placements[0].ok).toBe(false);
    expect(data.placements[0].error).toBeTruthy();

    await request.delete(`/api/question-bank/tests/${data.test_id}`, {
      headers: { Authorization: `Bearer ${teacherToken}` },
    });
  });

  test('publishing nothing is a sentence, not a stack trace', async ({ request }) => {
    const res = await request.post('/api/question-bank/tests/publish', {
      headers: { Authorization: `Bearer ${teacherToken}` },
      data: { title: 'Empty', rules: {}, questions: [], placements: [] },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/at least one question/i);
  });

  test('publishing without a name is refused before anything is written', async ({ request }) => {
    const res = await request.post('/api/question-bank/tests/publish', {
      headers: { Authorization: `Bearer ${teacherToken}` },
      data: { title: '  ', rules: {}, questions: bankQuestionIds.map((id) => ({ bank_question_id: id })) },
    });
    expect(res.status()).toBe(400);
  });

  /**
   * Refused, but as a 400 rather than a 403.
   *
   * `verifyQBAccess(auth, null)` answers 400 for a student before the route's
   * own user_type check is ever reached. That is a known wart across roughly
   * twenty question-bank routes, not something these two routes invented, and
   * fixing it here alone would make them the odd ones out. What the assertion
   * has to pin is the part that matters: a student is refused and nothing is
   * written. The exact code is asserted loosely so this spec does not have to
   * be edited when the wart is fixed repo-wide.
   */
  test('a student cannot publish a test', async ({ request }) => {
    const res = await request.post('/api/question-bank/tests/publish', {
      headers: { Authorization: `Bearer ${studentToken}` },
      data: { title: 'Nope', rules: {}, questions: bankQuestionIds.map((id) => ({ bank_question_id: id })) },
    });
    expect([400, 401, 403]).toContain(res.status());

    // And nothing was created under that title.
    const library = await request.get('/api/question-bank/tests', {
      headers: { Authorization: `Bearer ${teacherToken}` },
    });
    const rows = (await library.json()).data || [];
    expect(rows.some((t: any) => t.title === 'Nope')).toBe(false);
  });

  test('a student cannot ask for a cost estimate either', async ({ request }) => {
    const res = await request.post('/api/question-bank/tests/generate/estimate', {
      headers: { Authorization: `Bearer ${studentToken}` },
      data: { mode: 'topic', count: 5, formats: ['MCQ'] },
    });
    expect([400, 401, 403]).toContain(res.status());
  });

  test('cleanup', async ({ request }) => {
    if (!publishedTestId) return;
    await request.delete(`/api/question-bank/tests/${publishedTestId}`, {
      headers: { Authorization: `Bearer ${teacherToken}` },
    });
  });
});
