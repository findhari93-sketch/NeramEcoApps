// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { TeacherSnapshot } from '@/lib/pad/client/types';

const mocks = vi.hoisted(() => ({
  caller: vi.fn(),
  live: vi.fn(),
  meta: vi.fn(),
  roster: vi.fn(),
  callPad: vi.fn(),
}));

vi.mock('@/lib/pad/caller', () => ({ resolvePadCaller: mocks.caller }));
vi.mock('@/lib/pad/sessions', () => ({
  liveSessionForMeeting: mocks.live,
  loadSessionMeta: mocks.meta,
  rosterIds: mocks.roster,
  padDb: () => ({}),
}));
vi.mock('@/lib/pad/rpc', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/pad/rpc')>()),
  callPad: mocks.callPad,
}));

import { PadRefusal } from '@/lib/pad/rpc';
import { __clearStageCaches } from '@/lib/pad/stage-cache';
import { GET } from './route';

const TEACHER = { user: { id: 'teacher-1' }, role: 'staff', internal: false };
const STUDENT = { user: { id: 'student-1' }, role: 'student', internal: false };

const SNAPSHOT: TeacherSnapshot = {
  ok: true,
  role: 'teacher',
  server_time: '2026-09-11T10:00:05Z',
  session: {
    id: 's1',
    status: 'live',
    room_code: '999071',
    hint_topic: 'pad-hint-x',
    teacher_topic: 'pad-teacher-secret',
    classroom_id: 'c1',
    classroom_name: 'NATA Evening Batch',
    scheduled_class_id: null,
    batch_id: null,
    meeting_id: 'meeting-1',
    created_at: '2026-09-11T09:55:00Z',
    ended_at: null,
    presence_basis: 'app',
    bot_in_meeting: false,
  },
  readiness: { enrolled: 31, connected: 28, in_meeting: 0 },
  prompt: {
    id: 'p1',
    sequence: 3,
    answer_type: 'mcq',
    option_count: 4,
    state: 'revealed',
    version: 4,
    correct_keys: ['B'],
    ungraded: false,
    label: null,
    opened_at: '2026-09-11T10:00:00Z',
    closed_at: '2026-09-11T10:01:00Z',
    revealed_at: '2026-09-11T10:02:00Z',
    answered_count: 23,
  },
  counts: { enrolled: 31, answered: 23, silent: 5, absent: 3, correct: 15, incorrect: 8, answered_off_roster: 0 },
  groups: [{ value: 'B', count: 15 }],
  history: [],
};

const call = (query = '?meetingId=meeting-1') => GET(new NextRequest(`http://localhost:3022/api/pad/stage${query}`, { headers: { Authorization: 'Bearer token' } }));
const teacherSnapshotCalls = () => mocks.callPad.mock.calls.filter(([, fn]) => fn === 'pad_teacher_snapshot');

beforeEach(() => {
  __clearStageCaches();
  mocks.caller.mockReset().mockResolvedValue(TEACHER);
  mocks.live.mockReset().mockResolvedValue('s1');
  mocks.meta.mockReset().mockResolvedValue({ id: 's1', classroom_id: 'c1', batch_id: null, teacher_id: 'teacher-1', status: 'live', meeting_id: 'meeting-1' });
  mocks.roster.mockReset().mockResolvedValue(['u1', 'u2']);
  mocks.callPad.mockReset().mockImplementation(async (_db: unknown, fn: string) => (fn === 'pad_teacher_snapshot' ? SNAPSHOT : { ok: true }));
});

describe('GET /api/pad/stage', () => {
  it('gives the session teacher the class results for the meeting, with nothing private in them', async () => {
    const response = await call();
    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.stage.prompt).toMatchObject({ sequence: 3, answered: 23, enrolled: 31, reveal: { correct_keys: ['B'], correct: 15, incorrect: 8 } });
    expect(JSON.stringify(body)).not.toMatch(/pad-teacher-secret|999071|meeting-1/);
    expect(mocks.live).toHaveBeenCalledWith('meeting-1');
    expect(teacherSnapshotCalls()[0][2]).toEqual({ p_actor: 'teacher-1', p_session: 's1', p_roster: ['u1', 'u2'] });
  });

  it('lets an enrolled student see the same results, checked by the database once', async () => {
    mocks.caller.mockResolvedValue(STUDENT);
    expect((await call()).status).toBe(200);
    expect((await call()).status).toBe(200);

    const studentChecks = mocks.callPad.mock.calls.filter(([, fn]) => fn === 'pad_student_snapshot');
    expect(studentChecks).toHaveLength(1);
    expect(studentChecks[0][2]).toEqual({ p_actor: 'student-1', p_session: 's1', p_touch: false });
    // One reading serves the whole meeting for a moment.
    expect(teacherSnapshotCalls()).toHaveLength(1);
  });

  it('refuses a student who is not on the class list, before reading any results', async () => {
    mocks.caller.mockResolvedValue(STUDENT);
    mocks.callPad.mockImplementation(async (_db: unknown, fn: string) => {
      if (fn === 'pad_student_snapshot') throw new PadRefusal('NOT_ENROLLED');
      return SNAPSHOT;
    });
    expect((await call()).status).toBe(403);
    expect(teacherSnapshotCalls()).toHaveLength(0);
  });

  it("refuses another teacher's session", async () => {
    mocks.caller.mockResolvedValue({ ...TEACHER, user: { id: 'teacher-2' } });
    expect((await call()).status).toBe(403);
    expect(teacherSnapshotCalls()).toHaveLength(0);
  });

  it('answers null while no session is live in the meeting, and asks for a meeting id', async () => {
    mocks.live.mockResolvedValue(null);
    await expect((await call()).json()).resolves.toEqual({ stage: null });
    expect((await call('')).status).toBe(400);
  });
});
