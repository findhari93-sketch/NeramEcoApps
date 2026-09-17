/**
 * Answer Pad API: sessions, joining, snapshots and the security boundary
 * (test plan level 6; side-panel spec sections 6, 9 and 12).
 *
 * Runs against a Nexus dev server wired to STAGING, never production:
 *
 *   E2E_NEXUS_URL=http://localhost:3022 npx playwright test tests/e2e/answer-pad --project=nexus-chrome --no-deps
 *
 * Needs staff.answer-pad and student.answer-pad switched on in staging's
 * feature_flags setting; the dark-launch 404s are covered by caller.test.ts.
 *
 * Tokens are the non-production test_ tokens for existing staging E2E accounts,
 * minted here rather than through /api/auth/test-login, which re-tiers the
 * accounts it touches. Every session a test starts is ended in afterAll.
 */
import { test, expect, type APIRequestContext, type APIResponse } from '@playwright/test';
import { APP_URLS } from '../../utils/credentials';

const NEXUS = APP_URLS.nexus;

const ACCOUNTS = {
  /** staff_role manager: internal staff, runs any classroom. */
  manager: 'e2etestingteacher@neramclasses.com',
  /** staff_role teacher: external, teaches only in E2E Test Classroom. */
  externalTeacher: 'e2e-attendance@neramclasses.com',
  otherTeacher: 'e2e-auth-test@neramclasses.com',
  student: 'e2etestingstudent@neramclasses.com',
  classmate: 'e2e-checklist-student@neramclasses.com',
} as const;

/** A rate-limited account stays limited for ten minutes, so the victim rotates between runs. */
const RATE_LIMIT_POOL = [
  'e2e-checklist-view-student@neramclasses.com',
  'e2e-documents@neramclasses.com',
  'e2e-edge-student@neramclasses.com',
];

const E2E_CLASSROOM = 'E2E Test Classroom';
const RANDOM_UUID = '9f0c1d2e-3b4a-4c5d-8e6f-7a8b9c0d1e2f';

/** Postgres and PostgREST text that must never reach a client. */
const DATABASE_LEAK = /relation "|violates |syntax error|permission denied|PGRST\d|"code":\s*"[0-9A-Z]{5}"|pad_[a-z_]+\(/;

const tokenFor = (email: string): string => `test_${Buffer.from(email).toString('base64')}`;
const auth = (email: string) => ({ Authorization: `Bearer ${tokenFor(email)}` });

async function json(res: APIResponse): Promise<any> {
  const text = await res.text();
  expect(text, 'response leaks database text').not.toMatch(DATABASE_LEAK);
  return text ? JSON.parse(text) : null;
}

let api: APIRequestContext;

const start = (email: string, data: Record<string, unknown> = {}) =>
  api.post(`${NEXUS}/api/pad/sessions`, { headers: auth(email), data });
const end = (email: string, sessionId: string, confirmUnrevealed = true) =>
  api.post(`${NEXUS}/api/pad/sessions/${sessionId}/end`, { headers: auth(email), data: { confirmUnrevealed } });
const snapshot = (email: string, sessionId: string) =>
  api.get(`${NEXUS}/api/pad/sessions/${sessionId}/snapshot`, { headers: auth(email) });
const join = (email: string, data: Record<string, unknown>) =>
  api.post(`${NEXUS}/api/pad/join`, { headers: auth(email), data });
const heartbeat = (email: string, sessionId: string) =>
  api.post(`${NEXUS}/api/pad/heartbeat`, { headers: auth(email), data: { sessionId } });

/** End whatever live session an interrupted earlier run left for this teacher. */
async function endLeftoverSession(email: string, classroomId: string): Promise<void> {
  const res = await start(email, { classroomId });
  const data = await json(res);
  if (res.status() === 409 && data.code === 'SESSION_CONFLICT') {
    await end(email, data.existing.session_id);
    const fresh = await json(await start(email, { classroomId }));
    await end(email, fresh.sessionId);
    return;
  }
  expect(res.status(), JSON.stringify(data)).toBe(200);
  await end(email, data.sessionId);
}

test.use({ storageState: { cookies: [], origins: [] } });

test.describe.serial('Answer Pad API', () => {
  test.setTimeout(180_000);

  let e2eClassroomId = '';
  /** A live classroom the external teacher does not teach in. */
  let otherClassroomId = '';
  let studentClassroomIds = new Set<string>();
  let sessionId = '';
  let roomCode = '';
  let seriesSessionId = '';
  let replacedSessionId = '';
  const startedSessions: Array<{ email: string; sessionId: string }> = [];

  test.beforeAll(async ({ playwright }) => {
    api = await playwright.request.newContext();
  });

  test.afterAll(async () => {
    for (const { email, sessionId: id } of [...startedSessions].reverse()) {
      await end(email, id).catch(() => undefined);
    }
    await api.dispose();
  });

  test('answers 401 on every route without a valid token, and forbids caching', async () => {
    const routes: Array<[string, string]> = [
      ['POST', '/api/pad/sessions'],
      ['POST', `/api/pad/sessions/${RANDOM_UUID}/end`],
      ['GET', `/api/pad/sessions/${RANDOM_UUID}/snapshot`],
      ['POST', '/api/pad/join'],
      ['POST', '/api/pad/heartbeat'],
    ];
    const headerSets: Array<Record<string, string>> = [{}, { Authorization: 'Basic abc' }, { Authorization: 'Bearer test_bm9ib2R5QGV4YW1wbGUuY29t' }];

    for (const [method, path] of routes) {
      for (const headers of headerSets) {
        const res = await api.fetch(`${NEXUS}${path}`, { method, headers, data: method === 'POST' ? {} : undefined });
        expect({ path, headers, status: res.status() }).toEqual({ path, headers, status: 401 });
        expect(res.headers()['cache-control'] ?? '').toContain('no-store');
        await json(res);
      }
    }
  });

  test('keeps each role on its own surface', async () => {
    expect((await start(ACCOUNTS.student)).status()).toBe(403);
    expect((await join(ACCOUNTS.manager, { code: '123456' })).status()).toBe(403);
    expect((await heartbeat(ACCOUNTS.manager, RANDOM_UUID)).status()).toBe(403);
  });

  test('asks which classroom when nothing identifies the class, scoped to what the teacher may run', async () => {
    const managerRes = await start(ACCOUNTS.manager, {});
    const managerChoice = await json(managerRes);
    expect(managerRes.status()).toBe(200);
    expect(managerChoice.needsClassroom).toBe(true);

    const e2e = managerChoice.classrooms.find((c: { name: string }) => c.name === E2E_CLASSROOM);
    expect(e2e, `${E2E_CLASSROOM} is missing on staging`).toBeTruthy();
    e2eClassroomId = e2e.id;

    const externalChoice = await json(await start(ACCOUNTS.externalTeacher, {}));
    expect(externalChoice.needsClassroom).toBe(true);
    const externalIds: string[] = externalChoice.classrooms.map((c: { id: string }) => c.id);
    expect(externalIds).toContain(e2eClassroomId);
    expect(externalIds.length).toBeLessThan(managerChoice.classrooms.length);

    const me = await json(await api.get(`${NEXUS}/api/auth/me`, { headers: auth(ACCOUNTS.student) }));
    studentClassroomIds = new Set((me?.classrooms ?? []).map((c: { id: string }) => c.id));

    // Prefer a classroom the external teacher does not teach AND the student is not in.
    const candidates = managerChoice.classrooms.filter((c: { id: string }) => !externalIds.includes(c.id));
    const other = candidates.find((c: { id: string }) => !studentClassroomIds.has(c.id)) ?? candidates[0];
    expect(other, 'staging needs a live classroom the external E2E teacher does not teach').toBeTruthy();
    otherClassroomId = other.id;

    await endLeftoverSession(ACCOUNTS.manager, e2eClassroomId);
    await endLeftoverSession(ACCOUNTS.externalTeacher, e2eClassroomId);
  });

  test('rejects malformed input and names the field', async () => {
    const cases: Array<[Record<string, unknown>, string, number]> = [
      [{ classroomId: 'room-1' }, 'classroomId', 400],
      [{ batchId: RANDOM_UUID }, 'batchId', 400],
      [{ classroomId: e2eClassroomId, batchId: RANDOM_UUID }, 'batchId', 400],
      [{ meeting: 'meeting-1' }, 'meeting', 400],
      [{ meeting: { chatId: 'x'.repeat(600) } }, 'meeting', 400],
      [{ endExisting: 'yes' }, 'endExisting', 400],
      [{ scheduledClassId: RANDOM_UUID }, 'scheduledClassId', 404],
    ];
    for (const [data, field, status] of cases) {
      const res = await start(ACCOUNTS.manager, data);
      expect({ field, status: res.status() }).toEqual({ field, status });
      expect(await json(res)).toMatchObject({ field });
    }

    expect(await json(await join(ACCOUNTS.student, { code: 'abc' }))).toMatchObject({ code: 'INVALID_INPUT', field: 'code' });
    expect((await join(ACCOUNTS.student, {})).status()).toBe(400);
    expect((await heartbeat(ACCOUNTS.student, 'not-a-uuid')).status()).toBe(400);
    expect((await snapshot(ACCOUNTS.manager, 'not-a-uuid')).status()).toBe(404);
    expect((await snapshot(ACCOUNTS.manager, RANDOM_UUID)).status()).toBe(404);
    expect((await end(ACCOUNTS.manager, RANDOM_UUID)).status()).toBe(404);
  });

  test('lets an external teacher run only classrooms they teach', async () => {
    const res = await start(ACCOUNTS.externalTeacher, { classroomId: otherClassroomId });
    expect(res.status()).toBe(403);
    expect((await json(res)).error).toMatch(/classes you teach/);
  });

  test('starts a session for the chosen classroom and resumes it when the console reopens', async () => {
    const res = await start(ACCOUNTS.manager, { classroomId: e2eClassroomId });
    const started = await json(res);
    expect(res.status(), JSON.stringify(started)).toBe(200);
    expect(started).toMatchObject({
      resumed: false,
      endedSessionId: null,
      binding: { source: 'chosen_classroom', classroomId: e2eClassroomId, scheduledClassId: null },
    });
    sessionId = started.sessionId;
    startedSessions.push({ email: ACCOUNTS.manager, sessionId });

    expect(await json(await start(ACCOUNTS.manager, { classroomId: e2eClassroomId }))).toMatchObject({ sessionId, resumed: true });
  });

  test('shows the console snapshot to the session teacher only', async () => {
    const res = await snapshot(ACCOUNTS.manager, sessionId);
    const snap = await json(res);
    expect(res.status()).toBe(200);
    expect(snap).toMatchObject({
      ok: true,
      role: 'teacher',
      prompt: null,
      counts: null,
      session: { id: sessionId, status: 'live', classroom_id: e2eClassroomId, presence_basis: 'app' },
    });
    expect(snap.session.room_code).toMatch(/^\d{6}$/);
    expect(snap.session.hint_topic).not.toBe(snap.session.teacher_topic);
    expect(snap.readiness.enrolled).toBeGreaterThan(0);
    roomCode = snap.session.room_code;

    for (const intruder of [ACCOUNTS.otherTeacher, ACCOUNTS.externalTeacher]) {
      const refused = await snapshot(intruder, sessionId);
      expect(refused.status()).toBe(403);
      expect(await json(refused)).toMatchObject({ code: 'NOT_SESSION_TEACHER' });
    }
  });

  test('lets an enrolled student join by room code, and refuses a wrong code', async () => {
    expect(await json(await join(ACCOUNTS.student, { code: `${roomCode.slice(0, 3)} ${roomCode.slice(3)}` }))).toEqual({ sessionId });

    const wrongCode = roomCode === '999999' ? '999998' : '999999';
    const wrong = await join(ACCOUNTS.classmate, { code: wrongCode });
    expect(wrong.status()).toBe(404);
    expect(await json(wrong)).toMatchObject({ code: 'ROOM_CODE_INVALID' });
  });

  test("gives a student their own view and none of the teacher's", async () => {
    const res = await snapshot(ACCOUNTS.student, sessionId);
    const text = await res.text();
    expect(res.status()).toBe(200);
    expect(JSON.parse(text)).toMatchObject({ ok: true, role: 'student', prompt: null, my_response: null, session: { id: sessionId, status: 'live' } });
    for (const teacherOnly of ['room_code', 'teacher_topic', 'readiness', 'counts', 'history', 'correct_keys']) {
      expect(text, `student snapshot exposes ${teacherOnly}`).not.toContain(`"${teacherOnly}"`);
    }
  });

  test('counts a student with the pad open as connected', async () => {
    expect(await json(await heartbeat(ACCOUNTS.student, sessionId))).toEqual({ status: 'live' });
    const snap = await json(await snapshot(ACCOUNTS.manager, sessionId));
    expect(snap.readiness.connected).toBeGreaterThanOrEqual(1);
  });

  test('joins from the Teams meeting once the teacher starts, and remembers the meeting series', async () => {
    const run = Date.now().toString(36);
    const meeting = { meetingId: `e2e-pad-meeting-${run}`, chatId: `19:meeting_e2epad${run}@thread.v2` };

    // The teacher has not started yet: the pad waits.
    expect(await json(await join(ACCOUNTS.classmate, { meetingId: meeting.meetingId }))).toEqual({ sessionId: null });

    const first = await json(await start(ACCOUNTS.externalTeacher, { meeting, classroomId: e2eClassroomId }));
    expect(first).toMatchObject({ resumed: false, binding: { source: 'chosen_classroom', classroomId: e2eClassroomId } });
    startedSessions.push({ email: ACCOUNTS.externalTeacher, sessionId: first.sessionId });
    expect(await json(await join(ACCOUNTS.classmate, { meetingId: meeting.meetingId }))).toEqual({ sessionId: first.sessionId });

    // Next class in the same series: nothing picked, the meeting is recognised.
    expect(await json(await end(ACCOUNTS.externalTeacher, first.sessionId))).toEqual({ changed: true });
    const next = await json(await start(ACCOUNTS.externalTeacher, { meeting: { meetingId: `${meeting.meetingId}-2`, chatId: meeting.chatId } }));
    expect(next).toMatchObject({ resumed: false, binding: { source: 'remembered', classroomId: e2eClassroomId } });
    seriesSessionId = next.sessionId;
    startedSessions.push({ email: ACCOUNTS.externalTeacher, sessionId: seriesSessionId });
  });

  test('lets only the session teacher end it, ends it once, and the pad sees the end', async () => {
    const refused = await end(ACCOUNTS.otherTeacher, sessionId);
    expect(refused.status()).toBe(403);
    expect(await json(refused)).toMatchObject({ code: 'NOT_SESSION_TEACHER' });

    expect(await json(await end(ACCOUNTS.manager, sessionId))).toEqual({ changed: true });
    expect(await json(await end(ACCOUNTS.manager, sessionId))).toEqual({ changed: false });

    expect(await json(await heartbeat(ACCOUNTS.student, sessionId))).toEqual({ status: 'ended' });
    expect(await json(await snapshot(ACCOUNTS.student, sessionId))).toMatchObject({ session: { status: 'ended' } });

    // A room code dies with its session.
    const late = await join(ACCOUNTS.student, { code: roomCode });
    expect(late.status()).toBe(404);
  });

  test('never silently replaces a live session with another class', async () => {
    const first = await json(await start(ACCOUNTS.manager, { classroomId: e2eClassroomId }));
    startedSessions.push({ email: ACCOUNTS.manager, sessionId: first.sessionId });

    const conflict = await start(ACCOUNTS.manager, { classroomId: otherClassroomId });
    expect(conflict.status()).toBe(409);
    expect(await json(conflict)).toMatchObject({
      code: 'SESSION_CONFLICT',
      existing: { session_id: first.sessionId, classroom_id: e2eClassroomId, classroom_name: E2E_CLASSROOM },
    });

    const replaced = await json(await start(ACCOUNTS.manager, { classroomId: otherClassroomId, endExisting: true }));
    expect(replaced).toMatchObject({ resumed: false, endedSessionId: first.sessionId });
    replacedSessionId = replaced.sessionId;
    startedSessions.push({ email: ACCOUNTS.manager, sessionId: replacedSessionId });

    expect(await json(await heartbeat(ACCOUNTS.student, first.sessionId))).toEqual({ status: 'ended' });
  });

  test('refuses a student outside the classroom, even holding the right room code', async () => {
    test.skip(studentClassroomIds.has(otherClassroomId), 'every other live staging classroom enrolls the E2E student');

    const code = (await json(await snapshot(ACCOUNTS.manager, replacedSessionId))).session.room_code;
    const refused = await join(ACCOUNTS.student, { code });
    expect(refused.status()).toBe(403);
    expect(await json(refused)).toMatchObject({ code: 'NOT_ENROLLED' });
    expect((await snapshot(ACCOUNTS.student, replacedSessionId)).status()).toBe(403);
    expect((await heartbeat(ACCOUNTS.student, replacedSessionId)).status()).toBe(403);
  });

  test('locks room-code guessing after eight failures, even for the right code', async () => {
    const victim = RATE_LIMIT_POOL[Math.floor(Date.now() / 600_000) % RATE_LIMIT_POOL.length];
    const liveCode = (await json(await snapshot(ACCOUNTS.externalTeacher, seriesSessionId))).session.room_code;
    const wrongCode = liveCode === '999999' ? '999998' : '999999';

    for (let attempt = 0; attempt < 8; attempt += 1) {
      // 429 when an earlier run in this ten-minute window already locked this account.
      expect([404, 429]).toContain((await join(victim, { code: wrongCode })).status());
    }

    const locked = await join(victim, { code: liveCode });
    expect(locked.status()).toBe(429);
    expect(await json(locked)).toMatchObject({ code: 'RATE_LIMITED' });
  });

  test('reaches nothing through Supabase with the public anon key', async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    test.skip(!url || !anon, 'the Supabase URL and anon key come from apps/nexus/.env.local');
    // Never probe production from a test run.
    expect(url).toContain('staging');

    const headers = { apikey: anon!, Authorization: `Bearer ${anon}` };
    for (const table of ['pad_sessions', 'pad_prompts', 'pad_responses', 'pad_events', 'pad_app_presence', 'pad_teams_users', 'pad_join_attempts']) {
      const res = await api.get(`${url}/rest/v1/${table}?select=*&limit=1`, { headers });
      expect({ table, status: res.status() }).not.toEqual({ table, status: 200 });
      expect(res.status()).toBeGreaterThanOrEqual(400);
    }
    for (const fn of ['pad_start_or_resume_session', 'pad_student_snapshot', 'pad_submit', 'pad_teacher_snapshot']) {
      const res = await api.post(`${url}/rest/v1/rpc/${fn}`, { headers, data: {} });
      expect({ fn, status: res.status() }).not.toEqual({ fn, status: 200 });
      expect(res.status()).toBeGreaterThanOrEqual(400);
    }
  });
});
