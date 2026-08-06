/**
 * The guard on the rule that the tile and the list both read.
 *
 * The bug this replaces: two hand-written copies of "who needs attention", one on
 * the headline tile and one on the red list under it, differing by a single term
 * (`clock.stalled`). Because nearly every student is stalled, the tile said 8 and
 * the list showed considerably more. Counting the rows to check the number gave
 * the wrong answer, which is the fastest way to teach someone not to trust a
 * screen.
 *
 * So the properties worth holding are that the classification is total, that it
 * is mutually exclusive, and that the tally is exactly a count of it.
 */
import { describe, it, expect } from 'vitest';
import {
  BUCKET_META,
  BUCKET_ORDER,
  catchupBucket,
  emptyTally,
  tallyBuckets,
  type BucketInput,
  type CatchupBucket,
} from './catchup-buckets';

/** A student with a clock running and keeping up. Every case below narrows this. */
function student(over: Partial<BucketInput> = {}): BucketInput {
  return {
    openCount: 3,
    blockedOnUs: 0,
    clock: { active: true, overdue: false, stalled: false },
    pace: { state: 'on_track' },
    ...over,
  };
}

describe('catchupBucket', () => {
  it('sends a student with nothing but blocked work to waiting_on_us', () => {
    // These students were not on the screen at all before. Blocked and
    // pending_teacher items never reach the pace denominator, so their open count
    // was zero and the route skipped them: nobody could see that an unpublished
    // recap was holding four people up.
    expect(
      catchupBucket(
        student({
          openCount: 0,
          blockedOnUs: 2,
          clock: { active: false, overdue: false, stalled: false },
          pace: { state: 'done' },
        }),
      ),
    ).toBe('waiting_on_us');
  });

  it('does not call it waiting_on_us while they still have work they can do', () => {
    // A recap we owe on one class does not excuse the other four they could open
    // today. Chasing them is still the right call, so they stay in a chase group.
    expect(catchupBucket(student({ openCount: 4, blockedOnUs: 2 }))).toBe('in_progress');
  });

  it('puts an expired clock ahead of everything else', () => {
    expect(
      catchupBucket(
        student({
          clock: { active: true, overdue: true, stalled: false },
          pace: { state: 'behind' },
        }),
      ),
    ).toBe('run_over');
  });

  it('calls a stalled student not_started, never behind', () => {
    // The specific complaint beats the trend. "They have never opened it" tells a
    // teacher what to say on the call; "behind pace" does not. This is also the
    // single most common state on the screen, so burying it inside `behind` is
    // how the largest group became invisible.
    expect(
      catchupBucket(
        student({
          clock: { active: false, overdue: false, stalled: true },
          pace: { state: 'behind' },
        }),
      ),
    ).toBe('not_started');
  });

  it('falls through to behind only for a student who is actually working', () => {
    expect(catchupBucket(student({ pace: { state: 'behind' } }))).toBe('behind');
  });

  it('is total and mutually exclusive across every combination', () => {
    // Exhaustive rather than sampled: the whole point of one function is that no
    // input can slip between the branches or satisfy two of them.
    const seen = new Set<CatchupBucket>();
    for (const openCount of [0, 3]) {
      for (const blockedOnUs of [0, 2]) {
        for (const active of [true, false]) {
          for (const overdue of [true, false]) {
            for (const stalled of [true, false]) {
              for (const state of ['on_track', 'behind', 'done'] as const) {
                const bucket = catchupBucket({
                  openCount,
                  blockedOnUs,
                  clock: { active, overdue, stalled },
                  pace: { state },
                });
                expect(BUCKET_ORDER).toContain(bucket);
                seen.add(bucket);
              }
            }
          }
        }
      }
    }
    // Every bucket is reachable, so none of them is dead code on a screen.
    expect([...seen].sort()).toEqual([...BUCKET_ORDER].sort());
  });
});

describe('the buckets as a set', () => {
  it('gives every bucket a heading, a hint and a tone', () => {
    for (const bucket of BUCKET_ORDER) {
      expect(BUCKET_META[bucket]?.label, bucket).toBeTruthy();
      expect(BUCKET_META[bucket]?.hint, bucket).toBeTruthy();
    }
    expect(Object.keys(BUCKET_META).sort()).toEqual([...BUCKET_ORDER].sort());
  });

  it('offers a nudge only where a nudge would be honest', () => {
    // Messaging someone to hurry up with a class we have not published a recap
    // for is the one thing this screen must not make easy.
    expect(BUCKET_META.waiting_on_us.nudgeable).toBe(false);
    expect(BUCKET_META.in_progress.nudgeable).toBe(false);
    expect(BUCKET_META.run_over.nudgeable).toBe(true);
    expect(BUCKET_META.not_started.nudgeable).toBe(true);
  });

  it('classifies waiting_on_us first but renders it last', () => {
    // It classifies first because it is a claim about us. It renders last because
    // it is the one group nobody can fix by making a phone call.
    expect(BUCKET_ORDER[BUCKET_ORDER.length - 1]).toBe('waiting_on_us');
    expect(BUCKET_ORDER[0]).toBe('run_over');
  });
});

describe('tallyBuckets', () => {
  it('counts exactly what it was given, so the tiles match the groups', () => {
    const tally = tallyBuckets(['run_over', 'not_started', 'not_started', 'waiting_on_us']);
    expect(tally.run_over).toBe(1);
    expect(tally.not_started).toBe(2);
    expect(tally.waiting_on_us).toBe(1);
    expect(tally.behind).toBe(0);
    expect(Object.values(tally).reduce((a, b) => a + b, 0)).toBe(4);
  });

  it('starts from zero on every bucket, not from undefined', () => {
    // A missing key renders as "NaN need attention" rather than "0".
    expect(Object.values(emptyTally()).every((n) => n === 0)).toBe(true);
    expect(Object.keys(emptyTally()).sort()).toEqual([...BUCKET_ORDER].sort());
  });
});
