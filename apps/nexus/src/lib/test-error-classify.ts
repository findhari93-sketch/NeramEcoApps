/**
 * Did the app break, or did it say no on purpose?
 *
 * The take page reports what goes wrong while a student sits a paper, and the
 * teacher's health banner counts those reports. On paper acf8084d (read on
 * production 2026-09-17) the banner said "12 students failed to open the paper"
 * when every one of those rows was the door refusing correctly: students who had
 * already sat the exam, and one sent from practice to the live exam. It also said
 * "21 students could not submit" when most of them had submitted and then tapped
 * again. A banner that cries wolf is ignored the day it is right.
 *
 * ONE definition, shared by the three places that need it, so they cannot drift:
 *   the take page      decides what not to report at all
 *   the errors route   drops an expected refusal that reaches it anyway
 *   the health route   excuses historical rows written before this existed
 *
 * Historical rows carry no code, only the sentence the server sent. The exact
 * sentences from apps/nexus/src/app/api/tests/attempt/route.ts (and
 * lib/live-run.ts, lib/catchup-test-gate.ts) are therefore matched as text. If one
 * of those sentences changes, old rows keep matching the old text and new rows
 * carry the code, so nothing needs migrating.
 *
 * Pure TypeScript, no imports.
 */

export interface TestFailureFacts {
  phase?: string | null;
  /** The `code` the server's JSON carried, when it carried one. */
  code?: string | null;
  /** HTTP status. null for a request that never got an answer. */
  status?: number | null;
  message?: string | null;
  /**
   * Submit on a closed attempt only: the status of the attempt the submit named,
   * when it is known. 'submitted' means the paper is in and nothing was lost.
   */
  attemptStatus?: string | null;
}

/** Sentences the attempt route sends, keyed to the code they stand for. */
const EXACT_SENTENCES: Record<string, string> = {
  'You have used all your attempts at this test.': 'ATTEMPT_LIMIT_REACHED',
  'This attempt is already finished. Start a new one to try again.': 'ATTEMPT_CLOSED',
  'This paper is your class exam right now. Take it from the exam, where it counts.': 'LIVE_RUN',
  'This paper is your class test right now. Take it from the class test, where it counts.': 'LIVE_RUN',
  'This exam has closed. Your teacher has your request.': 'EXAM_CLOSED',
  'This exam has closed. You can ask your teacher for another sitting.': 'EXAM_CLOSED',
  'This exam closed before your paper was submitted. You can ask your teacher for another sitting.': 'EXAM_CLOSED',
  'The extra time your teacher gave you has run out. You can ask again.': 'CLASS_TEST_CLOSED',
  'This class test has closed. Your teacher has your request.': 'CLASS_TEST_CLOSED',
  'This class test has closed. You can ask your teacher to reopen it.': 'CLASS_TEST_CLOSED',
  'Watch one of the class recordings before taking this test.': 'VIDEO_REQUIRED',
  'Revision opens once you have completed this chapter.': 'NOT_COMPLETED',
  'Open this test from the class it belongs to.': 'WRONG_ENGINE',
  // Window refusals the route sends with no code at all. A student arriving
  // after a paper closed is not the app failing either.
  'Test is not yet available': 'TEST_NOT_OPEN',
  'This test is not open yet': 'TEST_NOT_OPEN',
  'Test has expired': 'TEST_CLOSED',
  'This test has closed': 'TEST_CLOSED',
  'This test is not available': 'TEST_HIDDEN',
};

/** Sentences with a date, a count or a class name inside them. */
const SENTENCE_PATTERNS: Array<[RegExp, string]> = [
  [/^This exam opens at .+\.$/, 'EXAM_NOT_OPEN'],
  [/^Finish your .+ first, then this test opens for you\.$/, 'CATCHUP_REQUIRED'],
];

/**
 * Bare domain codes that reached a student as the whole message. EXAM_CLOSED on
 * submit went out this way (HTTP 500) until it was mapped.
 */
const BARE_CODES: Record<string, string> = {
  EXAM_CLOSED: 'EXAM_CLOSED',
  ATTEMPT_LIMIT_REACHED: 'ATTEMPT_LIMIT_REACHED',
  ATTEMPT_ALREADY_SUBMITTED: 'ATTEMPT_CLOSED',
  ATTEMPT_NOT_OPEN: 'ATTEMPT_CLOSED',
};

/** Refusals that mean the door on the way IN is working. */
const EXPECTED_ON_LOAD = new Set([
  'ATTEMPT_LIMIT_REACHED',
  'LIVE_RUN',
  'EXAM_NOT_OPEN',
  'EXAM_CLOSED',
  'CLASS_TEST_CLOSED',
  'CATCHUP_REQUIRED',
  'VIDEO_REQUIRED',
  'NOT_COMPLETED',
  'WRONG_ENGINE',
  'TEST_NOT_OPEN',
  'TEST_CLOSED',
  'TEST_HIDDEN',
]);

/** The code a failure stands for, from its own code or from the sentence it carried. */
export function failureCodeOf(facts: Pick<TestFailureFacts, 'code' | 'message'>): string | null {
  const code = typeof facts.code === 'string' ? facts.code.trim() : '';
  if (code) return code;

  const message = typeof facts.message === 'string' ? facts.message.trim() : '';
  if (!message) return null;
  if (EXACT_SENTENCES[message]) return EXACT_SENTENCES[message];
  if (BARE_CODES[message]) return BARE_CODES[message];
  for (const [pattern, patternCode] of SENTENCE_PATTERNS) {
    if (pattern.test(message)) return patternCode;
  }
  return null;
}

/**
 * True when this "failure" is the app refusing on purpose, which the student
 * was shown and which no teacher needs to fix.
 *
 * A 5xx or a 401 is never excused, whatever sentence it carries: a refusal is a
 * 403 or a 409, and anything else is the app or the sign-in breaking.
 */
export function isExpectedRefusal(facts: TestFailureFacts): boolean {
  const status = typeof facts.status === 'number' ? facts.status : null;
  if (status !== null && (status >= 500 || status === 401)) return false;

  const code = failureCodeOf(facts);
  if (!code) return false;

  if (facts.phase === 'load') return EXPECTED_ON_LOAD.has(code);

  // A closed attempt refused a submit. That is only harmless when the paper it
  // named is in fact submitted: a double tap, the timer racing the student's own
  // press. An attempt closed any other way lost the student's work.
  if (facts.phase === 'submit') return code === 'ATTEMPT_CLOSED' && facts.attemptStatus === 'submitted';

  return false;
}

/** A stored nexus_test_attempt_errors row, as much as classifying it needs. */
export interface StoredErrorRow {
  phase?: string | null;
  message?: string | null;
  detail?: unknown;
}

/**
 * The facts a stored row holds. `lookedUpAttemptStatus` is the attempt's status
 * read from nexus_test_attempts, for rows written before the reporter recorded it.
 */
export function factsFromErrorRow(row: StoredErrorRow, lookedUpAttemptStatus?: string | null): TestFailureFacts {
  const detail = row.detail && typeof row.detail === 'object' ? (row.detail as Record<string, unknown>) : {};
  const status = typeof detail.status === 'number' ? detail.status : null;
  const code = typeof detail.code === 'string' && detail.code ? detail.code : null;
  const stored = typeof detail.attempt_status === 'string' && detail.attempt_status ? detail.attempt_status : null;
  return {
    phase: row.phase ?? null,
    message: row.message ?? null,
    code,
    status,
    attemptStatus: stored ?? lookedUpAttemptStatus ?? null,
  };
}

/** What the take page does with a submit that did not go through. */
export type SubmitFailureKind = 'retry' | 'attempt_closed' | 'exam_closed';

export function submitFailureKind(facts: Pick<TestFailureFacts, 'code' | 'status' | 'message'>): SubmitFailureKind {
  const code = failureCodeOf(facts);
  if (code === 'ATTEMPT_CLOSED') return 'attempt_closed';
  if (code === 'EXAM_CLOSED') return 'exam_closed';
  return 'retry';
}

/**
 * How long to wait before each automatic retry of a submit the student did not
 * press (the timer ran out, or proctoring hit its limit). Three tries over about
 * fifty seconds rides out a dropped connection without hammering a server that
 * is down.
 */
export const AUTO_SUBMIT_RETRY_DELAYS_MS: readonly number[] = [5000, 15000, 30000];

/** The wait before the next automatic retry, or null once they are used up. */
export function nextAutoRetryDelay(retriesSoFar: number): number | null {
  return AUTO_SUBMIT_RETRY_DELAYS_MS[retriesSoFar] ?? null;
}
