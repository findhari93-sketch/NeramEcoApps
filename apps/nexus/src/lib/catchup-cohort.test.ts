import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The classroom backlog pipeline, which had no test at all until three screens
 * depended on it: the student wall, the Teams celebration post, and the
 * attendance standing view.
 *
 * The rule it exists to protect is that those three name the SAME people. They
 * can only do that by asking one function, which is why `loadAllClearStudents`
 * is a filter over `loadClassroomBacklog` rather than its own copy of the
 * pipeline.
 */

const state = vi.hoisted(() => ({
  members: [] as any[],
  absences: [] as any[],
}));

/** Resolved status drives everything, so the fixtures set it directly. */
vi.mock('@neram/database', () => ({
  istTodayYmd: () => '2026-10-01',
  isTracked: (m: any) => m.participation_status !== 'dormant' && !m.removed,
  loadClassroomRoster: async () => ({ members: state.members }),
  readCatchupWindows: async () => ({}),
  toFacts: (item: any) => item,
  resolveCatchupBacklog: (items: any[]) =>
    items.map((i) => ({ status: i.status, chained: !!i.chained, countsTowardPace: true })),
  // Mirrors the real function's line 701: excused, blocked and pending_teacher
  // are not work anyone owes, so they never reach `open`.
  summariseMissedClasses: (resolved: any[]) => {
    const owed = resolved.filter(
      (r) =>
        !r.chained &&
        r.status !== 'excused' &&
        r.status !== 'blocked' &&
        r.status !== 'pending_teacher',
    );
    return {
      total: owed.length,
      completed: owed.filter((r) => r.status === 'done').length,
      open: owed.filter((r) => r.status !== 'done').length,
      overdue: 0,
      waiting: 0,
    };
  },
  summariseCatchupBacklog: (resolved: any[]) => {
    const chained = resolved.filter((r) => r.chained && r.countsTowardPace);
    return {
      total: chained.length,
      completed: chained.filter((r) => r.status === 'done').length,
      blocked: 0,
      pendingTeacher: 0,
    };
  },
  summariseCatchupClock: () => ({ active: false, overdue: false, stalled: false }),
}));

vi.mock('./catchup-facts', () => ({
  loadClassFactsForStudents: async (_c: unknown, byStudent: Map<string, string[]>) =>
    new Map([...byStudent.keys()].map((id) => [id, {}])),
}));

const supabase = {
  from: () => ({
    select: () => ({ eq: () => ({ limit: () => Promise.resolve({ data: state.absences }) }) }),
  }),
};

const { loadClassroomBacklog, loadAllClearStudents } = await import('./catchup-cohort');

const member = (id: string, over: Record<string, unknown> = {}) => ({
  user_id: id,
  user: { name: id, email: `${id}@x.com`, avatar_url: null },
  ...over,
});
const absence = (studentId: string, status: string, date = '2026-09-10') => ({
  id: `${studentId}-${date}-${status}`,
  student_id: studentId,
  scheduled_class_id: `c-${date}-${status}`,
  status,
  kind: 'no_show',
  caught_up_at: status === 'done' ? '2026-09-12T00:00:00Z' : null,
  class: { id: `c-${date}-${status}`, scheduled_date: date, start_time: '19:00:00' },
});

beforeEach(() => {
  state.members = [];
  state.absences = [];
});

describe('loadClassroomBacklog', () => {
  it('gives every tracked student an entry, including those who owe nothing', () => {
    state.members = [member('clear'), member('behind')];
    state.absences = [absence('behind', 'waiting')];
    return loadClassroomBacklog(supabase, 'c1', '2026-10-01').then((backlog) => {
      // A missing key would be indistinguishable from a failed read at the
      // caller, and "we could not tell" is the opposite of "they owe nothing".
      expect([...backlog.keys()].sort()).toEqual(['behind', 'clear']);
      expect(backlog.get('clear')!.ownOpen).toBe(0);
      expect(backlog.get('behind')!.ownOpen).toBe(1);
    });
  });

  it('leaves out students the catch-up pipeline does not track', async () => {
    state.members = [member('ok'), member('paused', { participation_status: 'dormant' })];
    const backlog = await loadClassroomBacklog(supabase, 'c1', '2026-10-01');
    expect(backlog.has('paused')).toBe(false);
    expect(backlog.has('ok')).toBe(true);
  });

  /**
   * The bug this test was written for. `summariseMissedClasses` already drops
   * blocked and pending_teacher items, so `openCount` never contained them.
   * Subtracting `blockedOnUs` from it again reported a student with three of
   * their own items and two of ours as owing one.
   */
  it('does not subtract blocked work from a count that never included it', async () => {
    state.members = [member('mixed')];
    state.absences = [
      absence('mixed', 'waiting', '2026-09-01'),
      absence('mixed', 'waiting', '2026-09-03'),
      absence('mixed', 'waiting', '2026-09-05'),
      absence('mixed', 'blocked', '2026-09-07'),
      absence('mixed', 'pending_teacher', '2026-09-09'),
    ];
    const b = (await loadClassroomBacklog(supabase, 'c1', '2026-10-01')).get('mixed')!;
    expect(b.ownOpen).toBe(3);
    expect(b.blockedOnUs).toBe(2);
    expect(b.openCount).toBe(3);
  });

  it('counts an excused class as work nobody owes', async () => {
    state.members = [member('excused')];
    state.absences = [absence('excused', 'excused')];
    const b = (await loadClassroomBacklog(supabase, 'c1', '2026-10-01')).get('excused')!;
    expect(b.ownOpen).toBe(0);
    expect(b.blockedOnUs).toBe(0);
  });

  it('orders a student items oldest class first', async () => {
    state.members = [member('s')];
    state.absences = [
      absence('s', 'waiting', '2026-09-20'),
      absence('s', 'waiting', '2026-09-02'),
      absence('s', 'waiting', '2026-09-11'),
    ];
    const b = (await loadClassroomBacklog(supabase, 'c1', '2026-10-01')).get('s')!;
    expect(b.items.map((i: any) => i.class.scheduled_date)).toEqual([
      '2026-09-02',
      '2026-09-11',
      '2026-09-20',
    ]);
  });

  it('returns nothing at all when the classroom has no tracked students', async () => {
    state.members = [member('gone', { removed: true })];
    expect((await loadClassroomBacklog(supabase, 'c1', '2026-10-01')).size).toBe(0);
  });
});

describe('loadAllClearStudents', () => {
  it('returns only the students with nothing outstanding and nothing blocked', async () => {
    state.members = [member('clear'), member('behind'), member('waiting-on-us')];
    state.absences = [
      absence('clear', 'done'),
      absence('behind', 'waiting'),
      absence('waiting-on-us', 'blocked'),
    ];
    const out = await loadAllClearStudents(supabase, 'c1');
    expect(out.map((s) => s.id)).toEqual(['clear']);
  });

  /**
   * A student blocked behind an unpublished recap has done nothing wrong, but
   * they are not "all clear" either: there is work outstanding, it is just ours.
   * Putting them on a wall their classmates read would say otherwise.
   */
  it('does not call a student clear while we owe them a recap', async () => {
    state.members = [member('waiting-on-us')];
    state.absences = [absence('waiting-on-us', 'blocked')];
    expect(await loadAllClearStudents(supabase, 'c1')).toEqual([]);
  });

  it('counts a student with no absence rows at all as clear', async () => {
    state.members = [member('spotless')];
    const out = await loadAllClearStudents(supabase, 'c1');
    expect(out.map((s) => s.id)).toEqual(['spotless']);
  });
});
