import type { InspirationCuration, InspirationSourceKind } from '@neram/database/queries/nexus';

/**
 * Which drawings students may see without a teacher deciding. The database
 * applies this in nexus_inspiration_sync_submission; this copy exists so the
 * rule is unit tested and so screens can explain it. Change both together.
 * Score: on a marks assignment the marks decide; otherwise stars out of five, then marks.
 */
export const ORIGINAL_SCORE_THRESHOLD = 0.8;

export interface SubmissionFacts {
  source_type: string;
  status: string;
  reviewed_at: string | null;
  tutor_rating: number | null;
  tutor_marks: number | null;
  max_marks: number | null;
  /** The parent assignment's evaluation type ('marks' or 'stars'); null when the drawing is not an assignment. */
  evaluation_type: string | null;
  corrected_image_url: string | null;
}

export function scorePct(f: SubmissionFacts): number | null {
  const marks = f.tutor_marks != null && f.max_marks != null && f.max_marks > 0 ? f.tutor_marks / f.max_marks : null;
  // A marks assignment is judged by its marks; the review screen can resend a stale star rating.
  if (f.evaluation_type === 'marks' && marks != null) return marks;
  if (f.tutor_rating != null) return f.tutor_rating / 5;
  return marks;
}

export function originalEligible(f: SubmissionFacts): boolean {
  return (
    f.source_type !== 'exam' &&
    !!f.reviewed_at &&
    (f.status === 'completed' || f.status === 'reviewed') &&
    (scorePct(f) ?? 0) >= ORIGINAL_SCORE_THRESHOLD
  );
}

export function referenceEligible(f: SubmissionFacts): boolean {
  return (
    f.source_type !== 'exam' &&
    !!f.corrected_image_url &&
    !!f.reviewed_at &&
    ['completed', 'reviewed', 'redo'].includes(f.status)
  );
}

export type HiddenReason = 'hidden_by_teacher' | 'opted_out' | 'not_rated' | 'below_threshold' | 'review_not_finished' | null;

export const HIDDEN_REASON_LABEL: Record<Exclude<HiddenReason, null>, string> = {
  hidden_by_teacher: 'Hidden by a teacher',
  opted_out: 'Student chose not to share',
  not_rated: 'Not rated yet',
  below_threshold: 'Below 4 stars or 80%',
  review_not_finished: 'Review not finished',
};

export function hiddenReason(input: {
  kind: InspirationSourceKind;
  curation: InspirationCuration;
  visible: boolean;
  scorePct: number | null;
  authorOptedOut: boolean;
}): HiddenReason {
  if (input.visible) return null;
  if (input.curation === 'hidden') return 'hidden_by_teacher';
  if (input.kind === 'submission_original' && input.authorOptedOut) return 'opted_out';
  if (input.kind === 'submission_original') return input.scorePct == null ? 'not_rated' : 'below_threshold';
  return 'review_not_finished';
}
