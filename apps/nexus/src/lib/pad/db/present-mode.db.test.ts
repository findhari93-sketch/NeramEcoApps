// @vitest-environment node
/**
 * Present to class (migration 20261028090000): a prompt asked from the question
 * bank with a time limit. The question's content reaches students without its
 * answer, answers stop at the deadline, time can be added, Reveal grades with
 * the bank's answer, and the class meeting takes over a browser session.
 * Every assertion runs the real migration SQL in PGlite.
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
}

async function liveSession(students = 2): Promise<LiveSession> {
  const fixture = await t.classWithStudents(students);
  const started = await t.start(fixture.teacherId, fixture.classroomId);
  expect(started).toMatchObject({ ok: true });
  return { ...fixture, sessionId: started.session_id };
}

/** Q.38 from the bank, answer B, with a 60 second timer. */
async function askFromBank(s: LiveSession, opts: { timeLimit?: number | null; suggestedKeys?: string[] | null } = {}) {
  const qb = await t.qbQuestion();
  const asked = await t.ask(s.teacherId, s.sessionId, 'mcq', 4, {
    label: '38',
    qbQuestionId: qb,
    timeLimit: opts.timeLimit === undefined ? 60 : opts.timeLimit,
    suggestedKeys: opts.suggestedKeys === undefined ? ['b'] : opts.suggestedKeys,
  });
  expect(asked).toMatchObject({ ok: true, changed: true });
  return { qb, promptId: asked.prompt_id as string, asked };
}

describe('asking from the question bank', () => {
  it('stores the link, the deadline and the normalised suggested answer', async () => {
    const s = await liveSession();
    const { qb, promptId, asked } = await askFromBank(s);
    expect(asked.closes_at).toBeTruthy();

    const [row] = await t.rows(`select qb_question_id, time_limit_s, closes_at, opened_at, suggested_keys from pad_prompts where id = $1`, [promptId]);
    expect(row.qb_question_id).toBe(qb);
    expect(row.time_limit_s).toBe(60);
    const seconds = (new Date(row.closes_at).getTime() - new Date(row.opened_at).getTime()) / 1000;
    expect(seconds).toBeGreaterThan(59);
    expect(seconds).toBeLessThan(61);
    expect(row.suggested_keys).toEqual(['B']);
  });

  it('refuses a suggested answer beyond the options, an unknown question and a time limit out of range', async () => {
    const s = await liveSession();
    const qb = await t.qbQuestion();
    expect(await t.ask(s.teacherId, s.sessionId, 'mcq', 4, { qbQuestionId: qb, suggestedKeys: ['E'] })).toMatchObject({
      ok: false,
      code: 'INVALID_INPUT',
      field: 'suggested_keys',
    });
    expect(
      await t.ask(s.teacherId, s.sessionId, 'mcq', 4, { qbQuestionId: '00000000-0000-4000-8000-000000000000' }),
    ).toMatchObject({ ok: false, code: 'INVALID_INPUT', field: 'qb_question' });
    expect(await t.ask(s.teacherId, s.sessionId, 'mcq', 4, { timeLimit: 2 })).toMatchObject({
      ok: false,
      code: 'INVALID_INPUT',
      field: 'time_limit',
    });
    expect(await t.ask(s.teacherId, s.sessionId, 'numeric', null, { suggestedKeys: ['two'] })).toMatchObject({
      ok: false,
      field: 'suggested_keys',
    });
  });

  it('a numeric suggested answer is normalised like a key', async () => {
    const s = await liveSession();
    const qb = await t.qbQuestion({ format: 'NUMERICAL', options: null, correctAnswer: '12.50' });
    const asked = await t.ask(s.teacherId, s.sessionId, 'numeric', null, { qbQuestionId: qb, suggestedKeys: ['012.50'] });
    const [row] = await t.rows(`select suggested_keys from pad_prompts where id = $1`, [asked.prompt_id]);
    expect(row.suggested_keys).toEqual(['12.5']);
  });

  it('a question asked without the bank or a timer behaves exactly as before', async () => {
    const s = await liveSession();
    const asked = await t.ask(s.teacherId, s.sessionId);
    const snap = await t.studentSnapshot(s.students[0], s.sessionId);
    expect(snap.prompt).toMatchObject({ id: asked.prompt_id, closes_at: null, time_limit_s: null, qb: null });
    expect(snap.auto_closed).toBe(false);
  });
});

describe('what students see', () => {
  it("shows the bank question's text, picture and options, never its answer", async () => {
    const s = await liveSession();
    const { promptId } = await askFromBank(s);

    for (const phase of ['open', 'closed', 'revealed'] as const) {
      if (phase === 'closed') await t.close(s.teacherId, promptId);
      if (phase === 'revealed') expect(await t.reveal(s.teacherId, promptId)).toMatchObject({ ok: true });

      const snap = await t.studentSnapshot(s.students[0], s.sessionId);
      expect(snap.prompt.qb).toMatchObject({
        format: 'MCQ',
        text: 'Which of these is a dome?',
        options: [
          { text: 'Arch', image_url: null },
          { text: 'Dome', image_url: 'https://cdn.test/b.png' },
          { text: 'Beam', image_url: null },
          { text: 'Truss', image_url: null },
        ],
        solution: null,
      });
      expect(snap.prompt).not.toHaveProperty('suggested_keys');
      expect(snap.prompt).not.toHaveProperty('qb_question_id');
      const json = JSON.stringify(snap.prompt.qb);
      expect(json).not.toContain('is_correct');
      expect(json).not.toContain('correct_answer');
      expect(json).not.toContain('"id"');
      if (phase !== 'revealed') expect(snap.prompt.correct_keys).toBeNull();
    }
  });

  it('the teacher sees the suggested answer, the link and the solution once revealed', async () => {
    const s = await liveSession();
    const { qb, promptId } = await askFromBank(s);
    let snap = await t.teacherSnapshot(s.teacherId, s.sessionId, s.students);
    expect(snap.prompt).toMatchObject({ qb_question_id: qb, suggested_keys: ['B'], time_limit_s: 60 });
    expect(snap.prompt.qb.solution).toBeNull();
    expect(snap.history[0].qb_question_id).toBe(qb);
    expect(snap.history[0].suggested_keys).toEqual(['B']);

    await t.close(s.teacherId, promptId);
    await t.reveal(s.teacherId, promptId);
    snap = await t.teacherSnapshot(s.teacherId, s.sessionId, s.students);
    expect(snap.prompt.qb.solution).toEqual({ explanation: 'A dome is a curved roof.', image_url: null });
  });
});

describe('the time limit', () => {
  it('takes an answer inside the 2 second grace and refuses one after it', async () => {
    const s = await liveSession();
    const { promptId } = await askFromBank(s);

    await t.moveDeadline(promptId, -1);
    expect(await t.submit(s.students[0], promptId, 'B')).toMatchObject({ ok: true, status: 'accepted' });

    await t.moveDeadline(promptId, -5);
    expect(await t.submit(s.students[1], promptId, 'A')).toMatchObject({
      ok: false,
      code: 'PROMPT_NOT_OPEN',
      state: 'closed',
      time_up: true,
    });
    // The answer that counted is still a success on retry, and cannot change.
    expect(await t.submit(s.students[0], promptId, 'B')).toMatchObject({ ok: true, status: 'unchanged' });
    expect(await t.submit(s.students[0], promptId, 'C')).toMatchObject({ ok: false, time_up: true, answer: 'B' });
  });

  it('the next snapshot read closes a question whose time is up, at the deadline', async () => {
    const s = await liveSession();
    const { promptId } = await askFromBank(s);
    await t.moveDeadline(promptId, -10);

    const snap = await t.studentSnapshot(s.students[0], s.sessionId);
    expect(snap.auto_closed).toBe(true);
    expect(snap.prompt.state).toBe('closed');

    const [row] = await t.rows(`select closed_at, closes_at from pad_prompts where id = $1`, [promptId]);
    expect(new Date(row.closed_at).getTime() - new Date(row.closes_at).getTime()).toBe(2000);

    // Once only.
    expect((await t.teacherSnapshot(s.teacherId, s.sessionId, s.students)).auto_closed).toBe(false);
    const closes = (await t.events(s.sessionId)).filter((e) => e.action === 'close');
    expect(closes).toHaveLength(1);
    expect(closes[0]).toMatchObject({ actor_id: null, detail: { auto: 'time_up' } });
  });

  it('a question whose time is not up stays open', async () => {
    const s = await liveSession();
    await askFromBank(s);
    const snap = await t.teacherSnapshot(s.teacherId, s.sessionId, s.students);
    expect(snap.auto_closed).toBe(false);
    expect(snap.prompt.state).toBe('open');
  });

  it('adds time to an open question, from now once its time is up', async () => {
    const s = await liveSession();
    const { promptId } = await askFromBank(s, { timeLimit: 30 });
    const [before] = await t.rows(`select closes_at from pad_prompts where id = $1`, [promptId]);

    const added = await t.setTimer(s.teacherId, promptId, 15);
    expect(added).toMatchObject({ ok: true, state: 'open', reopened: false });
    expect(new Date(added.closes_at).getTime() - new Date(before.closes_at).getTime()).toBe(15_000);

    await t.moveDeadline(promptId, -1);
    const late = await t.setTimer(s.teacherId, promptId, 15);
    const fromNow = (new Date(late.closes_at).getTime() - Date.now()) / 1000;
    expect(fromNow).toBeGreaterThan(13);
    expect(fromNow).toBeLessThan(17);
  });

  it('more time on the newest closed question opens it again; older ones refuse', async () => {
    const s = await liveSession();
    const first = await askFromBank(s);
    await t.close(s.teacherId, first.promptId);

    const more = await t.setTimer(s.teacherId, first.promptId, 15);
    expect(more).toMatchObject({ ok: true, state: 'open', reopened: true });
    expect(await t.submit(s.students[0], first.promptId, 'B')).toMatchObject({ ok: true });

    const second = await t.ask(s.teacherId, s.sessionId, 'mcq', 4, { closePromptId: first.promptId });
    expect(second.ok).toBe(true);
    expect(await t.setTimer(s.teacherId, first.promptId, 15)).toMatchObject({ ok: false, code: 'NOT_LATEST_PROMPT' });
  });

  it('starts a timer on a question that had none, and can stop it', async () => {
    const s = await liveSession();
    const asked = await t.ask(s.teacherId, s.sessionId);
    expect((await t.setTimer(s.teacherId, asked.prompt_id, 30)).closes_at).toBeTruthy();
    expect(await t.setTimer(s.teacherId, asked.prompt_id, null, true)).toMatchObject({ ok: true, closes_at: null });
  });

  it('refuses a stranger and an amount out of range', async () => {
    const s = await liveSession();
    const { promptId } = await askFromBank(s);
    const other = await t.user('teacher');
    expect(await t.setTimer(other, promptId, 15)).toMatchObject({ ok: false, code: 'NOT_SESSION_TEACHER' });
    expect(await t.setTimer(s.teacherId, promptId, 0)).toMatchObject({ ok: false, code: 'INVALID_INPUT' });
    expect(await t.setTimer(s.teacherId, promptId, 601)).toMatchObject({ ok: false, code: 'INVALID_INPUT' });
  });

  it('Reopen clears the deadline, so the next read does not close it again', async () => {
    const s = await liveSession();
    const { promptId } = await askFromBank(s);
    await t.moveDeadline(promptId, -10);
    await t.studentSnapshot(s.students[0], s.sessionId);
    expect(await t.reopen(s.teacherId, promptId)).toMatchObject({ ok: true, state: 'open' });

    const snap = await t.teacherSnapshot(s.teacherId, s.sessionId, s.students);
    expect(snap.prompt).toMatchObject({ state: 'open', closes_at: null });
    expect(snap.auto_closed).toBe(false);
  });

  it('the deadline cannot be written outside the pad functions', async () => {
    const s = await liveSession();
    const { promptId } = await askFromBank(s);
    await expect(t.rows(`update pad_prompts set closes_at = now() + interval '1 hour' where id = $1`, [promptId])).rejects.toThrow(
      /transition functions/,
    );
    await expect(t.rows(`update pad_prompts set suggested_keys = '{A}' where id = $1`, [promptId])).rejects.toThrow(
      /transition functions/,
    );
    const other = await t.qbQuestion();
    await expect(t.rows(`update pad_prompts set qb_question_id = $2 where id = $1`, [promptId, other])).rejects.toThrow(
      /question bank link/,
    );
  });
});

describe('Reveal with the question bank answer', () => {
  it('grades with the suggested answer when no key was chosen', async () => {
    const s = await liveSession();
    const { promptId } = await askFromBank(s);
    await t.submit(s.students[0], promptId, 'B');
    await t.submit(s.students[1], promptId, 'C');
    await t.close(s.teacherId, promptId);

    expect(await t.reveal(s.teacherId, promptId)).toMatchObject({ ok: true, state: 'revealed' });
    const graded = await t.rows(`select student_id, is_correct from pad_responses where prompt_id = $1`, [promptId]);
    expect(Object.fromEntries(graded.map((r: any) => [r.student_id, r.is_correct]))).toEqual({
      [s.students[0]]: true,
      [s.students[1]]: false,
    });
    const [row] = await t.rows(`select correct_keys from pad_prompts where id = $1`, [promptId]);
    expect(row.correct_keys).toEqual(['B']);
    const reveal = (await t.events(s.sessionId)).find((e) => e.action === 'reveal');
    expect(reveal?.detail.key_from).toBe('qb');
  });

  it("a key the teacher chooses wins over the bank's", async () => {
    const s = await liveSession();
    const { promptId } = await askFromBank(s);
    await t.submit(s.students[0], promptId, 'C');
    await t.close(s.teacherId, promptId);
    await t.setKey(s.teacherId, promptId, ['C']);
    await t.reveal(s.teacherId, promptId);
    const [graded] = await t.rows(`select is_correct from pad_responses where prompt_id = $1`, [promptId]);
    expect(graded.is_correct).toBe(true);
  });

  it('still needs a key when the bank had none', async () => {
    const s = await liveSession();
    const { promptId } = await askFromBank(s, { suggestedKeys: null });
    await t.close(s.teacherId, promptId);
    expect(await t.reveal(s.teacherId, promptId)).toMatchObject({ ok: false, code: 'KEY_REQUIRED' });
  });
});

describe('the question bank link', () => {
  it('deleting the bank question keeps the prompt and drops the link', async () => {
    const s = await liveSession();
    const { qb, promptId } = await askFromBank(s);
    await t.rows(`delete from nexus_qb_questions where id = $1`, [qb]);
    const [row] = await t.rows(`select qb_question_id, state from pad_prompts where id = $1`, [promptId]);
    expect(row).toEqual({ qb_question_id: null, state: 'open' });
    expect((await t.studentSnapshot(s.students[0], s.sessionId)).prompt.qb).toBeNull();
  });
});

describe('the meeting takes over a browser session', () => {
  it('binds a live browser session for the same class to the meeting', async () => {
    const fixture = await t.classWithStudents(1);
    const browser = await t.start(fixture.teacherId, fixture.classroomId);
    expect(browser).toMatchObject({ ok: true, resumed: false });

    const meeting = await t.start(fixture.teacherId, fixture.classroomId, { meetingId: 'meeting-present-1' });
    expect(meeting).toMatchObject({ ok: true, resumed: true, session_id: browser.session_id });
    const [row] = await t.rows(`select meeting_id from pad_sessions where id = $1`, [browser.session_id]);
    expect(row.meeting_id).toBe('meeting-present-1');

    // Students in the meeting now find it.
    expect(await t.joinByMeeting(fixture.students[0], 'meeting-present-1')).toMatchObject({ ok: true });
  });

  it('a session for another class is still a conflict', async () => {
    const fixture = await t.classWithStudents(1);
    await t.start(fixture.teacherId, fixture.classroomId);
    const otherClass = await t.classroom('Other');
    expect(await t.start(fixture.teacherId, otherClass, { meetingId: 'meeting-present-2' })).toMatchObject({
      ok: false,
      code: 'SESSION_CONFLICT',
    });
  });
});

describe('the TypeScript copy of pad_normalize', () => {
  it('gives the same numeric and text answers as the database', async () => {
    const { normalizeNumeric, normalizeText } = await import('@/lib/qb-present/answer-plan');
    const numeric = ['012.50', '-0', '1,000', '+3.0', '.5', '7.', '-0.010', '1 000', 'abc', '', '  42  ', '1e3'];
    const text = ['  Gwalior   Fort. ', 'Yes!!', '2 : 3', 'A', '   '];
    for (const raw of numeric) {
      const [row] = await t.rows<{ v: string | null }>(`select pad_normalize('numeric', $1) as v`, [raw]);
      expect(normalizeNumeric(raw), raw).toBe(row.v);
    }
    for (const raw of text) {
      const [row] = await t.rows<{ v: string | null }>(`select pad_normalize('text', $1) as v`, [raw]);
      expect(normalizeText(raw), raw).toBe(row.v);
    }
  });
});
