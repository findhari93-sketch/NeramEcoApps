// @vitest-environment node
/**
 * Answer Pad rounds and results (migration 20261024090000): who joined, close
 * and ask in one call, excused reasons, the next round, round results, publish
 * and what each student may see.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PadTestDb, at, type ClassFixture, type Json } from './test-harness';

let t: PadTestDb;

beforeAll(async () => {
  t = await PadTestDb.create();
}, 120_000);

afterAll(async () => {
  await t?.dispose();
});

interface Round extends ClassFixture {
  sessionId: string;
  classId: string;
}

async function round(students = 4): Promise<Round> {
  const fixture = await t.classWithStudents(students);
  const classId = await t.scheduledClass(fixture.classroomId, fixture.teacherId);
  const started = await t.start(fixture.teacherId, fixture.classroomId, { scheduledClassId: classId, meetingId: `m-${classId}` });
  expect(started.ok).toBe(true);
  return { ...fixture, sessionId: started.session_id, classId };
}

/** In the pad now: joined a minute ago, seen just now. */
async function inPad(sessionId: string, studentId: string) {
  const now = new Date();
  await t.appPresence(sessionId, studentId, at(now, -60_000), now);
}

/** Asks, collects the given answers, closes, and reveals with the key (or leaves it for later). */
async function question(
  r: Round,
  answers: Array<[string, string]>,
  key: string[] | null,
): Promise<string> {
  const asked = await t.ask(r.teacherId, r.sessionId, 'mcq', 4);
  expect(asked.ok).toBe(true);
  for (const [student, answer] of answers) {
    expect((await t.submit(student, asked.prompt_id, answer)).ok).toBe(true);
  }
  await t.close(r.teacherId, asked.prompt_id);
  if (key) {
    await t.setKey(r.teacherId, asked.prompt_id, key);
    await t.reveal(r.teacherId, asked.prompt_id);
  }
  return asked.prompt_id;
}

const byId = (rows: Json[], id: string) => rows.find((row) => row.student_id === id);

describe('who joined', () => {
  it('counts class-list students who opened the pad this round, never staff, and never drops anyone who left', async () => {
    const r = await round(3);
    const staffOnList = await t.user('teacher');
    await t.enroll(staffOnList, r.classroomId);
    const roster = [...r.students, staffOnList];

    await inPad(r.sessionId, r.students[0]);
    await inPad(r.sessionId, staffOnList);
    // Joined ten minutes ago and closed the pad five minutes ago: still joined.
    const now = new Date();
    await t.appPresence(r.sessionId, r.students[1], at(now, -600_000), at(now, -300_000));

    const snap = await t.teacherSnapshot(r.teacherId, r.sessionId, roster);
    expect(snap.readiness).toMatchObject({ enrolled: 3, joined: 2, connected: 1 });
    expect(snap.people.joined.map((p: Json) => p.student_id).sort()).toEqual([r.students[0], r.students[1]].sort());
    expect(snap.people.not_joined.map((p: Json) => p.student_id)).toEqual([r.students[2]]);
    expect(JSON.stringify(snap.people)).not.toContain(staffOnList);
  });

  it('counts a student who answers or gives a reason as joined', async () => {
    const r = await round(3);
    const asked = await t.ask(r.teacherId, r.sessionId, 'mcq', 4);
    await t.submit(r.students[0], asked.prompt_id, 'A');
    await t.skip(r.students[1], asked.prompt_id, 'need_time');
    const snap = await t.teacherSnapshot(r.teacherId, r.sessionId, r.students);
    expect(snap.counts).toMatchObject({ joined: 2, answered_joined: 1 });
    expect(snap.waiting).toEqual([
      expect.objectContaining({ student_id: r.students[1], reason: 'need_time', approval: null }),
    ]);
  });
});

describe('close and ask in one call', () => {
  it('closes the named open question and opens the next; a double tap returns the new one', async () => {
    const r = await round(2);
    const q1 = await t.ask(r.teacherId, r.sessionId, 'mcq', 4, { label: '31' });
    const q2 = await t.ask(r.teacherId, r.sessionId, 'mcq', 4, { label: '32', closePromptId: q1.prompt_id });
    expect(q2).toMatchObject({ ok: true, changed: true, label: '32', closed_prompt_id: q1.prompt_id, state: 'open' });

    const again = await t.ask(r.teacherId, r.sessionId, 'mcq', 4, { label: '32', closePromptId: q1.prompt_id });
    expect(again).toMatchObject({ ok: true, changed: false, prompt_id: q2.prompt_id });

    const prompts = await t.rows<{ label: string; state: string }>(
      `select label, state from pad_prompts where session_id = $1 order by sequence`,
      [r.sessionId],
    );
    expect(prompts).toEqual([
      { label: '31', state: 'closed' },
      { label: '32', state: 'open' },
    ]);
  });

  it('closes nothing when the next question is refused', async () => {
    const r = await round(1);
    const q1 = await t.ask(r.teacherId, r.sessionId, 'mcq', 4);
    const bad = await t.ask(r.teacherId, r.sessionId, 'mcq', 9, { closePromptId: q1.prompt_id });
    expect(bad).toMatchObject({ ok: false, code: 'INVALID_INPUT', field: 'option_count' });
    const [row] = await t.rows<{ state: string }>(`select state from pad_prompts where id = $1`, [q1.prompt_id]);
    expect(row.state).toBe('open');
  });
});

describe('excused reasons', () => {
  it('lets the teacher accept a reason, which leaves the question out of the score', async () => {
    const r = await round(2);
    for (const s of r.students) await inPad(r.sessionId, s);
    const asked = await t.ask(r.teacherId, r.sessionId, 'mcq', 4);
    await t.skip(r.students[0], asked.prompt_id, 'tech_problem', 'wifi');
    await t.submit(r.students[1], asked.prompt_id, 'A');

    expect(await t.excuse(r.teacherId, asked.prompt_id, { students: [r.students[0]] })).toEqual({ ok: true, changed: true, count: 1 });
    expect((await t.studentSnapshot(r.students[0], r.sessionId)).my_skip).toMatchObject({ reason: 'tech_problem', approval: 'approved' });

    await t.close(r.teacherId, asked.prompt_id);
    await t.setKey(r.teacherId, asked.prompt_id, ['A']);
    await t.reveal(r.teacherId, asked.prompt_id);

    const pad = await t.studentSnapshot(r.students[0], r.sessionId);
    expect(pad.score).toEqual({ correct: 0, wrong: 0, skipped: 0, excused: 1, absent: 0, total_graded: 0 });
    const rows = (await t.participation(r.teacherId, asked.prompt_id, r.students)).rows;
    expect(byId(rows, r.students[0])).toMatchObject({ participation: 'excused', skip_approval: 'approved' });
  });

  it('decides every reason of one kind at once, turns one down, and forgets a decision when the reason changes', async () => {
    const r = await round(3);
    const asked = await t.ask(r.teacherId, r.sessionId, 'mcq', 4);
    await t.skip(r.students[0], asked.prompt_id, 'cant_see');
    await t.skip(r.students[1], asked.prompt_id, 'cant_see');
    await t.skip(r.students[2], asked.prompt_id, 'dont_know');

    expect(await t.excuse(r.teacherId, asked.prompt_id, { reason: 'cant_see' })).toMatchObject({ ok: true, count: 2 });
    expect(await t.excuse(r.teacherId, asked.prompt_id, { students: [r.students[2]], approve: false })).toMatchObject({ count: 1 });
    const snap = await t.teacherSnapshot(r.teacherId, r.sessionId, r.students);
    expect(snap.skips.approved).toBe(2);
    expect(byId(snap.waiting, r.students[2])).toMatchObject({ approval: 'rejected' });

    await t.skip(r.students[0], asked.prompt_id, 'need_time');
    expect((await t.studentSnapshot(r.students[0], r.sessionId)).my_skip).toMatchObject({ reason: 'need_time', approval: null });
  });

  it('refuses another teacher and a call that names nobody', async () => {
    const r = await round(1);
    const asked = await t.ask(r.teacherId, r.sessionId, 'mcq', 4);
    const intruder = await t.user('teacher');
    expect(await t.excuse(intruder, asked.prompt_id, { students: r.students })).toMatchObject({ ok: false, code: 'NOT_SESSION_TEACHER' });
    expect(await t.excuse(r.teacherId, asked.prompt_id, {})).toMatchObject({ ok: false, code: 'INVALID_INPUT' });
  });

  it('keeps pad_skip_reasons decisions behind pad_excuse', async () => {
    const r = await round(1);
    const asked = await t.ask(r.teacherId, r.sessionId, 'mcq', 4);
    await t.skip(r.students[0], asked.prompt_id, 'dont_know');
    await expect(t.rows(`update pad_skip_reasons set approval = 'approved' where prompt_id = $1`, [asked.prompt_id])).rejects.toThrow(
      /only through pad_set_skip_reason\(\) and pad_excuse\(\)/,
    );
  });
});

describe('rounds', () => {
  it('numbers rounds per class and starts the next with the same room code', async () => {
    const r = await round(1);
    const [first] = await t.rows<{ round_no: number; room_code: string }>(`select round_no, room_code from pad_sessions where id = $1`, [r.sessionId]);
    expect(first.round_no).toBe(1);

    const next = await t.nextRound(r.teacherId, r.sessionId);
    expect(next).toMatchObject({ ok: true, changed: true, round_no: 2, room_code: first.room_code, ended_session_id: r.sessionId });
    const [old] = await t.rows<{ status: string }>(`select status from pad_sessions where id = $1`, [r.sessionId]);
    expect(old.status).toBe('ended');

    // A student still on round 1 is pointed at round 2.
    const pad = await t.studentSnapshot(r.students[0], r.sessionId);
    expect(pad.session).toMatchObject({ status: 'ended', round_no: 1, next_session_id: next.session_id });

    // A second press returns the round already running.
    expect(await t.nextRound(r.teacherId, r.sessionId)).toMatchObject({ ok: true, changed: false, session_id: next.session_id });
  });

  it('asks before ending a round with a question still waiting for its answer', async () => {
    const r = await round(1);
    await t.ask(r.teacherId, r.sessionId, 'mcq', 4, { label: '38' });
    expect(await t.nextRound(r.teacherId, r.sessionId)).toMatchObject({ ok: false, code: 'UNREVEALED_PROMPT', label: '38', count: 1 });
    expect(await t.nextRound(r.teacherId, r.sessionId, true)).toMatchObject({ ok: true, round_no: 2 });
  });

  it('refuses another teacher', async () => {
    const r = await round(1);
    const intruder = await t.user('teacher');
    expect(await t.nextRound(intruder, r.sessionId)).toMatchObject({ ok: false, code: 'NOT_SESSION_TEACHER' });
  });
});

describe('round results', () => {
  /**
   * s1: right, right             2 of 2, strong, rank 1
   * s4: excused, right           1 of 1, strong, rank 2
   * s2: right, wrong             1 of 2, good,   rank 3
   * s3: in the pad, no answers   0 of 2, not active, rank 4 (last)
   */
  async function played(): Promise<{ r: Round; q1: string; q2: string }> {
    const r = await round(4);
    const [s1, s2, s3, s4] = r.students;
    for (const s of r.students) await inPad(r.sessionId, s);

    const a1 = await t.ask(r.teacherId, r.sessionId, 'mcq', 4);
    await t.submit(s1, a1.prompt_id, 'A');
    await t.submit(s2, a1.prompt_id, 'A');
    await t.skip(s4, a1.prompt_id, 'tech_problem');
    await t.excuse(r.teacherId, a1.prompt_id, { students: [s4] });
    await t.close(r.teacherId, a1.prompt_id);
    await t.setKey(r.teacherId, a1.prompt_id, ['A']);
    await t.reveal(r.teacherId, a1.prompt_id);

    const q2 = await question(r, [[s1, 'B'], [s2, 'C'], [s4, 'B']], ['B']);
    void s3;
    return { r, q1: a1.prompt_id, q2 };
  }

  it('ranks by most correct, then score, with labels and the not active flag', async () => {
    const { r } = await played();
    const [s1, s2, s3, s4] = r.students;
    const res = await t.results(r.teacherId, r.sessionId, r.students);
    expect(res.ok).toBe(true);
    expect(byId(res.students, s1)).toMatchObject({ correct: 2, wrong: 0, counted: 2, attempted: 2, accuracy_pct: 100, score_pct: 100, label: 'strong', rank: 1, ranked_of: 4, not_active: false });
    expect(byId(res.students, s4)).toMatchObject({ correct: 1, excused: 1, counted: 1, attempted: 1, score_pct: 100, label: 'strong', rank: 2 });
    expect(byId(res.students, s2)).toMatchObject({ correct: 1, wrong: 1, counted: 2, attempted: 2, accuracy_pct: 50, score_pct: 50, label: 'good', rank: 3 });
    // Joined but answered nothing: ranked last, out of everyone who joined.
    expect(byId(res.students, s3)).toMatchObject({ correct: 0, no_answer: 2, attempted: 0, accuracy_pct: null, answered: 0, score_pct: 0, label: 'needs_practice', rank: 4, ranked_of: 4, not_active: true });
    // Attempted plus not attempted is always the questions counted for them.
    for (const row of res.students) expect(row.attempted + row.no_answer).toBe(row.counted);
    expect(res.class).toMatchObject({ questions: 2, graded: 2, pending_keys: 0, joined: 4, took_part: 3, enrolled: 4 });
    expect(res.top.map((row: Json) => row.student_id)).toEqual([s1, s4, s2]);
  });

  it('shares a rank on a tie', async () => {
    const r = await round(2);
    for (const s of r.students) await inPad(r.sessionId, s);
    await question(r, [[r.students[0], 'A'], [r.students[1], 'A']], ['A']);
    const res = await t.results(r.teacherId, r.sessionId, r.students);
    expect(res.students.map((row: Json) => row.rank)).toEqual([1, 1]);
  });

  it('publishes only an ended round, hands back who to message once, and shows each student their own row', async () => {
    const { r } = await played();
    const [s1, s2, s3] = r.students;
    expect(await t.publish(r.teacherId, r.sessionId, r.students)).toMatchObject({ ok: false, code: 'INVALID_TRANSITION', state: 'live' });
    expect(await t.studentResults(s2, r.sessionId, r.students)).toMatchObject({ ok: true, published: false });

    await t.end(r.teacherId, r.sessionId);
    const published = await t.publish(r.teacherId, r.sessionId, r.students);
    expect(published).toMatchObject({ ok: true, changed: true, published_at: expect.any(String) });
    expect([...published.notify].sort()).toEqual([...r.students].sort());

    expect(await t.markNotified(r.teacherId, r.sessionId)).toEqual({ ok: true, changed: true });
    expect((await t.publish(r.teacherId, r.sessionId, r.students)).notify).toEqual([]);

    const mine = await t.studentResults(s2, r.sessionId, r.students);
    expect(mine).toMatchObject({ ok: true, published: true, round_no: 1 });
    expect(mine.me).toMatchObject({ student_id: s2, correct: 1, counted: 2, attempted: 2, label: 'good', in_top: true, rank: 3, ranked_of: 4 });
    expect(mine.me).not.toHaveProperty('on_roster');
    expect(mine.top).toHaveLength(3);
    expect(mine.top[0]).toMatchObject({ student_id: s1, correct: 2 });
    expect(mine.class).toMatchObject({ questions: 2, graded: 2, joined: 4, took_part: 3 });
    // Their own answer to each question, and nobody else's.
    expect(mine.questions.map((q: Json) => [q.sequence, q.your_answer, q.correct_keys, q.result])).toEqual([
      [1, 'A', ['A'], 'right'],
      [2, 'C', ['B'], 'wrong'],
    ]);

    const quiet = await t.studentResults(s3, r.sessionId, r.students);
    expect(quiet.me).toMatchObject({ in_top: false, not_active: true, rank: 4, ranked_of: 4 });
    expect(JSON.stringify(quiet.top)).not.toContain(s3);
    expect(quiet.questions.map((q: Json) => q.result)).toEqual(['not_attempted', 'not_attempted']);
    // A student never gets the class list: only their own row and the top five.
    expect(quiet).not.toHaveProperty('students');
    expect(quiet.top.every((row: Json) => row.rank <= 5 && row.correct > 0)).toBe(true);

    const excused = await t.studentResults(r.students[3], r.sessionId, r.students);
    expect(excused.questions.map((q: Json) => q.result)).toEqual(['excused', 'right']);

    const outsider = await t.user('student');
    expect(await t.studentResults(outsider, r.sessionId, r.students)).toEqual({ ok: false, code: 'NOT_ENROLLED' });

    expect(await t.publish(r.teacherId, r.sessionId, r.students, false)).toMatchObject({ ok: true, changed: true, published_at: null });
    expect(await t.studentResults(s2, r.sessionId, r.students)).toMatchObject({ published: false });
  });

  it('updates results after a late answer key and says they changed since publishing', async () => {
    const { r, q2 } = await played();
    const [s1, s2] = r.students;
    await t.end(r.teacherId, r.sessionId);
    await t.publish(r.teacherId, r.sessionId, r.students);
    expect((await t.results(r.teacherId, r.sessionId, r.students)).session.changed_since_publish).toBe(false);

    await t.setKey(r.teacherId, q2, ['C']);
    const res = await t.results(r.teacherId, r.sessionId, r.students);
    expect(res.session.changed_since_publish).toBe(true);
    expect(byId(res.students, s2)).toMatchObject({ correct: 2, rank: 1 });
    expect(byId(res.students, s1)).toMatchObject({ correct: 1 });
  });

  it('stores an ended round\'s results against the class, and a late key rewrites them', async () => {
    const { r, q2 } = await played();
    const [s1, s2, s3] = r.students;
    expect(await t.storeResults(r.teacherId, r.sessionId, r.students)).toMatchObject({ ok: false, code: 'INVALID_TRANSITION', state: 'live' });

    await t.end(r.teacherId, r.sessionId);
    const intruder = await t.user('teacher');
    expect(await t.storeResults(intruder, r.sessionId, r.students)).toMatchObject({ ok: false, code: 'NOT_SESSION_TEACHER' });
    expect(await t.storeResults(r.teacherId, r.sessionId, r.students)).toEqual({ ok: true, stored: 4 });
    // Safe to run again: the round's rows are replaced, never doubled.
    expect(await t.storeResults(r.teacherId, r.sessionId, r.students)).toEqual({ ok: true, stored: 4 });

    const stored = await t.rows<Json>(
      `select student_id, scheduled_class_id, round_no, questions, attempted, not_attempted, correct, rank, ranked_of, not_active
         from pad_round_results where session_id = $1`,
      [r.sessionId],
    );
    expect(stored).toHaveLength(4);
    expect(byId(stored, s1)).toMatchObject({ scheduled_class_id: r.classId, round_no: 1, questions: 2, attempted: 2, not_attempted: 0, correct: 2, rank: 1, ranked_of: 4 });
    expect(byId(stored, s3)).toMatchObject({ attempted: 0, not_attempted: 2, rank: 4, not_active: true });

    await t.setKey(r.teacherId, q2, ['C']);
    await t.storeResults(r.teacherId, r.sessionId, r.students);
    const after = await t.rows<Json>(`select student_id, correct, rank from pad_round_results where session_id = $1`, [r.sessionId]);
    expect(byId(after, s2)).toMatchObject({ correct: 2, rank: 1 });
  });

  it('counts a question asked while a student was away apart, never against them', async () => {
    const r = await round(2);
    const [here, late] = r.students;
    await inPad(r.sessionId, here);
    await question(r, [[here, 'A']], ['A']);
    // Opens the pad only after Q.1 closed.
    await new Promise((resolve) => setTimeout(resolve, 20));
    await t.appPresence(r.sessionId, late, new Date(), new Date(Date.now() + 120_000));
    await question(r, [[here, 'B'], [late, 'B']], ['B']);
    const res = await t.results(r.teacherId, r.sessionId, r.students);
    expect(byId(res.students, late)).toMatchObject({ counted: 1, attempted: 1, correct: 1, away: 1 });
  });

  it('lists a class\'s rounds: every round for the teacher, published rounds with their own row for a student', async () => {
    const { r } = await played();
    const next = await t.nextRound(r.teacherId, r.sessionId);
    expect(next.ok).toBe(true);
    await t.publish(r.teacherId, r.sessionId, r.students);

    const teacher = await t.classRounds(r.teacherId, r.classId, r.students, 'teacher');
    expect(teacher.rounds.map((x: Json) => [x.round_no, x.status])).toEqual([
      [1, 'ended'],
      [2, 'live'],
    ]);
    expect(teacher.rounds[0].class).toMatchObject({ questions: 2, took_part: 3 });

    const student = await t.classRounds(r.students[1], r.classId, r.students, 'student');
    expect(student.rounds).toHaveLength(1);
    expect(student.rounds[0]).toMatchObject({ round_no: 1, me: expect.objectContaining({ correct: 1 }) });

    expect(await t.classRounds(r.students[1], r.classId, r.students, 'teacher')).toMatchObject({ ok: false, code: 'NOT_STAFF' });
    const outsider = await t.user('student');
    expect(await t.classRounds(outsider, r.classId, r.students, 'student')).toMatchObject({ ok: false, code: 'NOT_ENROLLED' });
  });
});
