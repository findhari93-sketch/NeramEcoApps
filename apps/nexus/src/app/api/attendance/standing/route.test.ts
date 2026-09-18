import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The standing view sits beside the register and inherits its two rules: it may
 * not write, and it may not turn an unmeasured class into an absence.
 */

const state = vi.hoisted(() => ({
  capability: true,
  classes: [] as Record<string, unknown>[],
  attendance: [] as Record<string, unknown>[],
  awayWindows: [] as Record<string, unknown>[],
  signIns: [] as Record<string, unknown>[],
  members: [] as Record<string, unknown>[],
  entered: [] as Record<string, unknown>[],
  backlog: new Map<string, { ownOpen: number; blockedOnUs: number }>(),
  writes: [] as string[],
}));

function builder(table: string) {
  const b: Record<string, unknown> = {};
  const rows = () => {
    if (table === 'nexus_scheduled_classes') return state.classes;
    if (table === 'nexus_attendance') return state.attendance;
    if (table === 'nexus_student_away_windows') return state.awayWindows;
    if (table === 'nexus_sign_in_events') return state.signIns;
    if (table === 'users') return usersRows;
    return [];
  };
  // `users` is asked two different questions: who is the caller, and the
  // nexus_entered_at of the roster.
  let usersRows: Record<string, unknown>[] = [
    { id: 'staff-1', user_type: 'teacher', staff_role: 'teacher', can_teach: true },
  ];
  const chain = () => b;
  for (const m of ['select', 'eq', 'gte', 'lte', 'not', 'is', 'or', 'order', 'limit']) b[m] = chain;
  b.in = (col: string) => {
    if (table === 'users' && col === 'id') usersRows = state.entered;
    return b;
  };
  for (const m of ['insert', 'update', 'upsert', 'delete']) {
    b[m] = () => {
      state.writes.push(`${table}.${m}`);
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
  getSupabaseAdminClient: () => ({ from: (t: string) => builder(t) }),
  loadClassroomRoster: async () => ({
    members: state.members,
    ids: state.members.map((m) => m.user_id as string),
    counts: { dormant: 3 },
  }),
  istTodayYmd: () => '2026-09-16',
}));
vi.mock('@/lib/ms-verify', () => ({ verifyMsToken: async () => ({ oid: 'ms-1' }) }));
vi.mock('@/lib/staff-capabilities', () => ({ canUser: () => state.capability }));
vi.mock('@/lib/catchup-open-counts', () => ({
  loadCatchupOpenCounts: async () => state.backlog,
}));

const { GET } = await import('./route');

const call = () =>
  GET(
    new NextRequest(
      'http://localhost/api/attendance/standing?classroom_id=c1&from=2026-09-01&to=2026-09-16',
      { headers: { Authorization: 'Bearer t' } },
    ),
  );

const rowFor = async (id: string) => {
  const body = await (await call()).json();
  return body.students.find((s: { id: string }) => s.id === id);
};

beforeEach(() => {
  state.capability = true;
  state.writes = [];
  state.classes = [
    {
      id: 'class-1',
      scheduled_date: '2026-09-15',
      start_time: '19:00:00',
      end_time: '20:30:00',
      batch_id: null,
    },
  ];
  state.members = [
    {
      user_id: 'quiet',
      enrolled_at: '2026-01-01T00:00:00Z',
      batch_id: null,
      current_standard: null,
      user: { name: 'Quiet', avatar_url: null },
    },
  ];
  state.attendance = [{ scheduled_class_id: 'class-1', student_id: 'other', attended: true }];
  state.awayWindows = [];
  state.signIns = [];
  state.entered = [{ id: 'quiet', nexus_entered_at: null }];
  state.backlog = new Map([['quiet', { ownOpen: 2, blockedOnUs: 0 }]]);
});

describe('GET /api/attendance/standing', () => {
  it('writes nothing at all', async () => {
    await call();
    expect(state.writes).toEqual([]);
  });

  it('refuses a caller without the attendance capability', async () => {
    state.capability = false;
    expect((await call()).status).toBe(403);
  });

  it('names the sleeper cell: missing, behind, and never seen', async () => {
    const row = await rowFor('quiet');
    expect(row.standing).toBe('no_contact');
    expect(row.reasons.join(' ')).toMatch(/never opened Nexus/i);
  });

  /**
   * The inherited rule. A class Teams was never read for says nothing about
   * anybody, and scoring it would report the whole roster as missing every
   * evening between the class ending and the sync cron.
   */
  it('reports an unmeasured class as measuring nothing, not as absence', async () => {
    state.attendance = [];
    const body = await (await call()).json();
    const row = body.students[0];
    expect(row.standing).toBe('not_measured');
    expect(row.rate).toBeNull();
    expect(row.counted).toBe(0);
    expect(body.unmeasured_classes).toBe(1);
  });

  /**
   * The placement that protects the people who used the feature as intended.
   * Declaring a window IS contact, so it must outrank "we have not heard from
   * them", even though every other signal is identical.
   */
  it('puts a declared window ahead of no contact', async () => {
    state.awayWindows = [
      {
        id: 'w1',
        student_id: 'quiet',
        starts_on: '2026-09-10',
        ends_on: '2026-09-20',
        review_on: '2026-09-20',
        reason_code: 'clash',
        reason_note: null,
        source: 'student',
        cancelled_at: null,
        created_at: '2026-09-01T00:00:00Z',
      },
    ];
    const row = await rowFor('quiet');
    expect(row.standing).toBe('away');
    expect(row.away).toBe(1);
    expect(row.unexplained).toBe(0);
    expect(row.away_now).toBe('Away until 20 Sep');
  });

  it('reports the students it hides, so three counts on one screen can be explained', async () => {
    const body = await (await call()).json();
    expect(body.paused_hidden).toBe(3);
  });

  it('separates work blocked on us from work the student owes', async () => {
    state.backlog = new Map([['quiet', { ownOpen: 0, blockedOnUs: 3 }]]);
    state.signIns = [{ user_id: 'quiet', occurred_at: '2026-09-15T00:00:00Z' }];
    state.entered = [{ id: 'quiet', nexus_entered_at: '2026-01-02T00:00:00Z' }];
    const row = await rowFor('quiet');
    expect(row.blocked_on_us).toBe(3);
    expect(row.open_backlog).toBe(0);
    expect(row.standing).not.toBe('falling_behind');
    expect(row.standing).not.toBe('no_contact');
  });
});
