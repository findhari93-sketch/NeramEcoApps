/**
 * Will sitting inside THIS reopened window rank the student in the exam's
 * second sitting?
 *
 * PURE, and deliberately its own named function rather than inline date math
 * in the route. A false positive here tells a punctual student they will be
 * ranked with the second sitting, which is the exact opposite of what this
 * feature exists to say, and a wrong comparison operator or a swapped field
 * would otherwise reach production with nothing to catch it.
 *
 * Only a reopen can ever answer true. Sitting inside the shared window, or a
 * makeup that still lands before the exam's own close, is the main sitting.
 */
export function willRankInSecondSitting(exam: {
  is_reopen: boolean | null | undefined;
  opens_at: string | null | undefined;
  exam_closes_at: string | null | undefined;
}): boolean {
  if (!exam.is_reopen || !exam.opens_at || !exam.exam_closes_at) return false;
  // A window opening at the instant the exam closes is not late, so this must
  // be a strict "after", never "on or after".
  return Date.parse(exam.opens_at) > Date.parse(exam.exam_closes_at);
}
