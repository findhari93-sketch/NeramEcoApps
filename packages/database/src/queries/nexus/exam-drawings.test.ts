import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeDb } from './testing/fake-supabase';
import { DRAWING_SUBMISSION_STATUSES, QUEUED_STATUS } from './exam-drawings';

/**
 * The bug this pins, in full.
 *
 * queueExamDrawings inserted `status: 'pending'`. The live CHECK constraint
 * drawing_submissions_status_check allows only
 *
 *   submitted | under_review | redo | completed | reviewed
 *
 * so every insert threw at the database. dispatchPlacementSideEffect catches
 * and logs rather than failing the student's submission, which is the right
 * call for a student mid-submit and is also why nobody noticed: production had
 * 0 rows with exam_attempt_id set, and the feature read as "no exam has drawings
 * yet" rather than "no exam drawing has ever been queued".
 *
 * The interesting assertion is not that the status equals a particular string.
 * It is that the status is a member of the constraint's vocabulary, so a future
 * edit to a value the database does not accept fails here rather than in a
 * swallowed log line six months later.
 */

const QUESTIONS = [
  { question_id: 'q-draw-1', question_format: 'DRAWING_PROMPT' },
  { question_id: 'q-mcq-1', question_format: 'MCQ' },
  { question_id: 'q-draw-2', question_format: 'DRAWING_PROMPT' },
  { question_id: 'q-img-1', question_format: 'IMAGE_BASED' },
];

vi.mock('./test-repository', () => ({
  getComposedTestQuestions: vi.fn(async () => QUESTIONS),
}));

const ATTEMPT = 'attempt-1';
const STUDENT = 'student-1';

function seed(answers: Record<string, string>) {
  return createFakeDb({
    nexus_test_attempts: [{ id: ATTEMPT, test_id: 'test-1', answers }],
    drawing_submissions: [],
  });
}

/** Every drawing answered with an uploaded image. */
const ALL_UPLOADED = {
  'q-draw-1': 'https://example.test/drawing-uploads/a.jpg',
  'q-draw-2': 'https://example.test/drawing-uploads/b.jpg',
  'q-img-1': 'https://example.test/drawing-uploads/c.jpg',
  'q-mcq-1': 'b',
};

describe('queueExamDrawings: the status the database will accept', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('writes a status inside drawing_submissions_status_check', async () => {
    const { queueExamDrawings } = await import('./exam-drawings');
    const db = seed(ALL_UPLOADED);

    await queueExamDrawings(
      { attemptId: ATTEMPT, studentId: STUDENT, placement: { context_id: 'class-1' } },
      db.client,
    );

    const queued = db.tables.drawing_submissions;
    expect(queued.length).toBeGreaterThan(0);
    for (const row of queued) {
      // 'pending' is what this caught. Any value outside the set throws 23514
      // at the database and is then swallowed by the caller.
      expect(DRAWING_SUBMISSION_STATUSES).toContain(row.status);
    }
  });

  it('queues a freshly uploaded drawing as submitted, not as anything further along', async () => {
    const { queueExamDrawings } = await import('./exam-drawings');
    const db = seed(ALL_UPLOADED);

    await queueExamDrawings(
      { attemptId: ATTEMPT, studentId: STUDENT, placement: { context_id: 'class-1' } },
      db.client,
    );

    expect(QUEUED_STATUS).toBe('submitted');
    expect(db.tables.drawing_submissions.every((r: any) => r.status === 'submitted')).toBe(true);
  });

  it('queues the drawings and the image question, and leaves the MCQ alone', async () => {
    const { queueExamDrawings } = await import('./exam-drawings');
    const db = seed(ALL_UPLOADED);

    const result = await queueExamDrawings(
      { attemptId: ATTEMPT, studentId: STUDENT, placement: { context_id: 'class-1' } },
      db.client,
    );

    expect(result.queued).toBe(3);
    const ids = db.tables.drawing_submissions.map((r: any) => r.exam_qb_question_id).sort();
    expect(ids).toEqual(['q-draw-1', 'q-draw-2', 'q-img-1']);
  });

  it('skips a drawing the student left blank rather than queueing an empty sheet', async () => {
    const { queueExamDrawings } = await import('./exam-drawings');
    const db = seed({ 'q-draw-1': 'https://example.test/drawing-uploads/a.jpg' });

    const result = await queueExamDrawings(
      { attemptId: ATTEMPT, studentId: STUDENT, placement: { context_id: 'class-1' } },
      db.client,
    );

    expect(result.queued).toBe(1);
    expect(db.tables.drawing_submissions).toHaveLength(1);
  });

  it('is idempotent, so a retried side effect cannot show a teacher the same drawing twice', async () => {
    const { queueExamDrawings } = await import('./exam-drawings');
    const db = seed(ALL_UPLOADED);
    const args = {
      attemptId: ATTEMPT,
      studentId: STUDENT,
      placement: { context_id: 'class-1' },
    };

    await queueExamDrawings(args, db.client);
    await queueExamDrawings(args, db.client);

    expect(db.tables.drawing_submissions).toHaveLength(3);
  });

  it('marks the rows as exam-sourced and leaves question_id null', async () => {
    const { queueExamDrawings } = await import('./exam-drawings');
    const db = seed(ALL_UPLOADED);

    await queueExamDrawings(
      { attemptId: ATTEMPT, studentId: STUDENT, placement: { context_id: 'class-1' } },
      db.client,
    );

    for (const row of db.tables.drawing_submissions) {
      // An exam prompt must not become a drawing_questions row: that would put
      // a copy of every exam question into the practice bank.
      expect(row.question_id).toBeNull();
      expect(row.source_type).toBe('exam');
      expect(row.exam_attempt_id).toBe(ATTEMPT);
    }
  });
});
