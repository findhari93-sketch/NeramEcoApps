import { describe, it, expect } from 'vitest';
import { createFakeDb } from './testing/fake-supabase';
import { startOrResumeAttempt } from './test-repository';

/**
 * The attempt limit belongs to the door, not to the paper.
 *
 * Paper acf8084d is a Study Materials chapter test AND the 18 Aug exam. The exam
 * allowed one attempt and the limit counted every attempt on the paper, so the
 * three students who had practised the chapter were refused at the exam door
 * with "You have used all your attempts at this test". All sixteen who got in had
 * never practised it. A reopen's extra attempt did not rescue them either: Inaya
 * had seven practice submissions against a limit of two.
 */

const TEST_ID = 'test-1';
const STUDENT_ID = 'student-1';
const EXAM = 'placement-exam';
const STUDY = 'placement-study';

function attempt(n: number, placementId: string, status: string) {
  return {
    id: `attempt-${n}`,
    test_id: TEST_ID,
    student_id: STUDENT_ID,
    placement_id: placementId,
    attempt_number: n,
    status,
    mode: 'official',
    answers: {},
    started_at: new Date().toISOString(),
    submitted_at: status === 'in_progress' ? null : new Date().toISOString(),
    percentage: status === 'submitted' ? 90 : null,
  };
}

function seed(attempts: any[]) {
  return createFakeDb({
    nexus_tests: [
      { id: TEST_ID, title: 'Indus Valley', test_type: 'untimed', questions_to_serve: null, shuffle_sections: false },
    ],
    nexus_test_questions: [
      { id: 'tq-1', test_id: TEST_ID, qb_question_id: 'q-1', marks: 1, negative_marks: 0, sort_order: 0 },
    ],
    nexus_qb_questions: [
      { id: 'q-1', question_text: 'Also known as?', question_format: 'MCQ', options: [{ id: 'a' }], correct_answer: 'a' },
    ],
    nexus_test_placements: [
      { id: EXAM, test_id: TEST_ID, context_type: 'exam', gating: { attempt_limit: 1 } },
      { id: STUDY, test_id: TEST_ID, context_type: 'study_file', gating: {} },
    ],
    nexus_test_attempts: attempts,
    nexus_test_draws: [],
  });
}

describe('startOrResumeAttempt: the limit is counted per door', () => {
  it('lets a student who practised the chapter three times into the one-attempt exam', async () => {
    const db = seed([attempt(1, STUDY, 'submitted'), attempt(2, STUDY, 'submitted'), attempt(3, STUDY, 'submitted')]);

    const result = await startOrResumeAttempt(
      { testId: TEST_ID, studentId: STUDENT_ID, placementId: EXAM },
      db.client,
    );

    expect(result.resumed).toBe(false);
    expect(result.attempt.placement_id).toBe(EXAM);
    // Numbered across the whole paper, because the draw key depends on it.
    expect(Number(result.attempt.attempt_number)).toBe(4);
  });

  it('still refuses a second sitting through the exam door itself', async () => {
    const db = seed([attempt(1, STUDY, 'submitted'), attempt(2, EXAM, 'submitted')]);

    await expect(
      startOrResumeAttempt({ testId: TEST_ID, studentId: STUDENT_ID, placementId: EXAM }, db.client),
    ).rejects.toThrow('ATTEMPT_LIMIT_REACHED');
  });

  it('gives a reopened student their one extra sitting, however much they practised', async () => {
    const db = seed([
      ...[1, 2, 3, 4, 5, 6, 7].map((n) => attempt(n, STUDY, 'submitted')),
      attempt(8, EXAM, 'submitted'),
    ]);

    const result = await startOrResumeAttempt(
      { testId: TEST_ID, studentId: STUDENT_ID, placementId: EXAM, extraAttempts: 1 },
      db.client,
    );

    expect(result.attempt.placement_id).toBe(EXAM);
    expect(Number(result.attempt.attempt_number)).toBe(9);
  });
});

describe('startOrResumeAttempt: an open attempt stays on its own door', () => {
  it('does not hand a practice attempt left open to the exam, and closes it with a stated reason', async () => {
    const db = seed([attempt(1, STUDY, 'in_progress')]);

    const result = await startOrResumeAttempt(
      { testId: TEST_ID, studentId: STUDENT_ID, placementId: EXAM },
      db.client,
    );

    expect(result.resumed).toBe(false);
    expect(result.attempt.placement_id).toBe(EXAM);

    const practice = db.tables.nexus_test_attempts.find((a: any) => a.id === 'attempt-1');
    expect(practice.status).toBe('abandoned');
    // Set, so the student is not asked why they gave up on it.
    expect(practice.abandon_reason_code).toBe('other');
  });

  it('does not hand an open exam attempt to the practice door either', async () => {
    const db = seed([attempt(1, EXAM, 'in_progress')]);

    const result = await startOrResumeAttempt(
      { testId: TEST_ID, studentId: STUDENT_ID, placementId: STUDY },
      db.client,
    );

    expect(result.resumed).toBe(false);
    expect(result.attempt.placement_id).toBe(STUDY);
  });

  it('still resumes an open attempt through the same door', async () => {
    const db = seed([attempt(1, STUDY, 'in_progress')]);

    const result = await startOrResumeAttempt(
      { testId: TEST_ID, studentId: STUDENT_ID, placementId: STUDY },
      db.client,
    );

    expect(result.resumed).toBe(true);
    expect(result.attempt.id).toBe('attempt-1');
  });
});
