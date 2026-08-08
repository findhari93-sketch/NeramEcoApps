import { test, expect } from '@playwright/test';

/**
 * Deleting and organising the papers students build for themselves.
 *
 * API level, matching tests-hub-nexus.spec.ts. The tenant forces Authenticator
 * and blocks ROPC, so a browser login for these accounts is not available; the
 * test-login route is how every Nexus spec authenticates.
 *
 * The properties held here are the ones that were decided rather than merely
 * implemented, and each one has a wrong answer that would look fine on screen:
 *
 *   1. A student can delete their OWN paper and nobody else's.
 *   2. Deleting keeps the score. This is the entire basis on which a soft delete
 *      was chosen, and nothing in the UI would reveal its loss until a student
 *      went looking for a result months later.
 *   3. Staff CAN delete a student's paper. This reverses an explicit 403.
 *   4. Staff CANNOT move one. The narrower half of the same rule, and the half
 *      that is easy to lose when the first is relaxed.
 *   5. PATCH /api/tests refuses a student. It used to accept any signed-in
 *      caller and spread the body into an update on any test id.
 */

let teacherToken: string;
let studentToken: string;
let otherStudentToken: string;
let classroomId: string;
let questionIds: string[] = [];

let folderId: string;
/** Deleted by the student, after being sat once. */
let ownTestId: string;
/** Deleted by staff. */
let staffDeletedTestId: string;
/** Used for the ownership and move guards. Never deleted. */
let guardTestId: string;

async function createStudentTest(request: any, token: string, title: string, folder?: string | null) {
  const res = await request.post('/api/question-bank/custom-tests', {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      title,
      question_ids: questionIds,
      timer_type: 'none',
      classroom_id: classroomId,
      folder_id: folder ?? null,
      source_filters: { selection: 'manual' },
    },
  });
  expect(res.status(), `creating "${title}" must succeed`).toBe(201);
  return (await res.json()).data.test_id as string;
}

test.describe('Student test library: delete and organise', () => {
  test.describe.configure({ mode: 'serial' });
  test.use({ baseURL: 'http://localhost:3012' });

  test('setup: a teacher and two students in one classroom', async ({ request }) => {
    const t = await request.post('/api/auth/test-login', {
      data: { email: 'e2e-organize-teacher@neramclasses.com', role: 'teacher' },
    });
    expect(t.status()).toBe(200);
    const tb = await t.json();
    teacherToken = tb.testToken;

    const s = await request.post('/api/auth/test-login', {
      data: { email: 'e2e-organize-student@neramclasses.com', role: 'student' },
    });
    expect(s.status()).toBe(200);
    const sb = await s.json();
    studentToken = sb.testToken;

    const o = await request.post('/api/auth/test-login', {
      data: { email: 'e2e-organize-other@neramclasses.com', role: 'student' },
    });
    expect(o.status()).toBe(200);
    otherStudentToken = (await o.json()).testToken;

    const teacherRooms = new Set((tb.classrooms || []).map((c: any) => c.id));
    const shared = (sb.classrooms || []).find((c: any) => teacherRooms.has(c.id));
    expect(shared, 'teacher and student must share a classroom').toBeTruthy();
    classroomId = shared.id;

    const q = await request.get('/api/question-bank/questions?page=1&page_size=2&question_status=active', {
      headers: { Authorization: `Bearer ${teacherToken}` },
    });
    expect(q.status()).toBe(200);
    questionIds = ((await q.json()).data?.questions || []).map((x: any) => x.id);
    expect(questionIds.length, 'the bank must hold at least two active questions').toBeGreaterThanOrEqual(2);
  });

  test('student: creates a folder in their own private tree', async ({ request }) => {
    const res = await request.post('/api/test-folders', {
      headers: { Authorization: `Bearer ${studentToken}` },
      // No scope is sent. The route resolves it from the caller, so this must
      // land in the student tree and never in the shared staff one.
      data: { name: `E2E Perspective drills ${Date.now()}` },
    });
    expect(res.status()).toBe(201);
    const folder = (await res.json()).data;
    folderId = folder.id;
    expect(folder.owner_scope).toBe('student');
    expect(folder.owner_id).toBeTruthy();
  });

  test('student: builds three papers, one already filed', async ({ request }) => {
    ownTestId = await createStudentTest(request, studentToken, 'E2E Own paper to delete');
    staffDeletedTestId = await createStudentTest(request, studentToken, 'E2E Paper staff will clear', folderId);
    guardTestId = await createStudentTest(request, studentToken, 'E2E Paper for the guards');
  });

  test('student: moves an unfiled paper into their folder', async ({ request }) => {
    const res = await request.patch('/api/test-folders', {
      headers: { Authorization: `Bearer ${studentToken}` },
      data: { test_ids: [ownTestId], folder_id: folderId },
    });
    expect(res.status()).toBe(200);
    expect((await res.json()).data.moved).toBe(1);

    const list = await request.get(`/api/question-bank/tests/library?folder=${folderId}`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    expect(list.status()).toBe(200);
    const ids = ((await list.json()).data?.tests || []).map((t: any) => t.id);
    expect(ids).toContain(ownTestId);
    expect(ids).toContain(staffDeletedTestId);
  });

  test('student: sits their own paper, so a score exists to protect', async ({ request }) => {
    const open = await request.get(`/api/tests/attempt?test_id=${ownTestId}`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    expect(open.status()).toBe(200);
    const attempt = (await open.json()).attempt;

    const submit = await request.post('/api/tests/attempt', {
      headers: { Authorization: `Bearer ${studentToken}` },
      data: { attempt_id: attempt.id, answers: {}, action: 'submit' },
    });
    expect(submit.status()).toBe(200);
    expect((await submit.json()).attempt.status).toBe('submitted');
  });

  test('a student cannot delete a paper that is not theirs', async ({ request }) => {
    const res = await request.post('/api/question-bank/tests/bulk-delete', {
      headers: { Authorization: `Bearer ${otherStudentToken}` },
      data: { test_ids: [guardTestId] },
    });
    expect(res.status()).toBe(403);
    expect((await res.json()).error).toContain('your own');
  });

  test('student: deletes their own paper and it leaves My tests', async ({ request }) => {
    const res = await request.post('/api/question-bank/tests/bulk-delete', {
      headers: { Authorization: `Bearer ${studentToken}` },
      data: { test_ids: [ownTestId] },
    });
    expect(res.status()).toBe(200);
    expect((await res.json()).data.deleted).toBe(1);

    const overview = await request.get(`/api/student/tests/overview?classroom=${classroomId}`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    expect(overview.status()).toBe(200);
    const mine = ((await overview.json()).data?.mine || []).map((t: any) => t.id);
    expect(mine).not.toContain(ownTestId);
  });

  test('the score survives the delete, which is why it is soft', async ({ request }) => {
    const res = await request.get(`/api/student/tests/history?classroom=${classroomId}&test_id=${ownTestId}`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    expect(res.status()).toBe(200);
    const attempts = (await res.json()).data?.attempts || [];
    // A hard delete would have cascaded this row out of nexus_test_attempts and
    // nothing on any screen would have said so.
    expect(attempts.length, 'the submitted attempt must still be in the history').toBeGreaterThan(0);
    expect(attempts[0].test_id).toBe(ownTestId);
  });

  test('staff: sees the student papers grouped by student', async ({ request }) => {
    const res = await request.get('/api/question-bank/tests/student-tests', {
      headers: { Authorization: `Bearer ${teacherToken}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    const all = (body.data?.groups || []).flatMap((g: any) => g.tests);
    const target = all.find((t: any) => t.id === staffDeletedTestId);
    expect(target, 'a student paper must be visible to staff').toBeTruthy();
    // The folder the STUDENT chose, which is what the Folder grouping reads.
    expect(target.folder_name).toBeTruthy();
    // Derived from the questions, so the Topic grouping has something to bucket on.
    expect(target.content_summary).toBeTruthy();
  });

  test('staff: CAN delete a student paper, reversing the old 403', async ({ request }) => {
    const res = await request.post('/api/question-bank/tests/bulk-delete', {
      headers: { Authorization: `Bearer ${teacherToken}` },
      data: { test_ids: [staffDeletedTestId] },
    });
    expect(res.status(), 'this used to be a 403 about papers belonging to the student').toBe(200);
    expect((await res.json()).data.deleted).toBe(1);

    const overview = await request.get(`/api/student/tests/overview?classroom=${classroomId}`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    const mine = ((await overview.json()).data?.mine || []).map((t: any) => t.id);
    expect(mine, 'the student stops seeing it too').not.toContain(staffDeletedTestId);
  });

  test('staff: still CANNOT move a student paper', async ({ request }) => {
    const res = await request.patch('/api/test-folders', {
      headers: { Authorization: `Bearer ${teacherToken}` },
      data: { test_ids: [guardTestId], folder_id: null },
    });
    // Deleting clutter is housekeeping. Rearranging someone's folders behind
    // their back is not, and the student would have no way to tell.
    expect(res.status()).toBe(403);
    expect((await res.json()).error).toContain('moved by the student');
  });

  test('PATCH /api/tests refuses a student, so is_active is not a back door', async ({ request }) => {
    const res = await request.patch('/api/tests', {
      headers: { Authorization: `Bearer ${studentToken}` },
      data: { test_id: guardTestId, is_active: false },
    });
    expect(res.status()).toBe(403);

    // And the paper is untouched: the refusal has to be real, not cosmetic.
    const overview = await request.get(`/api/student/tests/overview?classroom=${classroomId}`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    const mine = ((await overview.json()).data?.mine || []).map((t: any) => t.id);
    expect(mine).toContain(guardTestId);
  });

  test('cleanup: the student clears what is left', async ({ request }) => {
    await request.post('/api/question-bank/tests/bulk-delete', {
      headers: { Authorization: `Bearer ${studentToken}` },
      data: { test_ids: [guardTestId] },
    });
    await request.delete(`/api/test-folders/${folderId}`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
  });
});
