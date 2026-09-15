/**
 * What a student may see of their own drawing, and when.
 *
 * A teacher's draft save and a held review (lib/drawing-hold) both write the
 * review onto `drawing_submissions` while `status` stays 'submitted'. The student
 * routes used to return that row as it was stored, so a student could read
 * feedback the teacher had not sent, which is the one thing holding a review is
 * for. This module is the single answer to "has this been handed back?".
 *
 * RELEASED means two things at once:
 *   1. the status says the teacher acted ('reviewed', 'completed' or 'redo'), and
 *   2. the review is not held. Re-holding a review that was already handed back
 *      clears `released_at` but leaves the status alone, while the teacher's new
 *      edits land on the row, so status on its own would leak those edits.
 *
 * Held is the same test `heldSubmissionIds` runs in SQL: a manual evaluation with
 * an intent and no `released_at`.
 *
 * The assignment payload is an ALLOWLIST. The query behind it is `select *`, so a
 * column added next year must stay out until someone decides a student should
 * have it. The single-submission route keeps its joins, so it gets the gating
 * without the allowlist.
 */
import type { Band, BandMap, RubricCriterion } from './drawing-rubric';
import { overallFromBands } from './drawing-rubric';

export const RELEASED_STATUSES: ReadonlySet<string> = new Set(['reviewed', 'completed', 'redo']);

export interface ManualEvaluationLite {
  id: string;
  submission_id: string;
  intent: string | null;
  released_at: string | null;
}

/** Mirrors the filter in `heldSubmissionIds` (lib/drawing-hold). */
export function isHeldEvaluation(e: { intent: string | null; released_at: string | null }): boolean {
  return e.intent != null && e.released_at == null;
}

export function heldIdsFrom(evaluations: ManualEvaluationLite[]): Set<string> {
  return new Set(evaluations.filter(isHeldEvaluation).map((e) => e.submission_id));
}

export function isReleasedForStudent(row: { id: string; status: string }, heldIds: ReadonlySet<string>): boolean {
  return RELEASED_STATUSES.has(row.status) && !heldIds.has(row.id);
}

/** Always visible: it is the student's own work. */
const ALWAYS_FIELDS = [
  'id',
  'assignment_id',
  'original_image_url',
  'thumbnail_url',
  'self_note',
  'status',
  'attempt_number',
  'submitted_at',
] as const;

/** The teacher's review. Null until it is handed back. */
const REVIEW_FIELDS = [
  'reviewed_at',
  'tutor_rating',
  'tutor_marks',
  'tutor_feedback',
  'tutor_resources',
  'reaction',
  'reviewed_image_url',
  'corrected_image_url',
  // Named for the AI, but it holds the teacher's own region notes (the review
  // route saves the region editor into it). The AI's marks live elsewhere.
  'ai_overlay_annotations',
] as const;

/** Never for a student: model prompts, draft state and curation flags. */
const STAFF_ONLY_FIELDS = [
  'ai_corrected_image_prompt',
  'ai_annotation_prompt',
  'ai_reference_prompts',
  'ai_draft_status',
  'is_gallery_visible',
  'alumni_featured',
] as const;

export interface StudentDrawingAttempt {
  id: string;
  assignment_id: string | null;
  original_image_url: string;
  thumbnail_url: string | null;
  self_note: string | null;
  status: string;
  attempt_number: number | null;
  submitted_at: string;
  reviewed_at: string | null;
  tutor_rating: number | null;
  tutor_marks: number | null;
  tutor_feedback: string | null;
  tutor_resources: unknown[];
  reaction: string | null;
  reviewed_image_url: string | null;
  corrected_image_url: string | null;
  ai_overlay_annotations: unknown[] | null;
  /** The teacher handed this review back. */
  released: boolean;
  /** Handed back once, and the teacher has taken it back to change it. */
  review_updating: boolean;
}

type Row = Record<string, unknown> & { id: string; status: string };

export function sanitizeDrawingForStudent(row: Row, heldIds: ReadonlySet<string>): StudentDrawingAttempt {
  const released = isReleasedForStudent(row, heldIds);
  const out: Record<string, unknown> = {};
  for (const key of ALWAYS_FIELDS) out[key] = row[key] ?? null;
  for (const key of REVIEW_FIELDS) out[key] = released ? row[key] ?? null : null;
  out.tutor_resources = released && Array.isArray(row.tutor_resources) ? row.tutor_resources : [];
  out.ai_overlay_annotations =
    released && Array.isArray(row.ai_overlay_annotations) ? row.ai_overlay_annotations : null;
  out.released = released;
  out.review_updating = RELEASED_STATUSES.has(row.status) && heldIds.has(row.id);
  return out as unknown as StudentDrawingAttempt;
}

/**
 * The same gate for a row that keeps its other fields (joins, question, legacy
 * `ai_feedback`), used where a page reads more than the assignment view does.
 */
export function withholdUnreleasedReview<T extends Row>(row: T, heldIds: ReadonlySet<string>): T {
  const released = isReleasedForStudent(row, heldIds);
  const out: Record<string, unknown> = { ...row };
  for (const key of STAFF_ONLY_FIELDS) delete out[key];
  if (!released) {
    for (const key of REVIEW_FIELDS) out[key] = null;
    out.tutor_resources = [];
  }
  return out as T;
}

export interface StudentRubric {
  criteria: Array<Pick<RubricCriterion, 'key' | 'title' | 'hint'>>;
  by_submission: Record<string, { bands: Record<string, Band>; overall: number | null }>;
}

/**
 * Per-criterion scores for the attempts that were handed back. Only the final
 * band per criterion: never the model's band, a correction reason, a reference
 * or a grading rule, all of which are the teacher's working.
 */
export function buildStudentRubric(
  criteria: RubricCriterion[],
  bandsBySubmission: Record<string, BandMap>,
  releasedIds: ReadonlySet<string>,
): StudentRubric | null {
  const keys = new Set(criteria.map((c) => c.key));
  const by_submission: StudentRubric['by_submission'] = {};
  for (const [submissionId, raw] of Object.entries(bandsBySubmission)) {
    if (!releasedIds.has(submissionId)) continue;
    const bands: Record<string, Band> = {};
    for (const [key, value] of Object.entries(raw)) {
      if (keys.has(key) && typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 5) {
        bands[key] = value as Band;
      }
    }
    if (Object.keys(bands).length === 0) continue;
    by_submission[submissionId] = { bands, overall: overallFromBands(bands, criteria) };
  }
  if (Object.keys(by_submission).length === 0) return null;
  return {
    criteria: criteria.map(({ key, title, hint }) => ({ key, title, hint })),
    by_submission,
  };
}
