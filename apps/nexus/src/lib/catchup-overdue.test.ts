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
  classes?: any[];
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
              : table === 'nexus_scheduled_classes'
                ? fx.classes || []
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

function absence(over: Record<string, unknown> = {}) {
  return {
    id: 'a1',
    student_id: 'stu-1',
    classroom_id: 'room-1',
    scheduled_class_id: 'class-1',
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

/** A term where the course ran on the 22nd and again on the 28th. */
const TERM = [
  { classroom_id: 'room-1', scheduled_date: '2026-07-22' },
  { classroom_id: 'room-1', scheduled_date: '2026-07-28' },
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe('sweepOverdueMissedClasses', () => {
  it('chases a class whose deadline has passed', async () => {
    // Missed the 22nd, course ran again on the 28th, today is the 31st.
    const supabase = fakeSupabase({
      absences: [absence()],
      classes: TERM,
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

  it('leaves a class alone while it is still within its deadline', async () => {
    // The course has not run again yet, so the fallback deadline is the 29th of
    // August, comfortably ahead of today.
    const supabase = fakeSupabase({
      absences: [absence({ class: { ...absence().class, scheduled_date: '2026-07-28' } })],
      classes: [{ classroom_id: 'room-1', scheduled_date: '2026-07-28' }],
      teachers: [{ user_id: 'teacher-1' }],
    });

    const r = await sweepOverdueMissedClasses(supabase);
    expect(r.overdue).toBe(0);
    expect(sendNudge).not.toHaveBeenCalled();
  });

  it('never chases a class that has no recording', async () => {
    // Chasing someone for this would be chasing them for our own missing video.
    const supabase = fakeSupabase({
      absences: [
        absence({
          class: { ...absence().class, recording_url: null, youtube_url: null },
        }),
      ],
      classes: TERM,
    });

    const r = await sweepOverdueMissedClasses(supabase);
    expect(r.overdue).toBe(0);
    expect(sendNudge).not.toHaveBeenCalled();
  });

  it('skips a cancelled class', async () => {
    const supabase = fakeSupabase({
      absences: [absence({ class: { ...absence().class, status: 'cancelled' } })],
      classes: TERM,
    });

    const r = await sweepOverdueMissedClasses(supabase);
    expect(r.scanned).toBe(0);
    expect(sendNudge).not.toHaveBeenCalled();
  });

  it('respects the cooldown so a daily run does not chase daily', async () => {
    // This is what makes a daily cron safe. The student was messaged yesterday.
    const supabase = fakeSupabase({
      absences: [absence({ followup_sent_at: new Date(Date.now() - 1 * DAY).toISOString() })],
      classes: TERM,
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
      classes: TERM,
      teachers: [{ user_id: 'teacher-1' }],
    });

    const r = await sweepOverdueMissedClasses(supabase);
    expect(r.studentsNudged).toBe(1);
  });

  it('sends one message for a student who owes several classes', async () => {
    // Four notifications for one conversation is how a nudge becomes noise.
    const supabase = fakeSupabase({
      absences: [
        absence({ id: 'a1', scheduled_class_id: 'c1' }),
        absence({
          id: 'a2',
          scheduled_class_id: 'c2',
          class: { ...absence().class, id: 'c2', scheduled_date: '2026-07-20' },
        }),
      ],
      classes: [
        { classroom_id: 'room-1', scheduled_date: '2026-07-20' },
        ...TERM,
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
      classes: [{ classroom_id: 'room-1', scheduled_date: '2026-07-20' }, ...TERM],
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
      classes: TERM,
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
    const supabase = fakeSupabase({ absences: [], classes: TERM });
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
      classes: TERM,
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
      classes: TERM,
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
