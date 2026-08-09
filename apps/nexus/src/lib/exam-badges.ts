/**
 * What an exam earns a student.
 *
 * PURE, so the award decision is testable without a database and identical
 * wherever it is read.
 *
 * The gamification tables, the rarity tiers, the leaderboard and the nightly
 * crons have all existed since 20260429 and nothing has ever written a
 * test-related event to them. 'quiz_completed' is already in the point-event
 * CHECK constraint, unused. This is the wiring, not a new system.
 */

export const EXAM_BADGE_IDS = {
  topper: 'exam_topper',
  podium: 'exam_podium',
  regular: 'exam_regular',
  personalBest: 'exam_personal_best',
} as const;

/**
 * How many students must have sat an exam before its podium means anything.
 *
 * Without this, "topper of a two-student exam" earns a legendary badge and the
 * badge stops meaning anything for everyone who has one. Five is the smallest
 * number where finishing first is a real result.
 */
export const EXAM_PODIUM_MIN_CANDIDATES = 5;

/** How many scheduled exams make someone a regular. */
export const EXAM_REGULAR_THRESHOLD = 3;

/**
 * Points scale with the score rather than with placing.
 *
 * A student who sat the paper and worked hard for 62% should move on the
 * leaderboard even though someone else came first. Rank earns the badge; effort
 * earns the points.
 */
export const EXAM_POINT_WEIGHT = 1;

export function examPointsFor(percentage: number): number {
  const pct = Math.max(0, Math.min(100, Number(percentage) || 0));
  return Math.round(pct * EXAM_POINT_WEIGHT);
}

export interface ExamBadgeInput {
  /** Their rank in their own classroom. Null when they did not sit it. */
  rank: number | null;
  percentage: number;
  /** How many students sat this exam in this classroom. */
  candidates: number;
  /** How many scheduled exams this student has now sat, including this one. */
  examsSat: number;
  /** Their best percentage across PREVIOUS scheduled exams. Null if this is their first. */
  previousBestPct: number | null;
}

/**
 * Which badges this result earns.
 *
 * Returns ids, not rows: awardBadge is idempotent through
 * UNIQUE(student_id, badge_id), so re-publishing an exam simply re-offers the
 * same ids and nothing is duplicated.
 */
export function examBadgesFor(input: ExamBadgeInput): string[] {
  const earned: string[] = [];

  // Absent students earn nothing at all, including regular: they did not sit it.
  if (input.rank == null) return earned;

  const podiumCounts = input.candidates >= EXAM_PODIUM_MIN_CANDIDATES;

  if (podiumCounts && input.rank === 1) earned.push(EXAM_BADGE_IDS.topper);
  if (podiumCounts && input.rank <= 3) earned.push(EXAM_BADGE_IDS.podium);

  if (input.examsSat >= EXAM_REGULAR_THRESHOLD) earned.push(EXAM_BADGE_IDS.regular);

  // Strictly above, and only when there is a previous result to beat. Awarding
  // it on a first exam would make "Personal Best" mean "turned up once".
  if (input.previousBestPct != null && input.percentage > input.previousBestPct) {
    earned.push(EXAM_BADGE_IDS.personalBest);
  }

  return earned;
}
