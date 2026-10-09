/**
 * Who gets a class meeting on their Teams calendar.
 *
 * Pure logic, kept out of the route so it can be unit tested: the rule is easy
 * to get subtly wrong (case-insensitive email matching, test seeds, disabled
 * accounts) and getting it wrong is visible to every member of staff.
 *
 * The rule:
 *   the assigned tutor              -> 'required'
 *   internal staff (admin/manager)  -> 'optional'
 *   external teachers               -> not invited unless they are the tutor
 *
 * Before this, every teacher was invited as an optional attendee to every class.
 * With visiting teachers that fills their calendar with classes they do not
 * teach and buries the one they do. The internal core team does need sight of
 * every class, which is precisely the admin/manager tier.
 */
import { isInternalStaff, resolveStaffRole } from '@/lib/staff-capabilities';

/** A calendar attendee in Microsoft Graph shape. */
export type GraphAttendee = {
  emailAddress: { address: string; name: string };
  type: 'required' | 'optional';
};

/** The staff fields the rule needs. Matches a `users` row selection. */
export interface StaffCalendarRow {
  name?: string | null;
  email?: string | null;
  ms_oid?: string | null;
  user_type?: string | null;
  staff_role?: string | null;
  is_disabled?: boolean | null;
}

/**
 * Build the attendee list for one class.
 *
 * `tutorEmail` may be empty (no tutor resolved), in which case only internal
 * staff are invited and nobody is marked 'required'.
 */
export function buildStaffAttendees(
  staff: StaffCalendarRow[],
  tutorEmail: string | null | undefined,
): GraphAttendee[] {
  // Microsoft preserves admin-set UPN casing, so the stored email and the passed
  // tutorEmail can differ in case for the same person.
  const tutorKey = tutorEmail?.trim().toLowerCase() || '';
  const out: GraphAttendee[] = [];
  const seen = new Set<string>();

  for (const s of staff || []) {
    const email = s.email;
    const msOid = s.ms_oid;
    // No mailbox to invite: unlinked account, or an E2E test-login seed (local
    // E2E runs write real rows, so these are present in the real table).
    if (!email || !msOid || String(msOid).startsWith('test-oid-')) continue;
    if (s.is_disabled === true) continue;

    const key = email.toLowerCase();
    if (seen.has(key)) continue;

    const isTutor = !!tutorKey && key === tutorKey;
    if (!isTutor && !isInternalStaff(resolveStaffRole(s))) continue;

    seen.add(key);
    out.push({
      emailAddress: { address: email, name: s.name || email },
      type: isTutor ? 'required' : 'optional',
    });
  }

  return out;
}

/**
 * Who may present in a class meeting: every member of staff (internal staff
 * and external teachers alike), plus the tutor even if their row is somehow
 * not a staff row. Students never.
 *
 * Wider than buildStaffAttendees on purpose. A visiting teacher does not need
 * every class on their calendar, but whoever ends up taking a class must be
 * able to share their screen, and the scheduled tutor is often not that person.
 *
 * `staff` is the `users` rows with user_type teacher or admin; `tutor` is the
 * class's teacher_id row when known.
 */
export function buildStaffPresenters(
  staff: StaffCalendarRow[],
  tutor?: StaffCalendarRow | null,
): Array<{ upn: string; oid: string }> {
  const out: Array<{ upn: string; oid: string }> = [];
  const seen = new Set<string>();
  for (const s of [...(staff || []), ...(tutor ? [tutor] : [])]) {
    const email = s.email?.trim();
    const oid = s.ms_oid?.trim();
    if (!email || !oid || oid.startsWith('test-oid-')) continue;
    if (s.is_disabled === true) continue;
    const key = oid.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ upn: email, oid });
  }
  return out;
}
