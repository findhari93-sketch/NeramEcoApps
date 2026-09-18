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
  // Every `.order(col)` call any query builder made, by table. Not the same
  // fixture as `writes`: this records reads, so a regression that drops the
  // ordering fix (rather than adding an illegal write) still gets caught.
  orderCalls: [] as Array<{ table: string; cols: string[] }>,
}));

// PostgREST's own default row cap, simulated so a fixture that forgets to
// page a read fails the same way the real backend would: truncated at 1,000,
// not an accidentally-complete result the mock made up.
const SERVER_ROW_CAP = 1000;

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
  let rangeArgs: [number, number] | null = null;
  const orderCols: string[] = [];
  const chain = () => b;
  for (const method of ['select', 'eq', 'in', 'gte', 'lte', 'not', 'limit']) {
    b[method] = chain;
  }
  // Recorded, not just chained through: this is what the ordering regression
  // test below inspects. A static in-memory array cannot honestly reproduce
  // a row shifting across a page boundary mid-sync (there is no second
  // writer, no MVCC, nothing to reorder), so this mock does not attempt
  // that. What it can pin is that the fix's actual mechanism, an explicit
  // `.order()` on every paginated read, stays wired up.
  b.order = (col: string) => {
    orderCols.push(col);
    return b;
  };
  // Records the page this call asked for, so `.then` below can slice like a
  // real `.range()` would. A query that never calls `.range()` at all reads
  // as page 0 of the server's own 1,000-row cap, exactly like production.
  b.range = (from: number, to: number) => {
    rangeArgs = [from, to];
    return b;
  };
  for (const method of ['insert', 'update', 'upsert', 'delete']) {
    b[method] = () => {
      state.writes.push(`${table}.${method}`);
      return Promise.resolve({ data: null, error: null });
    };
  }
  b.maybeSingle = () => Promise.resolve({ data: rows()[0] ?? null, error: null });
  b.single = () => Promise.resolve({ data: rows()[0] ?? null, error: null });
  b.then = (onFulfilled: (v: unknown) => unknown) => {
    if (orderCols.length) state.orderCalls.push({ table, cols: [...orderCols] });
    const all = rows() as unknown[];
    const [from, to] = rangeArgs ?? [0, SERVER_ROW_CAP - 1];
    return Promise.resolve({ data: all.slice(from, to + 1), error: null }).then(onFulfilled);
  };
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
  state.orderCalls = [];
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

  it('orders every paginated read by its table\'s own unique pair, so a row cannot shift across a page boundary', async () => {
    // `.range()` alone promises nothing about which row lands on which page:
    // Postgres gives no row order at all without an explicit ORDER BY, so a
    // sync upsert landing between one page read and the next could move a
    // row from an unfetched page to an already-fetched one (or the reverse),
    // and pagination would never see it either way. The fix is that every
    // paginated read here orders by its table's UNIQUE(scheduled_class_id,
    // student_id) constraint, which is total (no two rows can tie on both
    // columns), not merely "stable-ish".
    //
    // This mock's static in-memory array cannot honestly reproduce that
    // hazard: there is no second writer and nothing to reorder mid-read, so
    // a simulated "row moved" scenario here would only prove the mock's own
    // sort is stable, not anything about the real fix. What this test pins
    // instead is that the fix's actual mechanism stays wired up: a
    // regression that quietly dropped one of these `.order()` calls would
    // still pass every other test in this file, because the mock's
    // insertion order already happens to match.
    await call();
    for (const table of ['nexus_attendance', 'nexus_class_absences', 'nexus_class_rsvp']) {
      const calls = state.orderCalls.filter((o) => o.table === table);
      expect(calls.length).toBeGreaterThan(0);
      for (const c of calls) {
        expect(c.cols).toEqual(['scheduled_class_id', 'student_id']);
      }
    }
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

  it('excludes a roster member with no batch_id from a batch-scoped class', async () => {
    // A member of the right batch appears in the same assertion set, so one
    // test covers both halves of the guard: excluded when unbatched, included
    // when matching. Regression case for the null-batch_id short-circuit bug:
    // `m.batch_id && ...` treated a null batch_id as "no opinion" instead of
    // "not in this batch", so every unbatched member leaked into a batch-scoped
    // class's cells and counts.
    state.classes.push({
      id: 'class-2',
      title: 'Batch Only Session',
      scheduled_date: '2026-09-14',
      start_time: '19:00:00',
      end_time: '20:30:00',
      batch_id: 'batch-A',
      attendance_sync_status: 'ok',
    });
    state.members.push({
      user_id: 'batchStudent',
      enrolled_at: '2026-06-01T00:00:00Z',
      batch_id: 'batch-A',
      current_standard: null,
      user: { name: 'Student E', avatar_url: null },
    });
    // Teams has read this class (a manual absence mark, in this fixture), so
    // it is measured and the loop this test means to exercise actually runs.
    // Without this row class-2 has none at all, which the Finding 1 fix now
    // reads as "not synced yet" and skips entirely, which is a different
    // scenario than the batch-scoping this test is about.
    state.attendance.push({ scheduled_class_id: 'class-2', student_id: 'batchStudent', attended: false });

    const body = await (await call()).json();
    const cells = body.cells['class-2'];
    expect(Object.keys(cells)).toEqual(['batchStudent']);
    const classTwo = body.classes.find((c: { id: string }) => c.id === 'class-2');
    expect(classTwo.counts).toEqual({ whole: 0, partly: 0, reason: 0, noReason: 1, joinedLater: 0 });
  });

  it('drops an excused absence from the denominator, not just from present', async () => {
    // Excusing a class is the teacher saying it is not held against the
    // student. It must stay visible (the 'reason' group, the class counts)
    // while leaving their percentage, which is why `counted` has to drop too,
    // not only `present`.
    state.members.push({
      user_id: 'excused',
      enrolled_at: '2026-06-01T00:00:00Z',
      batch_id: null,
      current_standard: null,
      user: { name: 'Student F', avatar_url: null },
    });
    state.absences.push({
      scheduled_class_id: 'class-1',
      student_id: 'excused',
      kind: 'no_show',
      reason_code: null,
      reason_note: null,
      excused_at: '2026-09-16T00:00:00Z',
      caught_up_at: null,
    });

    const body = await (await call()).json();
    expect(body.cells['class-1'].excused.g).toBe('reason');
    expect(body.classes[0].counts.reason).toBe(1);
    const student = body.students.find((s: { id: string }) => s.id === 'excused');
    expect(student.counted).toBe(0);
    expect(student.rate).toBe(null);
  });

  // A dormant student is not reachable as a regression test here: this
  // route's mock of loadClassroomRoster is a stub that returns exactly
  // `state.members` unfiltered, it does not reimplement the real
  // participation_status filtering. In production, loadClassroomRoster is
  // called with its default options (includeDormant left false), so a
  // dormant member is dropped from `members` before this route ever sees the
  // array; the route itself has no dormant-filtering code path to exercise.
  // Putting a dormant-flagged row into state.members here and asserting it is
  // absent from `students`/`cells` would only prove the test fixture was
  // written without one, not that the route filters anything, so it is
  // skipped per the brief's own fallback instruction. What the route DOES
  // own, reporting `rosterCounts.dormant` as `paused_hidden`, is already
  // covered by 'says how many dormant students were hidden' above.

  it('never reports a class with no attendance rows as its roster missing', async () => {
    // Finding 1: a class whose Teams attendance was never read (or whose sync
    // failed) used to hand every enrolled student a "no reason" cell, because
    // `attended` defaults to false when there is no attendance row at all.
    // A never-synced class is not the same fact as a room full of no-shows,
    // and this is the fixture that would have caught the two being confused.
    state.classes.push({
      id: 'class-unsynced',
      title: 'Never Read From Teams',
      scheduled_date: '2026-09-10',
      start_time: '19:00:00',
      end_time: '20:30:00',
      batch_id: null,
      attendance_sync_status: null,
    });
    // Deliberately no state.attendance rows for class-unsynced.

    const body = await (await call()).json();
    const cls = body.classes.find((c: { id: string }) => c.id === 'class-unsynced');
    expect(cls.measured).toBe(false);
    expect(cls.held).toBe(null);
    // No cell claims a group for anybody on this class: not "no reason",
    // not any of the other four. The column has nothing to say.
    expect(body.cells['class-unsynced']).toEqual({});
    // Its own counts stay at zero rather than a roster's worth of "no reason".
    expect(cls.counts).toEqual({ whole: 0, partly: 0, reason: 0, noReason: 0, joinedLater: 0 });
    // And it never enters anybody's percentage: the always-attending
    // 'stayed' student's rate is unaffected by the unsynced class existing.
    const stayed = body.students.find((s: { id: string }) => s.id === 'stayed');
    expect(stayed.counted).toBe(1);
    expect(stayed.rate).toBe(100);
  });

  it('pages an attendance read past the row cap instead of truncating it', async () => {
    // Finding 3: a single unpaginated `.in(classIds)` truncates silently at
    // PostgREST's 1,000-row default, and a truncated read renders every
    // missing row as a student who did not attend, the same falsehood
    // Finding 1 fixed for an unmeasured class. The mock's `.then` caps an
    // un-ranged read at that same 1,000, exactly like the real backend, so
    // this fixture would fail if the route ever went back to one bare `.in()`.
    const bulk = Array.from({ length: 1200 }, (_, i) => ({
      scheduled_class_id: 'class-1',
      student_id: `bulk-${i}`,
      attended: true,
      joined_at: '2026-09-15T13:32:00Z',
      left_at: '2026-09-15T14:40:00Z',
      attendance_intervals: [{ joinDateTime: '2026-09-15T13:32:00Z', leaveDateTime: '2026-09-15T14:40:00Z' }],
    }));
    state.attendance = bulk;
    state.members = bulk.map((a) => ({
      user_id: a.student_id,
      enrolled_at: '2026-06-01T00:00:00Z',
      batch_id: null,
      current_standard: null,
      user: { name: a.student_id, avatar_url: null },
    }));

    const body = await (await call()).json();
    const cells = body.cells['class-1'];
    expect(Object.keys(cells).length).toBe(1200);
    // The 1,001st and last rows are exactly the ones a single-page read
    // would have dropped.
    expect(cells['bulk-1000'].g).toBe('whole');
    expect(cells['bulk-1199'].g).toBe('whole');
  });

  it('errors rather than silently truncating when a read never ends within the page guard', async () => {
    // fetchAllPages used to stop quietly at MAX_PAGES and hand back whatever
    // it had read so far, which is the same class of falsehood as an
    // unbounded `.in()`: rows past the cutoff would render as students who
    // did not attend instead of surfacing that the read did not finish. An
    // exact multiple of the page size (20,000, the guard's own limit) is the
    // fixture that exercises it without needing an unrealistically huge array.
    const huge = Array.from({ length: 20000 }, (_, i) => ({
      scheduled_class_id: 'class-1',
      student_id: `overflow-${i}`,
      attended: true,
      joined_at: '2026-09-15T13:32:00Z',
      left_at: '2026-09-15T14:40:00Z',
      attendance_intervals: [{ joinDateTime: '2026-09-15T13:32:00Z', leaveDateTime: '2026-09-15T14:40:00Z' }],
    }));
    state.attendance = huge;

    const res = await call();
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/did not end/i);
  });
});
