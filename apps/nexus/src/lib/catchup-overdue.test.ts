import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sweepOverdueMissedClasses, OVERDUE_COOLDOWN_DAYS } from './catchup-overdue';

vi.mock('./nudge-delivery', () => ({
  sendNudge: vi.fn(async () => ({ results: [], counts: {} })),
}));

// istTodayYmd is the only clock this module reads, so pinning it makes the
// whole sweep deterministic without freezing global time.
vi.mock('@neram/database', async () => {
  const actual = await vi.importActual<typeof import('@neram/database')>('@neram/database');
  return { ...actual, istTodayYmd: () => '2026-07-31' };
});

import { sendNudge } from './nudge-delivery';

const DAY = 86_400_000;

interface Fixture {
  absences?: any[];
  classrooms?: any[];
  teachers?: any[];
}

/** Records what the sweep writes, so the assertions can check side effects. */
function fakeSupabase(fx: Fixture) {
  const writes: { table: string; patch: any; ids?: string[] }[] = [];
  const inserts: { table: string; rows: any[] }[] = [];

  const api = {
    writes,
    inserts,
    from(table: string) {
      const builder: any = {
        _table: table,
        select: () => builder,
        eq: () => builder,
        neq: () => builder,
        is: () => builder,
        not: () => builder,
        in: (_col: string, ids: string[]) => {
          builder._ids = ids;
          return builder;
        },
        order: () => builder,
        update(patch: any) {
          const b: any = {
            in: (_c: string, ids: string[]) => {
              writes.push({ table, patch, ids });
              return Promise.resolve({ error: null });
            },
            eq: () => Promise.resolve({ error: null }),
          };
          return b;
        },
        insert(rows: any[]) {
          inserts.push({ table, rows });
          return Promise.resolve({ error: null });
        },
        then(resolve: any) {
          const data =
            table === 'nexus_class_absences'
              ? fx.absences || []
              : table === 'nexus_classrooms'
                ? fx.classrooms || DEFAULT_CLASSROOMS
                : table === 'nexus_enrollments'
                  ? fx.teachers || []
                  : [];
          return resolve({ data, error: null });
        },
      };
      return builder;
    },
  };
  return api;
}

/** A seven day window, which is the migration's default. */
const DEFAULT_CLASSROOMS = [
  { id: 'room-1', catchup_window_days: 7, catchup_optout_window_days: 3 },
];

/**
 * A class the student STARTED, which is the only kind the sweep looks at now.
 *
 * Default: started on the 22nd with a seven day window, so it was due on the
 * 28th and today (the 31st) it has run over.
 */
function absence(over: Record<string, unknown> = {}) {
  return {
    id: 'a1',
    student_id: 'stu-1',
    classroom_id: 'room-1',
    scheduled_class_id: 'class-1',
    kind: 'no_show',
    activated_on: '2026-07-22',
    days_used: 0,
    followup_sent_at: null,
    class: {
      id: 'class-1',
      title: 'Coordinate Geometry Basics',
      scheduled_date: '2026-07-22',
      status: 'completed',
      recording_url: 'https://sharepoint/rec.mp4',
      youtube_url: null,
    },
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('sweepOverdueMissedClasses', () => {
  it('chases a class whose clock has run out', async () => {
    // Started on the 22nd with a seven day window, so due on the 28th. Today is
    // the 31st.
    const supabase = fakeSupabase({
      absences: [absence()],
      teachers: [{ user_id: 'teacher-1' }],
    });

    const r = await sweepOverdueMissedClasses(supabase);

    expect(r.overdue).toBe(1);
    expect(r.studentsNudged).toBe(1);
    expect(sendNudge).toHaveBeenCalledOnce();
    expect(vi.mocked(sendNudge).mock.calls[0][0]).toMatchObject({
      studentIds: ['stu-1'],
      eventType: 'catchup_overdue',
    });
  });

  it('leaves a class alone while its clock is still running', async () => {
    // Started two days ago, so five of the seven days are left.
    const supabase = fakeSupabase({
      absences: [absence({ activated_on: '2026-07-29' })],
      teachers: [{ user_id: 'teacher-1' }],
    });

    const r = await sweepOverdueMissedClasses(supabase);
    expect(r.overdue).toBe(0);
    expect(sendNudge).not.toHaveBeenCalled();
  });

  it('counts the days already banked from an earlier stint', async () => {
    // Started again today, but five of the seven days were spent before, so it
    // is due in one day, not seven. Without banking, switching away and back
    // would be an unlimited extension.
    const fresh = fakeSupabase({
      absences: [absence({ activated_on: '2026-07-31', days_used: 5 })],
      teachers: [{ user_id: 'teacher-1' }],
    });
    expect((await sweepOverdueMissedClasses(fresh)).overdue).toBe(0);

    // And once they are spent, it is chased even though it was started today.
    vi.clearAllMocks();
    const spent = fakeSupabase({
      absences: [absence({ activated_on: '2026-07-31', days_used: 9 })],
      teachers: [{ user_id: 'teacher-1' }],
    });
    expect((await sweepOverdueMissedClasses(spent)).overdue).toBe(1);
  });

  it('ignores a class nobody has started, however old it is', async () => {
    // The whole point of the redesign. A June class sitting untouched in August
    // owes nothing, so nobody is messaged about it.
    const supabase = fakeSupabase({
      absences: [
        absence({
          activated_on: null,
          days_used: 0,
          class: { ...absence().class, scheduled_date: '2026-06-02' },
        }),
      ],
      teachers: [{ user_id: 'teacher-1' }],
    });

    const r = await sweepOverdueMissedClasses(supabase);
    expect(r.overdue).toBe(0);
    expect(sendNudge).not.toHaveBeenCalled();
  });

  it('chases a late joiner too, now that they have clocks', async () => {
    // The sweep used to skip kind = late_joiner outright, because their deadline
    // came from a weekly quota rather than the timetable. They start classes the
    // same way as everyone else now.
    const supabase = fakeSupabase({
      absences: [absence({ kind: 'late_joiner' })],
      teachers: [{ user_id: 'teacher-1' }],
    });

    const r = await sweepOverdueMissedClasses(supabase);
    expect(r.overdue).toBe(1);
    expect(r.studentsNudged).toBe(1);
  });

  it('gives a declined class the shorter window', async () => {
    // opted_out means they RSVPd no. Three days rather than seven, so a clock
    // started on the 28th is already over on the 31st.
    const supabase = fakeSupabase({
      absences: [absence({ kind: 'opted_out', activated_on: '2026-07-28' })],
      teachers: [{ user_id: 'teacher-1' }],
    });
    expect((await sweepOverdueMissedClasses(supabase)).overdue).toBe(1);

    // The same clock on a genuine absence still has time left.
    vi.clearAllMocks();
    const genuine = fakeSupabase({
      absences: [absence({ kind: 'no_show', activated_on: '2026-07-28' })],
      teachers: [{ user_id: 'teacher-1' }],
    });
    expect((await sweepOverdueMissedClasses(genuine)).overdue).toBe(0);
  });

  it('never chases a class that has no recording', async () => {
    // Chasing someone for this would be chasing them for our own missing video.
    const supabase = fakeSupabase({
      absences: [
        absence({
          class: { ...absence().class, recording_url: null, youtube_url: null },
        }),
      ],
    });

    const r = await sweepOverdueMissedClasses(supabase);
    expect(r.overdue).toBe(0);
    expect(sendNudge).not.toHaveBeenCalled();
  });

  it('skips a cancelled class', async () => {
    const supabase = fakeSupabase({
      absences: [absence({ class: { ...absence().class, status: 'cancelled' } })],
    });

    const r = await sweepOverdueMissedClasses(supabase);
    expect(r.scanned).toBe(0);
    expect(sendNudge).not.toHaveBeenCalled();
  });

  it('respects the cooldown so a daily run does not chase daily', async () => {
    // This is what makes a daily cron safe. The student was messaged yesterday.
    const supabase = fakeSupabase({
      absences: [absence({ followup_sent_at: new Date(Date.now() - 1 * DAY).toISOString() })],
      teachers: [{ user_id: 'teacher-1' }],
    });

    const r = await sweepOverdueMissedClasses(supabase);
    // Still counted as overdue for the teacher, just not messaged again.
    expect(r.overdue).toBe(1);
    expect(r.studentsNudged).toBe(0);
    expect(sendNudge).not.toHaveBeenCalled();
  });

  it('chases again once the cooldown has expired', async () => {
    const supabase = fakeSupabase({
      absences: [
        absence({
          followup_sent_at: new Date(Date.now() - (OVERDUE_COOLDOWN_DAYS + 2) * DAY).toISOString(),
        }),
      ],
      teachers: [{ user_id: 'teacher-1' }],
    });

    const r = await sweepOverdueMissedClasses(supabase);
    expect(r.studentsNudged).toBe(1);
  });

  it('sends one message for a student behind in more than one classroom', async () => {
    // Four notifications for one conversation is how a nudge becomes noise.
    // One clock per classroom, so this is a student enrolled in two of them.
    const supabase = fakeSupabase({
      absences: [
        absence({ id: 'a1', scheduled_class_id: 'c1' }),
        absence({
          id: 'a2',
          scheduled_class_id: 'c2',
          class: { ...absence().class, id: 'c2', scheduled_date: '2026-07-20' },
        }),
      ],
      teachers: [{ user_id: 'teacher-1' }],
    });

    const r = await sweepOverdueMissedClasses(supabase);
    expect(r.overdue).toBe(2);
    expect(r.studentsNudged).toBe(1);
    expect(sendNudge).toHaveBeenCalledOnce();

    // It names the oldest one, and says how many there are.
    const call = vi.mocked(sendNudge).mock.calls[0][0];
    expect(call.plain).toContain('2026-07-20');
    expect(call.metadata).toMatchObject({ overdue_count: 2 });
  });

  it('stamps every chased item so the cooldown covers all of them', async () => {
    const supabase = fakeSupabase({
      absences: [
        absence({ id: 'a1', scheduled_class_id: 'c1' }),
        absence({
          id: 'a2',
          scheduled_class_id: 'c2',
          class: { ...absence().class, id: 'c2', scheduled_date: '2026-07-20' },
        }),
      ],
      teachers: [{ user_id: 'teacher-1' }],
    });

    await sweepOverdueMissedClasses(supabase);

    const stamp = supabase.writes.find((w) => w.table === 'nexus_class_absences');
    expect(stamp?.ids?.sort()).toEqual(['a1', 'a2']);
    expect(stamp?.patch).toHaveProperty('followup_sent_at');
  });

  it('tells the classroom teachers once, not once per student', async () => {
    const supabase = fakeSupabase({
      absences: [
        absence({ id: 'a1', student_id: 'stu-1' }),
        absence({ id: 'a2', student_id: 'stu-2' }),
        absence({ id: 'a3', student_id: 'stu-3' }),
      ],
      teachers: [{ user_id: 'teacher-1' }, { user_id: 'teacher-2' }],
    });

    const r = await sweepOverdueMissedClasses(supabase);
    expect(r.studentsNudged).toBe(3);
    // Two teachers, one row each, for the whole classroom.
    expect(r.teachersNotified).toBe(2);

    const notif = supabase.inserts.find((i) => i.table === 'nexus_timetable_notifications');
    expect(notif?.rows).toHaveLength(2);
    expect(notif?.rows[0]).toMatchObject({ event_type: 'catchup_overdue' });
    expect(notif?.rows[0].title).toContain('3 students');
  });

  it('does nothing at all when nobody is behind', async () => {
    const supabase = fakeSupabase({ absences: [] });
    const r = await sweepOverdueMissedClasses(supabase);
    expect(r).toMatchObject({ scanned: 0, overdue: 0, studentsNudged: 0, teachersNotified: 0 });
    expect(sendNudge).not.toHaveBeenCalled();
  });

  it('keeps going when one nudge fails', async () => {
    vi.mocked(sendNudge)
      .mockRejectedValueOnce(new Error('Teams is down'))
      .mockResolvedValueOnce({ results: [], counts: {} } as any);

    const supabase = fakeSupabase({
      absences: [absence({ id: 'a1', student_id: 'stu-1' }), absence({ id: 'a2', student_id: 'stu-2' })],
      teachers: [{ user_id: 'teacher-1' }],
    });

    const r = await sweepOverdueMissedClasses(supabase);
    expect(r.studentsNudged).toBe(1);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]).toContain('Teams is down');
  });

  it('uses no em dashes in anything it sends, per the house copy rule', async () => {
    const supabase = fakeSupabase({
      absences: [absence()],
      teachers: [{ user_id: 'teacher-1' }],
    });

    await sweepOverdueMissedClasses(supabase);

    const call = vi.mocked(sendNudge).mock.calls[0][0];
    for (const text of [call.subject, call.plain, call.teamsText || '']) {
      expect(text).not.toMatch(/[—–]|--/);
    }
    const notif = supabase.inserts.find((i) => i.table === 'nexus_timetable_notifications');
    for (const row of notif?.rows || []) {
      expect(`${row.title} ${row.message}`).not.toMatch(/[—–]|--/);
    }
  });
});
