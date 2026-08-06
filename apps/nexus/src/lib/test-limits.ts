/**
 * How big a paper a student may build for themselves.
 *
 * The builder at /student/tests/new has always said "up to 50" and enforced it.
 * The question bank's own "select all matching" path did not, and it fetches up
 * to a thousand ids in one go, which is how a student ended up sitting a
 * 544-question "practice" test they could never finish.
 *
 * Lives here rather than in either page because the server has to be the one
 * that actually holds the line: a cap that exists only in the browser is a
 * suggestion.
 */
export const MAX_STUDENT_TEST_QUESTIONS = 50;

/** The sentence shown when someone tries to go past it. Same words everywhere. */
export function studentTestSizeMessage(count: number): string {
  return `A practice test tops out at ${MAX_STUDENT_TEST_QUESTIONS} questions, and ${count} were selected. Narrow the filters, or pick the ones you want to drill.`;
}
