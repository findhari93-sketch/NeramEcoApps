import { describe, it, expect } from 'vitest';
import { createFakeDb } from './testing/fake-supabase';
import { recordAttemptViolation, countAttemptViolations, getViolationCountsForTest } from './test-attempt-violations';

const TEST_ID = 'test-1';

function seed() {
  return createFakeDb({ nexus_test_attempt_violations: [] });
}

describe('recordAttemptViolation / countAttemptViolations', () => {
  it('starts at zero for an attempt with no logged violations', async () => {
    const db = seed();
    expect(await countAttemptViolations('attempt-1', db.client)).toBe(0);
  });

  it('returns the running count for that attempt after each insert', async () => {
    const db = seed();
    const input = { attemptId: 'attempt-1', testId: TEST_ID, studentId: 'student-1' } as const;

    expect(await recordAttemptViolation({ ...input, kind: 'tab_switch' }, db.client)).toBe(1);
    expect(await recordAttemptViolation({ ...input, kind: 'window_blur' }, db.client)).toBe(2);
    expect(await recordAttemptViolation({ ...input, kind: 'fullscreen_exit' }, db.client)).toBe(3);
  });

  it('keeps counts scoped to their own attempt, not the whole test', async () => {
    const db = seed();
    await recordAttemptViolation(
      { attemptId: 'attempt-1', testId: TEST_ID, studentId: 'student-1', kind: 'tab_switch' },
      db.client,
    );
    await recordAttemptViolation(
      { attemptId: 'attempt-2', testId: TEST_ID, studentId: 'student-2', kind: 'tab_switch' },
      db.client,
    );

    expect(await countAttemptViolations('attempt-1', db.client)).toBe(1);
    expect(await countAttemptViolations('attempt-2', db.client)).toBe(1);
  });
});

describe('getViolationCountsForTest: batched per student, summed across attempts', () => {
  it("sums a student's violations across multiple attempts (a retake does not reset the pattern)", async () => {
    const db = seed();
    // student-1 sat twice (attempt-1 then a retake, attempt-2), and left the
    // paper on both sittings.
    await recordAttemptViolation(
      { attemptId: 'attempt-1', testId: TEST_ID, studentId: 'student-1', kind: 'tab_switch' },
      db.client,
    );
    await recordAttemptViolation(
      { attemptId: 'attempt-2', testId: TEST_ID, studentId: 'student-1', kind: 'window_blur' },
      db.client,
    );
    await recordAttemptViolation(
      { attemptId: 'attempt-2', testId: TEST_ID, studentId: 'student-1', kind: 'fullscreen_exit' },
      db.client,
    );
    await recordAttemptViolation(
      { attemptId: 'attempt-3', testId: TEST_ID, studentId: 'student-2', kind: 'tab_switch' },
      db.client,
    );

    const counts = await getViolationCountsForTest(TEST_ID, ['student-1', 'student-2', 'student-3'], db.client);
    expect(counts.get('student-1')).toBe(3);
    expect(counts.get('student-2')).toBe(1);
    expect(counts.get('student-3')).toBeUndefined();
  });

  it('returns an empty map without querying when no student ids are given', async () => {
    const db = seed();
    const counts = await getViolationCountsForTest(TEST_ID, [], db.client);
    expect(counts.size).toBe(0);
  });
});
