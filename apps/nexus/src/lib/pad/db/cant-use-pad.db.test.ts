// @vitest-environment node
/**
 * Answer Pad v4.1 (migration 20261104090000): the teacher marks a student who
 * cannot use the pad, and every question of the round excuses them until Undo.
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
}

/** A round with every student's pad open, so all of them count as here. */
async function round(students = 3): Promise<Round> {
  const fixture = await t.classWithStudents(students);
  const started = await t.start(fixture.teacherId, fixture.classroomId);
  expect(started.ok).toBe(true);
  const now = new Date();
  for (const id of fixture.students) await t.appPresence(started.session_id, id, at(now, -60_000), now);
  return { ...fixture, sessionId: started.session_id };
}

const byId = (rows: Json[], id: string) => rows.find((row) => row.student_id === id);

describe("can't use the pad", () => {
  it('excuses the open question and every question asked after, and shows in the snapshot', async () => {
    const r = await round(3);
    const [stuck] = r.students;
    const first = await t.ask(r.teacherId, r.sessionId, 'mcq', 4);

    const marked = await t.cantUsePad(r.teacherId, r.sessionId, stuck, true);
    expect(marked).toMatchObject({ ok: true, on: true, questions: 1 });
    expect(await t.skipRows(first.prompt_id)).toEqual([{ student_id: stuck, reason: 'pad_problem', approval: 'approved' }]);

    const second = await t.ask(r.teacherId, r.sessionId, 'mcq', 4, { closePromptId: first.prompt_id });
    expect(second.ok).toBe(true);
    expect(await t.skipRows(second.prompt_id)).toEqual([{ student_id: stuck, reason: 'pad_problem', approval: 'approved' }]);

    const snap = await t.teacherSnapshot(r.teacherId, r.sessionId, r.students);
    expect(snap.people.cant_use_pad.map((p: Json) => p.student_id)).toEqual([stuck]);
    expect(snap.counts).toMatchObject({ excused_joined: 1 });
  });

  it('never counts against the student: excused, not "no answer", in the results', async () => {
    const r = await round(2);
    const [answers, stuck] = r.students;
    await t.cantUsePad(r.teacherId, r.sessionId, stuck, true);
    const asked = await t.ask(r.teacherId, r.sessionId, 'mcq', 4);
    await t.submit(answers, asked.prompt_id, 'a');
    await t.close(r.teacherId, asked.prompt_id);
    await t.setKey(r.teacherId, asked.prompt_id, ['b']);
    await t.reveal(r.teacherId, asked.prompt_id);

    const res = await t.results(r.teacherId, r.sessionId, r.students);
    expect(byId(res.students, stuck)).toMatchObject({ excused: 1, no_answer: 0, attempted: 0 });
    expect(byId(res.students, answers)).toMatchObject({ attempted: 1, wrong: 1 });
  });

  it('lets an answer the student does send count, as answered wins over excused', async () => {
    const r = await round(2);
    const [, stuck] = r.students;
    await t.cantUsePad(r.teacherId, r.sessionId, stuck, true);
    const asked = await t.ask(r.teacherId, r.sessionId, 'mcq', 4);
    expect((await t.submit(stuck, asked.prompt_id, 'a')).ok).toBe(true);
    await t.close(r.teacherId, asked.prompt_id);
    await t.setKey(r.teacherId, asked.prompt_id, ['a']);
    await t.reveal(r.teacherId, asked.prompt_id);
    const res = await t.results(r.teacherId, r.sessionId, r.students);
    expect(byId(res.students, stuck)).toMatchObject({ correct: 1, attempted: 1 });
  });

  it('Undo clears the mark and the unrevealed questions, and leaves a revealed one as it was', async () => {
    const r = await round(2);
    const [, stuck] = r.students;
    await t.cantUsePad(r.teacherId, r.sessionId, stuck, true);
    const revealed = await t.ask(r.teacherId, r.sessionId, 'mcq', 4);
    await t.close(r.teacherId, revealed.prompt_id);
    await t.setKey(r.teacherId, revealed.prompt_id, ['a']);
    await t.reveal(r.teacherId, revealed.prompt_id);
    const open = await t.ask(r.teacherId, r.sessionId, 'mcq', 4);

    const undone = await t.cantUsePad(r.teacherId, r.sessionId, stuck, false);
    expect(undone).toMatchObject({ ok: true, on: false, questions: 1 });
    expect(await t.skipRows(open.prompt_id)).toEqual([]);
    expect(await t.skipRows(revealed.prompt_id)).toEqual([{ student_id: stuck, reason: 'pad_problem', approval: 'approved' }]);

    const next = await t.ask(r.teacherId, r.sessionId, 'mcq', 4, { closePromptId: open.prompt_id });
    expect(await t.skipRows(next.prompt_id)).toEqual([]);
    const snap = await t.teacherSnapshot(r.teacherId, r.sessionId, r.students);
    expect(snap.people.cant_use_pad).toEqual([]);
  });

  it("keeps the student's own reason, and approves it", async () => {
    const r = await round(2);
    const [, stuck] = r.students;
    const asked = await t.ask(r.teacherId, r.sessionId, 'mcq', 4);
    await t.skip(stuck, asked.prompt_id, 'tech_problem');
    await t.cantUsePad(r.teacherId, r.sessionId, stuck, true);
    expect(await t.skipRows(asked.prompt_id)).toEqual([{ student_id: stuck, reason: 'tech_problem', approval: 'approved' }]);
  });

  it('is for the round teacher only, never a staff member, never an ended round', async () => {
    const r = await round(2);
    const [student] = r.students;
    const other = await t.user('teacher');
    expect(await t.cantUsePad(other, r.sessionId, student, true)).toMatchObject({ ok: false, code: 'NOT_SESSION_TEACHER' });
    expect(await t.cantUsePad(student, r.sessionId, student, true)).toMatchObject({ ok: false, code: 'NOT_SESSION_TEACHER' });
    expect(await t.cantUsePad(r.teacherId, r.sessionId, other, true)).toMatchObject({ ok: false, code: 'INVALID_INPUT' });
    expect(await t.cantUsePad(r.teacherId, r.sessionId, null, true)).toMatchObject({ ok: false, code: 'INVALID_INPUT' });

    await t.end(r.teacherId, r.sessionId, true);
    expect(await t.cantUsePad(r.teacherId, r.sessionId, student, true)).toMatchObject({ ok: false, code: 'SESSION_NOT_LIVE' });
  });

  it('marking twice is harmless', async () => {
    const r = await round(2);
    const [, stuck] = r.students;
    const asked = await t.ask(r.teacherId, r.sessionId, 'mcq', 4);
    await t.cantUsePad(r.teacherId, r.sessionId, stuck, true);
    expect(await t.cantUsePad(r.teacherId, r.sessionId, stuck, true)).toMatchObject({ ok: true, questions: 0 });
    expect(await t.skipRows(asked.prompt_id)).toHaveLength(1);
  });
});
