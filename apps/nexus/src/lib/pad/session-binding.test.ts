// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import type { ScheduledClassCandidate } from './meeting-binding';
import { decideSessionBinding, isUuid, mayRunSession, parseStartSessionRequest, type BoundSession } from './session-binding';

const ROOM = '11111111-1111-4111-8111-111111111111';
const OTHER_ROOM = '22222222-2222-4222-8222-222222222222';
const BATCH = '33333333-3333-4333-8333-333333333333';
const CLASS = '44444444-4444-4444-8444-444444444444';
const TEACHER = '55555555-5555-4555-8555-555555555555';

function cls(overrides: Partial<ScheduledClassCandidate> = {}): ScheduledClassCandidate {
  return {
    id: CLASS,
    classroom_id: ROOM,
    batch_id: null,
    teacher_id: TEACHER,
    scheduled_date: '2026-09-10',
    start_time: '10:00',
    end_time: '11:30',
    teams_meeting_join_url: null,
    teams_meeting_url: null,
    ...overrides,
  };
}

describe('isUuid', () => {
  it('accepts a UUID in either case and nothing else', () => {
    expect(isUuid(ROOM)).toBe(true);
    expect(isUuid(ROOM.toUpperCase())).toBe(true);
    for (const value of ['', 'not-a-uuid', `${ROOM}x`, 42, null, undefined, {}]) {
      expect(isUuid(value)).toBe(false);
    }
  });
});

describe('parseStartSessionRequest', () => {
  it('reads an empty or missing body as "start from the meeting alone"', () => {
    const empty = { ok: true, value: { meeting: null, classroomId: null, batchId: null, scheduledClassId: null, endExisting: false } };
    expect(parseStartSessionRequest({})).toEqual(empty);
    expect(parseStartSessionRequest(null)).toEqual(empty);
    expect(parseStartSessionRequest('text')).toEqual(empty);
  });

  it('reads a full request and lowercases the ids', () => {
    expect(
      parseStartSessionRequest({
        meeting: { meetingId: 'MCMxOTptZWV0aW5n', chatId: '19:meeting_x@thread.v2', channelId: null },
        classroomId: ROOM.toUpperCase(),
        batchId: BATCH,
        scheduledClassId: CLASS,
        endExisting: true,
      }),
    ).toEqual({
      ok: true,
      value: {
        meeting: { meetingId: 'MCMxOTptZWV0aW5n', chatId: '19:meeting_x@thread.v2', channelId: null },
        classroomId: ROOM,
        batchId: BATCH,
        scheduledClassId: CLASS,
        endExisting: true,
      },
    });
  });

  it.each([
    [{ classroomId: 'room-1' }, 'classroomId'],
    [{ classroomId: ROOM, batchId: 42 }, 'batchId'],
    [{ scheduledClassId: 'x' }, 'scheduledClassId'],
    [{ batchId: BATCH }, 'batchId'],
    [{ meeting: 'meeting-1' }, 'meeting'],
    [{ meeting: [] }, 'meeting'],
    [{ meeting: { meetingId: 7 } }, 'meeting'],
    [{ meeting: { chatId: 'x'.repeat(513) } }, 'meeting'],
    [{ endExisting: 'yes' }, 'endExisting'],
  ])('refuses %j, naming %s', (body, field) => {
    expect(parseStartSessionRequest(body)).toEqual({ ok: false, field });
  });

  it('treats a meeting object with no ids as no meeting', () => {
    const parsed = parseStartSessionRequest({ meeting: { meetingId: '', chatId: null } });
    expect(parsed.ok && parsed.value.meeting).toBeNull();
  });
});

describe('decideSessionBinding', () => {
  const none = { chosenClass: null, chosenClassroomId: null, chosenBatchId: null, scheduledMatch: null, remembered: null };

  it('asks the teacher when nothing identifies the class', () => {
    expect(decideSessionBinding(none)).toEqual({ kind: 'choose' });
  });

  it('uses the meeting series memory when the meeting matched no scheduled class', () => {
    expect(decideSessionBinding({ ...none, remembered: { classroom_id: ROOM, batch_id: BATCH } })).toEqual({
      kind: 'bound',
      source: 'remembered',
      classroomId: ROOM,
      batchId: BATCH,
      scheduledClassId: null,
    });
  });

  it('prefers the scheduled class the meeting matched over the memory', () => {
    const binding = decideSessionBinding({
      ...none,
      scheduledMatch: cls({ batch_id: BATCH }),
      remembered: { classroom_id: OTHER_ROOM, batch_id: null },
    });
    expect(binding).toEqual({ kind: 'bound', source: 'scheduled_class', classroomId: ROOM, batchId: BATCH, scheduledClassId: CLASS });
  });

  it('lets the teacher override the match with a classroom, keeping the class only when it belongs there', () => {
    expect(decideSessionBinding({ ...none, chosenClassroomId: ROOM, scheduledMatch: cls({ batch_id: BATCH }) })).toEqual({
      kind: 'bound',
      source: 'chosen_classroom',
      classroomId: ROOM,
      batchId: BATCH,
      scheduledClassId: CLASS,
    });
    expect(decideSessionBinding({ ...none, chosenClassroomId: OTHER_ROOM, scheduledMatch: cls() })).toEqual({
      kind: 'bound',
      source: 'chosen_classroom',
      classroomId: OTHER_ROOM,
      batchId: null,
      scheduledClassId: null,
    });
  });

  it('keeps the section the teacher picked over the one on the matched class', () => {
    const other = '66666666-6666-4666-8666-666666666666';
    const binding = decideSessionBinding({ ...none, chosenClassroomId: ROOM, chosenBatchId: other, scheduledMatch: cls({ batch_id: BATCH }) });
    expect(binding).toMatchObject({ batchId: other, scheduledClassId: CLASS });
  });

  it('puts a scheduled class the teacher picked above everything else', () => {
    const binding = decideSessionBinding({
      chosenClass: cls({ classroom_id: OTHER_ROOM }),
      chosenClassroomId: ROOM,
      chosenBatchId: null,
      scheduledMatch: cls({ id: 'another' }),
      remembered: { classroom_id: ROOM, batch_id: null },
    });
    expect(binding).toEqual({ kind: 'bound', source: 'chosen_class', classroomId: OTHER_ROOM, batchId: null, scheduledClassId: CLASS });
  });
});

describe('mayRunSession', () => {
  const withClass: BoundSession = { kind: 'bound', source: 'scheduled_class', classroomId: ROOM, batchId: null, scheduledClassId: CLASS };
  const withoutClass: BoundSession = { ...withClass, source: 'remembered', scheduledClassId: null };

  it('lets internal staff run any class without looking anything up', async () => {
    const teaches = vi.fn(async () => false);
    await expect(mayRunSession({ internal: true, userId: 'manager' }, withClass, { scheduledClassTeacherId: 'someone-else', teachesClassroom: teaches })).resolves.toBe(true);
    expect(teaches).not.toHaveBeenCalled();
  });

  it('lets an external teacher run a scheduled class only if they are its tutor', async () => {
    const teaches = vi.fn(async () => true);
    await expect(mayRunSession({ internal: false, userId: TEACHER }, withClass, { scheduledClassTeacherId: TEACHER, teachesClassroom: teaches })).resolves.toBe(true);
    await expect(mayRunSession({ internal: false, userId: 'visiting' }, withClass, { scheduledClassTeacherId: TEACHER, teachesClassroom: teaches })).resolves.toBe(false);
    expect(teaches).not.toHaveBeenCalled();
  });

  it('falls back to teaching in the classroom when the class has no tutor or there is no class', async () => {
    for (const binding of [withClass, withoutClass]) {
      await expect(mayRunSession({ internal: false, userId: TEACHER }, binding, { scheduledClassTeacherId: null, teachesClassroom: async () => true })).resolves.toBe(true);
      await expect(mayRunSession({ internal: false, userId: TEACHER }, binding, { scheduledClassTeacherId: null, teachesClassroom: async () => false })).resolves.toBe(false);
    }
  });
});
