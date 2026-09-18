/**
 * Where a drawing came from, and what that means for reviewing it.
 *
 * Every drawing a student makes is one drawing_submissions row, and the
 * Sketchbook shows all of them. There are two kinds of work:
 *   OWED      an assignment drawing or a test drawing. A teacher has to mark it.
 *   PRACTICE  a sketch, a question bank drawing, free practice or homework.
 *             Marking is optional and nothing is pending.
 *
 * The database package keeps the same list as PRACTICE_SOURCE_TYPES in
 * queries/nexus/sketchbook.ts (a package cannot import from an app); the test
 * holds the two in step.
 *
 * Decided by source_type and assignment_id only, never exam_attempt_id: staging
 * has no such column, and every test drawing is source_type 'exam'.
 */

export type DrawingSourceType = 'sketchbook' | 'question_bank' | 'free_practice' | 'homework' | 'assignment' | 'exam';

export const PRACTICE_SOURCES: readonly DrawingSourceType[] = ['sketchbook', 'question_bank', 'free_practice', 'homework'];

export interface DrawingSourceFacts {
  source_type: string | null;
  assignment_id?: string | null;
}

export type ReviewKind = 'practice' | 'assignment' | 'test';

export function reviewKindOf(row: DrawingSourceFacts): ReviewKind {
  if (row.source_type === 'exam') return 'test';
  if (row.assignment_id) return 'assignment';
  return 'practice';
}

export function isPracticeDrawing(row: DrawingSourceFacts): boolean {
  return reviewKindOf(row) === 'practice';
}

const LABELS: Record<DrawingSourceType, string> = {
  sketchbook: 'Sketch',
  question_bank: 'Question bank',
  free_practice: 'Practice',
  homework: 'Homework',
  assignment: 'Assignment',
  exam: 'Test',
};

export function drawingSourceLabel(source: string | null): string {
  return LABELS[source as DrawingSourceType] ?? 'Drawing';
}

export interface ReviewFacts extends DrawingSourceFacts {
  status: string;
  reviewed_at?: string | null;
}

/**
 * True once a teacher has acted on this round. A sketch is stored 'completed'
 * the moment it is uploaded, so for a sketch only reviewed_at can say so.
 */
export function wasReviewedBefore(row: ReviewFacts): boolean {
  if (row.reviewed_at) return true;
  if (row.source_type === 'sketchbook') return false;
  return ['reviewed', 'completed', 'redo'].includes(row.status);
}

/** Opens ready to grade, or locked behind Evaluate. Never a dead end: Evaluate always reopens. */
export function opensForGrading(row: ReviewFacts, hasNewerAttempt: boolean): boolean {
  if (hasNewerAttempt) return false;
  if (row.source_type === 'sketchbook') return !row.reviewed_at;
  return !['reviewed', 'completed'].includes(row.status);
}

/** Redo asks the student to draw it again. A sketch and a test paper have no redo round. */
export function canRedo(row: DrawingSourceFacts): boolean {
  return row.source_type !== 'sketchbook' && reviewKindOf(row) !== 'test';
}

export type ReviewState = 'none' | 'waiting' | 'reviewed' | 'redo';

export interface ReviewSummary {
  state: ReviewState;
  rating: number | null;
  marks: number | null;
}

/**
 * What a Sketchbook tile says about the teacher's review. `released` is false
 * when the viewer is the student and the review has not been handed back
 * (lib/student-drawing-payload), and then nothing of the review shows.
 */
export function summarizeReview(
  row: ReviewFacts & { tutor_rating?: number | null; tutor_marks?: number | null },
  released: boolean,
): ReviewSummary {
  const owed = !isPracticeDrawing(row);
  const empty: ReviewSummary = { state: owed ? 'waiting' : 'none', rating: null, marks: null };
  if (!released) return empty;
  if (row.status === 'redo') return { state: 'redo', rating: null, marks: null };
  if (wasReviewedBefore(row)) {
    return { state: 'reviewed', rating: row.tutor_rating ?? null, marks: row.tutor_marks ?? null };
  }
  return empty;
}

/** The review part of a tile's spoken label. Null when there is nothing to say. */
export function reviewStateWords(
  summary: ReviewSummary,
  opts: { maxMarks: number | null; viewer: 'own' | 'teacher' },
): string | null {
  switch (summary.state) {
    case 'reviewed':
      if (summary.marks != null && opts.maxMarks) return `reviewed, ${summary.marks} of ${opts.maxMarks} marks`;
      if (summary.rating) return `reviewed, ${summary.rating} stars`;
      return 'reviewed';
    case 'waiting':
      return opts.viewer === 'own' ? 'waiting for your teacher' : 'waiting for review';
    case 'redo':
      return 'redo asked';
    default:
      return null;
  }
}
