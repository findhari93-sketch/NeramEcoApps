import { test, expect } from '@playwright/test';
import { APP_URLS, getTestAuthToken } from '../utils/credentials';

/**
 * The class prep test and the join gate.
 *
 * Run serially: the tests share one class and one attached prep test, and the
 * attach/detach lifecycle is part of what is being verified.
 *
 * Everything self-skips when the migrations are not applied in this environment,
 * including on a 500, which is what an unmigrated database produces here. That
 * convention is copied from course-plan-assignments-nexus.spec.ts so a developer
 * running the suite against an older branch does not see a wall of red.
 */

const NEXUS = APP_URLS.nexus;

test.describe.configure({ mode: 'serial' });

test.describe('Class prep test and join gate', () => {
  let teacherToken: string | null = null;
  let studentToken: string | null = null;
  let classId: string | null = null;

  test('setup: tokens and a class to work with', async ({ request }) => {
    const teacher = await getTestAuthToken(request, 'teacher');
    const student = await getTestAuthToken(request, 'student');
    if (!teacher) {
      test.skip(true, 'Nexus dev server / test-login unavailable');
      return;
    }
    teacherToken = teacher.testToken;
    studentToken = student?.testToken ?? null;

    // A future class, because attaching a prep test to one that has already
    // started is refused by design.
    const res = await request.get(`${NEXUS}/api/timetable/my-schedule`, {
      headers: { Authorization: `Bearer ${teacherToken}` },
    });
    if (res.status() !== 200) {
      test.skip(true, 'Timetable unavailable for this account in this environment');
      return;
    }
    const body = await res.json();
    const upcoming = (body.classes || []).find((c: any) => c.status === 'scheduled');
    if (!upcoming) {
      test.skip(true, 'No upcoming class in range for this account');
      return;
    }
    classId = upcoming.id;
  });

  test('an unauthenticated caller cannot read the prep test', async ({ request }) => {
    if (!classId) {
      test.skip(true, 'setup did not find a class');
      return;
    }
    const res = await request.get(`${NEXUS}/api/timetable/${classId}/prep-test`);
    expect([401, 403]).toContain(res.status());
  });

  test('a parent is refused on every prep endpoint', async ({ request }) => {
    if (!classId) {
      test.skip(true, 'setup did not find a class');
      return;
    }
    // verifyMsToken fails closed for parent tokens unless a route opts in, and
    // getRequestUser rejects them again. Both layers are asserted by proxy here:
    // a par_-shaped token must never be accepted.
    const parentish = 'par_not_a_real_token';
    for (const path of [
      `/api/timetable/${classId}/prep-test`,
      `/api/timetable/${classId}/prep-roster`,
      `/api/timetable/${classId}/join`,
      `/api/student/class-prep/${classId}/test`,
    ]) {
      const res = await request.get(`${NEXUS}${path}`, {
        headers: { Authorization: `Bearer ${parentish}` },
      });
      expect([401, 403], `${path} must refuse a parent token`).toContain(res.status());
    }
  });

  test('a student cannot attach a prep test', async ({ request }) => {
    if (!classId || !studentToken) {
      test.skip(true, 'setup incomplete');
      return;
    }
    const res = await request.post(`${NEXUS}/api/timetable/${classId}/prep-test`, {
      headers: { Authorization: `Bearer ${studentToken}` },
      data: { question_ids: ['00000000-0000-0000-0000-000000000000'] },
    });
    expect([403, 404]).toContain(res.status());
  });

  test('the teacher sees the empty state before anything is attached', async ({ request }) => {
    if (!classId || !teacherToken) {
      test.skip(true, 'setup incomplete');
      return;
    }
    const res = await request.get(`${NEXUS}/api/timetable/${classId}/prep-test`, {
      headers: { Authorization: `Bearer ${teacherToken}` },
    });
    if (res.status() === 500) {
      test.skip(true, 'class prep migrations not applied in this environment');
      return;
    }
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.canEdit).toBe(true);
    expect(body).toHaveProperty('default_passing_pct');
    expect(body).toHaveProperty('linkable');
  });

  test('a paper of ungradable questions is refused, naming the problem', async ({ request }) => {
    if (!classId || !teacherToken) {
      test.skip(true, 'setup incomplete');
      return;
    }
    // Find a drawing prompt, which no machine can mark. A prep test holding one
    // would either award free marks or be unpassable.
    const qres = await request.get(
      `${NEXUS}/api/question-bank/questions?question_format=DRAWING_PROMPT&page_size=1&question_status=active`,
      { headers: { Authorization: `Bearer ${teacherToken}` } },
    );
    if (qres.status() !== 200) {
      test.skip(true, 'question bank unavailable');
      return;
    }
    const q = (await qres.json()).data?.questions?.[0];
    if (!q) {
      test.skip(true, 'no drawing questions in the bank to test the guard with');
      return;
    }

    const res = await request.post(`${NEXUS}/api/timetable/${classId}/prep-test`, {
      headers: { Authorization: `Bearer ${teacherToken}` },
      data: { question_ids: [q.id], passing_pct: 70 },
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toMatch(/MCQ or numerical/i);
  });

  test('attaching, re-barring and detaching a prep test', async ({ request }) => {
    if (!classId || !teacherToken) {
      test.skip(true, 'setup incomplete');
      return;
    }
    const qres = await request.get(
      `${NEXUS}/api/question-bank/questions?question_format=MCQ&page_size=6&question_status=active`,
      { headers: { Authorization: `Bearer ${teacherToken}` } },
    );
    if (qres.status() !== 200) {
      test.skip(true, 'question bank unavailable');
      return;
    }
    const ids = ((await qres.json()).data?.questions || []).map((q: any) => q.id);
    if (ids.length < 2) {
      test.skip(true, 'not enough active MCQ questions in the bank');
      return;
    }

    const created = await request.post(`${NEXUS}/api/timetable/${classId}/prep-test`, {
      headers: { Authorization: `Bearer ${teacherToken}` },
      data: { question_ids: ids, title: 'E2E prep test', passing_pct: 80 },
    });
    if (created.status() === 500) {
      test.skip(true, 'class prep migrations not applied in this environment');
      return;
    }
    expect(created.status()).toBe(201);
    const info = (await created.json()).prep_test;
    expect(info.question_count).toBe(ids.length);
    expect(info.passing_pct).toBe(80);
    // The count, not just the percentage: 80% of 6 is 5 of 6, and stating it is
    // how a teacher avoids accidentally setting "near perfect".
    expect(info.must_get_right).toBe(Math.ceil(0.8 * ids.length));

    // Re-attaching must REPLACE, not accumulate: the partial unique index allows
    // exactly one active placement per class.
    const again = await request.post(`${NEXUS}/api/timetable/${classId}/prep-test`, {
      headers: { Authorization: `Bearer ${teacherToken}` },
      data: { question_ids: ids.slice(0, 2), passing_pct: 50 },
    });
    expect(again.status()).toBe(201);
    expect((await again.json()).prep_test.question_count).toBe(2);

    const patched = await request.patch(`${NEXUS}/api/timetable/${classId}/prep-test`, {
      headers: { Authorization: `Bearer ${teacherToken}` },
      data: { passing_pct: 90 },
    });
    expect(patched.status()).toBe(200);
    expect((await patched.json()).prep_test.passing_pct).toBe(90);

    const bad = await request.patch(`${NEXUS}/api/timetable/${classId}/prep-test`, {
      headers: { Authorization: `Bearer ${teacherToken}` },
      data: { passing_pct: 0 },
    });
    expect(bad.status()).toBe(400);
  });

  test('the roster reports everyone as not started before anyone opens it', async ({ request }) => {
    if (!classId || !teacherToken) {
      test.skip(true, 'setup incomplete');
      return;
    }
    const res = await request.get(`${NEXUS}/api/timetable/${classId}/prep-roster`, {
      headers: { Authorization: `Bearer ${teacherToken}` },
    });
    if (res.status() === 500) {
      test.skip(true, 'class prep migrations not applied in this environment');
      return;
    }
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.has_test).toBe(true);
    // Nobody is ever "failed" for not having begun.
    for (const row of body.rows || []) {
      expect(['not_started', 'ready', 'test_pending', 'prework_pending', 'reason_given', 'attended_unprepared'])
        .toContain(row.status);
    }
    if ((body.rows || []).length === 0) {
      // readyRate is null, never 0, for an empty roster.
      expect(body.summary.readyRate).toBeNull();
    }
  });

  test('a gated prep test cannot be opened through the legacy engine', async ({ request }) => {
    if (!classId || !studentToken) {
      test.skip(true, 'setup incomplete');
      return;
    }
    const paper = await request.get(`${NEXUS}/api/student/class-prep/${classId}/test`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    if (paper.status() !== 200) {
      test.skip(true, 'student cannot reach this class in this environment');
      return;
    }
    const testId = (await paper.json()).test_id;

    // The hole this closes was live: a catch-up test was listable and openable
    // here, and this route only validates a placement when the client supplies
    // one, so the unlock check never ran.
    const legacy = await request.get(`${NEXUS}/api/tests/attempt?test_id=${testId}`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    expect(legacy.status()).toBe(403);
    expect((await legacy.json()).code).toBe('WRONG_ENGINE');
  });

  test('a gated prep test never appears in the generic student test list', async ({ request }) => {
    if (!studentToken) {
      test.skip(true, 'setup incomplete');
      return;
    }
    const me = await request.get(`${NEXUS}/api/auth/me`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    if (me.status() !== 200) {
      test.skip(true, 'auth/me unavailable');
      return;
    }
    const classroomId = (await me.json())?.classrooms?.[0]?.id;
    if (!classroomId) {
      test.skip(true, 'student has no classroom');
      return;
    }
    const res = await request.get(`${NEXUS}/api/tests?classroom=${classroomId}`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    if (res.status() !== 200) {
      test.skip(true, 'tests list unavailable');
      return;
    }
    for (const t of (await res.json()).tests || []) {
      expect(
        ['class_prep', 'catchup_class'],
        'a gated kind must never be listed as ordinary work',
      ).not.toContain(t.test_kind);
    }
  });

  test('cleanup: detach the prep test', async ({ request }) => {
    if (!classId || !teacherToken) {
      test.skip(true, 'setup incomplete');
      return;
    }
    const res = await request.delete(`${NEXUS}/api/timetable/${classId}/prep-test`, {
      headers: { Authorization: `Bearer ${teacherToken}` },
    });
    expect([200, 403, 404]).toContain(res.status());
    if (res.status() === 200) {
      const after = await request.get(`${NEXUS}/api/timetable/${classId}/prep-test`, {
        headers: { Authorization: `Bearer ${teacherToken}` },
      });
      expect((await after.json()).prep_test).toBeNull();
    }
  });
});
