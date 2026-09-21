import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The expected headcount.
 *
 * Two invariants hold for every class this route describes, and almost every
 * test here is really one of them in disguise:
 *
 *   attending + not_attending === total      (nobody is counted twice)
 *   total + away === on_roll                 (away left the denominator, and
 *                                             the roll it left is still stated)
 *
 * The second is the whole feature. The first is what breaks the moment somebody
 * decides an away student who also tapped "cannot attend" belongs in both lists.
 */

const state = vi.hoisted(() => ({
  userType: 'teacher' as string,
  classes: [] as Record<string, unknown>[],
  rsvps: [] as Record<string, unknown>[],
  awayWindows: [] as Record<string, unknown>[],
  awayError: null as unknown,
  members: [] as Record<string, unknown>[],
  writes: [] as string[],
}));

function builder(table: string) {
  const b: Record<string, unknown> = {};
  const rows = () => {
    if (table === 'nexus_scheduled_classes') return state.classes;
    if (table === 'nexus_class_rsvp') return state.rsvps;
    if (table === 'nexus_student_away_windows') return state.awayWindows;
    if (table === 'users') return [{ id: 'staff-1', user_type: state.userType }];
    return [];
  };
  const chain = () => b;
  for (const m of ['select', 'eq', 'gte', 'lte', 'not', 'is', 'or', 'in', 'order', 'limit']) {
    b[m] = chain;
  }

  // `neq` is applied rather than waved through, because the route's
  // .neq('status', 'cancelled') now decides more than which class rows appear:
  // it decides whether a DATE reads as scheduled or as free to book. A
  // pass-through stub would let a test assert the opposite of production.
  const neqs: [string, unknown][] = [];
  b.neq = (column: string, value: unknown) => {
    neqs.push([column, value]);
    return b;
  };
  for (const m of ['insert', 'update', 'upsert', 'delete']) {
    b[m] = () => {
      state.writes.push(`${table}.${m}`);
      return Promise.resolve({ data: null, error: null });
    };
  }
  const settle = () => {
    if (table === 'nexus_student_away_windows' && state.awayError) {
      return { data: null, error: state.awayError };
    }
    let out = rows();
    for (const [column, value] of neqs) {
      out = out.filter((r) => (r as Record<string, unknown>)[column] !== value);
    }
    return { data: out, error: null };
  };
  b.maybeSingle = () => Promise.resolve({ data: rows()[0] ?? null, error: null });
  b.single = () => Promise.resolve({ data: rows()[0] ?? null, error: null });
  b.then = (onFulfilled: (v: unknown) => unknown) => Promise.resolve(settle()).then(onFulfilled);
  return b;
}

vi.mock('@neram/database', () => ({
  getSupabaseAdminClient: () => ({ from: (t: string) => builder(t) }),
  loadClassroomRoster: async () => ({
    members: state.members,
    ids: state.members.map((m) => m.user_id as string),
    counts: { tracked: state.members.length, dormant: 0, total: state.members.length },
  }),
}));
vi.mock('@/lib/ms-verify', () => ({ verifyMsToken: async () => ({ oid: 'ms-1' }) }));

const { GET } = await import('./route');

const url = (qs: string) =>
  new NextRequest(`http://localhost/api/timetable/rsvp-dashboard?classroom_id=c1&${qs}`, {
    headers: { Authorization: 'Bearer t' },
  });

const forClass = (classId = 'class-1') => GET(url(`class_id=${classId}`));
const forRange = (start = '2026-09-01', end = '2026-09-30') =>
  GET(url(`start=${start}&end=${end}`));

/** n students, all unbatched unless told otherwise. */
function roster(n: number, batchOf: (i: number) => string | null = () => null) {
  return Array.from({ length: n }, (_, i) => ({
    user_id: `s${i + 1}`,
    batch_id: batchOf(i + 1),
    user: { name: `Student ${i + 1}`, avatar_url: null },
  }));
}

const window = (studentId: string, startsOn: string, endsOn: string | null, over: object = {}) => ({
  id: `w-${studentId}-${startsOn}`,
  student_id: studentId,
  starts_on: startsOn,
  ends_on: endsOn,
  reason_code: 'clash',
  reason_note: null,
  source: 'student',
  cancelled_at: null,
  created_at: '2026-08-01T00:00:00Z',
  ...over,
});

const optOut = (studentId: string, classId = 'class-1', reasonCode = 'unwell') => ({
  scheduled_class_id: classId,
  student_id: studentId,
  reason: null,
  reason_code: reasonCode,
  wants_catchup: true,
  responded_at: '2026-09-10T00:00:00Z',
});

const aClass = (over: object = {}) => ({
  id: 'class-1',
  title: 'Perspective drawing',
  scheduled_date: '2026-09-22',
  start_time: '19:00',
  end_time: '20:00',
  batch_id: null,
  status: 'scheduled',
  ...over,
});

beforeEach(() => {
  state.userType = 'teacher';
  state.writes = [];
  state.awayError = null;
  state.members = roster(28);
  state.classes = [aClass()];
  state.rsvps = [];
  state.awayWindows = [];
});

describe('the headline arithmetic', () => {
  it('reads 18 of 22 expected, 6 away, when 28 are on roll and 4 stepped out', async () => {
    state.awayWindows = ['s1', 's2', 's3', 's4', 's5', 's6'].map((id) =>
      window(id, '2026-09-15', '2026-09-30'),
    );
    state.rsvps = ['s7', 's8', 's9', 's10'].map((id) => optOut(id));

    const body = await (await forClass()).json();

    expect(body.summary).toEqual({
      attending: 18,
      not_attending: 4,
      total: 22,
      on_roll: 28,
      away: 6,
    });
  });

  it('holds both invariants for every class across a mixed range', async () => {
    state.classes = [
      aClass({ id: 'c-a', scheduled_date: '2026-09-02' }),
      aClass({ id: 'c-b', scheduled_date: '2026-09-16' }),
      aClass({ id: 'c-c', scheduled_date: '2026-09-23', batch_id: 'b1' }),
      aClass({ id: 'c-d', scheduled_date: '2026-09-29' }),
    ];
    state.members = roster(28, (i) => (i <= 10 ? 'b1' : null));
    state.awayWindows = [
      window('s1', '2026-09-01', '2026-09-05'),
      window('s2', '2026-09-20', null),
      window('s11', '2026-09-15', '2026-09-30'),
    ];
    state.rsvps = [optOut('s3', 'c-a'), optOut('s4', 'c-b'), optOut('s5', 'c-c')];

    const body = await (await forRange()).json();

    expect(body.classes).toHaveLength(4);
    for (const c of body.classes) {
      const s = c.summary;
      expect(s.attending + s.not_attending).toBe(s.total);
      expect(s.total + s.away).toBe(s.on_roll);
    }
  });

  it('leaves total equal to on_roll when nobody is away', async () => {
    state.rsvps = [optOut('s1')];
    const body = await (await forClass()).json();
    expect(body.summary.away).toBe(0);
    expect(body.summary.total).toBe(body.summary.on_roll);
    expect(body.summary.total).toBe(28);
  });
});

describe('which windows count', () => {
  it('counts an open ended window against a class three months out', async () => {
    state.classes = [aClass({ scheduled_date: '2026-12-20' })];
    state.awayWindows = [window('s1', '2026-09-15', null)];

    const body = await (await forClass()).json();

    expect(body.summary.away).toBe(1);
    expect(body.away[0].ends_on).toBeNull();
    expect(body.away[0].away_window).toContain('Away since');
  });

  it('is inclusive at both ends of a window that starts mid week', async () => {
    state.members = roster(4);
    state.classes = [
      aClass({ id: 'mon', scheduled_date: '2026-09-21' }),
      aClass({ id: 'thu', scheduled_date: '2026-09-24' }),
      aClass({ id: 'sat', scheduled_date: '2026-09-26' }),
      aClass({ id: 'sun', scheduled_date: '2026-09-27' }),
    ];
    state.awayWindows = [window('s1', '2026-09-24', '2026-09-26')];

    const body = await (await forRange()).json();
    const awayOn = Object.fromEntries(
      body.classes.map((c: { class_id: string; summary: { away: number } }) => [
        c.class_id,
        c.summary.away,
      ]),
    );

    expect(awayOn).toEqual({ mon: 0, thu: 1, sat: 1, sun: 0 });
  });

  it('ignores a window the student already ended', async () => {
    state.awayWindows = [
      window('s1', '2026-09-15', '2026-09-30', { cancelled_at: '2026-09-18T00:00:00Z' }),
    ];
    const body = await (await forClass()).json();
    expect(body.summary.away).toBe(0);
    expect(body.summary.total).toBe(28);
  });

  it('counts a student with two overlapping windows exactly once', async () => {
    state.awayWindows = [
      window('s1', '2026-09-15', '2026-09-30'),
      window('s1', '2026-09-20', '2026-10-05', { id: 'w-second' }),
    ];
    const body = await (await forClass()).json();
    expect(body.summary.away).toBe(1);
    expect(body.away).toHaveLength(1);
  });

  it('describes the window against the class date, not today', async () => {
    state.classes = [aClass({ scheduled_date: '2026-09-22' })];
    state.awayWindows = [window('s1', '2026-09-15', '2026-09-30')];
    const body = await (await forClass()).json();
    // Read from inside the window: "Away until 30 Sep", not "Away 15 Sep to 30 Sep".
    expect(body.away[0].away_window).toContain('Away until 30 Sep');
  });
});

describe('away outranks the opt out', () => {
  it('counts a student who is away and also declined exactly once', async () => {
    state.awayWindows = [window('s1', '2026-09-15', '2026-09-30')];
    state.rsvps = [optOut('s1'), optOut('s2')];

    const body = await (await forClass()).json();

    expect(body.summary).toMatchObject({ away: 1, not_attending: 1, total: 27, on_roll: 28 });
    expect(body.away).toHaveLength(1);
    expect(body.away[0].id).toBe('s1');
    expect(body.away[0].also_declined).toBe(true);
    expect(body.not_attending.map((s: { id: string }) => s.id)).toEqual(['s2']);
  });

  it('keeps an away student out of the reason tally so the chips do not double count', async () => {
    state.awayWindows = [window('s1', '2026-09-15', '2026-09-30')];
    state.rsvps = [optOut('s1', 'class-1', 'unwell'), optOut('s2', 'class-1', 'unwell')];

    const body = await (await forClass()).json();

    expect(body.reason_tally.unwell).toBe(1);
  });
});

describe('the batch gate', () => {
  it('excludes another batch AND the unbatched, so on_roll is the invited list', async () => {
    state.members = roster(28, (i) => (i <= 10 ? 'b1' : i <= 20 ? 'b2' : null));
    state.classes = [aClass({ batch_id: 'b1' })];

    const body = await (await forClass()).json();

    expect(body.summary.on_roll).toBe(10);
    expect(body.summary.total).toBe(10);
    expect(body.attending).toHaveLength(10);
  });

  it('counts everyone when the class has no batch', async () => {
    state.members = roster(28, (i) => (i <= 10 ? 'b1' : null));
    state.classes = [aClass({ batch_id: null })];

    const body = await (await forClass()).json();

    expect(body.summary.on_roll).toBe(28);
  });

  it('does not count a student who is away but not in this class batch', async () => {
    state.members = roster(4, (i) => (i <= 2 ? 'b1' : 'b2'));
    state.classes = [aClass({ batch_id: 'b1' })];
    state.awayWindows = [window('s3', '2026-09-15', '2026-09-30')];

    const body = await (await forClass()).json();

    expect(body.summary).toMatchObject({ on_roll: 2, total: 2, away: 0 });
  });
});

describe('range mode', () => {
  it('names each student once instead of once per class', async () => {
    state.classes = [
      aClass({ id: 'c-a', scheduled_date: '2026-09-21' }),
      aClass({ id: 'c-b', scheduled_date: '2026-09-22' }),
    ];
    state.awayWindows = [window('s1', '2026-09-20', '2026-09-30')];
    state.rsvps = [optOut('s2', 'c-a'), optOut('s2', 'c-b')];

    const body = await (await forRange()).json();

    expect(body.away_students).toHaveLength(1);
    expect(body.away_students[0].id).toBe('s1');
    expect(body.away_students[0].windows).toHaveLength(1);
    expect(body.declined_students).toHaveLength(1);
    expect(body.declined_students[0].id).toBe('s2');
  });

  it('sends ids per class, never the attending roll call', async () => {
    state.awayWindows = [window('s1', '2026-09-20', '2026-09-30')];
    state.rsvps = [optOut('s2')];

    const body = await (await forRange()).json();
    const cls = body.classes[0];

    expect(cls.away_ids).toEqual(['s1']);
    expect(cls.declined_ids).toEqual(['s2']);
    expect(cls.attending).toBeUndefined();
    expect(cls.not_attending).toBeUndefined();
    expect(cls.away).toBeUndefined();
  });

  it('keeps the also-declined fact, which the id lists would otherwise lose', async () => {
    state.awayWindows = [window('s1', '2026-09-15', '2026-09-30')];
    state.rsvps = [optOut('s1'), optOut('s2')];

    const cls = (await (await forRange()).json()).classes[0];

    expect(cls.away_ids).toEqual(['s1']);
    expect(cls.declined_ids).toEqual(['s2']);
    expect(cls.also_declined_ids).toEqual(['s1']);
    // And it is still one chair, not two.
    expect(cls.summary.attending + cls.summary.not_attending).toBe(cls.summary.total);
  });

  it('echoes the range it was asked for', async () => {
    const body = await (await forRange('2026-08-31', '2026-10-04')).json();
    expect(body.range).toEqual({ start: '2026-08-31', end: '2026-10-04' });
  });
});

/**
 * The day rows.
 *
 * A class row answers "who is coming to this class". A day row answers "is this
 * day worth running", which is asked BEFORE the class exists, so there is a row
 * for every date in the range whether or not anything is scheduled on it.
 *
 * Both invariants still hold, and for the same structural reason: every student
 * who passes the batch gate lands in exactly one of three buckets.
 */
describe('the day roll', () => {
  const dayOn = (body: { days: { date: string }[] }, date: string) =>
    body.days.find((d) => d.date === date) as any;

  it('gives every date a row, not just the dates with a class', async () => {
    const body = await (await forRange('2026-09-01', '2026-09-30')).json();

    expect(body.days).toHaveLength(30);
    expect(body.days[0].date).toBe('2026-09-01');
    expect(body.days[29].date).toBe('2026-09-30');
    // Strictly ascending, no gaps and no repeats.
    const dates = body.days.map((d: { date: string }) => d.date);
    expect([...dates].sort()).toEqual(dates);
    expect(new Set(dates).size).toBe(30);
  });

  it('takes the UNION of the day batches, so two batches on one night is both', async () => {
    state.members = roster(28, (i) => (i <= 10 ? 'b1' : i <= 20 ? 'b2' : null));
    state.classes = [
      aClass({ id: 'early', scheduled_date: '2026-09-22', batch_id: 'b1' }),
      aClass({ id: 'late', scheduled_date: '2026-09-22', batch_id: 'b2' }),
    ];

    const body = await (await forRange()).json();

    expect(dayOn(body, '2026-09-22').summary.on_roll).toBe(20);
    // And the class rows did not move: each still reports its own invited list.
    expect(body.classes.map((c: { summary: { on_roll: number } }) => c.summary.on_roll)).toEqual([
      10, 10,
    ]);
  });

  it('does not double count when the same batch has two classes that day', async () => {
    state.members = roster(28, (i) => (i <= 10 ? 'b1' : null));
    state.classes = [
      aClass({ id: 'early', scheduled_date: '2026-09-22', batch_id: 'b1' }),
      aClass({ id: 'late', scheduled_date: '2026-09-22', batch_id: 'b1' }),
    ];

    const body = await (await forRange()).json();

    expect(dayOn(body, '2026-09-22').summary.on_roll).toBe(10);
  });

  it('lets a whole-classroom class absorb every other batch on the day', async () => {
    state.members = roster(28, (i) => (i <= 10 ? 'b1' : null));
    state.classes = [
      aClass({ id: 'batched', scheduled_date: '2026-09-22', batch_id: 'b1' }),
      aClass({ id: 'open', scheduled_date: '2026-09-22', batch_id: null }),
    ];

    const body = await (await forRange()).json();

    expect(dayOn(body, '2026-09-22').summary.on_roll).toBe(28);
  });

  it('ignores a student away in a batch nobody invited that day', async () => {
    state.members = roster(4, (i) => (i <= 2 ? 'b1' : 'b2'));
    state.classes = [aClass({ scheduled_date: '2026-09-22', batch_id: 'b1' })];
    state.awayWindows = [window('s3', '2026-09-15', '2026-09-30')];

    const body = await (await forRange()).json();

    expect(dayOn(body, '2026-09-22').summary).toMatchObject({ on_roll: 2, total: 2, away: 0 });
    expect(dayOn(body, '2026-09-22').away_ids).toEqual([]);
  });

  it('counts one empty chair for a student away with three classes that night', async () => {
    state.classes = [
      aClass({ id: 'a', scheduled_date: '2026-09-22' }),
      aClass({ id: 'b', scheduled_date: '2026-09-22' }),
      aClass({ id: 'c', scheduled_date: '2026-09-22' }),
    ];
    state.awayWindows = [window('s1', '2026-09-20', '2026-09-24')];

    const body = await (await forRange()).json();

    expect(dayOn(body, '2026-09-22').summary.away).toBe(1);
    expect(dayOn(body, '2026-09-22').away_ids).toEqual(['s1']);
  });

  it('counts a student who declined two of the day classes exactly once', async () => {
    state.classes = [
      aClass({ id: 'a', scheduled_date: '2026-09-22' }),
      aClass({ id: 'b', scheduled_date: '2026-09-22' }),
    ];
    state.rsvps = [optOut('s2', 'a'), optOut('s2', 'b')];

    const day = dayOn(await (await forRange()).json(), '2026-09-22');

    expect(day.summary.not_attending).toBe(1);
    expect(day.declined_ids).toEqual(['s2']);
    expect(day.summary.attending + day.summary.not_attending).toBe(day.summary.total);
    // One student, one reason chip, whatever they said on each class.
    const tallied = Object.values(day.reason_tally as Record<string, number>).reduce(
      (a, b) => a + b,
      0,
    );
    expect(tallied).toBe(1);
  });

  it('answers for a date with nothing scheduled, which is the whole point', async () => {
    state.classes = [aClass({ scheduled_date: '2026-09-22' })];
    state.awayWindows = [window('s1', '2026-09-15', '2026-09-30')];

    const free = dayOn(await (await forRange()).json(), '2026-09-20');

    expect(free.class_ids).toEqual([]);
    expect(free.summary).toEqual({
      attending: 27,
      not_attending: 0,
      total: 27,
      on_roll: 28,
      away: 1,
    });
    // Nobody was asked, so the zero is structural. The UI has to word it
    // "available" rather than "expected" or it asserts a reply nobody gave.
    expect(free.declined_ids).toEqual([]);
  });

  it('reads a date whose only class is cancelled as free to book', async () => {
    state.classes = [aClass({ scheduled_date: '2026-09-22', status: 'cancelled' })];

    const body = await (await forRange()).json();

    expect(body.classes).toHaveLength(0);
    expect(dayOn(body, '2026-09-22').class_ids).toEqual([]);
    expect(dayOn(body, '2026-09-22').summary.on_roll).toBe(28);
  });

  it('is inclusive at both ends of a window, on dates with no class at all', async () => {
    state.members = roster(4);
    state.classes = [];
    state.awayWindows = [window('s1', '2026-09-10', '2026-09-12')];

    const body = await (await forRange('2026-09-08', '2026-09-14')).json();

    expect(body.days.map((d: { summary: { away: number } }) => d.summary.away)).toEqual([
      0, 0, 1, 1, 1, 0, 0,
    ]);
  });

  it('carries an open ended window forward across free dates', async () => {
    state.members = roster(4);
    state.classes = [];
    state.awayWindows = [window('s1', '2026-09-11', null)];

    const body = await (await forRange('2026-09-09', '2026-09-13')).json();

    expect(body.days.map((d: { summary: { away: number } }) => d.summary.away)).toEqual([
      0, 0, 1, 1, 1,
    ]);
  });

  it('tallies why the away students are away, separately from the opt outs', async () => {
    state.awayWindows = [
      window('s1', '2026-09-20', '2026-09-24', { reason_code: 'clash' }),
      window('s2', '2026-09-20', '2026-09-24', { reason_code: 'clash', id: 'w-2' }),
      window('s3', '2026-09-20', '2026-09-24', { reason_code: 'unwell', id: 'w-3' }),
    ];
    state.rsvps = [optOut('s4', 'class-1', 'family')];

    const day = dayOn(await (await forRange()).json(), '2026-09-22');

    expect(day.away_tally).toMatchObject({ clash: 2, unwell: 1, family: 0 });
    // A clash away window and a clash opt-out are not the same event.
    expect(day.reason_tally).toMatchObject({ family: 1, clash: 0 });
  });

  it('holds both invariants on every DAY of a mixed range', async () => {
    state.classes = [
      aClass({ id: 'c-a', scheduled_date: '2026-09-02' }),
      aClass({ id: 'c-b', scheduled_date: '2026-09-16' }),
      aClass({ id: 'c-c', scheduled_date: '2026-09-23', batch_id: 'b1' }),
      aClass({ id: 'c-d', scheduled_date: '2026-09-29' }),
    ];
    state.members = roster(28, (i) => (i <= 10 ? 'b1' : null));
    state.awayWindows = [
      window('s1', '2026-09-01', '2026-09-05'),
      window('s2', '2026-09-20', null),
      window('s11', '2026-09-15', '2026-09-30'),
    ];
    state.rsvps = [optOut('s3', 'c-a'), optOut('s4', 'c-b'), optOut('s5', 'c-c')];

    const body = await (await forRange()).json();

    expect(body.days).toHaveLength(30);
    for (const d of body.days) {
      const s = d.summary;
      expect(s.attending + s.not_attending, `${d.date} counts somebody twice`).toBe(s.total);
      expect(s.total + s.away, `${d.date} lost the roll`).toBe(s.on_roll);
    }
  });

  it('states the whole roll, so a batched day is visibly narrower than it', async () => {
    state.members = roster(28, (i) => (i <= 10 ? 'b1' : null));
    state.classes = [aClass({ scheduled_date: '2026-09-22', batch_id: 'b1' })];

    const body = await (await forRange()).json();

    expect(body.roster_total).toBe(28);
    expect(dayOn(body, '2026-09-22').summary.on_roll).toBe(10);
  });

  it('caps the day rows without touching the class rows', async () => {
    const body = await (await forRange('2026-01-01', '2026-12-31')).json();

    expect(body.days).toHaveLength(75);
    expect(body.days[0].date).toBe('2026-01-01');
    expect(body.classes).toHaveLength(1);
    expect(body.range).toEqual({ start: '2026-01-01', end: '2026-12-31' });
  });

  it('400s a range that is not a pair of dates', async () => {
    expect((await forRange('not-a-date', '2026-09-30')).status).toBe(400);
    expect((await forRange('2026-09-01', '30-09-2026')).status).toBe(400);
  });

  it('says nobody is away, rather than throwing, before the table exists', async () => {
    state.awayError = { code: 'PGRST205', message: 'Could not find the table' };

    const res = await forRange('2026-09-01', '2026-09-07');
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.days).toHaveLength(7);
    expect(
      body.days.every((d: { summary: { away: number; total: number; on_roll: number } }) => {
        return d.summary.away === 0 && d.summary.total === d.summary.on_roll;
      }),
    ).toBe(true);
  });
});

describe('the rules it inherits', () => {
  it('stays at 200 with nobody away when the table has not been migrated yet', async () => {
    state.awayError = { code: 'PGRST205', message: 'Could not find the table' };

    const res = await forClass();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.summary.away).toBe(0);
    expect(body.summary.total).toBe(28);
  });

  it('never writes', async () => {
    state.awayWindows = [window('s1', '2026-09-15', '2026-09-30')];
    state.rsvps = [optOut('s2')];
    await forClass();
    await forRange();
    expect(state.writes).toEqual([]);
  });

  it('refuses a caller who is not staff', async () => {
    state.userType = 'student';
    expect((await forClass()).status).toBe(403);
  });

  it('404s a class that belongs to another classroom', async () => {
    state.classes = [];
    const res = await forClass('class-from-elsewhere');
    expect(res.status).toBe(404);
  });

  it('400s without a class or a range', async () => {
    expect((await GET(url('x=1'))).status).toBe(400);
  });

  it('has no no_response bucket, on either shape', async () => {
    const classBody = await (await forClass()).json();
    const rangeBody = await (await forRange()).json();
    expect(classBody.summary).not.toHaveProperty('no_response');
    expect(rangeBody.classes[0].summary).not.toHaveProperty('no_response');
  });
});

/**
 * A class on the 18th was never a class the student who enrolled on the 20th
 * could have attended. Counting them makes an old night look worse than it was,
 * and makes the roll move under a teacher's feet every time somebody enrols.
 */
describe('the roll as of the date', () => {
  const dayOn = (body: any, date: string) => body.days.find((d: any) => d.date === date);

  beforeEach(() => {
    state.members = roster(3);
    state.classes = [];
    state.rsvps = [];
    state.awayWindows = [];
  });

  it('leaves a student out of every date before they enrolled', async () => {
    state.members[2].enrolled_at = '2026-09-20T09:00:00+05:30';
    const body = await (await forRange('2026-09-18', '2026-09-22')).json();

    expect(dayOn(body, '2026-09-18').summary.on_roll).toBe(2);
    expect(dayOn(body, '2026-09-19').summary.on_roll).toBe(2);
    expect(dayOn(body, '2026-09-20').summary.on_roll).toBe(3);
    expect(dayOn(body, '2026-09-21').summary.on_roll).toBe(3);
  });

  it('counts someone who enrolled late on the day of the class', async () => {
    // 9 PM IST on the 20th. The roster itself counts them as a member that day,
    // so this must agree with it rather than being sharper than it.
    state.members[2].enrolled_at = '2026-09-20T21:00:00+05:30';
    const body = await (await forRange('2026-09-20', '2026-09-20')).json();
    expect(dayOn(body, '2026-09-20').summary.on_roll).toBe(3);
  });

  // The bug family this repo already has live elsewhere: reading a timestamptz
  // as a date without a zone rolls it back a day in IST.
  it('reads the enrolment date in IST, not UTC', async () => {
    // 2026-09-20T19:00Z is 2026-09-21 00:30 IST: the 21st, not the 20th.
    state.members[2].enrolled_at = '2026-09-20T19:00:00Z';
    const body = await (await forRange('2026-09-20', '2026-09-21')).json();

    expect(dayOn(body, '2026-09-20').summary.on_roll).toBe(2);
    expect(dayOn(body, '2026-09-21').summary.on_roll).toBe(3);
  });

  it('never drops a student whose enrolment date failed to backfill', async () => {
    state.members[2].enrolled_at = null;
    const body = await (await forRange('2026-09-18', '2026-09-18')).json();
    expect(dayOn(body, '2026-09-18').summary.on_roll).toBe(3);
  });

  it('holds both invariants on a date the roll changes', async () => {
    state.members[2].enrolled_at = '2026-09-20T09:00:00+05:30';
    state.awayWindows = [window('s1', '2026-09-18', '2026-09-22')];
    const body = await (await forRange('2026-09-18', '2026-09-22')).json();

    for (const d of body.days) {
      expect(d.summary.attending + d.summary.not_attending).toBe(d.summary.total);
      expect(d.summary.total + d.summary.away).toBe(d.summary.on_roll);
    }
  });

  it('applies the same rule to a single class, not just to day rows', async () => {
    state.members[2].enrolled_at = '2026-09-20T09:00:00+05:30';
    state.classes = [
      { id: 'class-1', title: 'A', scheduled_date: '2026-09-18', start_time: '19:00', end_time: '20:30', batch_id: null, status: 'scheduled' },
    ];
    const body = await (await forClass()).json();
    expect(body.summary.on_roll).toBe(2);
  });

  it('keeps the enrolment date off the wire', async () => {
    state.members[2].enrolled_at = '2026-09-20T09:00:00+05:30';
    state.classes = [
      { id: 'class-1', title: 'A', scheduled_date: '2026-09-25', start_time: '19:00', end_time: '20:30', batch_id: null, status: 'scheduled' },
    ];
    const body = await (await forClass()).json();
    expect(body.attending.length).toBe(3);
    for (const s of body.attending) expect(s).not.toHaveProperty('enrolled_at');
  });
});
