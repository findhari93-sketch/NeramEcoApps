import type { ExamBucket } from '@neram/database';

/**
 * Which roster students belong in the nexus_exam_results snapshot.
 *
 * A row in that table means "this is what happened to this student on this
 * exam". Three of the four buckets are an answer to that: they sat it on the
 * day, they sat it late, or the door shut on them and they did not sit it.
 *
 * `still_to_sit` is not an answer. Their window is open and the story is not
 * over, so there is nothing to record yet. Recording it anyway is what caused
 * the rank denominator to disagree across three surfaces, what stamped
 * notified_at on students who were then never told their real result, and what
 * handed a Personal Best badge to students sitting their first ever exam.
 *
 * PURE and separate from the route so the rule can be read and tested on its
 * own, because getting it wrong is silent: every one of those three failures
 * looked like a successful publish.
 */
const SNAPSHOT_BUCKETS: ReadonlySet<ExamBucket> = new Set<ExamBucket>([
  'exam_day',
  'second_sitting',
  'absent',
]);

export function isSnapshotRow(row: { bucket: ExamBucket }): boolean {
  return SNAPSHOT_BUCKETS.has(row.bucket);
}

export function snapshotRows<T extends { bucket: ExamBucket }>(rows: readonly T[]): T[] {
  return rows.filter(isSnapshotRow);
}
