/**
 * Which abandoned test attempt, if any, to ask the student about right now.
 *
 * A student can have up to three unexplained abandoned attempts queued
 * server-side at once (see `GET /api/student/tests/overview`). Only one is
 * ever shown, and once the student has answered or dismissed it, none of the
 * remaining queue is shown for the rest of the visit, even though they are
 * still unexplained. Reason: showing the next one the instant the first
 * closes is indistinguishable, to the student, from the same "What
 * happened?" popup refusing to close, since the title and buttons are
 * identical and only the test name underneath changes. The rest of the queue
 * waits for the next time the student opens this page.
 */
export function pickUnexplainedAttempt<T>(
  needsReason: T[] | null | undefined,
  askedThisVisit: boolean,
): T | null {
  if (askedThisVisit) return null;
  return needsReason?.[0] ?? null;
}
