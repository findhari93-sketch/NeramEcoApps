import { test, expect } from '@playwright/test';

/**
 * Unified test engine E2E (API-level, mirrors tests-nexus.spec.ts style):
 * teacher composes a repository test from bank questions, manages it via the new
 * /api/question-bank/tests/[id] PATCH/DELETE, assigns it to the classroom with a
 * window, and the STUDENT sees it as an assigned test in /api/tests and can take
 * it through /api/tests/attempt (per-row qb_question_id resolution fix).
 * Also covers the bulk add_tags action and the tagging-export endpoint.
 */

let teacherToken: string;
let studentToken: string;
let teacherClassrooms: Array<{ id: string }> = [];
let classroomId: string;
let bankQuestionIds: string[] = [];
let composedTestId: string;
let placementId: string;
let gatedTestId: string;
let gatedPlacementId: string;
let tagId: string;
let originalTagIds: string[] = [];

test.describe('Nexus unified tests hub + assigned tests', () => {
  test.describe.configure({ mode: 'serial' });
  test.use({ baseURL: 'http://localhost:3012' });

  test('setup: teacher + student in the same classroom', async ({ request }) => {
    const t = await request.post('/api/auth/test-login', {
      data: { email: 'e2e-tests-hub-teacher@neramclasses.com', role: 'teacher' },
    });
    expect(t.status()).toBe(200);
    const tb = await t.json();
    teacherToken = tb.testToken;
    teacherClassrooms = tb.classrooms || [];
    expect(teacherClassrooms.length).toBeGreaterThan(0);

    const s = await request.post('/api/auth/test-login', {
      data: { email: 'e2e-tests-hub-student@neramclasses.com', role: 'student' },
    });
    expect(s.status()).toBe(200);
    const sb = await s.json();
    studentToken = sb.testToken;
    const studentClassroomIds = new Set((sb.classrooms || []).map((c: any) => c.id));
    const shared = teacherClassrooms.find((c) => studentClassroomIds.has(c.id));
    expect(shared, 'teacher and student must share a classroom (E2E Test Classroom)').toBeTruthy();
    classroomId = shared!.id;
  });

  test('teacher: grouped overview responds with groups', async ({ request }) => {
    const res = await request.get('/api/question-bank/tests/overview', {
      headers: { Authorization: `Bearer ${teacherToken}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.data)).toBe(true);
    for (const group of body.data) {
      expect(group.key).toBeTruthy();
      expect(typeof group.count).toBe('number');
      expect(Array.isArray(group.tests)).toBe(true);
    }
  });

  test('teacher: pick two bank questions', async ({ request }) => {
    const res = await request.get('/api/question-bank/questions?page=1&page_size=2&question_status=active', {
      headers: { Authorization: `Bearer ${teacherToken}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    bankQuestionIds = (body.data?.questions || []).map((q: any) => q.id);
    expect(bankQuestionIds.length).toBe(2);
  });

  test('teacher: compose a repository test', async ({ request }) => {
    const res = await request.post('/api/question-bank/tests', {
      headers: { Authorization: `Bearer ${teacherToken}` },
      data: {
        title: 'E2E Hub Composed Test',
        question_ids: bankQuestionIds,
        timer_type: 'none',
        passing_marks: 1,
        is_published: true,
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    composedTestId = body.data?.test_id;
    expect(composedTestId).toBeTruthy();
  });

  test('teacher: detail returns questions with answers + attempts count', async ({ request }) => {
    const res = await request.get(`/api/question-bank/tests/${composedTestId}`, {
      headers: { Authorization: `Bearer ${teacherToken}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.test.title).toBe('E2E Hub Composed Test');
    expect(body.data.questions.length).toBe(2);
    for (const q of body.data.questions) {
      expect(q.correct_answer !== undefined).toBe(true);
    }
    expect(Array.isArray(body.data.placements)).toBe(true);
    expect(typeof body.data.attempts_count).toBe('number');
  });

  test('teacher: PATCH toggles publish state', async ({ request }) => {
    const off = await request.patch(`/api/question-bank/tests/${composedTestId}`, {
      headers: { Authorization: `Bearer ${teacherToken}` },
      data: { is_published: false },
    });
    expect(off.status()).toBe(200);
    expect((await off.json()).data.is_published).toBe(false);

    const on = await request.patch(`/api/question-bank/tests/${composedTestId}`, {
      headers: { Authorization: `Bearer ${teacherToken}` },
      data: { is_published: true },
    });
    expect(on.status()).toBe(200);
    expect((await on.json()).data.is_published).toBe(true);
  });

  test('teacher: assign to classroom with a due window', async ({ request }) => {
    const dueTomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const res = await request.post(`/api/question-bank/tests/${composedTestId}/placements`, {
      headers: { Authorization: `Bearer ${teacherToken}` },
      data: {
        context_type: 'classroom_assignment',
        context_id: classroomId,
        passing_pct: 50,
        available_until: dueTomorrow,
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    placementId = body.data.id;
    expect(body.data.available_until).toBeTruthy();
  });

  test('student: sees the assigned test with placement info', async ({ request }) => {
    const res = await request.get(`/api/tests?classroom=${classroomId}`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.role).toBe('student');
    const found = (body.tests || []).find((t: any) => t.id === composedTestId);
    expect(found, 'placement-assigned test must appear in the student list').toBeTruthy();
    expect(found.assignment?.context_type).toBe('classroom_assignment');
    expect(found.assignment?.placement_id).toBe(placementId);
    expect(found.question_count).toBe(2);
  });

  test('student: composed test resolves all questions in the take flow', async ({ request }) => {
    const res = await request.get(
      `/api/tests/attempt?test_id=${composedTestId}&placement_id=${placementId}`,
      { headers: { Authorization: `Bearer ${studentToken}` } },
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.questions.length).toBe(2);
    for (const q of body.questions) {
      expect(q.question, 'bank question must resolve (per-row dual resolution)').toBeTruthy();
      expect(q.question.id).toBeTruthy();
      expect(q.question.correct_answer).toBeUndefined();
    }
    expect(body.attempt?.status).toBe('in_progress');
  });

  test('student: submit grades against the bank', async ({ request }) => {
    const attemptRes = await request.get(`/api/tests/attempt?test_id=${composedTestId}`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    const attempt = (await attemptRes.json()).attempt;
    const res = await request.post('/api/tests/attempt', {
      headers: { Authorization: `Bearer ${studentToken}` },
      data: { attempt_id: attempt.id, answers: {}, action: 'submit' },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.attempt.status).toBe('submitted');
    expect(body.attempt.total_marks).toBe(2);
  });

  test('window: a not-yet-open placement blocks the attempt with 403', async ({ request }) => {
    const create = await request.post('/api/question-bank/tests', {
      headers: { Authorization: `Bearer ${teacherToken}` },
      data: {
        title: 'E2E Hub Gated Test',
        question_ids: [bankQuestionIds[0]],
        timer_type: 'none',
        is_published: true,
      },
    });
    expect(create.status()).toBe(201);
    gatedTestId = (await create.json()).data.test_id;

    const opensTomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const place = await request.post(`/api/question-bank/tests/${gatedTestId}/placements`, {
      headers: { Authorization: `Bearer ${teacherToken}` },
      data: {
        context_type: 'classroom_assignment',
        context_id: classroomId,
        available_from: opensTomorrow,
      },
    });
    expect(place.status()).toBe(201);
    gatedPlacementId = (await place.json()).data.id;

    const attempt = await request.get(
      `/api/tests/attempt?test_id=${gatedTestId}&placement_id=${gatedPlacementId}`,
      { headers: { Authorization: `Bearer ${studentToken}` }, failOnStatusCode: false },
    );
    expect(attempt.status()).toBe(403);
    expect((await attempt.json()).error).toContain('not open');
  });

  test('tagging: bulk add_tags is additive and restorable', async ({ request }) => {
    const tagsRes = await request.get('/api/question-bank/tags', {
      headers: { Authorization: `Bearer ${teacherToken}` },
    });
    expect(tagsRes.status()).toBe(200);
    const tags = (await tagsRes.json()).data || [];
    expect(tags.length).toBeGreaterThan(0);
    tagId = tags[0].id;

    const before = await request.get(`/api/question-bank/questions/${bankQuestionIds[0]}`, {
      headers: { Authorization: `Bearer ${teacherToken}` },
    });
    originalTagIds = (await before.json()).data?.tag_ids || [];

    const add = await request.patch('/api/question-bank/questions/bulk-update', {
      headers: { Authorization: `Bearer ${teacherToken}` },
      data: { action: 'add_tags', question_ids: [bankQuestionIds[0]], tag_ids: [tagId] },
    });
    expect(add.status()).toBe(200);

    const after = await request.get(`/api/question-bank/questions/${bankQuestionIds[0]}`, {
      headers: { Authorization: `Bearer ${teacherToken}` },
    });
    const afterTagIds = (await after.json()).data?.tag_ids || [];
    expect(afterTagIds).toContain(tagId);
    for (const id of originalTagIds) {
      expect(afterTagIds, 'add_tags must never remove existing tags').toContain(id);
    }

    // Restore the original tag set (replace semantics of the single-question PATCH).
    const restore = await request.patch(`/api/question-bank/questions/${bankQuestionIds[0]}`, {
      headers: { Authorization: `Bearer ${teacherToken}` },
      data: { tag_ids: originalTagIds },
    });
    expect(restore.status()).toBe(200);
  });

  test('tagging: pairs mode skips unknown question ids instead of failing', async ({ request }) => {
    const res = await request.patch('/api/question-bank/questions/bulk-update', {
      headers: { Authorization: `Bearer ${teacherToken}` },
      data: {
        action: 'add_tags',
        assignments: [{ question_id: '00000000-0000-4000-8000-000000000000', tag_ids: [tagId] }],
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.skipped).toBe(1);
    expect(body.data.updated).toBe(0);
  });

  test('tagging: export endpoint pages the untagged pool', async ({ request }) => {
    const res = await request.get('/api/question-bank/tagging-export?scope=untagged&page=1&page_size=5', {
      headers: { Authorization: `Bearer ${teacherToken}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.data.questions)).toBe(true);
    expect(typeof body.data.total).toBe('number');
    for (const q of body.data.questions) {
      expect(q.id).toBeTruthy();
    }
  });

  test('cleanup: soft-delete the composed tests', async ({ request }) => {
    for (const id of [composedTestId, gatedTestId].filter(Boolean)) {
      const res = await request.delete(`/api/question-bank/tests/${id}`, {
        headers: { Authorization: `Bearer ${teacherToken}` },
      });
      expect(res.status()).toBe(200);
      const check = await request.get(`/api/question-bank/tests/${id}`, {
        headers: { Authorization: `Bearer ${teacherToken}` },
      });
      expect((await check.json()).data.test.is_active).toBe(false);
    }
  });
});
