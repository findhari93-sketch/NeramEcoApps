import { describe, expect, it } from 'vitest';
import {
  announce,
  announceForecast,
  type ForecastLike,
  availableLabel,
  awayLabel,
  barSegments,
  compactLabel,
  expectedLabel,
  onRollLabel,
  reasonSummaryLabel,
  steppedOutLabel,
  turnoutVerdict,
} from './class-availability';
import type { RsvpSummary } from '@/app/api/timetable/rsvp-dashboard/route';

const summary = (over: Partial<RsvpSummary> = {}): RsvpSummary => ({
  attending: 18,
  not_attending: 4,
  total: 22,
  on_roll: 28,
  away: 6,
  ...over,
});

describe('the wording', () => {
  it('spells the sentence out where there is room', () => {
    expect(expectedLabel(summary())).toBe('18 of 22 expected');
  });

  it('drops the word where there is not', () => {
    expect(compactLabel(summary())).toBe('18 of 22');
  });

  it('states the other denominator, so the two reconcile on screen', () => {
    expect(onRollLabel(28)).toBe('28 on roll');
  });

  it('returns an empty string at zero, so callers can concatenate', () => {
    expect(awayLabel(0)).toBe('');
    expect(steppedOutLabel(0)).toBe('');
  });

  it('says one, not one away students', () => {
    expect(awayLabel(1)).toBe('1 away');
    expect(steppedOutLabel(1)).toBe('1 stepped out');
  });
});

describe('announce, which is what a screen reader gets', () => {
  it('carries the away count the 12px glyph cannot', () => {
    expect(announce(summary())).toBe('18 of 22 expected, 6 away, 4 stepped out');
  });

  it('drops the clauses that are zero rather than reading "0 away"', () => {
    expect(announce(summary({ attending: 28, not_attending: 0, total: 28, away: 0 }))).toBe(
      '28 of 28 expected',
    );
  });
});

describe('barSegments', () => {
  it('measures against the roll, so the away block is visible at all', () => {
    const segs = barSegments(summary());
    expect(segs.map((s) => s.key)).toEqual(['attending', 'declined', 'away']);
    expect(segs.find((s) => s.key === 'away')?.pct).toBeCloseTo((6 / 28) * 100);
  });

  it('sums to 100 across the three buckets', () => {
    const total = barSegments(summary()).reduce((n, s) => n + s.pct, 0);
    expect(total).toBeCloseTo(100);
  });

  it('returns nothing rather than NaN for an empty roll', () => {
    expect(barSegments(summary({ attending: 0, not_attending: 0, total: 0, on_roll: 0, away: 0 })))
      .toEqual([]);
  });
});

describe('the verdict, which is what the planner leads with', () => {
  /** Against the roll, `attending` is the only lever; `total` follows from away. */
  const roll = (attending: number, away = 0, declined = 0): RsvpSummary =>
    summary({
      attending,
      not_attending: declined,
      total: attending + declined,
      away,
      on_roll: attending + declined + away,
    });

  it('is measured against the roll, not against the expected denominator', () => {
    // 13 in the room, 14 on exam leave. Against `total` this is 13 of 13, a
    // flawless night. Against the roll it is 48%, which is the night the
    // teacher opened the sheet to find.
    const examSeason = roll(13, 14);
    expect(examSeason.attending / examSeason.total).toBe(1);
    expect(turnoutVerdict(examSeason).key).toBe('very_thin');
  });

  it('calls three quarters good and one student fewer thin', () => {
    expect(turnoutVerdict(roll(21, 7)).key).toBe('good'); // exactly 0.75
    expect(turnoutVerdict(roll(20, 8)).key).toBe('thin'); // 0.714
  });

  it('calls a half thin and one student fewer very thin', () => {
    expect(turnoutVerdict(roll(14, 14)).key).toBe('thin'); // exactly 0.50
    expect(turnoutVerdict(roll(13, 15)).key).toBe('very_thin');
  });

  it('counts a stepped-out student against the turnout too', () => {
    expect(turnoutVerdict(roll(10, 0, 18)).key).toBe('very_thin');
  });

  it('says nobody is on roll rather than dividing by zero', () => {
    const empty = summary({ attending: 0, not_attending: 0, total: 0, on_roll: 0, away: 0 });
    expect(turnoutVerdict(empty)).toEqual({ key: 'empty', label: 'Nobody on roll' });
  });
});

describe('the reason line, which is what makes a count actionable', () => {
  it('reads in the order the reasons are offered, skipping the zeros', () => {
    expect(reasonSummaryLabel({ unwell: 1, clash: 2, family: 1, other: 0 })).toBe(
      '1 unwell, 1 family, 2 exam clash',
    );
  });

  it('is empty rather than "0 unwell" when nothing is tallied', () => {
    expect(reasonSummaryLabel({ unwell: 0, family: 0, clash: 0, other: 0 })).toBe('');
    expect(reasonSummaryLabel(null)).toBe('');
  });
});

/** The realistic-headcount shape, defaulting to an estimate that changed nothing. */
const forecast = (over: Partial<ForecastLike> = {}): ForecastLike => ({
  likely: 18,
  expected: 18,
  onRoll: 28,
  away: 6,
  declined: 4,
  atRisk: 0,
  estimated: (over.atRisk ?? 0) > 0,
  ...over,
});

describe('a date with nothing scheduled', () => {
  it('says available, never expected, because nobody was asked', () => {
    const free = summary({ attending: 26, not_attending: 0, total: 26, on_roll: 28, away: 2 });
    expect(availableLabel(free)).toBe('26 of 28 available');
  });

  it('leaves the stepped-out clause out of the announcement entirely', () => {
    const free = forecast({ likely: 26, onRoll: 28, away: 2, declined: 0, atRisk: 0 });
    expect(announceForecast(free, 'Sun 21 Sep', false)).toBe(
      'Sun 21 Sep, 26 of 28 available, Good turnout, 28 on roll, 2 away',
    );
  });

  it('spells the verdict and the whole sum out for a screen reader', () => {
    const f = forecast({ likely: 14, expected: 18, onRoll: 28, away: 6, declined: 4, atRisk: 4 });
    expect(announceForecast(f, 'Today', true)).toBe(
      'Today, ~14 of 28 likely, Thin, 28 on roll, 6 away, 4 stepped out, 4 rarely come',
    );
  });
});

describe('an empty class does not divide by zero', () => {
  it('words it without a NaN', () => {
    const empty = summary({ attending: 0, not_attending: 0, total: 0, on_roll: 0, away: 0 });
    expect(expectedLabel(empty)).toBe('0 of 0 expected');
    expect(announce(empty)).toBe('0 of 0 expected');
  });
});
