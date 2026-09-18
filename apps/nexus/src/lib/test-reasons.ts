/**
 * Why a student did not do, or could not finish, a test.
 *
 * A THIRD vocabulary, deliberately, alongside RSVP_REASON_CODES ("why I am not
 * coming") and PREWORK_REASON_CODES ("why the work set before class is not
 * done"). Reusing prework's list here was the obvious move and it is wrong,
 * because it cannot express the two answers this feature exists to collect:
 *
 *   technical_problem   the test itself is broken
 *   too_hard            the test is fine, the student is not ready for it
 *
 * Production made the case. On 2026-08-06 the teacher hub showed 19 student
 * papers, of which 9 had been opened and abandoned without a single submission,
 * one of them nine times. Nothing anywhere distinguished "I could not load
 * question 4" from "I gave up", and the screen rendered both as "0 attempts",
 * which reads as a third thing again: not interested. Three very different
 * problems collapsed into one number that was also wrong.
 *
 * The other four codes are carried over from prework word for word, so a
 * teacher's tally across surfaces stays one set of words rather than two
 * dialects.
 *
 * Pure TypeScript so the API route, the student sheet and the teacher roster all
 * agree. To add a code, widen BOTH this array and the CHECK constraints in
 * supabase/migrations/20260824090100_nexus_test_reasons.sql (the latest widening
 * is 20260923090100_nexus_test_reason_did_not_know.sql).
 *
 * TWO CONTEXTS, ONE VOCABULARY (2026-09-17). The original labels describe a paper
 * the student STARTED and walked away from. A test they never sat at all needs
 * different words for the same codes ("I did not have time", not "I ran out of
 * time"), plus one answer that only exists there: did_not_know. On the 18 Aug
 * exam ten students were in the class and never opened the paper, and nothing
 * in the product could say whether they had even seen that it was open.
 */

export const TEST_REASON_CODES = [
  'technical_problem',
  'too_hard',
  'not_understood',
  'no_time',
  'unwell',
  'other',
  'did_not_know',
] as const;

export type TestReasonCode = (typeof TEST_REASON_CODES)[number];

/**
 * Which story the reason is part of.
 *   abandoned  a sitting that started and stopped (nexus_test_attempts.abandon_reason_*)
 *   missed     a test they owed and never sat (nexus_test_skip_reasons)
 */
export type TestReasonContext = 'abandoned' | 'missed';

export interface TestReason {
  code: TestReasonCode;
  /** Shown on the row the student taps. First person, their words. */
  label: string;
  /** Compact form for the teacher's tag. */
  shortLabel: string;
  /** Free text is required, because nothing else about this code is specific enough. */
  requiresNote: boolean;
  /**
   * Does this code accuse the TEST rather than describe the student?
   *
   * Drives whether a paper is flagged for staff attention rather than merely
   * tallied. One student saying "too hard" is information about that student.
   * One student saying "something went wrong" is information about the paper,
   * and the paper may be failing silently for everyone else too.
   */
  blamesTest: boolean;
  /**
   * The row label for a test the student never sat. Null when the code is not
   * offered there: "I did not understand the questions" means nothing about a
   * paper nobody opened.
   */
  missedLabel: string | null;
  /** Offered for a sitting that started and stopped. */
  forAbandoned: boolean;
}

export const TEST_REASONS: TestReason[] = [
  {
    code: 'technical_problem',
    label: 'Something went wrong and I could not continue',
    shortLabel: 'Broken',
    // The single most useful field in this whole feature. "Something went wrong"
    // is unactionable; "question 12 never loaded" is a bug report.
    requiresNote: true,
    blamesTest: true,
    missedLabel: 'The test would not open or submit',
    forAbandoned: true,
  },
  {
    code: 'too_hard',
    label: 'It was too hard for me',
    shortLabel: 'Too hard',
    requiresNote: false,
    blamesTest: false,
    missedLabel: 'I was not ready for this topic',
    forAbandoned: true,
  },
  {
    code: 'not_understood',
    label: 'I did not understand the questions',
    shortLabel: 'Stuck',
    requiresNote: false,
    blamesTest: false,
    missedLabel: null,
    forAbandoned: true,
  },
  {
    code: 'no_time',
    label: 'I ran out of time',
    shortLabel: 'No time',
    requiresNote: false,
    blamesTest: false,
    missedLabel: 'I did not have time',
    forAbandoned: true,
  },
  {
    code: 'unwell',
    label: 'I was unwell',
    shortLabel: 'Unwell',
    requiresNote: false,
    blamesTest: false,
    missedLabel: 'I was unwell',
    forAbandoned: true,
  },
  {
    code: 'other',
    label: 'Something else',
    shortLabel: 'Other',
    requiresNote: true,
    blamesTest: false,
    missedLabel: 'Something else',
    forAbandoned: true,
  },
  {
    // Only for a test they never sat: a student who started a paper knew it was
    // open. No note, because the answer is complete as it stands, and asking for
    // one is how a one-tap reply becomes a reply nobody sends.
    code: 'did_not_know',
    label: 'I did not know the test was open',
    shortLabel: "Didn't know",
    requiresNote: false,
    blamesTest: false,
    missedLabel: 'I did not know the test was open',
    forAbandoned: false,
  },
];

const BY_CODE = new Map<string, TestReason>(TEST_REASONS.map((r) => [r.code, r]));

/** What the "you left a test unfinished" sheet offers, in its original order. */
export const ABANDON_TEST_REASONS: TestReason[] = TEST_REASONS.filter((r) => r.forAbandoned);

/**
 * What "Tell your teacher why" offers for a test the student never sat. The
 * likeliest answer first, so the common reply is the first thing a thumb reaches.
 */
const MISSED_ORDER: TestReasonCode[] = ['did_not_know', 'no_time', 'technical_problem', 'too_hard', 'unwell', 'other'];

export const MISSED_TEST_REASONS: TestReason[] = MISSED_ORDER.map((code) => BY_CODE.get(code)!);

export function isTestReasonCode(value: unknown): value is TestReasonCode {
  return typeof value === 'string' && BY_CODE.has(value);
}

export function testReasonRequiresNote(code: unknown): boolean {
  return isTestReasonCode(code) ? BY_CODE.get(code)!.requiresNote : false;
}

/** Whether this code is one a student may give in this context. */
export function testReasonFitsContext(code: unknown, context: TestReasonContext): boolean {
  if (!isTestReasonCode(code)) return false;
  const r = BY_CODE.get(code)!;
  return context === 'abandoned' ? r.forAbandoned : r.missedLabel !== null;
}

/**
 * The first-person sentence for a code, in the words of its context. A code with
 * no missed wording (not_understood) falls back to its original label, so a row
 * written before the contexts split still reads.
 */
export function testReasonLabel(
  code: string | null | undefined,
  context: TestReasonContext = 'abandoned',
): string {
  if (!isTestReasonCode(code)) return 'No reason given';
  const r = BY_CODE.get(code)!;
  return context === 'missed' ? (r.missedLabel ?? r.label) : r.label;
}

/** True when the reason points at the paper rather than at the student. */
export function testReasonBlamesTest(code: unknown): boolean {
  return isTestReasonCode(code) ? BY_CODE.get(code)!.blamesTest : false;
}

/**
 * How a reason reads back to a teacher or to the student themselves.
 *
 * Prefers the note when there is one, because "question 12 never loaded" says
 * more than "Broken". Falls back to the code's label in the words of its context,
 * then to a neutral string so a row written before a code existed still renders.
 */
export function describeTestReason(
  code: string | null | undefined,
  note: string | null | undefined,
  context: TestReasonContext = 'abandoned',
): string {
  const trimmed = note?.trim();
  if (trimmed) return trimmed;
  return testReasonLabel(code, context);
}

/** Just the category, for grouping and tags. Never the free text. */
export function testReasonShortLabel(code: string | null | undefined): string {
  return isTestReasonCode(code) ? BY_CODE.get(code)!.shortLabel : 'Other';
}

/**
 * Count reasons per code.
 * Unknown or missing codes fold into 'other' so the totals always add up.
 */
export function tallyTestReasons(
  rows: { reason_code?: string | null }[],
): Record<TestReasonCode, number> {
  const out = {
    technical_problem: 0,
    too_hard: 0,
    not_understood: 0,
    no_time: 0,
    unwell: 0,
    other: 0,
    did_not_know: 0,
  } as Record<TestReasonCode, number>;
  for (const row of rows || []) {
    const code = isTestReasonCode(row.reason_code) ? row.reason_code : 'other';
    out[code] += 1;
  }
  return out;
}

/**
 * Does this paper look BROKEN rather than merely hard?
 *
 * The question a teacher scanning the hub actually needs answered. One report
 * of a technical problem is enough to warrant a look: a test that fails to load
 * fails silently for everyone who did not bother to say so, and the cost of
 * checking a working paper is far lower than the cost of leaving a broken one in
 * front of a class.
 */
export function looksBroken(rows: { reason_code?: string | null }[]): boolean {
  return (rows || []).some((r) => testReasonBlamesTest(r.reason_code));
}

/**
 * The single most common reason in a set, phrased for a teacher's queue row
 * ("Mostly: ran out of time"). Returns null when there is nothing to report.
 */
export function dominantTestReason(rows: { reason_code?: string | null }[]): string | null {
  if (!rows?.length) return null;
  const tally = tallyTestReasons(rows);
  let best: TestReasonCode | null = null;
  for (const code of TEST_REASON_CODES) {
    if (tally[code] > 0 && (best === null || tally[code] > tally[best])) best = code;
  }
  if (!best) return null;
  return BY_CODE.get(best)!.label.replace(/^I /, '').toLowerCase();
}
