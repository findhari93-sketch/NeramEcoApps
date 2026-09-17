import { describe, it, expect } from 'vitest';
import { createFakeDb } from './testing/fake-supabase';
import { submitAttempt } from './test-repository';

/**
 * An exam's submit guard reads the same window its door does.
 *
 * The 18 Aug History of Architecture exam closed at 22:45 IST. On 11 Sep the
 * teacher reopened it for 26 students until 19 Sep. The attempt route let them
 * in, because the door resolves each student's own window through
 * resolveExamWindowForStudent. submitAttempt only knew the placement's
 * available_until, which is the exam's own close, so every one of them was
 * refused at Submit with EXAM_CLOSED. Four students answered all 50 questions
 * and none of the papers was marked.
 */

const TEST_ID = 'test-1';
const STUDENT_ID = 'student-1';
const PLACEMENT_ID = 'placement-exam';
const EXAM_ID = 'exam-1';

const DAY = 24 * 60 * 60 * 1000;
const iso = (ms: number) => new Date(ms).toISOString();
const NOW = Date.now();
const EXAM_OPENS = iso(NOW - 30 * DAY);
const EXAM_CLOSES = iso(NOW - 30 * DAY + 8 * 60 * 60 * 1000);

function seed(extra: { makeups?: any[]; grants?: any[] } = {}) {
  return createFakeDb({
    nexus_tests: [
      { id: TEST_ID, title: 'History of Architecture Test', test_type: 'untimed', questions_to_serve: null, shuffle_sections: false },
    ],
    nexus_test_questions: [
      { id: 'tq-1', test_id: TEST_ID, qb_question_id: 'q-1', marks: 1, negative_marks: 0, sort_order: 0 },
    ],
    nexus_qb_questions: [
      { id: 'q-1', question_text: 'Which style?', question_format: 'MCQ', options: [{ id: 'a' }, { id: 'b' }], correct_answer: 'a' },
    ],
    nexus_test_placements: [
      {
        id: PLACEMENT_ID,
        test_id: TEST_ID,
        context_type: 'exam',
        context_id: 'scheduled-class-1',
        available_from: EXAM_OPENS,
        available_until: EXAM_CLOSES,
        gating: { exam_id: EXAM_ID, attempt_limit: 1 },
      },
    ],
    nexus_exams: [{ id: EXAM_ID, test_id: TEST_ID, opens_at: EXAM_OPENS, closes_at: EXAM_CLOSES }],
    nexus_exam_makeups: extra.makeups ?? [],
    nexus_test_access_requests: extra.grants ?? [],
    nexus_test_attempts: [
      {
        id: 'attempt-1',
        test_id: TEST_ID,
        student_id: STUDENT_ID,
        placement_id: PLACEMENT_ID,
        attempt_number: 1,
        status: 'in_progress',
        mode: 'official',
        answers: { 'q-1': 'a' },
        started_at: iso(NOW - 20 * 60 * 1000),
        submitted_at: null,
      },
    ],
    nexus_test_draws: [],
  });
}

function grant(opensAt: number, closesAt: number, status = 'granted') {
  return {
    id: 'grant-1',
    placement_id: PLACEMENT_ID,
    student_id: STUDENT_ID,
    source: 'teacher_grant',
    status,
    opens_at: iso(opensAt),
    closes_at: iso(closesAt),
  };
}

const submit = (db: ReturnType<typeof seed>) =>
  submitAttempt({ attemptId: 'attempt-1', studentId: STUDENT_ID }, db.client);

describe('submitAttempt: an exam submit honours the student\'s own window', () => {
  it('accepts the paper of a student the teacher reopened the exam for', async () => {
    const db = seed({ grants: [grant(NOW - 6 * DAY, NOW + 2 * DAY)] });

    const result = await submit(db);

    expect(result.percentage).toBe(100);
    expect(db.tables.nexus_test_attempts[0].status).toBe('submitted');
  });

  it('accepts the paper of a student sitting a make-up window', async () => {
    const db = seed({
      makeups: [
        {
          id: 'makeup-1',
          exam_id: EXAM_ID,
          student_id: STUDENT_ID,
          opens_at: iso(NOW - 60 * 60 * 1000),
          closes_at: iso(NOW + 60 * 60 * 1000),
          revoked_at: null,
        },
      ],
    });

    await submit(db);

    expect(db.tables.nexus_test_attempts[0].status).toBe('submitted');
  });

  it('still refuses a late submit from a student with no window of their own', async () => {
    const db = seed();

    await expect(submit(db)).rejects.toThrow('EXAM_CLOSED');
    expect(db.tables.nexus_test_attempts[0].status).toBe('in_progress');
  });

  it('refuses once the reopen itself has run out', async () => {
    const db = seed({ grants: [grant(NOW - 6 * DAY, NOW - 2 * 60 * 1000)] });

    await expect(submit(db)).rejects.toThrow('EXAM_CLOSED');
  });

  it('does not let a request the teacher has not approved stand in for a reopen', async () => {
    const db = seed({ grants: [grant(NOW - 6 * DAY, NOW + 2 * DAY, 'pending')] });

    await expect(submit(db)).rejects.toThrow('EXAM_CLOSED');
  });
});
