import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Round-1 review finding: loadParentClassWindow and loadParentClassDetail are
 * the two remaining callers of buildClassAttendanceViews that did not get a
 * sessionWindows map when the parent-facing attendance rule was fixed to read
 * the class's real end (attendance-register.ts's sessionWindow/presenceOf)
 * instead of the booked end. Both feed api/parent/timetable and
 * api/parent/classes/[classId], which render straight into ParentClassSheet,
 * so a parent opening their child's timetable was still reading "Left early"
 * about a class that simply finished ahead of its booking.
 *
 * These tests exercise the DB-touching loaders themselves (not just the pure
 * buildClassAttendanceViews/sessionWindow functions, already covered in
 * parent-attendance.test.ts), because the bug lived in the wiring: whether the
 * roster-wide attendance rows each loader already reads get turned into a
 * sessionWindows map and threaded through, exactly as loadChildAttendance does
 * in lib/parent-data.ts.
 *
 * The fake Supabase client below is a generic table store with eq/in/is
 * filtering, good enough for the handful of queries these two functions make.
 * loadClassFacts and loadClassPrepStates are replaced outright (rather than
 * modelled through the fake tables) because their own query shapes are
 * covered by their own test suites and are irrelevant to this fix.
 */

const state = vi.hoisted(() => {
  const tables: Record<string, any[]> = {};

  function makeBuilder(table: string) {
    const eqFilters: Array<[string, unknown]> = [];
    const inFilters: Array<[string, unknown[]]> = [];

    function resolveRows(): any[] {
      let rows = tables[table] || [];
      for (const [col, val] of eqFilters) {
        rows = rows.filter((r) => (val === null ? r[col] == null : r[col] === val));
      }
      for (const [col, vals] of inFilters) {
        rows = rows.filter((r) => vals.includes(r[col]));
      }
      return rows;
    }

    const builder: any = {
      select: () => builder,
      eq: (col: string, val: unknown) => {
        eqFilters.push([col, val]);
        return builder;
      },
      is: (col: string, val: unknown) => {
        eqFilters.push([col, val]);
        return builder;
      },
      in: (col: string, vals: unknown[]) => {
        inFilters.push([col, vals]);
        return builder;
      },
      // Date-range and OR filters are no-ops here: every test seeds exactly the
      // rows it wants a query to see, so there is nothing left for these to
      // narrow down.
      gte: () => builder,
      lte: () => builder,
      or: () => builder,
      order: () => builder,
      maybeSingle: async () => ({ data: resolveRows()[0] ?? null, error: null }),
      then: (onFulfilled: any, onRejected: any) =>
        Promise.resolve({ data: resolveRows(), error: null }).then(onFulfilled, onRejected),
    };
    return builder;
  }

  return {
    tables,
    client: { from: (table: string) => makeBuilder(table) },
  };
});

vi.mock('@neram/database', () => ({
  getSupabaseAdminClient: () => state.client,
  loadClassFacts: async () => ({
    recapByClass: new Map(),
    completedRecaps: new Set(),
    assignmentsByClass: new Map(),
    submitted: new Set(),
    testByClass: new Map(),
  }),
  isWatched: () => false,
  loadClassPrepStates: async () => new Map(),
}));

import { loadParentClassWindow, loadParentClassDetail } from './parent-classes';
import type { ClassScope } from './parent-data';

const CLASSROOM_ID = 'classroom-1';
const CLASS_ID = 'class-1';
const CHILD_ID = 'child-1';
const SCOPE: ClassScope = { batchId: null };

/** A class booked 7:00-8:30 PM, dated well in the past so classPhase reads it as settled. */
function classRow() {
  return {
    id: CLASS_ID,
    classroom_id: CLASSROOM_ID,
    batch_id: null,
    publish_state: 'published',
    title: 'Basic 3D',
    description: null,
    scheduled_date: '2020-01-15',
    start_time: '19:00:00',
    end_time: '20:30:00',
    status: 'completed',
    recording_url: null,
    youtube_url: null,
    teacher: null,
    topic: null,
    course_topic: null,
    classroom: null,
  };
}

const at = (hhmm: string) => `2020-01-15T${hhmm}:00+05:30`;

/** The room emptied at 8:10, twenty minutes ahead of the 8:30 booking. */
function roomAttendanceRows() {
  return [
    {
      scheduled_class_id: CLASS_ID,
      student_id: CHILD_ID,
      attended: true,
      joined_at: at('19:02'),
      left_at: at('20:10'),
      duration_minutes: 68,
      attendance_intervals: [{ joinDateTime: at('19:02'), leaveDateTime: at('20:10') }],
    },
    {
      scheduled_class_id: CLASS_ID,
      student_id: 'other-1',
      attended: true,
      joined_at: at('19:00'),
      left_at: at('20:10'),
      duration_minutes: 70,
      attendance_intervals: [{ joinDateTime: at('19:00'), leaveDateTime: at('20:10') }],
    },
    {
      scheduled_class_id: CLASS_ID,
      student_id: 'other-2',
      attended: true,
      joined_at: at('19:00'),
      left_at: at('20:10'),
      duration_minutes: 70,
      attendance_intervals: [{ joinDateTime: at('19:00'), leaveDateTime: at('20:10') }],
    },
  ];
}

beforeEach(() => {
  for (const key of Object.keys(state.tables)) delete state.tables[key];
  state.tables.nexus_scheduled_classes = [classRow()];
  state.tables.nexus_attendance = roomAttendanceRows();
  state.tables.nexus_class_absences = [];
  state.tables.nexus_classroom_holidays = [];
  state.tables.nexus_class_resources = [];
  state.tables.nexus_class_tags = [];
});

describe('loadParentClassWindow reads the room, not the booking', () => {
  it('does not report the child as leaving early when the whole room left together', async () => {
    const result = await loadParentClassWindow(
      CHILD_ID,
      CLASSROOM_ID,
      SCOPE,
      '2019-01-01',
      '2020-12-31'
    );
    expect(result.attendanceViews).toHaveLength(1);
    expect(result.attendanceViews[0].leftEarly).toBe(false);
    expect(result.attendanceViews[0].label).toBe('attended');
  });
});

describe('loadParentClassDetail reads the room, not the booking', () => {
  it('does not report the child as leaving early when the whole room left together', async () => {
    const result = await loadParentClassDetail(CHILD_ID, CLASSROOM_ID, SCOPE, CLASS_ID);
    expect(result).not.toBeNull();
    // loadParentClassDetail folds the attendance view into cls.attendance
    // (via toParentClass), rather than returning attendanceViews directly the
    // way loadParentClassWindow does.
    expect(result?.cls.attendance?.leftEarly).toBe(false);
    expect(result?.cls.attendance?.label).toBe('attended');
  });
});
