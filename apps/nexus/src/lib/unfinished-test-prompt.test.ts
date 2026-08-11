/**
 * Regression test for NXS-0116: the "What happened?" popup stayed open
 * because closing it for one abandoned attempt immediately surfaced the
 * next one in the same render, which reads as the popup never closing.
 */
import { describe, it, expect } from 'vitest';
import { pickUnexplainedAttempt } from './unfinished-test-prompt';

describe('pickUnexplainedAttempt', () => {
  it('picks the newest (first) unexplained attempt when nothing has been asked yet', () => {
    const queue = [{ attempt_id: 'a' }, { attempt_id: 'b' }, { attempt_id: 'c' }];
    expect(pickUnexplainedAttempt(queue, false)).toEqual({ attempt_id: 'a' });
  });

  it('does not surface the next queued attempt once one has been asked this visit', () => {
    const queue = [{ attempt_id: 'a' }, { attempt_id: 'b' }, { attempt_id: 'c' }];
    expect(pickUnexplainedAttempt(queue, true)).toBeNull();
  });

  it('returns null when the queue is empty, regardless of the flag', () => {
    expect(pickUnexplainedAttempt([], false)).toBeNull();
    expect(pickUnexplainedAttempt([], true)).toBeNull();
  });

  it('returns null when the queue is missing', () => {
    expect(pickUnexplainedAttempt(undefined, false)).toBeNull();
    expect(pickUnexplainedAttempt(null, false)).toBeNull();
  });
});
