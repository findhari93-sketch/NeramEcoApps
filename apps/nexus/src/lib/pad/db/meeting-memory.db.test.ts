// @vitest-environment node
/**
 * Meeting series memory (side-panel spec section 10: the session is bound to a
 * batch "picked once per meeting series, remembered after"). Runs the real
 * migration SQL in PGlite.
 */
import { randomUUID } from 'crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PadTestDb } from './test-harness';

let t: PadTestDb;

beforeAll(async () => {
  t = await PadTestDb.create();
}, 120_000);

afterAll(async () => {
  await t?.dispose();
});

const newThread = (): string => `19:meeting_${randomUUID()}@thread.v2`;

describe('pad_recall_meeting_binding', () => {
  it('knows nothing about a thread no session has used', async () => {
    const fixture = await t.classWithStudents(1);
    expect(await t.recallMeeting(fixture.teacherId, newThread())).toEqual({ ok: true, binding: null });
  });

  it("recalls the classroom of the newest session on the thread, whoever taught it", async () => {
    const fixture = await t.classWithStudents(1);
    const thread = newThread();

    const first = await t.start(fixture.teacherId, fixture.classroomId, { meetingId: 'meeting-1', meetingThread: thread });
    expect(first.ok).toBe(true);
    await t.end(fixture.teacherId, first.session_id);
    await t.ageSession(first.session_id, 24 * 7);

    expect(await t.recallMeeting(fixture.teacherId, thread)).toMatchObject({
      ok: true,
      binding: { classroom_id: fixture.classroomId, batch_id: null, classroom_name: 'Test Classroom' },
    });

    // Next week a co-teacher takes the same series for another classroom.
    const coTeacher = await t.user('teacher');
    const otherClassroom = await t.classroom('Second classroom');
    const second = await t.start(coTeacher, otherClassroom, { meetingId: 'meeting-2', meetingThread: thread });
    expect(second.ok).toBe(true);

    expect(await t.recallMeeting(fixture.teacherId, thread)).toMatchObject({
      ok: true,
      binding: { classroom_id: otherClassroom, classroom_name: 'Second classroom' },
    });
  });

  it('keeps threads apart', async () => {
    const fixture = await t.classWithStudents(1);
    const used = newThread();
    const started = await t.start(fixture.teacherId, fixture.classroomId, { meetingThread: used });
    expect(started.ok).toBe(true);

    expect((await t.recallMeeting(fixture.teacherId, used)).binding.classroom_id).toBe(fixture.classroomId);
    expect(await t.recallMeeting(fixture.teacherId, newThread())).toEqual({ ok: true, binding: null });
  });

  it('answers staff only, and refuses an empty thread', async () => {
    const fixture = await t.classWithStudents(1);
    const thread = newThread();
    await t.start(fixture.teacherId, fixture.classroomId, { meetingThread: thread });

    expect(await t.recallMeeting(fixture.students[0], thread)).toEqual({ ok: false, code: 'NOT_STAFF' });
    expect(await t.recallMeeting(null, thread)).toEqual({ ok: false, code: 'NOT_STAFF' });
    expect(await t.recallMeeting(fixture.teacherId, '')).toEqual({ ok: false, code: 'INVALID_INPUT', field: 'thread' });
    expect(await t.recallMeeting(fixture.teacherId, null)).toEqual({ ok: false, code: 'INVALID_INPUT', field: 'thread' });
  });
});
