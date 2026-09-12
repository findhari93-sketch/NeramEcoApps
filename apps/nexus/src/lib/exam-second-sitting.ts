/**
 * Will sitting inside THIS personal window rank the student in the exam's
 * second sitting?
 *
 * PURE, and deliberately its own named function rather than inline date math
 * in the route. A false positive here tells a punctual student they will be
 * ranked with the second sitting, which is the exact opposite of what this
 * feature exists to say, and a wrong comparison operator or a swapped field
 * would otherwise reach production with nothing to catch it.
 *
 * THE ONLY QUESTION IS WHEN THE DOOR OPENS, never which door it is. A reopen
 * and a make-up are the same fact to a ranking: a window that begins after the
 * shared close gives that student time everybody else did not have, and
 * examSittingFor ranks their paper `second` on `started_at` alone without ever
 * reading these tables. Admitting reopens only left the two disagreeing, and
 * production carried 2 live make-ups sitting inside that gap: their students
 * would have been ranked in the second sitting and told nothing about it
 * beforehand. A make-up or a reopen that still lands before the exam's own
 * close is the main sitting, as is the shared window itself.
 */
export function willRankInSecondSitting(exam: {
  is_reopen: boolean | null | undefined;
  is_makeup?: boolean | null | undefined;
  opens_at: string | null | undefined;
  exam_closes_at: string | null | undefined;
}): boolean {
  if (!exam.is_reopen && !exam.is_makeup) return false;
  if (!exam.opens_at || !exam.exam_closes_at) return false;
  // A window opening at the instant the exam closes is not late, so this must
  // be a strict "after", never "on or after".
  return Date.parse(exam.opens_at) > Date.parse(exam.exam_closes_at);
}
