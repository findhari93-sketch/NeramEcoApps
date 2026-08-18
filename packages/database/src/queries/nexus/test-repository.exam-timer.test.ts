import { describe, it, expect } from 'vitest';
import { createFakeDb } from './testing/fake-supabase';
import { startOrResumeAttempt } from './test-repository';

/**
 * An exam's own timer_mode overrides the paper's fixed test_type when
 * deciding whether an in-progress attempt is stale (see resolveExamTimer()
 * in exam-timer.ts, and the exam-context branch it feeds in
 * startOrResumeAttempt). These pin both directions: an untimed paper made
 * timed for this sitting, and a timed paper made untimed for this sitting.
 */

const TEST_ID = 'test-1';
const STUDENT_ID = 'student-1';
const PLACEMENT_ID = 'placement-1';
const EXAM_ID = 'exam-1';
const FIVE_MINUTES_AGO = new Date(Date.now() - 5 * 60 * 1000).toISOString();

function seed(opts: {
  paperTestType: string;
  paperDurationMinutes: number | null;
  examTimerMode: 'inherit' | 'untimed' | 'timed';
  examDurationMinutes: number | null;
}) {
  return createFakeDb({
    nexus_tests: [
      {
        id: TEST_ID,
        title: 'History of Architecture Test',
        test_type: opts.paperTestType,
        duration_minutes: opts.paperDurationMinutes,
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
    nexus_test_placements: [
      {
        id: PLACEMENT_ID,
        test_id: TEST_ID,
        context_type: 'exam',
        context_id: 'scheduled-class-1',
        gating: { exam_id: EXAM_ID, attempt_limit: 1 },
      },
    ],
    nexus_exams: [
      {
        id: EXAM_ID,
        test_id: TEST_ID,
        timer_mode: opts.examTimerMode,
        duration_minutes: opts.examDurationMinutes,
      },
    ],
    nexus_test_attempts: [
      {
        id: 'attempt-1',
        test_id: TEST_ID,
        student_id: STUDENT_ID,
        placement_id: PLACEMENT_ID,
        attempt_number: 1,
        status: 'in_progress',
        mode: 'official',
        answers: {},
        started_at: FIVE_MINUTES_AGO,
        submitted_at: null,
      },
    ],
    nexus_test_draws: [],
  });
}

describe('startOrResumeAttempt: an exam timer_mode override changes staleness, not just the paper', () => {
  it('timer_mode "timed" makes an untimed paper\'s attempt go stale on the exam\'s own short duration', async () => {
    const db = seed({
      paperTestType: 'untimed',
      paperDurationMinutes: null,
      examTimerMode: 'timed',
      examDurationMinutes: 1, // 1 minute, and the attempt started 5 minutes ago
    });

    const result = await startOrResumeAttempt(
      { testId: TEST_ID, studentId: STUDENT_ID, placementId: PLACEMENT_ID },
      db.client,
    );

    // The stale attempt-1 was retired and a fresh attempt-2 started, proving
    // the paper's own "untimed" was overridden by the exam.
    expect(result.resumed).toBe(false);
    expect(Number(result.attempt.attempt_number)).toBe(2);
    const retired = db.tables.nexus_test_attempts.find((a) => a.id === 'attempt-1');
    expect(retired?.status).toBe('abandoned');
  });

  it('timer_mode "untimed" keeps a timed paper\'s attempt resumable past what would otherwise be stale', async () => {
    const db = seed({
      paperTestType: 'timed',
      paperDurationMinutes: 1, // would be stale after 1 minute if the paper alone decided
      examTimerMode: 'untimed',
      examDurationMinutes: null,
    });

    const result = await startOrResumeAttempt(
      { testId: TEST_ID, studentId: STUDENT_ID, placementId: PLACEMENT_ID },
      db.client,
    );

    // Resumed, not replaced: the exam's own "untimed" overrode the paper.
    expect(result.resumed).toBe(true);
    expect(result.attempt.id).toBe('attempt-1');
    const original = db.tables.nexus_test_attempts.find((a) => a.id === 'attempt-1');
    expect(original?.status).toBe('in_progress');
  });

  it('timer_mode "inherit" (a pre-existing exam) keeps the paper fully authoritative, unchanged from before this feature', async () => {
    const db = seed({
      paperTestType: 'timed',
      paperDurationMinutes: 1,
      examTimerMode: 'inherit',
      examDurationMinutes: 999, // irrelevant under inherit -- must not leak through
    });

    const result = await startOrResumeAttempt(
      { testId: TEST_ID, studentId: STUDENT_ID, placementId: PLACEMENT_ID },
      db.client,
    );

    expect(result.resumed).toBe(false);
    expect(Number(result.attempt.attempt_number)).toBe(2);
  });
});
