import { describe, expect, it } from 'vitest';
import {
  announce,
  announceForecast,
  type ForecastLike,
  availableLabel,
  awayLabel,
  barSegments,
  classCountLabel,
  compactForecastLabel,
  compactLabel,
  expectedLabel,
  forecastBreakdownLabel,
  forecastHeadline,
  forecastVerdictOf,
  headcountOf,
  likelyLabel,
  likelySentence,
  NOT_READ_NOTE,
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

describe('a day that has already happened', () => {
  const base: ForecastLike = {
    likely: 16,
    expected: 20,
    onRoll: 30,
    away: 9,
    declined: 1,
    atRisk: 4,
    estimated: true,
  };

  it('states what happened, not what was hoped for', () => {
    const f: ForecastLike = { ...base, outcome: 'actual', actual: 18 };
    expect(likelyLabel(f)).toBe('18 of 30 came');
    // No tilde: this is a count. And no "likely", which would read as a
    // prediction about a night that is over.
    expect(likelyLabel(f)).not.toContain('~');
    expect(likelySentence(f)).toBe('18 of 30 came');
    expect(forecastHeadline(f, true)).toBe('18 of 30 came');
  });

  it('drops the prediction from the breakdown once the class has run', () => {
    const f: ForecastLike = { ...base, outcome: 'actual', actual: 18 };
    const label = forecastBreakdownLabel(f);
    expect(label).toContain('30 on roll');
    expect(label).toContain('9 away');
    // "4 rarely come" about a night already counted is noise.
    expect(label).not.toContain('rarely come');
  });

  it('refuses to put a number on a class nobody read', () => {
    const f: ForecastLike = { ...base, outcome: 'past_unmeasured', actual: null };
    expect(likelyLabel(f)).toBe(NOT_READ_NOTE);
    expect(likelyLabel(f)).not.toMatch(/\d/);
    expect(headcountOf(f)).toBeNull();
    // And no verdict, because "good turnout" over a missing row is the screen
    // inventing an opinion.
    expect(forecastVerdictOf(f)).toBeNull();
    expect(announceForecast(f, 'Friday', true)).not.toContain('turnout');
  });

  it('judges a measured day on who came, not on the old forecast', () => {
    const thin: ForecastLike = { ...base, outcome: 'actual', actual: 4 };
    const full: ForecastLike = { ...base, outcome: 'actual', actual: 29 };
    // `likely` is 16 in both. The verdict must follow `actual`.
    expect(forecastVerdictOf(thin)!.key).not.toBe('good');
    expect(forecastVerdictOf(full)!.key).toBe('good');
  });
});

describe('the forward headline', () => {
  const f = (over: Partial<ForecastLike> = {}): ForecastLike => ({
    likely: 16,
    expected: 20,
    onRoll: 30,
    away: 9,
    declined: 1,
    atRisk: 4,
    estimated: true,
    ...over,
  });

  it('keeps the old wording for a date still ahead', () => {
    expect(likelyLabel(f())).toBe('~16 of 30');
    expect(forecastHeadline(f(), true)).toBe('~16 of 30 likely');
    // Nobody has been asked on a date with nothing scheduled.
    expect(forecastHeadline(f(), false)).toBe('~16 of 30 available');
  });

  it('reports the named count and the chairs as two numbers', () => {
    // 4 unreliable students cost about 3 chairs, because an unreliable student
    // is not a certain absence. Printing only one of these leaves the "See who"
    // sheet listing four names under a drop of three with nothing to explain it.
    const label = forecastBreakdownLabel(f({ discounted: 3 }));
    expect(label).toContain('4 rarely come, about 3 fewer');
  });

  it('falls back to the plain phrase when nothing was actually discounted', () => {
    expect(forecastBreakdownLabel(f({ discounted: 0 }))).toContain('4 rarely come');
    expect(forecastBreakdownLabel(f({ discounted: 0 }))).not.toContain('fewer');
  });

  it('says out loud when the estimate rests on students we barely know', () => {
    expect(forecastBreakdownLabel(f({ confidence: 'soft' }))).toContain('estimate is soft');
    expect(forecastBreakdownLabel(f({ confidence: 'firm' }))).not.toContain('soft');
  });

  it('treats a caller that predates the split as a forecast', () => {
    // Every existing call site omits `outcome` and must keep its exact wording.
    expect(likelyLabel(f())).toBe('~16 of 30');
    expect(headcountOf(f())).toBe(16);
    expect(forecastVerdictOf(f())).not.toBeNull();
  });
});

describe('the month-grid pill', () => {
  const f = (over: Partial<ForecastLike> = {}): ForecastLike => ({
    likely: 16,
    expected: 20,
    onRoll: 30,
    away: 9,
    declined: 1,
    atRisk: 4,
    estimated: true,
    ...over,
  });

  // The pill sits in a 7-column grid cell. "Not read from Teams yet" is 23
  // characters in a space sized for about 9 and would wrap the whole month.
  it('stays short enough for a calendar cell in every state', () => {
    for (const label of [
      compactForecastLabel(f()),
      compactForecastLabel(f({ outcome: 'actual', actual: 18 })),
      compactForecastLabel(f({ outcome: 'past_unmeasured', actual: null })),
    ]) {
      expect(label.length).toBeLessThanOrEqual(10);
    }
  });

  it('still tells a counted night from a predicted one at a glance', () => {
    expect(compactForecastLabel(f({ outcome: 'actual', actual: 18 }))).toBe('18 came');
    expect(compactForecastLabel(f({ outcome: 'past_unmeasured' }))).toBe('Not read');
    expect(compactForecastLabel(f())).toBe('~16 of 30');
  });

  it('loses nothing, because the cell still announces the whole sentence', () => {
    const past = f({ outcome: 'actual', actual: 18 });
    expect(announceForecast(past, 'Monday 3 October', true)).toContain('18 of 30 came');
  });
});

/**
 * The exact line the complaint was about: a week block reading "36 of 38" for a
 * class that had already run and held about twenty.
 */
describe('a class block that has already run', () => {
  it('states the expectation until Teams has been read', () => {
    expect(classCountLabel(summary({ attending: 36, total: 38 }))).toBe('36 of 38');
  });

  it('states what happened once it has', () => {
    expect(classCountLabel(summary({ attending: 36, total: 38 }), 20)).toBe('20 of 38 came');
  });

  it('keeps the same denominator so the two can be compared', () => {
    const s = summary({ attending: 36, total: 38 });
    // "36 of 38 expected" became "20 of 38 came", not a switch to some other
    // roll the teacher never saw.
    expect(classCountLabel(s)).toContain('of 38');
    expect(classCountLabel(s, 20)).toContain('of 38');
  });

  it('tells a class nobody read apart from one nobody came to', () => {
    const s = summary({ attending: 36, total: 38 });
    // undefined: never read, so say what was expected.
    expect(classCountLabel(s, undefined)).toBe('36 of 38');
    // 0: read, and genuinely nobody came. These must never collapse together,
    // which is why the caller keys its map on synced classes only.
    expect(classCountLabel(s, 0)).toBe('0 of 38 came');
  });
});
