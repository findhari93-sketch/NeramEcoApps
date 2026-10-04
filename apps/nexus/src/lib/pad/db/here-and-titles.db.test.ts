// @vitest-environment node
/**
 * Answer Pad v4 (migration 20261101090000): "here" counts the Teams meeting as
 * well as the pad, the class title, stale sessions and rounds with no questions.
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
  meetingId: string;
}

async function round(students = 3): Promise<Round> {
  const fixture = await t.classWithStudents(students);
  const classId = await t.scheduledClass(fixture.classroomId, fixture.teacherId);
  const meetingId = `m-${classId}`;
  const started = await t.start(fixture.teacherId, fixture.classroomId, { scheduledClassId: classId, meetingId });
  expect(started.ok).toBe(true);
  return { ...fixture, sessionId: started.session_id, classId, meetingId };
}

const byId = (rows: Json[], id: string) => rows.find((row) => row.student_id === id);

describe('who is here', () => {
  it('counts students in the Teams meeting as well as those with the pad open, roster only, staff never', async () => {
    const r = await round(4);
    const [padOnly, meetingOnly, both, away] = r.students;
    const staffOnList = await t.user('teacher');
    await t.enroll(staffOnList, r.classroomId);
    const outsider = await t.user('student');
    const now = new Date();

    await t.appPresence(r.sessionId, padOnly, at(now, -60_000), now);
    await t.meetingPresence(r.meetingId, meetingOnly, at(now, -120_000), null);
    await t.appPresence(r.sessionId, both, at(now, -60_000), now);
    await t.meetingPresence(r.meetingId, both, at(now, -120_000), null);
    await t.meetingPresence(r.meetingId, staffOnList, at(now, -120_000), null);
    await t.meetingPresence(r.meetingId, outsider, at(now, -120_000), null);
    // In the same meeting, but left a day before this round began.
    await t.meetingPresence(r.meetingId, away, at(now, -86_400_000), at(now, -86_000_000));

    const snap = await t.teacherSnapshot(r.teacherId, r.sessionId, [...r.students, staffOnList]);
    expect(snap.readiness).toMatchObject({ enrolled: 4, joined: 3, opened: 2 });
    const people = snap.people.joined as Json[];
    expect(people.map((p) => p.student_id).sort()).toEqual([padOnly, meetingOnly, both].sort());
    expect(byId(people, padOnly)?.source).toBe('pad');
    expect(byId(people, meetingOnly)?.source).toBe('meeting');
    expect(byId(people, both)?.source).toBe('both');
    expect(snap.people.not_joined.map((p: Json) => p.student_id)).toEqual([away]);
  });

  it('counts a student in the meeting who never opened the pad as not attempted, ranked last', async () => {
    const r = await round(2);
    const [answers, listens] = r.students;
    const now = new Date();
    await t.appPresence(r.sessionId, answers, at(now, -60_000), now);
    await t.meetingPresence(r.meetingId, listens, at(now, -120_000), null);

    const asked = await t.ask(r.teacherId, r.sessionId, 'mcq', 4);
    await t.submit(answers, asked.prompt_id, 'a');
    await t.close(r.teacherId, asked.prompt_id);
    await t.setKey(r.teacherId, asked.prompt_id, ['a']);
    await t.reveal(r.teacherId, asked.prompt_id);

    const res = await t.results(r.teacherId, r.sessionId, r.students);
    expect(byId(res.students, answers)).toMatchObject({ correct: 1, rank: 1, ranked_of: 2 });
    expect(byId(res.students, listens)).toMatchObject({ attempted: 0, no_answer: 1, away: 0, rank: 2, ranked_of: 2 });
  });

  it('waits on students in the meeting too, so they can be nudged', async () => {
    const r = await round(1);
    await t.meetingPresence(r.meetingId, r.students[0], at(new Date(), -60_000), null);
    await t.ask(r.teacherId, r.sessionId, 'mcq', 4);
    const snap = await t.teacherSnapshot(r.teacherId, r.sessionId, r.students);
    expect(snap.waiting).toEqual([expect.objectContaining({ student_id: r.students[0], pad_open: false })]);
  });
});

describe('the class title', () => {
  it('uses the timetable class, then the Teams meeting, then the classroom, and the teacher can rename it', async () => {
    const r = await round(1);
    let snap = await t.teacherSnapshot(r.teacherId, r.sessionId, r.students);
    expect(snap.session.title).toBe('Test class');

    expect(await t.rename(r.teacherId, r.sessionId, '  JEE   preparation ')).toEqual({ ok: true, title: 'JEE preparation' });
    snap = await t.teacherSnapshot(r.teacherId, r.sessionId, r.students);
    expect(snap.session.title).toBe('JEE preparation');

    // Cleared: back to the timetable.
    expect(await t.rename(r.teacherId, r.sessionId, '')).toEqual({ ok: true, title: 'Test class' });
  });

  it('keeps the Teams meeting title for a meeting that is not on the timetable', async () => {
    const fixture = await t.classWithStudents(1);
    const started = await t.start(fixture.teacherId, fixture.classroomId, { meetingId: 'm-adhoc', meetingTitle: 'JEE preparation' });
    const snap = await t.teacherSnapshot(fixture.teacherId, started.session_id, fixture.students);
    expect(snap.session.title).toBe('JEE preparation');
    expect(snap.session.classroom_name).toBe('Test Classroom');
  });

  it('falls back to the classroom name', async () => {
    const fixture = await t.classWithStudents(1);
    const started = await t.start(fixture.teacherId, fixture.classroomId, { meetingId: 'm-plain' });
    const snap = await t.teacherSnapshot(fixture.teacherId, started.session_id, fixture.students);
    expect(snap.session.title).toBe('Test Classroom');
  });

  it('lets only the session teacher rename it, up to 120 characters', async () => {
    const r = await round(1);
    const other = await t.user('teacher');
    expect(await t.rename(other, r.sessionId, 'Mine now')).toEqual({ ok: false, code: 'NOT_SESSION_TEACHER' });
    expect(await t.rename(r.teacherId, r.sessionId, 'x'.repeat(121))).toEqual({ ok: false, code: 'INVALID_INPUT', field: 'title' });
  });
});

describe('rounds with no questions', () => {
  it('are left out of the class rounds once ended, while a live one still shows', async () => {
    const r = await round(1);
    // Round 1 ended by mistake straight away.
    const next = await t.nextRound(r.teacherId, r.sessionId);
    expect(next.ok).toBe(true);
    const second = next.session_id as string;

    let rounds = await t.classRounds(r.teacherId, r.classId, r.students, 'teacher');
    expect(rounds.rounds.map((x: Json) => x.session_id)).toEqual([second]);

    const asked = await t.ask(r.teacherId, second, 'mcq', 4);
    await t.close(r.teacherId, asked.prompt_id);
    await t.end(r.teacherId, second, true);
    rounds = await t.classRounds(r.teacherId, r.classId, r.students, 'teacher');
    expect(rounds.rounds.map((x: Json) => x.round_no)).toEqual([2]);
  });
});
