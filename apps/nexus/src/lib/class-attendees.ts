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
