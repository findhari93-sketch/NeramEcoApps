import { describe, expect, it } from 'vitest';
import { EMPTY_PAYLOAD, withPayloadDefaults, type CachedPayload } from './payload';

describe('withPayloadDefaults', () => {
  it('tells nothing-yet from nothing-here', () => {
    expect(withPayloadDefaults(undefined)).toBeNull();
    expect(withPayloadDefaults({})).toEqual(EMPTY_PAYLOAD);
  });

  /**
   * The exact payload a teacher had on their device: written by the deploy
   * before `byBucket` existed, replayed into the deploy whose tiles read
   * `totals.byBucket.run_over`.
   */
  it('survives a payload written before byBucket existed', () => {
    const yesterday = {
      classroomId: 'c1',
      students: [],
      totals: {
        studentsBehind: 4,
        studentsCatchingUp: 9,
        outstanding: 21,
        clearedThisMonth: 2,
        explained: 3,
        unexplained: 6,
        hiddenDormant: 0,
      },
    } as CachedPayload;

    const data = withPayloadDefaults(yesterday)!;

    expect(data.totals.byBucket.run_over).toBe(0);
    expect(data.totals.byBucket.waiting_on_us).toBe(0);
    // The numbers that were there are still the ones reported.
    expect(data.totals.studentsBehind).toBe(4);
    expect(data.totals.outstanding).toBe(21);
    // And the lists the tabs walk are arrays, not undefined.
    expect(data.students).toEqual([]);
    // The diagnosis tiles read a tally that yesterday's payload never had.
    expect(data.totals.byDiagnosis.stuck).toBe(0);
    expect(data.totals.byDiagnosis.all_clear).toBe(0);
  });

  it('fills a bucket the tally has never heard of', () => {
    const data = withPayloadDefaults({ totals: { byBucket: { run_over: 3 } } })!;

    expect(data.totals.byBucket.run_over).toBe(3);
    expect(data.totals.byBucket.not_started).toBe(0);
  });

  it('gives rows cached before congratulations were recorded a null celebration', () => {
    // A missing key must read as "never congratulated", and the payload-level
    // flag as "the records were read", so the wall still pre-selects.
    const data = withPayloadDefaults({
      students: [{ student: { id: 's1' }, bucket: 'all_clear' } as any],
    })!;

    expect(data.students[0].celebration).toBeNull();
    expect(data.celebrationsUnavailable).toBe(false);
  });

  it('leaves a complete payload alone', () => {
    const full: CachedPayload = {
      ...EMPTY_PAYLOAD,
      classroomId: 'c1',
      totals: { ...EMPTY_PAYLOAD.totals, outstanding: 12, byBucket: { ...EMPTY_PAYLOAD.totals.byBucket, behind: 5 } },
    };

    expect(withPayloadDefaults(full)).toEqual(full);
  });
});
