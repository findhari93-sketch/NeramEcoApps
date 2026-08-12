/**
 * Does this student still owe this class, and therefore how does its recording play?
 *
 * One definition, read by the list that offers a recap and by the route that
 * serves it. That pairing is the whole reason this is a module rather than two
 * inline conditions: the student's Catch-up screen decides which tab a class
 * belongs in, and the recap route decides whether its checkpoints bind. If those
 * two answers were computed separately they would eventually disagree, and the
 * visible form of that disagreement is a class sitting under "Watch again" that
 * then demands a quiz, or a class the student owes quietly playing ungated.
 *
 * The rule reads off `nexus_class_absences`, which is the obligation table. A
 * row exists only for a class this student was not in. So:
 *
 *   no row at all      they attended. Nothing is owed, and nothing ever was.
 *   row, both stamps null  open. This is homework.
 *   caught_up_at set   they finished it.
 *   excused_at set     a teacher let them off it.
 *
 * Absence of a row is deliberately the same answer as a cleared row. Both mean
 * "not homework", and treating a missing row as owed would gate every class a
 * student ever sat in.
 *
 * Nothing here is a security boundary on its own. It picks a playback mode, and
 * `lib/video-gate.ts` says plainly that gating is what stops ordinary skipping
 * by ordinary students. What actually protects a checkpoint is the quiz route
 * refusing an out-of-order section, and what actually clears a class is
 * `markRecapCompletedIfAllPassed` needing every checkpoint passed. This decides
 * which of those a student is put in front of, and it is computed on the server
 * so that it is never something a student can ask for.
 */

import type { VideoGateMode } from './video-gate';

/** The two stamps that close an obligation, as they come back from the database. */
export interface ObligationRow {
  caught_up_at: string | null;
  excused_at: string | null;
}

/**
 * True only for a class this student still owes.
 *
 * `null` and `undefined` both mean "no absence row was found", which is the
 * attended case, so both are false.
 */
export function hasOpenObligation(row: ObligationRow | null | undefined): boolean {
  if (!row) return false;
  return !row.caught_up_at && !row.excused_at;
}

/**
 * How the recording for this class should play for this student.
 *
 * `revision` widens the scrub ceiling and the speed cap and stops any quiz
 * opening. It is only ever reached by someone with nothing outstanding on the
 * class, so it takes nothing away from anybody: a student who owes the class
 * still meets every checkpoint exactly as before.
 */
export function watchModeFor(row: ObligationRow | null | undefined): VideoGateMode {
  return hasOpenObligation(row) ? 'gated' : 'revision';
}

/**
 * May this student open the OPEN player for a class, the one with no checkpoints?
 *
 * Owing the class is not on its own a reason to refuse. The refusal only makes
 * sense when there is a guided version to send them to instead, and that is what
 * `hasPublishedRecap` decides. Two situations turn on it:
 *
 *   owed, recap published    refuse. The guided screen is where a watch counts,
 *                            and letting them watch here means watching twice.
 *   owed, no recap yet       allow. The catch-up screen's own fallback plays
 *                            through this same route and credits the watch with
 *                            its mark_watched action, so refusing would leave the
 *                            student with no way through at all.
 *
 * Nothing owed, in either case, is an ordinary rewatch and always allowed.
 *
 * Staff are not modelled here. They never owe a class, and the route checks that
 * before it gets this far.
 */
export function mayWatchUngated(
  row: ObligationRow | null | undefined,
  hasPublishedRecap: boolean,
): boolean {
  if (!hasOpenObligation(row)) return true;
  return !hasPublishedRecap;
}
