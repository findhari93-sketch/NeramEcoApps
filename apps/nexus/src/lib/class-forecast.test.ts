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

/** Ten students, all of whom turn up. */
const regulars = (n: number, over: Partial<ForecastStudent> = {}) =>
  Array.from({ length: n }, (_, i) =>
    student(`ok${i}`, { present: 9, counted: 10, ...over }),
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

    expect(f.expected).toBe(10);
    expect(f.atRisk).toBe(2);
    expect(f.likely).toBe(8);
    expect(f.estimated).toBe(true);
  });

  it('leaves the count alone when everyone turns up', () => {
    const f = forecastFor(day(), regulars(10));
    expect(f.likely).toBe(10);
    // Nothing was estimated, so nothing should be dressed up as an estimate.
    expect(f.estimated).toBe(false);
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
    expect(f.likely).toBe(9);
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
    expect(f.likely).toBe(9);
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

    expect(before.likely).toBe(9);
    expect(after.likely).toBe(10);
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
