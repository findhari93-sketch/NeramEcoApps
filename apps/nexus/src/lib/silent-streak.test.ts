import { describe, expect, it } from 'vitest';
import {
  countSilentStreaks,
  classesWithNobodyPresent,
  streakIsActionable,
  RESTRICT_AT,
  STREAK_MAX_SPAN_DAYS,
  type SilentStreakInput,
  type StreakClass,
} from './silent-streak';

/**
 * The rule this module feeds can lock a student out of the app, so almost every
 * test here is really one sentence: it punishes SILENCE, never absence. Any
 * single act of telling us anything, through any of the three doors, resets the
 * count to zero.
 */

const LONG_AGO = '2020-01-01T00:00:00Z';

/** Newest first, which is the order the loader reads them in. */
const classes = (...dates: string[]): StreakClass[] =>
  dates.map((d, i) => ({ id: `c${i}`, scheduled_date: d, title: `Class ${i}` }));

const WEEKLY = classes('2026-10-05', '2026-09-28', '2026-09-21', '2026-09-14', '2026-09-07');

function build(over: Partial<SilentStreakInput> = {}): SilentStreakInput {
  const base: SilentStreakInput = {
    classes: WEEKLY,
    studentIds: ['s1'],
    enrolledAt: new Map([['s1', LONG_AGO]]),
    // Somebody was present at every class, or every class would be discarded
    // as a failed sync. A second student carries that.
    attended: new Set(WEEKLY.map((c) => `${c.id}:other`)),
    notTaught: new Set(),
    excused: new Set(),
    away: new Set(),
    explained: new Set(),
  };
  return { ...base, ...over };
}

const streakOf = (over: Partial<SilentStreakInput> = {}) =>
  countSilentStreaks(build(over)).get('s1')!;

describe('counting back from the most recent class', () => {
  it('counts every class missed with nothing said', () => {
    const s = streakOf();
    expect(s.streak).toBe(5);
    // Newest first, so the blocker and the tracker list the freshest miss top.
    expect(s.classes[0].scheduled_date).toBe('2026-10-05');
    expect(s.brokenBy).toBe('none');
  });

  it('stops at the first class they turned up to', () => {
    const s = streakOf({
      attended: new Set([...build().attended, 'c2:s1']),
    });
    // c0 and c1 are silent; c2 broke it. The two before c2 are not reachable.
    expect(s.streak).toBe(2);
    expect(s.brokenBy).toBe('attended');
  });

  it('is zero when the most recent class was attended', () => {
    const s = streakOf({ attended: new Set([...build().attended, 'c0:s1']) });
    expect(s.streak).toBe(0);
    expect(s.classes).toHaveLength(0);
  });
});

// The feature's whole moral claim. attendance-standing.ts says it in its own
// words: a student who told us they would be gone must never be the one the
// screen points at, or the feature punishes the people who used it.
describe('any act of telling us resets it', () => {
  it('a declared away window breaks the streak', () => {
    const s = streakOf({ away: new Set(['c1:s1']) });
    expect(s.streak).toBe(1);
    expect(s.brokenBy).toBe('away');
  });

  it('a reason given on the class breaks it, even long afterwards', () => {
    const s = streakOf({ explained: new Set(['c1:s1']) });
    expect(s.streak).toBe(1);
    expect(s.brokenBy).toBe('reason');
  });

  it('a teacher excusing them breaks it', () => {
    const s = streakOf({ excused: new Set(['c1:s1']) });
    expect(s.streak).toBe(1);
    expect(s.brokenBy).toBe('excused');
  });

  it('one word on the newest class clears the whole run', () => {
    // The student is four misses deep and says something once. The rule must
    // let them out immediately, or it is not a rule about communication.
    const before = streakOf();
    const after = streakOf({ explained: new Set(['c0:s1']) });
    expect(before.streak).toBe(5);
    expect(after.streak).toBe(0);
    expect(streakIsActionable(after)).toBe(false);
  });
});

describe('classes that are not evidence', () => {
  it('skips a class marked as never taught', () => {
    const s = streakOf({ notTaught: new Set(['c1']) });
    // Transparent: not counted, and not a breaker either.
    expect(s.streak).toBe(4);
    expect(s.judged).toBe(4);
  });

  it('skips classes that ran before they enrolled', () => {
    const s = streakOf({ enrolledAt: new Map([['s1', '2026-09-20T00:00:00Z']]) });
    // Only the 5th, 28th and 21st were ever theirs to miss.
    expect(s.streak).toBe(3);
    expect(s.judged).toBe(3);
  });

  // THE ONE THAT ENDS THE FEATURE IF IT IS WRONG. A failed Teams sync still
  // stamps attendance_synced_at, and the absence derivation then writes the
  // whole roster as a no-show. Three of those would hold an entire classroom
  // for a failure that was ours.
  it('discards a class nobody at all is recorded present at', () => {
    const attended = new Set(
      WEEKLY.filter((c) => c.id !== 'c1').map((c) => `${c.id}:other`),
    );
    const s = streakOf({ attended });
    expect(s.streak).toBe(4);
    expect(s.judged).toBe(4);
  });

  it('holds nobody at all when every class in the window failed to sync', () => {
    const s = streakOf({ attended: new Set() });
    expect(s.streak).toBe(0);
    expect(s.judged).toBe(0);
    expect(streakIsActionable(s)).toBe(false);
  });

  it('names the empty classes so a caller can say why it stayed quiet', () => {
    const empty = classesWithNobodyPresent({
      classes: WEEKLY,
      attended: new Set(['c0:a', 'c2:b']),
    });
    expect([...empty].sort()).toEqual(['c1', 'c3', 'c4']);
  });
});

describe('what may actually arm a restriction', () => {
  it('needs the full count', () => {
    const two = classes('2026-10-05', '2026-09-28');
    const s = countSilentStreaks(
      build({ classes: two, attended: new Set(two.map((c) => `${c.id}:other`)) }),
    ).get('s1')!;
    expect(s.streak).toBe(2);
    expect(RESTRICT_AT).toBe(3);
    expect(streakIsActionable(s)).toBe(false);
  });

  it('arms at three consecutive silent misses close together', () => {
    const three = classes('2026-10-05', '2026-10-02', '2026-09-29');
    const s = countSilentStreaks(
      build({ classes: three, attended: new Set(three.map((c) => `${c.id}:other`)) }),
    ).get('s1')!;
    expect(s.streak).toBe(3);
    expect(s.spanDays).toBe(6);
    expect(streakIsActionable(s)).toBe(true);
  });

  // Unmeasured classes are transparent, which is right, but it means a dark
  // fortnight can stitch three "consecutive" classes a month apart. That is no
  // longer the thing anyone would call three classes in a row.
  it('refuses a streak stretched across a sync outage', () => {
    const spread = classes('2026-10-05', '2026-08-20', '2026-08-13');
    const s = countSilentStreaks(
      build({ classes: spread, attended: new Set(spread.map((c) => `${c.id}:other`)) }),
    ).get('s1')!;
    expect(s.streak).toBe(3);
    expect(s.spanDays).toBeGreaterThan(STREAK_MAX_SPAN_DAYS);
    // Still visible to a teacher, just not able to fire by itself.
    expect(streakIsActionable(s)).toBe(false);
  });
});

describe('several students at once', () => {
  it('judges each against their own record', () => {
    const input = build({
      studentIds: ['s1', 's2', 's3'],
      enrolledAt: new Map([
        ['s1', LONG_AGO],
        ['s2', LONG_AGO],
        ['s3', LONG_AGO],
      ]),
      attended: new Set([...WEEKLY.map((c) => `${c.id}:other`), 'c0:s2']),
      away: new Set(['c1:s3']),
    });
    const out = countSilentStreaks(input);

    expect(out.get('s1')!.streak).toBe(5);
    expect(out.get('s2')!.streak).toBe(0);
    expect(out.get('s3')!.streak).toBe(1);
  });

  it('returns a row for every student asked about, even a spotless one', () => {
    const out = countSilentStreaks(
      build({
        studentIds: ['s1', 'clean'],
        enrolledAt: new Map([
          ['s1', LONG_AGO],
          ['clean', LONG_AGO],
        ]),
        attended: new Set([
          ...WEEKLY.map((c) => `${c.id}:other`),
          ...WEEKLY.map((c) => `${c.id}:clean`),
        ]),
      }),
    );
    expect(out.has('clean')).toBe(true);
    expect(out.get('clean')!.streak).toBe(0);
  });

  it('copes with no classes and no students without throwing', () => {
    expect(countSilentStreaks(build({ classes: [], attended: new Set() })).get('s1')!.streak).toBe(0);
    expect(countSilentStreaks(build({ studentIds: [] })).size).toBe(0);
  });
});
