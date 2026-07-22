/**
 * One normalized "attempt" shape for an assignment's redo history, so the same
 * timeline renders drawing and document assignments, teacher-side and
 * student-side. Drawing attempts are separate drawing_submissions rows; document
 * attempts are the current nexus_assignment_submissions row plus its history[]
 * snapshots. Both collapse into AttemptView[] here (oldest first).
 */
import type {
  DrawingSubmission,
  NexusAssignmentSubmission,
  NexusAssignmentSubmissionFile,
  NexusAssignmentEvaluationType,
  GalleryReactionType,
} from '@neram/database/types';

export interface AttemptView {
  /** Stable React key. */
  key: string;
  /** 1-based attempt number derived from chronological order (not the stored value). */
  index: number;
  isLatest: boolean;
  kind: 'drawing' | 'document';
  /** submitted | under_review | redo | reviewed | completed */
  status: string;
  submitted_at: string;
  reviewed_at?: string | null;
  // Grading (unified across both scales)
  evaluationType: NexusAssignmentEvaluationType;
  /** Numeric marks (document marks or drawing tutor_marks). */
  marks?: number | null;
  maxMarks: number;
  /** 1-5 stars (drawing tutor_rating). */
  rating?: number | null;
  reaction?: GalleryReactionType | null;
  feedback?: string | null;
  // Drawing media (present when kind === 'drawing')
  drawing?: {
    submissionId: string;
    original_image_url: string;
    reviewed_image_url: string | null;
    corrected_image_url: string | null;
    annotations: DrawingSubmission['ai_overlay_annotations'];
  };
  // Document media (present when kind === 'document')
  files?: NexusAssignmentSubmissionFile[];
}

/** The value GradeDisplay wants: stars use the 1-5 rating, marks use the number. */
export function attemptGradeValue(a: AttemptView): number | null {
  return a.evaluationType === 'stars' ? a.rating ?? null : a.marks ?? null;
}

/** Human label for an attempt's status chip. */
export function attemptStatusLabel(status: string): string {
  switch (status) {
    case 'submitted':
      return 'Submitted';
    case 'under_review':
      return 'Under review';
    case 'redo':
      return 'Redo requested';
    case 'reviewed':
      return 'Reviewed';
    case 'completed':
      return 'Completed';
    default:
      return status;
  }
}

/** True when the latest attempt is a resubmission still waiting on the teacher. */
export function isAwaitingReReview(attempts: AttemptView[]): boolean {
  if (attempts.length < 2) return false;
  const last = attempts[attempts.length - 1];
  return last.status === 'submitted' || last.status === 'under_review';
}

/**
 * Map a chronological list of a student's drawing_submissions rows (all sharing
 * one assignment_id + student_id) into AttemptView[]. Index is derived from order
 * so it is correct even when the stored attempt_number is unreliable.
 */
export function drawingAttemptsToViews(
  attempts: DrawingSubmission[],
  opts: { evaluationType: NexusAssignmentEvaluationType; maxMarks: number },
): AttemptView[] {
  const sorted = [...attempts].sort((a, b) => a.submitted_at.localeCompare(b.submitted_at));
  return sorted.map((a, i) => ({
    key: a.id,
    index: i + 1,
    isLatest: i === sorted.length - 1,
    kind: 'drawing' as const,
    status: a.status,
    submitted_at: a.submitted_at,
    reviewed_at: a.reviewed_at,
    evaluationType: opts.evaluationType,
    marks: a.tutor_marks,
    maxMarks: opts.maxMarks,
    rating: a.tutor_rating,
    reaction: a.reaction,
    feedback: a.tutor_feedback,
    drawing: {
      submissionId: a.id,
      original_image_url: a.original_image_url,
      reviewed_image_url: a.reviewed_image_url,
      corrected_image_url: a.corrected_image_url,
      annotations: a.ai_overlay_annotations,
    },
  }));
}

/**
 * Map a document submission (single row + its history[] snapshots) into
 * AttemptView[]. History snapshots are prior rounds the teacher sent back for a
 * redo; the current row is the latest attempt.
 */
export function documentSubmissionToViews(
  submission: NexusAssignmentSubmission | null | undefined,
  opts: { evaluationType: NexusAssignmentEvaluationType; maxMarks: number },
): AttemptView[] {
  if (!submission) return [];
  const views: AttemptView[] = (submission.history || []).map((h) => ({
    key: `h${h.attempt}-${h.submitted_at}`,
    index: h.attempt,
    isLatest: false,
    kind: 'document' as const,
    // A snapshot only exists because that round was superseded by a resubmit,
    // which only happens after a redo request.
    status: 'redo',
    submitted_at: h.submitted_at,
    evaluationType: opts.evaluationType,
    marks: h.marks ?? null,
    maxMarks: opts.maxMarks,
    feedback: h.feedback ?? null,
    files: h.files,
  }));
  views.push({
    key: submission.id,
    index: submission.attempt_number,
    isLatest: true,
    kind: 'document',
    status: submission.status,
    submitted_at: submission.submitted_at,
    reviewed_at: submission.reviewed_at,
    evaluationType: opts.evaluationType,
    marks: submission.marks,
    maxMarks: opts.maxMarks,
    reaction: submission.reaction,
    feedback: submission.feedback,
    files: submission.files,
  });
  return views.sort((a, b) => a.index - b.index);
}
