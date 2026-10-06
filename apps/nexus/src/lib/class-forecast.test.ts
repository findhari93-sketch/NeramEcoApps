import { describe, expect, it } from 'vitest';
import {
  buildForecast,
  dayBatchIds,
  newcomersOn,
  rarelyComingOn,
  type ForecastStudent,
} from './class-forecast';
import type { RsvpClassSummary, RsvpDaySummary, RsvpSummary } from '@/app/api/timetable/rsvp-dashboard/route';

const TODAY = '2026-09-21';
const LONG_AGO = '2025-01-10T09:00:00Z';

const summary = (over: Partial<RsvpSummary> = {}): RsvpSummary => ({
  attending: 10,
  not_attending: 0,
  total: 10,
  on_roll: 10,
  away: 0,
  ...over,
});

const day = (over: Partial<RsvpDaySummary> = {}): RsvpDaySummary => ({
  date: '2026-09-25',
  measured: false,
  present: 0,
  summary: summary(),
  away_ids: [],
  declined_ids: [],
  also_declined_ids: [],
  reason_tally: {} as RsvpDaySummary['reason_tally'],
  away_tally: {} as RsvpDaySummary['away_tally'],
  class_ids: [],
  ...over,
});

/** Present in 1 of 10 expected classes: comfortably under the bar. */
const student = (id: string, over: Partial<ForecastStudent> = {}): ForecastStudent => ({
  id,
  name: id,
  avatar_url: null,
  batch_id: null,
  enrolled_at: LONG_AGO,
  present: 1,
  counted: 10,
  away: 0,
  standing: 'falling_behind',
  ...over,
});

/**
 * Reliable students: present in 9 of 10. NOT perfect, which matters now.
 *
 * Under the old cliff these contributed a whole chair each, because 90% is
 * nowhere near RARELY_COMES_RATE. Under the expected-value model nine of them
 * are worth about 8.1 chairs, which is the arithmetic a teacher planning the
 * room actually needs. Several numbers below moved by one for exactly that
 * reason and each is called out where it happens.
 */
const regulars = (n: number, over: Partial<ForecastStudent> = {}) =>
  Array.from({ length: n }, (_, i) =>
    student(`ok${i}`, { present: 9, counted: 10, ...over }),
  );

/** Students who have genuinely never missed. The only case that costs nothing. */
const perfect = (n: number, over: Partial<ForecastStudent> = {}) =>
  Array.from({ length: n }, (_, i) =>
    student(`all${i}`, { present: 10, counted: 10, standing: 'keeping_up', ...over }),
  );

const cls = (id: string, batchId: string | null = null): RsvpClassSummary =>
  ({ class_id: id, batch_id: batchId }) as RsvpClassSummary;

const forecastFor = (
  d: RsvpDaySummary,
  students: ForecastStudent[] | null,
  classes: RsvpClassSummary[] = [],
) => buildForecast({ days: [d], classes, students, today: TODAY }).get(d.date)!;

describe('the realistic headcount', () => {
  it('subtracts the students whose record says they will not come', () => {
    const roster = [...regulars(8), student('rare1'), student('rare2')];
    const f = forecastFor(day(), roster);

    // 8 students at 90% plus 2 at 10%, against a room base rate of 74%:
    // 8 x 0.873 + 2 x 0.207 = 7.40, rounded once at the end.
    expect(f.expected).toBe(10);
    expect(f.atRisk).toBe(2);
    expect(f.likely).toBe(7);
    expect(f.estimated).toBe(true);
    // The named count and the chairs are now two different numbers, and both
    // are reported so the "See who" sheet can list 2 names under a drop of 3.
    expect(f.discounted).toBe(3);
  });

  it('leaves the count alone when everyone turns up', () => {
    const f = forecastFor(day(), perfect(10));
    expect(f.likely).toBe(10);
    // Nothing was estimated, so nothing should be dressed up as an estimate.
    // This is the one case that still costs nothing, and it is the reason the
    // tilde keeps meaning something after the move to probabilities.
    expect(f.estimated).toBe(false);
    expect(f.discounted).toBe(0);
  });

  // THE BUG THIS MODEL EXISTS FOR. A class read "36 of 38" and held twenty,
  // because every student sat on the comfortable side of a 40% step and so
  // cost the forecast nothing at all. A record is evidence in proportion to
  // what it says, not only once it crosses a line.
  it('no longer moves by a whole class either side of the rarely-comes line', () => {
    const roomAt = (rate: number) =>
      forecastFor(
        day({ summary: summary({ attending: 30, total: 30, on_roll: 30 }) }),
        Array.from({ length: 30 }, (_, i) =>
          student(`s${i}`, { present: Math.round(rate * 20), counted: 20 }),
        ),
      );

    const just_under = roomAt(0.39);
    const just_over = roomAt(0.41);

    // Under the old step these were 0 and 30. They are now one chair apart.
    expect(Math.abs(just_under.likely - just_over.likely)).toBeLessThanOrEqual(1);
    // And both are near the truth, which neither of them used to be.
    expect(just_under.likely).toBeGreaterThan(8);
    expect(just_over.likely).toBeLessThan(16);
  });

  it('counts a student with no history at all at the room average, never at zero', () => {
    const roster = [...regulars(9), student('ghost', { present: 0, counted: 0 })];
    const f = forecastFor(day(), roster);

    // Never having looked is not evidence that they do not come.
    expect(f.likely).toBeGreaterThanOrEqual(8);
    expect(f.unknowns).toContain('ghost');
    expect(f.atRisk).toBe(0);
  });

  // The trap this module exists for. Away and stepped-out have ALREADY left
  // `expected`; taking them off again would remove the same empty chair twice.
  it('does not subtract an away student a second time', () => {
    const roster = [...regulars(9), student('rare1')];
    const d = day({
      summary: summary({ attending: 9, total: 9, on_roll: 10, away: 1 }),
      away_ids: ['rare1'],
    });

    const f = forecastFor(d, roster);
    expect(f.atRisk).toBe(0);
    // 9 reliable students at 90%, so about 8 chairs. The point of the test is
    // that the away student is not taken off a SECOND time: `expected` is 9
    // because they already left it, and `likely` reflects only the other nine.
    expect(f.likely).toBe(8);
  });

  it('does not subtract a student who already stepped out', () => {
    const roster = [...regulars(9), student('rare1')];
    const d = day({
      summary: summary({ attending: 9, not_attending: 1, total: 10, on_roll: 10 }),
      declined_ids: ['rare1'],
      class_ids: ['c1'],
    });

    const f = forecastFor(d, roster, [cls('c1')]);
    expect(f.atRisk).toBe(0);
    // Same reasoning as the away case above: nine reliable students, not ten.
    expect(f.likely).toBe(8);
  });

  it('never goes below zero even if the sets disagree', () => {
    const roster = Array.from({ length: 10 }, (_, i) => student(`rare${i}`));
    const d = day({ summary: summary({ attending: 3, total: 3, on_roll: 10, away: 7 }) });
    const f = forecastFor(d, roster);
    expect(f.likely).toBeGreaterThanOrEqual(0);
  });
});

describe('who counts as rarely coming', () => {
  // The defect this replaced: StandingRow.rate divides by `counted`, which
  // includes away days. A student who declared three weeks of exam leave and
  // has since returned would read as someone who never attends, and the
  // forecast would punish the one person who told us in advance.
  it('does not punish a student whose absences were all declared leave', () => {
    const declared = student('declared', { present: 4, counted: 13, away: 9 });
    // Raw rate is 4/13 = 31%, under the bar. Away-excluded it is 4/4 = 100%.
    const f = forecastFor(day(), [...regulars(9), declared]);
    expect(f.atRisk).toBe(0);
  });

  it('still counts absences the student gave a reason for after the fact', () => {
    // Nothing declared in advance: they simply were not there.
    const patchy = student('patchy', { present: 2, counted: 10, away: 0 });
    const f = forecastFor(day(), [...regulars(9), patchy]);
    expect(f.atRisk).toBe(1);
  });

  it('says nothing about a student with too little measured history', () => {
    const thin = student('thin', { present: 0, counted: 2, away: 0 });
    const f = forecastFor(day(), [...regulars(9), thin]);
    expect(f.atRisk).toBe(0);
  });

  it('says nothing when no class in the window was measured at all', () => {
    const unmeasured = student('unmeasured', { present: 0, counted: 0, away: 0 });
    const f = forecastFor(day(), [...regulars(9), unmeasured]);
    expect(f.atRisk).toBe(0);
  });

  it('never discounts someone who only just joined', () => {
    const joiner = student('joiner', { enrolled_at: '2026-09-18T09:00:00Z', standing: 'new' });
    const f = forecastFor(day(), [...regulars(9), joiner]);
    expect(f.atRisk).toBe(0);
    expect(f.newcomers).toEqual(['joiner']);
  });
});

describe('the batch gate', () => {
  it('ignores a thin record in a batch this day never invited', () => {
    const roster = [
      ...regulars(9, { batch_id: 'b1' }),
      student('rare_b2', { batch_id: 'b2' }),
    ];
    const d = day({ summary: summary({ attending: 9, total: 9, on_roll: 9 }), class_ids: ['c1'] });

    const f = forecastFor(d, roster, [cls('c1', 'b1')]);
    expect(f.atRisk).toBe(0);
  });

  it('counts a thin record once when two classes invite the same batch', () => {
    const roster = [...regulars(9, { batch_id: 'b1' }), student('rare', { batch_id: 'b1' })];
    const d = day({
      summary: summary({ attending: 10, total: 10, on_roll: 10 }),
      class_ids: ['c1', 'c2'],
    });

    const f = forecastFor(d, roster, [cls('c1', 'b1'), cls('c2', 'b1')]);
    expect(f.atRisk).toBe(1);
  });

  it('opens the whole roll when any of the day\'s classes has no batch', () => {
    const roster = [...regulars(9, { batch_id: 'b1' }), student('rare_b2', { batch_id: 'b2' })];
    const d = day({
      summary: summary({ attending: 10, total: 10, on_roll: 10 }),
      class_ids: ['c1', 'c2'],
    });

    const f = forecastFor(d, roster, [cls('c1', 'b1'), cls('c2', null)]);
    expect(f.atRisk).toBe(1);
  });

  it('reads an unresolvable class id as whole-classroom rather than shrinking the roll', () => {
    expect(dayBatchIds({ class_ids: ['ghost'] }, new Map())).toBeNull();
  });

  it('has no batch gate at all on a date with nothing scheduled', () => {
    expect(dayBatchIds({ class_ids: [] }, new Map())).toBeNull();
  });
});

// A class that has already run is not a question any more. The calendar used to
// keep rendering the forecast for it, which is how a block reading "36 of 38"
// came to describe a room that held twenty.
describe('a date that has already happened', () => {
  const past = '2026-09-10';

  it('reports what actually happened once Teams has been read', () => {
    const d = day({ date: past, measured: true, present: 18, class_ids: ['c1'] });
    const f = forecastFor(d, regulars(10), [cls('c1')]);

    expect(f.outcome).toBe('actual');
    expect(f.actual).toBe(18);
    // No tilde on a counted room. The estimate is over; this is the register.
    expect(f.estimated).toBe(false);
  });

  it('offers no number at all for a past class nobody read', () => {
    const d = day({ date: past, measured: false, class_ids: ['c1'] });
    const f = forecastFor(d, regulars(10), [cls('c1')]);

    expect(f.outcome).toBe('past_unmeasured');
    expect(f.actual).toBeNull();
    expect(f.estimated).toBe(false);
  });

  it('still forecasts today and every date ahead of it', () => {
    const todayRow = forecastFor(day({ date: TODAY }), regulars(10));
    const ahead = forecastFor(day({ date: '2026-09-25' }), regulars(10));

    // Today has not finished, so it is still a question worth asking.
    expect(todayRow.outcome).toBe('forecast');
    expect(ahead.outcome).toBe('forecast');
  });

  it('never reads a future date as measured even if the flag is wrong', () => {
    const f = forecastFor(day({ date: '2026-09-25', measured: true, present: 4 }), regulars(10));
    expect(f.outcome).toBe('forecast');
    expect(f.actual).toBeNull();
  });
});

describe('saying how much of the estimate is guesswork', () => {
  it('calls the estimate soft when most of the room has little history', () => {
    const roster = [
      ...regulars(2),
      ...Array.from({ length: 8 }, (_, i) => student(`thin${i}`, { present: 1, counted: 2 })),
    ];
    const f = forecastFor(day(), roster);
    expect(f.confidence).toBe('soft');
    expect(f.unknowns).toHaveLength(8);
  });

  it('calls it firm when the records are real', () => {
    const f = forecastFor(day(), regulars(10));
    expect(f.confidence).toBe('firm');
    expect(f.unknowns).toHaveLength(0);
  });
});

describe('the roll as of the date', () => {
  it('leaves a student out of dates before they enrolled', () => {
    const joined20th = student('newbie', {
      enrolled_at: '2026-09-20T09:00:00Z',
      present: 9,
      counted: 10,
    });
    const roster = [...regulars(9), joined20th];

    // The 18th had 9 on the roll; the 25th has 10.
    const before = forecastFor(day({ date: '2026-09-18', summary: summary({ attending: 9, total: 9, on_roll: 9 }) }), roster);
    const after = forecastFor(day({ date: '2026-09-25' }), roster);

    // 9 reliable students on the 18th; on the 25th the new joiner is on the
    // roll too and, being inside the joining grace, is never discounted.
    expect(before.likely).toBe(8);
    expect(after.likely).toBe(9);
  });
});

describe('degrading when the attendance record cannot be read', () => {
  // A forecast that rendered "~0 of 30" because a fetch failed would be far
  // worse than no forecast at all.
  it('falls back to the entitled count with no standing data', () => {
    for (const rows of [null, undefined, []]) {
      const f = forecastFor(day(), rows as ForecastStudent[] | null);
      expect(f.likely).toBe(10);
      expect(f.atRisk).toBe(0);
      expect(f.estimated).toBe(false);
    }
  });

  // Two independently fetched rosters can disagree: someone enrolled or was
  // paused between the requests, or a classroom switch is serving one stale
  // payload. Rather than reconcile them, check the one number both sides state.
  it('drops the estimate when the two rosters disagree about the roll', () => {
    const roster = [...regulars(8), student('rare1'), student('rare2')];
    // The server says 12 on roll; this roster can only account for 10.
    const d = day({ summary: summary({ attending: 12, total: 12, on_roll: 12 }) });

    const f = forecastFor(d, roster);
    expect(f.atRisk).toBe(0);
    expect(f.likely).toBe(12);
    expect(f.estimated).toBe(false);
  });

  it('returns a row for every date either way', () => {
    const days = [day({ date: '2026-09-25' }), day({ date: '2026-09-26' })];
    const map = buildForecast({ days, classes: [], students: null, today: TODAY });
    expect([...map.keys()]).toEqual(['2026-09-25', '2026-09-26']);
  });
});

describe('the people behind the number', () => {
  it('names them worst record first', () => {
    const roster = [
      ...regulars(7),
      student('worst', { present: 0, counted: 10 }),
      student('middling', { present: 3, counted: 10 }),
    ];
    const rows = rarelyComingOn(day(), [], roster, TODAY);
    expect(rows.map((r) => r.id)).toEqual(['worst', 'middling']);
    expect(rows[0].record.rate).toBe(0);
    expect(rows[1].record.rate).toBe(30);
  });

  it('quotes the denominator it actually judged on, away days removed', () => {
    const roster = [student('mixed', { present: 2, counted: 18, away: 6 })];
    const [row] = rarelyComingOn(day({ summary: summary({ attending: 1, total: 1, on_roll: 1 }) }), [], roster, TODAY);
    expect(row.record.judged).toBe(12);
    expect(row.record.rate).toBe(17);
  });

  it('keeps the away and stepped-out students out of the list entirely', () => {
    const roster = [student('away1'), student('declined1'), student('rare1')];
    const d = day({
      summary: summary({ attending: 1, not_attending: 1, total: 2, on_roll: 3, away: 1 }),
      away_ids: ['away1'],
      declined_ids: ['declined1'],
    });
    expect(rarelyComingOn(d, [], roster, TODAY).map((r) => r.id)).toEqual(['rare1']);
  });

  it('lists the recent joiners separately, never as a risk', () => {
    const joiner = student('joiner', { enrolled_at: '2026-09-19T09:00:00Z' });
    const roster = [...regulars(9), joiner];
    expect(newcomersOn(day(), [], roster, TODAY).map((s) => s.id)).toEqual(['joiner']);
    expect(rarelyComingOn(day(), [], roster, TODAY).map((r) => r.id)).toEqual([]);
  });
});
