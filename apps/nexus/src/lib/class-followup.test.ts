import { describe, expect, it } from 'vitest';
import {
  daysToCatchUp,
  followupState,
  isIrregular,
  medianOf,
  stateFromBucket,
  tallyFollowup,
  type FollowupInput,
} from './class-followup';

const missed = (over: Partial<FollowupInput> = {}): FollowupInput => ({
  attended: false,
  measured: true,
  hasReason: false,
  hasAbsence: true,
  ...over,
});

describe('followupState: the four corners', () => {
  it('told us why and caught up', () => {
    expect(followupState(missed({ hasReason: true, caughtUp: true }))).toBe('caught_up');
  });

  it('told us why, not yet', () => {
    expect(followupState(missed({ hasReason: true, catchupStatus: 'active' }))).toBe('catching_up');
  });

  it('said nothing but caught up', () => {
    expect(followupState(missed({ caughtUp: true }))).toBe('caught_up_silent');
  });

  it('said nothing and not caught up is the one to ring', () => {
    expect(followupState(missed({ catchupStatus: 'waiting' }))).toBe('needs_call');
  });
});

describe('followupState: the states on neither axis', () => {
  it('came, whole or partly', () => {
    expect(followupState({ ...missed(), attended: true })).toBe('attended');
    expect(followupState({ ...missed(), attended: true, partly: true })).toBe('partly');
  });

  it('never blames a student for a recap we have not published', () => {
    expect(followupState(missed({ catchupStatus: 'pending_teacher' }))).toBe('waiting_on_us');
    expect(followupState(missed({ catchupStatus: 'blocked' }))).toBe('waiting_on_us');
  });

  it('a late joiner owes the recording, not a reason', () => {
    expect(followupState(missed({ joinedAfterClass: true }))).toBe('late_joiner');
    // And finishing it is a plain catch-up, never "never said why".
    expect(followupState(missed({ joinedAfterClass: true, caughtUp: true }))).toBe('caught_up');
  });

  it('excused outranks everything a student could still do', () => {
    expect(followupState(missed({ excused: true, catchupStatus: 'waiting' }))).toBe('excused');
  });

  it('says nothing about a class whose attendance was never read', () => {
    expect(followupState(missed({ measured: false, hasAbsence: false }))).toBe('unmeasured');
    // A teacher-marked absence on an unsynced class still counts.
    expect(followupState(missed({ measured: false, hasAbsence: true }))).toBe('needs_call');
  });
});

describe('stateFromBucket', () => {
  it('files a student on declared leave under told-us-why', () => {
    expect(stateFromBucket('away')).toBe('catching_up');
    expect(stateFromBucket('missed_with_reason')).toBe('catching_up');
    expect(stateFromBucket('missed_no_reason')).toBe('needs_call');
  });
});

describe('the numbers around the grid', () => {
  it('tallies one state per student', () => {
    const t = tallyFollowup(['attended', 'attended', 'needs_call', 'caught_up']);
    expect(t.attended).toBe(2);
    expect(t.needs_call).toBe(1);
    expect(t.caught_up).toBe(1);
    expect(t.catching_up).toBe(0);
  });

  it('counts catch-up days in IST', () => {
    // 11:30 PM IST on the 16th is still the 16th, one day after a class on the 15th.
    expect(daysToCatchUp('2026-09-15', '2026-09-16T18:00:00Z')).toBe(1);
    expect(daysToCatchUp('2026-09-15', null)).toBeNull();
  });

  it('uses the median so one straggler does not describe the class', () => {
    expect(medianOf([1, 2, 90])).toBe(2);
    expect(medianOf([1, 3])).toBe(2);
    expect(medianOf([])).toBeNull();
  });

  it('flags a student irregular at 3 misses of the recent classes', () => {
    expect(isIrregular({ missed: 3, of: 5 })).toBe(true);
    expect(isIrregular({ missed: 2, of: 5 })).toBe(false);
    expect(isIrregular({ missed: 2, of: 2 })).toBe(false);
    expect(isIrregular(null)).toBe(false);
  });
});
