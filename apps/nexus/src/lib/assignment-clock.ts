/**
 * The assignment "personal clock".
 *
 * The rule itself now lives in @neram/database so the server rollups
 * (leaderboard scoring, engagement) and the student's own cards read one
 * definition. There used to be two, and a comment in the query layer describing
 * its copy as "mirroring assignment-clock.ts", which is how two deadlines for
 * the same assignment quietly drift apart.
 *
 * Kept here as a re-export so existing imports keep working.
 */
export {
  computeAssignmentClock,
  isSubmissionOnTime,
  istTodayStr,
} from '@neram/database';
export type {
  AssignmentClock,
  AssignmentClockInput,
  AssignmentClockStatus,
} from '@neram/database';
