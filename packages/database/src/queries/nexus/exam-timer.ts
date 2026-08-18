/**
 * Which clock a student sees for one exam sitting: the paper's own, or the
 * exam's own override.
 *
 * PURE, on purpose, same discipline as effectiveAttemptScore in exam-score.ts:
 * the take page's countdown (via GET /api/tests/attempt), the server-side
 * staleness check (attemptIsStale), and the invigilation roster's live
 * countdown must never be able to disagree about whether a sitting is timed
 * and for how long, so all three read through here instead of each
 * re-deriving it from raw columns.
 */

export type ExamTimerMode = 'inherit' | 'untimed' | 'timed';

export interface ExamTimerFields {
  timer_mode?: ExamTimerMode | string | null;
  duration_minutes?: number | null;
}

export interface PaperTimerFields {
  test_type?: string | null;
  duration_minutes?: number | null;
}

export interface ResolvedExamTimer {
  test_type: string;
  duration_minutes: number | null;
}

/**
 * `exam` is null/undefined for every non-exam context (an ordinary test or
 * placement), which resolves as "inherit" and returns the paper's own fields
 * unchanged -- this is what keeps every test that has never been an exam
 * completely unaffected by this function's existence.
 */
export function resolveExamTimer(
  exam: ExamTimerFields | null | undefined,
  paper: PaperTimerFields,
): ResolvedExamTimer {
  const mode = exam?.timer_mode ?? 'inherit';

  if (mode === 'untimed') {
    return { test_type: 'untimed', duration_minutes: null };
  }
  if (mode === 'timed') {
    return { test_type: 'timed', duration_minutes: exam?.duration_minutes ?? null };
  }
  // inherit, or an exam this reader has never heard of: exactly what the
  // paper says, byte-identical to every reader that existed before this.
  return {
    test_type: paper.test_type ?? 'untimed',
    duration_minutes: paper.duration_minutes ?? null,
  };
}
