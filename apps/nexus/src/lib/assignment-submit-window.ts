/**
 * When a student is allowed to hand work in, and what that hand-in means.
 *
 * This exists because a student who spotted her own mistake could not fix it.
 * She uploaded a PDF, noticed a sign error minutes later, and had no way to
 * replace the file: the submit button was hidden the moment a submission row
 * existed, and only a teacher's redo request brought it back. Nothing about that
 * was intended. The server never checked anything at all.
 *
 * The rule, in one sentence: you may replace your own work while it is still
 * unmarked and still inside your personal deadline.
 *
 * Two properties are load-bearing:
 *
 *  - A replace keeps the ORIGINAL submitted_at (see upsertSubmission). Because
 *    the window shuts at the deadline anyway, a replacement is always on time,
 *    so freezing the timestamp cannot flatter anyone and fixing a typo can never
 *    retroactively turn on-time work late.
 *  - 'locked' is a real answer, not the absence of one. The old client-side gate
 *    hid the button and said nothing, which is what sent the student to chat
 *    instead of to the app.
 *
 * Pure and framework-free, like assignment-format.ts beside it.
 */
import { isSubmissionOnTime, type AssignmentClockInput } from '@/lib/assignment-clock';

/**
 * 'first'   - nothing submitted yet.
 * 'redo'    - the teacher sent it back; a new attempt, history is kept.
 * 'replace' - the student is swapping their own unmarked file; same attempt.
 * 'locked'  - marked, or past the deadline. Only a teacher's redo reopens it.
 */
export type SubmitMode = 'first' | 'redo' | 'replace' | 'locked';

/** The fields of a submission this decision actually depends on. */
export interface SubmitWindowSubmission {
  status: string;
  reviewed_at?: string | null;
}

export function resolveSubmitMode(
  submission: SubmitWindowSubmission | null | undefined,
  clock: AssignmentClockInput,
  nowIso: string,
): SubmitMode {
  if (!submission) return 'first';
  if (submission.status === 'redo') return 'redo';

  // Anything already carrying a review is finished work. Guarding on reviewed_at
  // as well as status is deliberate: this is the check that stops a replayed
  // submit call from running upsertSubmission over a graded row, which clears
  // marks. Before this existed, a student could erase their own marks.
  if (submission.status !== 'submitted' || submission.reviewed_at) return 'locked';

  // isSubmissionOnTime already returns true when there is no deadline at all,
  // and already resolves a late joiner's personal catch-up window, so both of
  // those cases are handled without being special-cased here.
  return isSubmissionOnTime(clock, nowIso) ? 'replace' : 'locked';
}

/** True when this mode means bytes may be accepted. */
export function canAcceptSubmission(mode: SubmitMode): boolean {
  return mode !== 'locked';
}

/**
 * When a student swapped their file after handing it in, or null if they did not.
 *
 * Derived rather than stored. A replace writes `files` and `updated_at` and
 * nothing else, so an updated_at ahead of submitted_at on unmarked work can only
 * mean the student changed it. That holds because exactly two functions write
 * this row, upsertSubmission and reviewSubmission, and the second one stamps
 * reviewed_at, which this excludes. A third writer would break it, which is why
 * the check lives here rather than being spelled out at each call site.
 *
 * The teacher needs this: without it, a file can change between the moment they
 * open a submission and the moment they mark it, with nothing on screen saying
 * so. It deliberately does NOT make the work look like a resubmission, because
 * nobody asked for a redo.
 */
export function studentEditedAt(
  submission:
    | (SubmitWindowSubmission & { submitted_at?: string | null; updated_at?: string | null })
    | null
    | undefined,
): string | null {
  if (!submission || submission.status !== 'submitted' || submission.reviewed_at) return null;
  const { submitted_at: submitted, updated_at: updated } = submission;
  if (!submitted || !updated) return null;
  // Strictly after, and by more than a second: submitted_at is stamped in JS
  // while created_at/updated_at default to the database's now(), so a fresh
  // insert can show a sub-second skew in either direction. Anything inside that
  // is clock noise, not a student.
  return Date.parse(updated) - Date.parse(submitted) > 1000 ? updated : null;
}

/**
 * Why the door is shut, in words a student can act on. A dead end that explains
 * itself and names the way forward beats a button that silently vanishes.
 */
export function lockedReason(submission: SubmitWindowSubmission | null | undefined): string {
  if (submission && (submission.status !== 'submitted' || submission.reviewed_at)) {
    return 'Your teacher has already marked this. Ask them to reopen it if you need to change your work.';
  }
  return 'The deadline for this assignment has passed. Ask your teacher to reopen it if you need to change your work.';
}
