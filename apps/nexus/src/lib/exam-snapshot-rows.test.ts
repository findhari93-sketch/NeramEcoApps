import { describe, it, expect } from 'vitest';
import { isSnapshotRow, snapshotRows } from './exam-snapshot-rows';
import type { ExamBucket } from '@neram/database';

/**
 * One rule, and getting it wrong is silent three different ways: a rank
 * denominator that disagrees with the message a student was just sent, a
 * notified_at stamp on somebody who has not sat yet so their real result later
 * reaches nobody, and a Personal Best badge on a first exam. Every one of those
 * looked like a successful publish.
 */
describe('snapshotRows', () => {
  const row = (bucket: ExamBucket, student_id: string = bucket) => ({ bucket, student_id });

  it('keeps a student who sat on exam day', () => {
    expect(isSnapshotRow(row('exam_day'))).toBe(true);
  });

  it('keeps a student who sat in the second sitting', () => {
    expect(isSnapshotRow(row('second_sitting'))).toBe(true);
  });

  it('keeps a student the door shut on', () => {
    expect(isSnapshotRow(row('absent'))).toBe(true);
  });

  it('drops a student whose window is still open', () => {
    // Not a result. Their story is not over, and recording it early is what
    // caused all three defects this filter exists to remove.
    expect(isSnapshotRow(row('still_to_sit'))).toBe(false);
  });

  it('filters a whole roster down to the students who have an answer', () => {
    const rows = [
      row('exam_day', 'arun'),
      row('still_to_sit', 'kaveya'),
      row('second_sitting', 'meera'),
      row('still_to_sit', 'zara'),
      row('absent', 'divya'),
    ];
    expect(snapshotRows(rows).map((r) => r.student_id)).toEqual(['arun', 'meera', 'divya']);
  });

  it('returns an empty list when nobody has sat and nobody is absent', () => {
    expect(snapshotRows([row('still_to_sit', 'a'), row('still_to_sit', 'b')])).toEqual([]);
  });
});
