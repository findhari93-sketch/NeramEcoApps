import { describe, it, expect } from 'vitest';
import { createFakeDb } from './testing/fake-supabase';
import { startOrResumeAttempt } from './test-repository';

/**
 * startOrResumeAttempt's gating.attempt_limit check gained an optional
 * extraAttempts input for nexus_exam_attempt_overrides (a teacher's "+1
 * attempt" grant from the invigilation roster). These pin that the base limit
 * is unchanged for every caller that omits it, and that a finite base limit is
 * raised by exactly the override amount when one is given.
 */

const TEST_ID = 'test-1';
const STUDENT_ID = 'student-1';
const PLACEMENT_ID = 'placement-1';

function baseSeed(gating: Record<string, unknown>, submittedCount: number) {
  const attempts = Array.from({ length: submittedCount }, (_, i) => ({
    id: `attempt-${i + 1}`,
    test_id: TEST_ID,
    student_id: STUDENT_ID,
    placement_id: PLACEMENT_ID,
    attempt_number: i + 1,
    status: 'submitted',
    mode: 'official',
    answers: {},
    started_at: new Date().toISOString(),
    submitted_at: new Date().toISOString(),
    percentage: 80,
  }));

  return createFakeDb({
    nexus_tests: [
      {
        id: TEST_ID,
        title: 'History of Architecture Test',
        test_type: 'untimed',
        questions_to_serve: null,
        shuffle_sections: false,
      },
    ],
    nexus_test_questions: [
      { id: 'tq-1', test_id: TEST_ID, qb_question_id: 'q-1', marks: 1, negative_marks: 0, sort_order: 0 },
    ],
    nexus_qb_questions: [
      { id: 'q-1', question_text: 'Which style?', question_format: 'MCQ', options: [{ id: 'a' }], correct_answer: 'a' },
    ],
    nexus_test_placements: [{ id: PLACEMENT_ID, test_id: TEST_ID, gating }],
    nexus_test_attempts: attempts,
    nexus_test_draws: [],
  });
}

describe('startOrResumeAttempt: extraAttempts on top of gating.attempt_limit', () => {
  it('a base limit of 1 alone blocks a 2nd sitting once 1 has been submitted (unchanged behavior)', async () => {
    const db = baseSeed({ attempt_limit: 1 }, 1);
    await expect(
      startOrResumeAttempt({ testId: TEST_ID, studentId: STUDENT_ID, placementId: PLACEMENT_ID }, db.client),
    ).rejects.toThrow('ATTEMPT_LIMIT_REACHED');
  });

  it('extraAttempts: 0 is a no-op, identical to omitting it', async () => {
    const db = baseSeed({ attempt_limit: 1 }, 1);
    await expect(
      startOrResumeAttempt(
        { testId: TEST_ID, studentId: STUDENT_ID, placementId: PLACEMENT_ID, extraAttempts: 0 },
        db.client,
      ),
    ).rejects.toThrow('ATTEMPT_LIMIT_REACHED');
  });

  it('base 1 + override 2 = 3 allowed: a 3rd sitting is let through once 2 are submitted', async () => {
    const db = baseSeed({ attempt_limit: 1 }, 2);
    const result = await startOrResumeAttempt(
      { testId: TEST_ID, studentId: STUDENT_ID, placementId: PLACEMENT_ID, extraAttempts: 2 },
      db.client,
    );
    expect(result.resumed).toBe(false);
    expect(Number(result.attempt.attempt_number)).toBe(3);
  });

  it('the same override still blocks a 4th sitting once all 3 are used', async () => {
    const db = baseSeed({ attempt_limit: 1 }, 3);
    await expect(
      startOrResumeAttempt(
        { testId: TEST_ID, studentId: STUDENT_ID, placementId: PLACEMENT_ID, extraAttempts: 2 },
        db.client,
      ),
    ).rejects.toThrow('ATTEMPT_LIMIT_REACHED');
  });

  it('an unlimited base limit (no attempt_limit set) ignores overrides entirely', async () => {
    const db = baseSeed({}, 5);
    const result = await startOrResumeAttempt(
      { testId: TEST_ID, studentId: STUDENT_ID, placementId: PLACEMENT_ID, extraAttempts: 2 },
      db.client,
    );
    expect(result.resumed).toBe(false);
    expect(Number(result.attempt.attempt_number)).toBe(6);
  });
});
