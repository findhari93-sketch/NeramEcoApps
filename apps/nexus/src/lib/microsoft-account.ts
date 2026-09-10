/**
 * "Awaiting Microsoft account": an enrolled student who has no Entra identity yet.
 *
 * Nexus is Microsoft-only, but Nexus membership is a `nexus_enrollments` row, and
 * that row is created the moment a student pays through the marketing direct
 * enrollment link (see apps/marketing/src/app/api/enroll/complete/route.ts), while
 * they still hold nothing but a Google/Firebase login. So between "paid" and
 * "admin provisioned their @neramclasses.com mailbox" a real, enrolled student
 * exists who cannot sign in to Nexus at all.
 *
 * Those students are deliberately NOT hidden from staff screens: a new joinee who
 * silently disappears from the roster is worse than one who is visibly waiting.
 * They are shown with a flag, kept out of the "N active" count, and excluded from
 * anything that only makes sense for someone who can actually sign in (the photo
 * review queue being the obvious one: their card shows the Google account picture
 * they never chose to submit).
 *
 * Deliberately NOT the `test-oid-` exclusion that lib/nexus-members.ts applies to
 * staff: the Playwright student fixtures carry synthetic oids and must keep
 * behaving like real students.
 *
 * Pure, so both the API routes and the UI can share one rule.
 */

/** True when the person holds a real Microsoft/Entra identity and can sign in.
 *
 *  `!!` and not `!= null`, deliberately: an empty string is not an account.
 *
 *  The SQL counterpart is `ms_oid IS NOT NULL AND ms_oid <> ''` in
 *  count_pending_photo_reviews (supabase/migrations/
 *  20260910090300_photo_review_badge_viewer_scoped.sql). Change one and you must
 *  change the other, or the sidebar badge starts advertising work the photo
 *  review queue refuses to show. That has already happened once: the badge ran
 *  for six weeks on a body with no ms_oid rule at all while the queue filtered
 *  on it. */
export function hasMicrosoftAccount(msOid: string | null | undefined): boolean {
  return !!msOid;
}

/** True when an enrolled student is still waiting for their Microsoft account. */
export function isAwaitingMicrosoft(msOid: string | null | undefined): boolean {
  return !hasMicrosoftAccount(msOid);
}

/** Chip label. Plain language: it names the missing thing, not a system state. */
export const AWAITING_MICROSOFT_LABEL = 'No Microsoft account';

/** Tooltip. Says what it means for the student AND what to do about it. */
export const AWAITING_MICROSOFT_TOOLTIP =
  'Enrolled, but cannot sign in to Nexus yet: they have no @neramclasses.com account. Create it in Entra, then use Refresh from Entra in Admin.';
