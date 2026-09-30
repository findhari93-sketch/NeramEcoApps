import type { LevelQueueStudent } from './student-level-types';

/**
 * The order the Sort by drawing screen walks a class in.
 *
 *   1. Not rated, with drawings to judge.
 *   2. Not rated, no drawings yet (nothing to look at, so they wait).
 *   3. Rated, the longest-unrevisited first, so a second pass starts with the
 *      judgements most likely to be out of date.
 *
 * Ties break by name so the order is stable between visits.
 */
export function orderLevelQueue(students: LevelQueueStudent[]): LevelQueueStudent[] {
  const bucket = (s: LevelQueueStudent) => (s.level ? 2 : s.drawings.length > 0 ? 0 : 1);
  return [...students].sort((a, b) => {
    const byBucket = bucket(a) - bucket(b);
    if (byBucket !== 0) return byBucket;
    if (a.level && b.level) {
      const byAge = (a.setAt ?? '').localeCompare(b.setAt ?? '');
      if (byAge !== 0) return byAge;
    }
    return (a.name ?? '').localeCompare(b.name ?? '');
  });
}

/** "15 of 42 sorted". */
export function sortedCount(students: readonly LevelQueueStudent[]): number {
  return students.filter((s) => s.level !== null).length;
}
