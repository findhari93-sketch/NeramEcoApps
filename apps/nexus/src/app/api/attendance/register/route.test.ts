import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The register is the one attendance surface that may not write. Opening the
 * screen it replaced called computeAbsencesForClass on every GET, so simply
 * looking at a class created rows. The write guard below is the point of this
 * file: any insert, update, upsert or delete fails the test.
 */

const state = vi.hoisted(() => ({
  capability: true,
  classes: [] as Record<string, unknown>[],
  attendance: [] as Record<string, unknown>[],
  absences: [] as Record<string, unknown>[],
  rsvps: [] as Record<string, unknown>[],
  members: [] as Record<string, unknown>[],
  writes: [] as string[],
}));

function builder(table: string) {
  const b: Record<string, unknown> = {};
  const rows = () => {
    if (table === 'nexus_scheduled_classes') return state.classes;
    if (table === 'nexus_attendance') return state.attendance;
    if (table === 'nexus_class_absences') return state.absences;
    if (table === 'nexus_class_rsvp') return state.rsvps;
    if (table === 'users') return [{ id: 'staff-1', user_type: 'teacher', staff_role: 'teacher', can_teach: true }];
    return [];
  };
  const chain = () => b;
  for (const method of ['select', 'eq', 'in', 'gte', 'lte', 'not', 'order', 'limit']) {
    b[method] = chain;
  }
  for (const method of ['insert', 'update', 'upsert', 'delete']) {
    b[method] = () => {
      state.writes.push(`${table}.${method}`);
      return Promise.resolve({ data: null, error: null });
    };
  }
  b.maybeSingle = () => Promise.resolve({ data: rows()[0] ?? null, error: null });
  b.single = () => Promise.resolve({ data: rows()[0] ?? null, error: null });
  b.then = (onFulfilled: (v: unknown) => unknown) =>
    Promise.resolve({ data: rows(), error: null }).then(onFulfilled);
  return b;
}

vi.mock('@neram/database', () => ({
  getSupabaseAdminClient: () => ({ from: (table: string) => builder(table) }),
  loadClassroomRoster: async () => ({
    members: state.members,
    ids: state.members.map((m) => m.user_id as string),
    dormantIds: [],
    counts: { dormant: 1 },
  }),
  istTodayYmd: () => '2026-09-16',
}));

vi.mock('@/lib/ms-verify', () => ({ verifyMsToken: async () => ({ oid: 'ms-oid-1' }) }));
vi.mock('@/lib/staff-capabilities', () => ({ canUser: () => state.capability }));

const { GET } = await import('./route');

const call = () =>
  GET(
    new NextRequest('http://localhost/api/attendance/register?classroom_id=c1&from=2026-09-01&to=2026-09-16', {
      headers: { Authorization: 'Bearer token' },
    }),
  );

beforeEach(() => {
  state.capability = true;
  state.writes = [];
  state.classes = [
    {
      id: 'class-1',
      title: 'Basic 3D Shape Composition',
      scheduled_date: '2026-09-15',
      start_time: '19:00:00',
      end_time: '20:30:00',
      batch_id: null,
      attendance_sync_status: 'ok',
    },
  ];
  state.members = [
    { user_id: 'stayed', enrolled_at: '2026-06-01T00:00:00Z', batch_id: null, current_standard: 'class_12', user: { name: 'Student A', avatar_url: null } },
    { user_id: 'partly', enrolled_at: '2026-06-01T00:00:00Z', batch_id: null, current_standard: null, user: { name: 'Student B', avatar_url: null } },
    { user_id: 'silent', enrolled_at: '2026-06-01T00:00:00Z', batch_id: null, current_standard: null, user: { name: 'Student C', avatar_url: null } },
    { user_id: 'newcomer', enrolled_at: '2026-09-16T00:00:00Z', batch_id: null, current_standard: null, user: { name: 'Student D', avatar_url: null } },
  ];
  state.attendance = [
    {
      scheduled_class_id: 'class-1',
      student_id: 'stayed',
      attended: true,
      joined_at: '2026-09-15T13:32:00Z',
      left_at: '2026-09-15T14:40:00Z',
      attendance_intervals: [{ joinDateTime: '2026-09-15T13:32:00Z', leaveDateTime: '2026-09-15T14:40:00Z' }],
    },
    {
      scheduled_class_id: 'class-1',
      student_id: 'partly',
      attended: true,
      joined_at: '2026-09-15T13:56:00Z',
      left_at: '2026-09-15T14:15:00Z',
      attendance_intervals: [{ joinDateTime: '2026-09-15T13:56:00Z', leaveDateTime: '2026-09-15T14:15:00Z' }],
    },
    {
      scheduled_class_id: 'class-1',
      student_id: 'third',
      attended: true,
      joined_at: '2026-09-15T13:33:00Z',
      left_at: '2026-09-15T14:40:00Z',
      attendance_intervals: [{ joinDateTime: '2026-09-15T13:33:00Z', leaveDateTime: '2026-09-15T14:40:00Z' }],
    },
  ];
  state.absences = [{ scheduled_class_id: 'class-1', student_id: 'silent', kind: 'no_show', reason_code: null, reason_note: null, excused_at: null, caught_up_at: null }];
  state.rsvps = [];
});

describe('GET /api/attendance/register', () => {
  it('never writes to the database', async () => {
    await call();
    expect(state.writes).toEqual([]);
  });

  it('refuses a caller without the attendance capability', async () => {
    state.capability = false;
    const res = await call();
    expect(res.status).toBe(403);
  });

  it('groups each student in the class', async () => {
    const body = await (await call()).json();
    const cells = body.cells['class-1'];
    expect(cells.stayed.g).toBe('whole');
    expect(cells.partly.g).toBe('partly');
    expect(cells.silent.g).toBe('no_reason');
    expect(cells.newcomer.g).toBe('joined_later');
  });

  it('counts each group on the class', async () => {
    const body = await (await call()).json();
    expect(body.classes[0].counts).toEqual({
      whole: 1,
      partly: 1,
      reason: 0,
      noReason: 1,
      joinedLater: 1,
    });
  });

  it('leaves a student who joined later out of their own percentage', async () => {
    const body = await (await call()).json();
    const newcomer = body.students.find((s: { id: string }) => s.id === 'newcomer');
    expect(newcomer.counted).toBe(0);
    expect(newcomer.rate).toBe(null);
  });

  it('reports the real end of the class, not the booked one', async () => {
    const body = await (await call()).json();
    expect(body.classes[0].held.source).toBe('observed');
    expect(body.classes[0].held.minutes).toBe(70);
  });

  it('says how many dormant students were hidden', async () => {
    const body = await (await call()).json();
    expect(body.paused_hidden).toBe(1);
  });
});
