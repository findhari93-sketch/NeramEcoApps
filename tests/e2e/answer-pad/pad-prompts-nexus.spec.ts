/**
 * Answer Pad API: the question loop (test plan level 6; side-panel spec
 * sections 4, 7, 8, 9 and 12; v3.1 section 11 scoring).
 *
 * Runs against a Nexus dev server wired to STAGING, never production:
 *
 *   E2E_NEXUS_URL=http://localhost:3022 npx playwright test tests/e2e/answer-pad --project=nexus-chrome --no-deps
 *
 * One class, walked end to end: ASK, answers, CLOSE, a key that changes,
 * REOPEN, REVEAL, details, a poll, and ending with a question still open.
 */
import { test, expect, type APIRequestContext, type APIResponse } from '@playwright/test';
import { NEXUS, endLeftoverSession, json, padApi, type PadApi } from './pad-api';

/** External-tier teacher who teaches in E2E Test Classroom. */
const TEACHER = 'e2e-checklist-teacher@neramclasses.com';
/** Another teacher of the same classroom, who does not own the session. */
const INTRUDER = 'e2e-checklist@neramclasses.com';
/** Answers B, the key. */
const RIGHT = 'e2etestingstudent@neramclasses.com';
/** Answers A. */
const WRONG = 'e2e-checklist-student@neramclasses.com';
/** Misses the first window, answers D after REOPEN. */
const LATE = 'e2e-checklist-view-student@neramclasses.com';

const UNKNOWN_ID = '9f0c1d2e-3b4a-4c5d-8e6f-7a8b9c0d1e2f';

test.use({ storageState: { cookies: [], origins: [] } });

test.describe.serial('Answer Pad API: the question loop', () => {
  test.setTimeout(180_000);

  let api: APIRequestContext;
  let pad: PadApi;
  let sessionId = '';
  let q1 = '';
  let q2 = '';
  const ids: Record<string, string> = {};

  test.beforeAll(async ({ playwright }) => {
    api = await playwright.request.newContext();
    pad = padApi(api);
  });

  test.afterAll(async () => {
    if (sessionId) await pad.end(TEACHER, sessionId).catch(() => undefined);
    await api.dispose();
  });

  test('starts a live session with three students connected', async () => {
    const choice = await json(await pad.start(TEACHER, {}));
    expect(choice.needsClassroom).toBe(true);
    const room = choice.classrooms.find((c: { name: string }) => c.name === 'E2E Test Classroom');
    expect(room, 'E2E Test Classroom is missing on staging').toBeTruthy();

    await endLeftoverSession(pad, TEACHER, room.id);
    const started = await json(await pad.start(TEACHER, { classroomId: room.id }));
    expect(started.sessionId).toBeTruthy();
    sessionId = started.sessionId;

    for (const email of [RIGHT, WRONG, LATE]) {
      ids[email] = (await json(await pad.me(email))).user.id;
      expect(await json(await pad.heartbeat(email, sessionId))).toEqual({ status: 'live' });
    }
  });

  test('refuses prompt routes without a token, and keeps students and teachers on their own sides', async () => {
    const unauthenticated: Array<() => Promise<APIResponse>> = [
      () => api.post(`${NEXUS}/api/pad/prompts/ask`, { data: { sessionId } }),
      () => api.post(`${NEXUS}/api/pad/prompts/${UNKNOWN_ID}/close`),
      () => api.post(`${NEXUS}/api/pad/prompts/${UNKNOWN_ID}/reopen`),
      () => api.post(`${NEXUS}/api/pad/prompts/${UNKNOWN_ID}/key`, { data: { keys: ['A'] } }),
      () => api.post(`${NEXUS}/api/pad/prompts/${UNKNOWN_ID}/reveal`),
      () => api.post(`${NEXUS}/api/pad/prompts/${UNKNOWN_ID}/label`, { data: { label: 'x' } }),
      () => api.get(`${NEXUS}/api/pad/prompts/${UNKNOWN_ID}/participation`),
      () => api.post(`${NEXUS}/api/pad/submit`, { data: { promptId: UNKNOWN_ID, answer: 'A' } }),
      () => api.get(`${NEXUS}/api/pad/sessions/${UNKNOWN_ID}/report`),
      () => api.post(`${NEXUS}/api/pad/sessions/${UNKNOWN_ID}/resend`),
      // The bot endpoint believes only the Bot Framework connector's signed token.
      () => api.post(`${NEXUS}/api/pad/bot/messages`, { data: { type: 'event', channelId: 'msteams', serviceUrl: 'https://attacker.example/' } }),
      () =>
        api.post(`${NEXUS}/api/pad/bot/messages`, {
          headers: { Authorization: 'Bearer eyJhbGciOiJub25lIn0.eyJpc3MiOiJodHRwczovL2FwaS5ib3RmcmFtZXdvcmsuY29tIn0.' },
          data: { type: 'event', channelId: 'msteams', serviceUrl: 'https://attacker.example/' },
        }),
    ];
    for (const send of unauthenticated) {
      const res = await send();
      expect({ url: res.url(), status: res.status() }).toEqual({ url: res.url(), status: 401 });
      await json(res);
    }

    expect((await pad.ask(RIGHT, { sessionId })).status()).toBe(403);
    expect((await pad.close(RIGHT, UNKNOWN_ID)).status()).toBe(403);
    expect((await pad.participation(RIGHT, UNKNOWN_ID)).status()).toBe(403);
    expect((await pad.submit(TEACHER, UNKNOWN_ID, 'A')).status()).toBe(403);
  });

  test('opens one prompt however often ASK is pressed', async () => {
    const invalid: Array<[Record<string, unknown>, string]> = [
      [{ sessionId: 'session-1' }, 'sessionId'],
      [{ sessionId, answerType: 'essay' }, 'answerType'],
      [{ sessionId, optionCount: 9 }, 'optionCount'],
    ];
    for (const [data, field] of invalid) {
      const res = await pad.ask(TEACHER, data);
      expect({ field, status: res.status() }).toEqual({ field, status: 400 });
    }

    const first = await json(await pad.ask(TEACHER, { sessionId, answerType: 'mcq', optionCount: 4 }));
    expect(first).toMatchObject({ sequence: 1, state: 'open', version: 1, changed: true });
    q1 = first.promptId;
    expect(await json(await pad.ask(TEACHER, { sessionId }))).toMatchObject({ promptId: q1, changed: false });

    const intruder = await pad.ask(INTRUDER, { sessionId });
    expect(intruder.status()).toBe(403);
    expect(await json(intruder)).toMatchObject({ code: 'NOT_SESSION_TEACHER' });
  });

  test("locks each student's first answer", async () => {
    expect(await json(await pad.submit(RIGHT, q1, ' b '))).toMatchObject({ status: 'accepted', answer: 'B', rawAnswer: 'b' });
    expect(await json(await pad.submit(RIGHT, q1, 'C'))).toMatchObject({ status: 'duplicate', answer: 'B' });
    expect(await json(await pad.submit(WRONG, q1, 'A'))).toMatchObject({ status: 'accepted', answer: 'A' });

    const beyondOptions = await pad.submit(LATE, q1, 'F');
    expect(beyondOptions.status()).toBe(400);
    expect(await json(beyondOptions)).toMatchObject({ code: 'INVALID_ANSWER' });
    expect(await json(await pad.submit(LATE, q1, '   '))).toMatchObject({ code: 'INVALID_INPUT', field: 'answer' });
  });

  test('shows the teacher a count while OPEN, never names or answers', async () => {
    const snap = await json(await pad.snapshot(TEACHER, sessionId));
    expect(snap.prompt).toMatchObject({ id: q1, state: 'open', answered_count: 2, correct_keys: null });
    expect(snap.groups).toEqual([]);
    expect(snap.counts.answered + snap.counts.silent + snap.counts.absent).toBe(snap.counts.enrolled);

    const details = await pad.participation(TEACHER, q1);
    expect(details.status()).toBe(409);
    expect(await json(details)).toMatchObject({ code: 'PROMPT_OPEN' });

    const mineText = await (await pad.snapshot(RIGHT, sessionId)).text();
    expect(JSON.parse(mineText)).toMatchObject({
      prompt: { id: q1, state: 'open', correct_keys: null, ungraded: null },
      my_response: { answer: 'B', is_correct: null },
    });
    expect(mineText).not.toContain(ids[WRONG]);
  });

  test('refuses a key or a reveal while the prompt is OPEN', async () => {
    for (const res of [await pad.key(TEACHER, q1, { keys: ['B'] }), await pad.reveal(TEACHER, q1)]) {
      expect(res.status()).toBe(409);
      expect(await json(res)).toMatchObject({ code: 'INVALID_TRANSITION', state: 'open' });
    }
  });

  test('stops answers at CLOSE, while a locked answer can still be fetched again', async () => {
    expect(await json(await pad.close(TEACHER, q1))).toMatchObject({ promptId: q1, state: 'closed', changed: true });
    expect(await json(await pad.close(TEACHER, q1))).toMatchObject({ changed: false });

    const late = await pad.submit(LATE, q1, 'D');
    expect(late.status()).toBe(409);
    expect(await json(late)).toMatchObject({ code: 'PROMPT_NOT_OPEN', state: 'closed' });
    expect(await json(await pad.submit(RIGHT, q1, 'B'))).toMatchObject({ status: 'duplicate', answer: 'B' });

    const snap = await json(await pad.snapshot(TEACHER, sessionId));
    expect(snap.groups).toEqual([
      { value: 'A', count: 1 },
      { value: 'B', count: 1 },
    ]);
  });

  test('lets the key change freely and keeps it from students until REVEAL', async () => {
    expect(await json(await pad.key(TEACHER, q1, { keys: ['c'] }))).toMatchObject({ changed: true });
    expect(await json(await pad.key(TEACHER, q1, { keys: ['A', 'B'] }))).toMatchObject({ changed: true });
    expect(await json(await pad.key(TEACHER, q1, { keys: ['b', 'a'] }))).toMatchObject({ changed: false });

    const beyondOptions = await pad.key(TEACHER, q1, { keys: ['E'] });
    expect(beyondOptions.status()).toBe(400);
    expect(await json(beyondOptions)).toMatchObject({ code: 'INVALID_KEY' });

    const studentText = await (await pad.snapshot(RIGHT, sessionId)).text();
    expect(JSON.parse(studentText).prompt.correct_keys).toBeNull();
    expect(studentText).not.toMatch(/"correct_keys":\s*\[/);

    expect((await pad.key(INTRUDER, q1, { keys: ['A'] })).status()).toBe(403);
  });

  test('clears the key at REOPEN and lets the students who had not answered answer', async () => {
    expect(await json(await pad.reopen(TEACHER, q1))).toMatchObject({ state: 'open', changed: true });
    const snap = await json(await pad.snapshot(TEACHER, sessionId));
    expect(snap.prompt).toMatchObject({ state: 'open', correct_keys: null, ungraded: false, answered_count: 2 });

    expect(await json(await pad.submit(LATE, q1, 'd'))).toMatchObject({ status: 'accepted', answer: 'D' });
    expect(await json(await pad.submit(WRONG, q1, 'B'))).toMatchObject({ status: 'duplicate', answer: 'A' });
    expect(await json(await pad.close(TEACHER, q1))).toMatchObject({ state: 'closed' });

    const noKey = await pad.reveal(TEACHER, q1);
    expect(noKey.status()).toBe(409);
    expect(await json(noKey)).toMatchObject({ code: 'KEY_REQUIRED' });
  });

  test('grades everyone at REVEAL, in one step, for good', async () => {
    expect(await json(await pad.key(TEACHER, q1, { keys: ['B'] }))).toMatchObject({ changed: true });
    expect(await json(await pad.label(TEACHER, q1, 'Warm-up'))).toMatchObject({ promptId: q1 });
    expect(await json(await pad.reveal(TEACHER, q1))).toMatchObject({ state: 'revealed', changed: true });
    expect(await json(await pad.reveal(TEACHER, q1))).toMatchObject({ changed: false });

    expect(await json(await pad.snapshot(RIGHT, sessionId))).toMatchObject({
      prompt: { state: 'revealed', correct_keys: ['B'], ungraded: false },
      my_response: { answer: 'B', is_correct: true },
    });
    expect(await json(await pad.snapshot(WRONG, sessionId))).toMatchObject({ my_response: { answer: 'A', is_correct: false } });

    for (const res of [await pad.reopen(TEACHER, q1), await pad.key(TEACHER, q1, { keys: ['A'] })]) {
      expect(res.status()).toBe(409);
      expect(await json(res)).toMatchObject({ code: 'INVALID_TRANSITION', state: 'revealed' });
    }
  });

  test('names every student once in the details after REVEAL', async () => {
    const res = await pad.participation(TEACHER, q1);
    expect(res.status()).toBe(200);
    const { rows } = await json(res);

    const byId = new Map<string, any>(rows.map((row: any) => [row.student_id, row]));
    expect(byId.size).toBe(rows.length);
    expect(byId.get(ids[RIGHT])).toMatchObject({ participation: 'answered', result: 'correct', answer: 'B' });
    expect(byId.get(ids[WRONG])).toMatchObject({ participation: 'answered', result: 'incorrect', answer: 'A' });
    expect(byId.get(ids[LATE])).toMatchObject({ participation: 'answered', result: 'incorrect', answer: 'D' });
    for (const row of rows) {
      expect(['answered', 'silent', 'absent']).toContain(row.participation);
      expect(row.name === null || typeof row.name === 'string').toBe(true);
    }

    const onRoster = rows.filter((row: any) => row.on_roster);
    const snap = await json(await pad.snapshot(TEACHER, sessionId));
    expect(snap.counts).toMatchObject({
      enrolled: onRoster.length,
      correct: onRoster.filter((row: any) => row.result === 'correct').length,
      incorrect: onRoster.filter((row: any) => row.result === 'incorrect').length,
    });
    expect(snap.counts.answered + snap.counts.silent + snap.counts.absent).toBe(snap.counts.enrolled);
    expect(snap.history).toEqual([expect.objectContaining({ id: q1, sequence: 1, label: 'Warm-up', state: 'revealed', answered: 3, correct: 1 })]);

    expect((await pad.participation(INTRUDER, q1)).status()).toBe(403);
  });

  test('starts Q2 at the next ASK, and a poll never grades or scores', async () => {
    const asked = await json(await pad.ask(TEACHER, { sessionId, answerType: 'numeric' }));
    expect(asked).toMatchObject({ sequence: 2, state: 'open', changed: true });
    q2 = asked.promptId;

    expect(await json(await pad.submit(RIGHT, q2, '1,000.50'))).toMatchObject({ status: 'accepted', answer: '1000.5' });
    expect(await json(await pad.submit(WRONG, q2, 'twelve'))).toMatchObject({ code: 'INVALID_ANSWER' });

    expect(await json(await pad.close(TEACHER, q2))).toMatchObject({ state: 'closed' });
    expect(await json(await pad.key(TEACHER, q2, { ungraded: true }))).toMatchObject({ changed: true });
    expect(await json(await pad.reveal(TEACHER, q2))).toMatchObject({ state: 'revealed' });

    const mine = await json(await pad.snapshot(RIGHT, sessionId));
    expect(mine).toMatchObject({ prompt: { id: q2, ungraded: true, correct_keys: null }, my_response: { answer: '1000.5', is_correct: null } });
    // Only Q1 is graded; the poll moves no score.
    expect(mine.score).toEqual({ correct: 1, wrong: 0, skipped: 0, absent: 0, total_graded: 1 });
    expect((await json(await pad.snapshot(WRONG, sessionId))).score).toMatchObject({ correct: 0, wrong: 1, total_graded: 1 });
  });

  test('keeps reminders to the session teacher, sends none without a meeting bot, and limits how often', async () => {
    expect((await pad.resend(INTRUDER, sessionId)).status()).toBe(403);
    expect((await pad.resend(RIGHT, sessionId)).status()).toBe(403);

    // This session was started without a Teams meeting, so there is no meeting to notify.
    expect(await json(await pad.resend(TEACHER, sessionId))).toMatchObject({ recipients: 0, sent: 0, skipped: 'no-meeting' });
    const tooSoon = await pad.resend(TEACHER, sessionId);
    expect(tooSoon.status()).toBe(429);
    expect(await json(tooSoon)).toMatchObject({ code: 'RATE_LIMITED' });
  });

  test('asks before ending with a question still open, then closes it for good', async () => {
    const asked = await json(await pad.ask(TEACHER, { sessionId, answerType: 'yesno' }));
    expect(asked).toMatchObject({ sequence: 3, state: 'open' });

    const unconfirmed = await pad.end(TEACHER, sessionId, false);
    expect(unconfirmed.status()).toBe(409);
    expect(await json(unconfirmed)).toMatchObject({ code: 'UNREVEALED_PROMPT', sequence: 3 });
    expect(await json(await pad.end(TEACHER, sessionId, true))).toEqual({ changed: true });

    const afterEnd = await pad.submit(RIGHT, asked.promptId, 'yes');
    expect(afterEnd.status()).toBe(409);
    expect(await json(afterEnd)).toMatchObject({ code: 'SESSION_NOT_LIVE' });
    expect((await json(await pad.snapshot(RIGHT, sessionId))).session.status).toBe('ended');
  });

  test("reports every question and every student, with the score each student's pad showed", async () => {
    const res = await pad.report(TEACHER, sessionId);
    expect(res.status()).toBe(200);
    const report = await json(res);

    expect(report.session).toMatchObject({ id: sessionId, status: 'ended' });
    expect(report.prompts.map((p: any) => [p.sequence, p.state, p.ungraded])).toEqual([
      [1, 'revealed', false],
      [2, 'revealed', true],
      // Still open when the class ended, so closed and never graded.
      [3, 'closed', false],
    ]);
    expect(report.prompts[0]).toMatchObject({ label: 'Warm-up', correct_keys: ['B'] });
    for (const prompt of report.prompts) {
      expect(prompt.counts.answered + prompt.counts.silent + prompt.counts.absent).toBe(prompt.counts.enrolled);
    }

    expect(report.students.filter((s: any) => s.on_roster)).toHaveLength(report.session.enrolled);
    const byId = new Map<string, any>(report.students.map((s: any) => [s.student_id, s]));
    expect(byId.size).toBe(report.students.length);
    for (const row of report.students) {
      // Every question that is no longer open puts each student in exactly one group.
      expect(row.answered + row.silent + row.absent).toBe(3);
    }

    // The report and the pad are one definition of the score (v3.1 section 11).
    for (const email of [RIGHT, WRONG, LATE]) {
      const { score } = await json(await pad.snapshot(email, sessionId));
      expect(byId.get(ids[email])).toMatchObject({
        correct: score.correct,
        wrong: score.wrong,
        skipped: score.skipped,
        total_graded: score.total_graded,
      });
    }
    expect(byId.get(ids[RIGHT])).toMatchObject({ correct: 1, wrong: 0, total_graded: 1 });
    expect(byId.get(ids[LATE])).toMatchObject({ correct: 0, wrong: 1, total_graded: 1 });

    expect((await pad.report(INTRUDER, sessionId)).status()).toBe(403);
    expect((await pad.report(RIGHT, sessionId)).status()).toBe(403);
    const unknown = await pad.report(TEACHER, UNKNOWN_ID);
    expect(unknown.status()).toBe(404);
    await json(unknown);
  });

  test('refuses another teacher on every prompt route, and answers 404 for an unknown prompt', async () => {
    for (const res of [
      await pad.close(INTRUDER, q2),
      await pad.reopen(INTRUDER, q2),
      await pad.reveal(INTRUDER, q2),
      await pad.label(INTRUDER, q2, 'not mine'),
      await pad.participation(INTRUDER, q2),
    ]) {
      expect({ url: res.url(), status: res.status() }).toEqual({ url: res.url(), status: 403 });
      await json(res);
    }

    for (const res of [
      await pad.close(TEACHER, UNKNOWN_ID),
      await pad.key(TEACHER, UNKNOWN_ID, { keys: ['A'] }),
      await pad.participation(TEACHER, UNKNOWN_ID),
      await pad.submit(RIGHT, UNKNOWN_ID, 'A'),
      await pad.close(TEACHER, 'not-a-uuid'),
    ]) {
      expect({ url: res.url(), status: res.status() }).toEqual({ url: res.url(), status: 404 });
      await json(res);
    }
  });
});
