/**
 * When a Microsoft profile photo may replace what we hold for a user.
 *
 * A student can set their picture in two places: the Nexus profile screen, or
 * myaccount.microsoft.com. The product rule is that these are ONE picture, and
 * that a human approves it once. That makes "when do we take the Microsoft
 * photo?" a policy question rather than a plumbing detail, so it lives here as
 * pure functions shared by the Nexus on-demand sync and the Admin weekly cron.
 * Duplicating this rule in two apps is how the two would quietly disagree.
 *
 * Deliberately pure: no Supabase, no Graph, no IO. Unit-testable.
 */

export type PhotoSyncStatus = 'missing' | 'pending' | 'approved' | 'rejected';

/**
 * Should we spend a Graph call reading this user's photo at all?
 *
 * Only 'pending' says no: something is already sitting in the teacher's queue,
 * and swapping it underneath them mid-review churns the queue for no gain. Every
 * other state has a reason to look.
 */
export function shouldFetchMicrosoftPhoto(photoStatus: PhotoSyncStatus): boolean {
  return photoStatus !== 'pending';
}

export interface PullDecision {
  /** Store the Microsoft photo and send it back for review. */
  pull: boolean;
  /** Machine-readable reason, used for the sync summary counters. */
  reason: 'new_photo' | 'changed_photo' | 'unchanged' | 'in_review';
}

/**
 * Given the user's current review state and whether the Microsoft photo differs
 * from the last one we fingerprinted, decide whether to take it.
 *
 * `hashChanged` must be computed against the bytes Microsoft RETURNS, never the
 * bytes we once sent it. Graph re-encodes what it stores, so comparing against
 * an upload would always look changed and would re-queue the same face forever.
 *
 * A pulled photo always lands on 'pending', including over an 'approved' one.
 * That is the point: a student who passed review and then swapped their picture
 * in Microsoft must be looked at again, otherwise approval is trivially defeated.
 */
export function decideMicrosoftPull(input: {
  photoStatus: PhotoSyncStatus;
  hashChanged: boolean;
}): PullDecision {
  if (input.photoStatus === 'pending') return { pull: false, reason: 'in_review' };
  if (!input.hashChanged) return { pull: false, reason: 'unchanged' };
  return {
    pull: true,
    reason: input.photoStatus === 'missing' ? 'new_photo' : 'changed_photo',
  };
}

/** Plain-language explanation for a sync report or a teacher-facing summary. */
export function pullReasonLabel(reason: PullDecision['reason']): string {
  switch (reason) {
    case 'new_photo':
      return 'Added a Microsoft photo';
    case 'changed_photo':
      return 'Microsoft photo changed, sent back for review';
    case 'unchanged':
      return 'Already up to date';
    case 'in_review':
      return 'Waiting for a teacher decision';
    default:
      return 'No change';
  }
}
