// @vitest-environment node
/**
 * Answer Pad student paths: submit, join, heartbeat, the student snapshot and
 * answer normalisation (spec sections 4, 6, 7, 9, 10 and 12).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PadTestDb, type ClassFixture } from './test-harness';

let t: PadTestDb;

beforeAll(async () => {
  t = await PadTestDb.create();
}, 120_000);

afterAll(async () => {
  await t?.dispose();
});

interface LiveSession extends ClassFixture {
  sessionId: string;
  roomCode: string;
}

async function liveSession(students = 3, opts: { meetingId?: string } = {}): Promise<LiveSession> {
  const fixture = await t.classWithStudents(students);
  const started = await t.start(fixture.teacherId, fixture.classroomId, opts);
  expect(started.ok).toBe(true);
  const [row] = await t.rows<{ room_code: string }>(`select room_code from pad_sessions where id = $1`, [started.session_id]);
  return { ...fixture, sessionId: started.session_id, roomCode: row.room_code };
}

async function openPrompt(s: LiveSession, type = 'mcq', options: number | null = 4): Promise<string> {
  const asked = await t.ask(s.teacherId, s.sessionId, type, type === 'mcq' ? options : null);
  expect(asked.ok).toBe(true);
  return asked.prompt_id;
}

describe('SUBMIT', () => {
  it('accepts an enrolled student and returns the normalised answer', async () => {
    const s = await liveSession();
    const promptId = await openPrompt(s);
    const res = await t.submit(s.students[0], promptId, ' c ');
    expect(res).toMatchObject({ ok: true, status: 'accepted', answer: 'C', raw_answer: 'c' });
    expect(res.responded_at).toBeTruthy();
  });

  it('keeps the first answer: a duplicate or a different second answer returns the first', async () => {
    const s = await liveSession();
    const promptId = await openPrompt(s);
    await t.submit(s.students[0], promptId, 'C');
    expect(await t.submit(s.students[0], promptId, 'C')).toMatchObject({ ok: true, status: 'duplicate', answer: 'C' });
    expect(await t.submit(s.students[0], promptId, 'A')).toMatchObject({ ok: true, status: 'duplicate', answer: 'C' });
    const [{ n }] = await t.rows<{ n: number }>(`select count(*)::int as n from pad_responses where prompt_id = $1`, [promptId]);
    expect(n).toBe(1);
  });

  it('returns the locked answer to a retry that arrives after CLOSE', async () => {
    const s = await liveSession();
    const promptId = await openPrompt(s);
    await t.submit(s.students[0], promptId, 'B');
    await t.close(s.teacherId, promptId);
    expect(await t.submit(s.students[0], promptId, 'B')).toMatchObject({ ok: true, status: 'duplicate', answer: 'B' });
  });

  it('rejects a first answer after CLOSE and after REVEAL, and logs it', async () => {
    const s = await liveSession(2);
    const promptId = await openPrompt(s);
    await t.close(s.teacherId, promptId);
    expect(await t.submit(s.students[0], promptId, 'A')).toEqual({ ok: false, code: 'PROMPT_NOT_OPEN', state: 'closed' });
    await t.setKey(s.teacherId, promptId, ['A']);
    await t.reveal(s.teacherId, promptId);
    expect(await t.submit(s.students[1], promptId, 'A')).toEqual({ ok: false, code: 'PROMPT_NOT_OPEN', state: 'revealed' });

    const rejected = (await t.events(s.sessionId)).filter((e) => e.action === 'submit_rejected');
    expect(rejected.map((e) => e.detail.code)).toEqual(['PROMPT_NOT_OPEN', 'PROMPT_NOT_OPEN']);
  });

  it('rejects anyone not actively enrolled as a student in the session classroom', async () => {
    const s = await liveSession(1);
    const promptId = await openPrompt(s);

    const outsider = await t.user('student');
    const otherClassroom = await t.classroom('Other');
    await t.enroll(outsider, otherClassroom);
    expect(await t.submit(outsider, promptId, 'A')).toEqual({ ok: false, code: 'NOT_ENROLLED' });

    const removed = await t.user('student');
    await t.enroll(removed, s.classroomId, { active: false });
    expect(await t.submit(removed, promptId, 'A')).toEqual({ ok: false, code: 'NOT_ENROLLED' });

    // A teacher enrollment is not a student enrollment, and neither is the session teacher.
    expect(await t.submit(s.teacherId, promptId, 'A')).toEqual({ ok: false, code: 'NOT_ENROLLED' });
    expect(await t.submit(null, promptId, 'A')).toEqual({ ok: false, code: 'NOT_ENROLLED' });
  });

  it('still accepts a dormant student: dormancy is monitoring, not access', async () => {
    const s = await liveSession(0);
    const dormant = await t.user('student');
    await t.enroll(dormant, s.classroomId, { participation: 'dormant' });
    const promptId = await openPrompt(s);
    expect(await t.submit(dormant, promptId, 'A')).toMatchObject({ ok: true, status: 'accepted' });
  });

  it('rejects answers that are not valid for the prompt', async () => {
    const s = await liveSession(1);
    const mcq = await openPrompt(s, 'mcq', 4);
    for (const bad of ['E', 'Z', 'AB', '', '   ', null]) {
      expect(await t.submit(s.students[0], mcq, bad)).toEqual({ ok: false, code: 'INVALID_ANSWER' });
    }
    await t.close(s.teacherId, mcq);
    await t.setKey(s.teacherId, mcq, null, true);
    await t.reveal(s.teacherId, mcq);

    const numeric = await openPrompt(s, 'numeric', null);
    for (const bad of ['abc', '4.2.1', '42m', '--1']) {
      expect(await t.submit(s.students[0], numeric, bad)).toEqual({ ok: false, code: 'INVALID_ANSWER' });
    }
    expect(await t.submit(s.students[0], numeric, '1,000.50')).toMatchObject({ ok: true, answer: '1000.5' });
  });

  it('rejects a submit once the session has ended', async () => {
    const s = await liveSession(1);
    const promptId = await openPrompt(s);
    await t.end(s.teacherId, s.sessionId, true);
    // Ending closes the open prompt, so either refusal is correct; it must not be accepted.
    const res = await t.submit(s.students[0], promptId, 'A');
    expect(res.ok).toBe(false);
    expect(['SESSION_NOT_LIVE', 'PROMPT_NOT_OPEN']).toContain(res.code);
  });

  it('records application presence when a student answers', async () => {
    const s = await liveSession(1);
    const promptId = await openPrompt(s);
    await t.submit(s.students[0], promptId, 'A');
    const rows = await t.rows(`select 1 from pad_app_presence where session_id = $1 and student_id = $2`, [s.sessionId, s.students[0]]);
    expect(rows).toHaveLength(1);
  });

  it('returns NOT_FOUND for an unknown prompt', async () => {
    const s = await liveSession(1);
    expect(await t.submit(s.students[0], '00000000-0000-0000-0000-000000000000', 'A')).toEqual({ ok: false, code: 'NOT_FOUND' });
  });
});

describe('joining', () => {
  it('binds an enrolled student to the live session by room code', async () => {
    const s = await liveSession(1);
    expect(await t.joinByCode(s.students[0], s.roomCode)).toEqual({ ok: true, session_id: s.sessionId });
    expect(await t.joinByCode(s.students[0], `${s.roomCode.slice(0, 3)} ${s.roomCode.slice(3)}`)).toEqual({
      ok: true,
      session_id: s.sessionId,
    });
  });

  it('never lets the room code authenticate anyone on its own', async () => {
    const s = await liveSession(1);
    expect(await t.joinByCode(null, s.roomCode)).toEqual({ ok: false, code: 'NOT_ENROLLED' });
    const outsider = await t.user('student');
    expect(await t.joinByCode(outsider, s.roomCode)).toEqual({ ok: false, code: 'NOT_ENROLLED' });
  });

  it('rejects a wrong code and the code of an ended session', async () => {
    const s = await liveSession(1);
    const wrong = s.roomCode === '000000' ? '111111' : '000000';
    expect(await t.joinByCode(s.students[0], wrong)).toEqual({ ok: false, code: 'ROOM_CODE_INVALID' });
    await t.end(s.teacherId, s.sessionId);
    expect(await t.joinByCode(s.students[0], s.roomCode)).toEqual({ ok: false, code: 'ROOM_CODE_INVALID' });
  });

  it('rate limits a student after 8 failed attempts in 10 minutes, even with the right code', async () => {
    const s = await liveSession(1);
    const wrong = s.roomCode === '000000' ? '111111' : '000000';
    for (let i = 0; i < 8; i += 1) {
      expect((await t.joinByCode(s.students[0], wrong)).code).toBe('ROOM_CODE_INVALID');
    }
    expect(await t.joinByCode(s.students[0], s.roomCode)).toEqual({ ok: false, code: 'RATE_LIMITED' });
  });

  it('rate limits an IP address after 40 failed attempts across accounts', async () => {
    const s = await liveSession(0);
    const wrong = s.roomCode === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i += 1) {
      const account = await t.user('student');
      for (let j = 0; j < 8; j += 1) await t.joinByCode(account, wrong, 'ip-hash-1');
    }
    const fresh = await t.user('student');
    await t.enroll(fresh, s.classroomId);
    expect(await t.joinByCode(fresh, s.roomCode, 'ip-hash-1')).toEqual({ ok: false, code: 'RATE_LIMITED' });
    expect(await t.joinByCode(fresh, s.roomCode, 'ip-hash-2')).toEqual({ ok: true, session_id: s.sessionId });
  });

  it('finds the live session for a Teams meeting, or tells the student to wait', async () => {
    const fixture = await t.classWithStudents(1);
    expect(await t.joinByMeeting(fixture.students[0], 'meeting-join')).toEqual({ ok: true, session_id: null });
    const started = await t.start(fixture.teacherId, fixture.classroomId, { meetingId: 'meeting-join' });
    expect(await t.joinByMeeting(fixture.students[0], 'meeting-join')).toEqual({ ok: true, session_id: started.session_id });
    const outsider = await t.user('student');
    expect(await t.joinByMeeting(outsider, 'meeting-join')).toEqual({ ok: false, code: 'NOT_ENROLLED' });
  });

  it('keeps one presence interval alive with heartbeats and starts a new one after a gap', async () => {
    const s = await liveSession(1);
    await t.heartbeat(s.students[0], s.sessionId);
    await t.heartbeat(s.students[0], s.sessionId);
    let rows = await t.rows(`select id from pad_app_presence where session_id = $1`, [s.sessionId]);
    expect(rows).toHaveLength(1);

    await t.rows(`update pad_app_presence set joined_at = now() - interval '10 minutes', last_seen_at = now() - interval '5 minutes'`);
    await t.heartbeat(s.students[0], s.sessionId);
    rows = await t.rows(`select id from pad_app_presence where session_id = $1`, [s.sessionId]);
    expect(rows).toHaveLength(2);

    const outsider = await t.user('student');
    expect(await t.heartbeat(outsider, s.sessionId)).toEqual({ ok: false, code: 'NOT_ENROLLED' });
  });
});

describe('student snapshot', () => {
  it('refuses anyone not enrolled', async () => {
    const s = await liveSession(1);
    const outsider = await t.user('student');
    expect(await t.studentSnapshot(outsider, s.sessionId)).toEqual({ ok: false, code: 'NOT_ENROLLED' });
    expect(await t.studentSnapshot(s.teacherId, s.sessionId)).toEqual({ ok: false, code: 'NOT_ENROLLED' });
  });

  it('shows an idle session before the first ASK, with no room code or teacher topic', async () => {
    const s = await liveSession(1);
    const snap = await t.studentSnapshot(s.students[0], s.sessionId);
    expect(snap).toMatchObject({ ok: true, role: 'student', prompt: null, my_response: null });
    expect(snap.session.hint_topic).toBeTruthy();
    const text = JSON.stringify(snap);
    const [row] = await t.rows<{ teacher_topic: string }>(`select teacher_topic from pad_sessions where id = $1`, [s.sessionId]);
    expect(text).not.toContain(row.teacher_topic);
    expect(text).not.toContain(s.roomCode);
  });

  it('never carries the key, the grading choice or any result before Reveal', async () => {
    const s = await liveSession(2);
    const promptId = await openPrompt(s);
    await t.submit(s.students[0], promptId, 'A');
    await t.close(s.teacherId, promptId);
    await t.setKey(s.teacherId, promptId, ['A']);

    const snap = await t.studentSnapshot(s.students[0], s.sessionId);
    expect(snap.prompt).toMatchObject({ state: 'closed', correct_keys: null, ungraded: null });
    expect(snap.my_response).toMatchObject({ answer: 'A', is_correct: null });
  });

  it("never shows another student's answer, before or after Reveal", async () => {
    const s = await liveSession(2);
    const promptId = await openPrompt(s);
    await t.submit(s.students[0], promptId, 'A');
    await t.submit(s.students[1], promptId, 'D');

    for (const phase of ['open', 'revealed']) {
      if (phase === 'revealed') {
        await t.close(s.teacherId, promptId);
        await t.setKey(s.teacherId, promptId, ['A']);
        await t.reveal(s.teacherId, promptId);
      }
      const snap = await t.studentSnapshot(s.students[0], s.sessionId);
      const text = JSON.stringify(snap);
      expect(text).not.toContain(s.students[1]);
      expect(snap.my_response.answer).toBe('A');
      expect(text).not.toMatch(/"D"/);
      expect(snap).not.toHaveProperty('counts');
      expect(snap).not.toHaveProperty('groups');
    }
  });

  it('shows the key and the result after Reveal, and the poll marker for an ungraded prompt', async () => {
    const s = await liveSession(2);
    const q1 = await openPrompt(s);
    await t.submit(s.students[0], q1, 'B');
    await t.close(s.teacherId, q1);
    await t.setKey(s.teacherId, q1, ['C']);
    await t.reveal(s.teacherId, q1);

    let snap = await t.studentSnapshot(s.students[0], s.sessionId);
    expect(snap.prompt).toMatchObject({ state: 'revealed', correct_keys: ['C'], ungraded: false });
    expect(snap.my_response).toMatchObject({ answer: 'B', is_correct: false });

    const silent = await t.studentSnapshot(s.students[1], s.sessionId);
    expect(silent.my_response).toBeNull();
    expect(silent.prompt.correct_keys).toEqual(['C']);

    const q2 = await openPrompt(s);
    await t.submit(s.students[0], q2, 'A');
    await t.close(s.teacherId, q2);
    await t.setKey(s.teacherId, q2, null, true);
    await t.reveal(s.teacherId, q2);
    snap = await t.studentSnapshot(s.students[0], s.sessionId);
    expect(snap.prompt).toMatchObject({ state: 'revealed', ungraded: true, correct_keys: null });
    expect(snap.my_response.is_correct).toBeNull();
  });

  it('records presence when asked to touch', async () => {
    const s = await liveSession(1);
    await t.studentSnapshot(s.students[0], s.sessionId, true);
    const rows = await t.rows(`select 1 from pad_app_presence where session_id = $1`, [s.sessionId]);
    expect(rows).toHaveLength(1);
  });
});

describe('answer normalisation', () => {
  const cases: Array<[string, string | null, string | null]> = [
    ['mcq', 'a', 'A'],
    ['mcq', ' F ', 'F'],
    ['mcq', 'G', null],
    ['mcq', 'AB', null],
    ['yesno', 'Yes', 'yes'],
    ['yesno', 'y', 'yes'],
    ['yesno', 'NO', 'no'],
    ['yesno', 'maybe', null],
    ['numeric', '42', '42'],
    ['numeric', '42.0', '42'],
    ['numeric', '042.500', '42.5'],
    ['numeric', '+7', '7'],
    ['numeric', '-0.0', '0'],
    ['numeric', '-3.10', '-3.1'],
    ['numeric', '.5', '0.5'],
    ['numeric', '5.', '5'],
    ['numeric', '1,000', '1000'],
    ['numeric', '1 000', '1000'],
    ['numeric', '4.2.1', null],
    ['numeric', '42 m', null],
    ['numeric', '1e3', null],
    ['text', '  Cantilever   Beam. ', 'cantilever beam'],
    ['text', 'Truss!?', 'truss'],
    ['text', '...', null],
    ['text', 'x'.repeat(101), null],
    ['essay', 'anything', null],
    ['mcq', null, null],
    ['text', '', null],
  ];

  it.each(cases)('%s %j -> %j', async (type, raw, expected) => {
    expect(await t.normalize(type, raw)).toBe(expected);
  });
});
