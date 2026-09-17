// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { nextPollDelay, type PollInputs } from './poll-policy';

const base: PollInputs = { role: 'student', realtime: 'unavailable', sessionStatus: 'live', promptState: null, hidden: false, failures: 0 };

describe('nextPollDelay', () => {
  it('stops polling once the session has ended', () => {
    expect(nextPollDelay({ ...base, sessionStatus: 'ended' })).toBeNull();
    expect(nextPollDelay({ ...base, role: 'teacher', sessionStatus: 'ended', hidden: true })).toBeNull();
  });

  it('keeps a student within a few seconds of the teacher without Realtime', () => {
    expect(nextPollDelay(base)).toBe(3_000);
  });

  it('polls the live counter fastest while students are answering, and relaxes otherwise', () => {
    expect(nextPollDelay({ ...base, role: 'teacher', promptState: 'open' })).toBe(2_000);
    for (const promptState of ['closed', 'revealed', null] as const) {
      expect(nextPollDelay({ ...base, role: 'teacher', promptState })).toBe(5_000);
    }
  });

  it('drops to a slow safety net once Realtime hints arrive', () => {
    expect(nextPollDelay({ ...base, realtime: 'subscribed' })).toBe(30_000);
    expect(nextPollDelay({ ...base, role: 'teacher', realtime: 'subscribed', promptState: 'open' })).toBe(30_000);
  });

  it('treats a connection still being made as unavailable', () => {
    expect(nextPollDelay({ ...base, realtime: 'connecting' })).toBe(3_000);
  });

  it('barely polls a hidden panel', () => {
    expect(nextPollDelay({ ...base, hidden: true, role: 'teacher', promptState: 'open' })).toBe(60_000);
  });

  it('backs off after failures, doubling up to thirty seconds', () => {
    expect(nextPollDelay({ ...base, failures: 1 })).toBe(6_000);
    expect(nextPollDelay({ ...base, failures: 2 })).toBe(12_000);
    expect(nextPollDelay({ ...base, failures: 3 })).toBe(24_000);
    expect(nextPollDelay({ ...base, failures: 4 })).toBe(30_000);
    expect(nextPollDelay({ ...base, failures: 50 })).toBe(30_000);
    // Never faster than the healthy cadence for a slow screen.
    expect(nextPollDelay({ ...base, hidden: true, failures: 3 })).toBe(60_000);
  });
});
