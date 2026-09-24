import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The headline bug fix (measure "left early" against when the room actually
 * emptied, not the booked end) was proven at the module level in
 * lib/attendance-register.test.ts, but nothing proved this route actually
 * calls that module rather than computing its own booked-end comparison, the
 * way it used to. This file is that missing proof: a class booked 7:00 to
 * 8:30 PM where the room emptied at 8:10 must come back with `leftEarly`
 * false for its attendees, and this test must fail if the route goes back to
 * measuring against the booked end.
 */

const state = vi.hoisted(() => ({
  classRow: null as Record<string, unknown> | null,
  attendance: [] as Record<string, unknown>[],
  rsvps: [] as Record<string, unknown>[],
  absences: [] as Record<string, unknown>[],
  awayWindows: [] as Record<string, unknown>[],
  members: [] as Record<string, unknown>[],
}));

function builder(table: string) {
  const b: Record<string, unknown> = {};
  const rows = () => {
    if (table === 'nexus_attendance') return state.attendance;
    if (table === 'nexus_class_rsvp') return state.rsvps;
    if (table === 'nexus_class_absences') return state.absences;
    if (table === 'nexus_student_away_windows') return state.awayWindows;
    return [];
  };
  const chain = () => b;
  for (const method of ['select', 'eq', 'in', 'gte', 'lte', 'not', 'is', 'or', 'order', 'limit']) {
    b[method] = chain;
  }
  b.single = () => {
    if (table === 'users') return Promise.resolve({ data: { id: 'staff-1', user_type: 'teacher' }, error: null });
    if (table === 'nexus_scheduled_classes') return Promise.resolve({ data: state.classRow, error: null });
    return Promise.resolve({ data: null, error: null });
  };
  b.maybeSingle = b.single;
  b.then = (onFulfilled: (v: unknown) => unknown) =>
    Promise.resolve({ data: rows(), error: null }).then(onFulfilled);
  return b;
}

vi.mock('@neram/database', () => ({
  getSupabaseAdminClient: () => ({ from: (table: string) => builder(table) }),
  loadClassroomRoster: async () => ({ members: state.members, ids: state.members.map((m) => m.user_id as string), dormantIds: [] }),
  istTodayYmd: () => '2026-09-15',
  readCatchupWindows: async () => [],
  resolveCatchupBacklog: () => [null],
  toFacts: () => ({}),
}));

vi.mock('@/lib/ms-verify', () => ({ verifyMsToken: async () => ({ oid: 'ms-oid-1' }) }));
// Real per-student catch-up resolution touches six more tables; nobody in
// this fixture is absent, so `catchupFor` returns null before it is ever
// reached. Mocked out anyway so importing the route never needs a real one.
vi.mock('@/lib/catchup-facts', () => ({ loadClassFactsForStudents: async () => new Map() }));
// Real module chains into Graph/Teams lookup code that has no place in a unit
// test; only the static message table is actually read by this route.
vi.mock('@/lib/attendance-sync', () => ({ ATTENDANCE_FAILURE_MESSAGES: {} }));

const { GET } = await import('./route');

const call = () =>
  GET(
    new NextRequest('http://localhost/api/timetable/class-insights?class_id=class-1&classroom_id=c1', {
      headers: { Authorization: 'Bearer token' },
    }),
  );

/** The 15 Sep 2026 class: booked 7:00 to 8:30 PM IST, room emptied about 8:10. */
const ist = (hhmm: string) => `2026-09-15T${hhmm}:00+05:30`;

beforeEach(() => {
  state.classRow = {
    id: 'class-1',
    title: 'Basic 3D Shape Composition',
    scheduled_date: '2026-09-15',
    start_time: '19:00:00',
    end_time: '20:30:00',
    classroom_id: 'c1',
    status: 'published',
    attendance_synced_at: '2026-09-15T15:00:00Z',
    attendance_sync_status: 'ok',
    teams_meeting_id: 'meeting-1',
    recording_url: null,
    youtube_url: null,
  };
  // Five attendees who all leave within a few minutes of 8:10 PM, the same
  // shape as production's 15 Sep class and as the sessionWindow fixture in
  // lib/attendance-register.test.ts's "class-insights regression" case. The
  // 80th percentile of these leave times is 8:10 PM, twenty minutes before
  // the booked 8:30 end: exactly the gap that used to flag every one of them.
  const leaves = ['20:03', '20:10', '20:10', '20:10', '20:13'];
  state.attendance = leaves.map((t, i) => ({
    student_id: `s${i}`,
    attended: true,
    joined_at: ist('19:03'),
    left_at: ist(t),
    duration_minutes: 67,
    attendance_intervals: [{ joinDateTime: ist('19:03'), leaveDateTime: ist(t) }],
  }));
  state.members = leaves.map((_, i) => ({
    user_id: `s${i}`,
    enrolled_at: '2026-06-01T00:00:00Z',
    current_standard: null,
    participation_status: 'active',
    enrolled: true,
    user: { name: `Student ${i}`, avatar_url: null, phone: null },
  }));
  state.rsvps = [];
  state.absences = [];
  state.awayWindows = [];
});

describe('GET /api/timetable/class-insights, the real-end regression', () => {
  it('measures the real end of the class, not the booked one', async () => {
    const body = await (await call()).json();
    expect(body.summary.held.source).toBe('observed');
    // 7:00 PM to 8:10 PM IST is 70 minutes; the booked span was 90.
    expect(body.summary.held.minutes).toBe(70);
  });

  it('does not flag any of them as leaving early, though every one left well before the booked 8:30 end', async () => {
    // This is the assertion that fails if the route ever measures against
    // `cls.end_time` (the booked 8:30) again: every attendee here left 17 to
    // 27 minutes before that booked end, so a booked-end comparison would
    // flag all five, the exact bug the shared sessionWindow module exists to
    // prevent. Measured against the room's real end (about 8:10), none of
    // them left more than a few minutes early.
    const body = await (await call()).json();
    expect(body.students).toHaveLength(5);
    for (const student of body.students) {
      expect(student.leftEarly).toBe(false);
    }
    expect(body.summary.leftEarlyCount).toBe(0);
  });
});

describe('GET /api/timetable/class-insights, one reason and one follow-up state', () => {
  beforeEach(() => {
    // A sixth student, on declared exam leave over the class date, with no
    // absence reason and no RSVP: the case the panel printed as "No reason
    // given" under a "Told us why" heading.
    state.members.push({
      user_id: 'away-1',
      enrolled_at: '2026-06-01T00:00:00Z',
      current_standard: null,
      participation_status: 'active',
      enrolled: true,
      user: { name: 'Sanjay Kumar', avatar_url: null, phone: null },
    });
    state.awayWindows = [
      {
        id: 'w1',
        student_id: 'away-1',
        starts_on: '2026-09-10',
        ends_on: '2026-09-20',
        reason_code: 'clash',
        reason_note: null,
        source: 'student',
        cancelled_at: null,
        created_at: '2026-09-05T10:00:00Z',
      },
    ];
  });

  it('says why an away student missed it, and files them as told us why', async () => {
    const body = await (await call()).json();
    const away = body.students.find((s: { id: string }) => s.id === 'away-1');
    expect(away.reason_resolved).toMatchObject({ code: 'clash', source: 'away' });
    expect(away.reason_resolved.line).toMatch(/^Exam clash · Away /);
    expect(away.followup).toBe('catching_up');
  });

  it('gives every student exactly one follow-up state', async () => {
    const body = await (await call()).json();
    const t = body.followup.tally as Record<string, number>;
    const sum = Object.values(t).reduce((n, v) => n + v, 0);
    expect(sum).toBe(body.students.length);
    expect(t.attended + t.partly).toBe(5);
    expect(body.followup.missed).toBe(1);
  });
});

