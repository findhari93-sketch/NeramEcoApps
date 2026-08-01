/**
 * Reaching a student's parent.
 *
 * Extracted from the catch-up digest cron, which held the only working copy of
 * this lookup. It is two joins and it looks trivial, which is exactly why a
 * second caller would have written it again and got it wrong: the address is
 * `nexus_parent_credentials.contact_email` and NEVER `users.email`. Parent
 * provisioning deliberately moved it off the users row, because that column is
 * globally unique and a parent's address is usually already sitting on a lead,
 * so reading users.email finds either nothing or the wrong person.
 *
 * Email only, on purpose. A parent signs in with an admin-issued id and password
 * against a synthetic ms_oid, so there is no Teams identity to ping and no
 * in-app bell they watch. sendNudge would deliver an in-app row nobody reads.
 */

import { getSupabaseAdminClient, sendEmail } from '@neram/database';
import { plainToHtml } from '@/lib/nudge-delivery';

export interface ParentContact {
  parentUserId: string;
  email: string;
  /** The children of this parent who are in the id list that was asked about. */
  studentIds: string[];
}

/**
 * The reachable parents of these students, grouped by parent.
 *
 * Grouped rather than one row per link, so a guardian with two students in the
 * same class gets one message rather than two.
 */
export async function resolveParentContacts(
  studentIds: string[],
  client?: any,
): Promise<ParentContact[]> {
  if (studentIds.length === 0) return [];
  const supabase = (client ?? getSupabaseAdminClient()) as any;

  const { data: links } = await supabase
    .from('nexus_parent_links')
    .select('parent_user_id, student_user_id')
    .in('student_user_id', studentIds);

  if (!links || links.length === 0) return [];

  const childrenByParent = new Map<string, string[]>();
  for (const link of links) {
    const list = childrenByParent.get(link.parent_user_id) || [];
    if (!list.includes(link.student_user_id)) list.push(link.student_user_id);
    childrenByParent.set(link.parent_user_id, list);
  }

  const { data: creds } = await supabase
    .from('nexus_parent_credentials')
    .select('parent_user_id, contact_email, is_active')
    .in('parent_user_id', [...childrenByParent.keys()]);

  const contacts: ParentContact[] = [];
  for (const c of creds || []) {
    // A revoked parent account is not a delivery failure, it is a deliberate
    // exclusion, so it is filtered here rather than attempted and reported.
    if (c.is_active === false || !c.contact_email) continue;
    contacts.push({
      parentUserId: c.parent_user_id,
      email: c.contact_email,
      studentIds: childrenByParent.get(c.parent_user_id) || [],
    });
  }
  return contacts;
}

export interface ParentEmailInput {
  /** Only these students' parents are written to. */
  studentIds: string[];
  /** Builds the message for one parent, given the names of their children here. */
  build: (childNames: string[]) => { subject: string; plain: string } | null;
  /** Display names, so the email can say who it is about. */
  nameById: Map<string, string | null>;
  /** Stops a bad call from turning into a mail run. */
  cap?: number;
  client?: any;
}

/** Email each linked parent once. Never throws; returns how many landed. */
export async function emailParentsOfStudents(
  input: ParentEmailInput,
): Promise<{ sent: number; errors: string[] }> {
  const errors: string[] = [];
  const cap = input.cap ?? 50;
  const contacts = await resolveParentContacts(input.studentIds, input.client);

  let sent = 0;
  for (const contact of contacts) {
    if (sent >= cap) {
      errors.push(`parent email cap of ${cap} reached`);
      break;
    }
    const names = contact.studentIds
      .map((id) => input.nameById.get(id) || null)
      .filter((n): n is string => !!n);
    const notice = input.build(names);
    if (!notice) continue;

    try {
      const res = await sendEmail({
        to: contact.email,
        subject: notice.subject,
        html: plainToHtml(notice.plain),
      });
      if (res.success) sent += 1;
      else errors.push(`parent ${contact.parentUserId}: ${res.error || 'email failed'}`);
    } catch (err) {
      errors.push(
        `parent ${contact.parentUserId}: ${err instanceof Error ? err.message : 'unknown error'}`,
      );
    }
  }

  return { sent, errors };
}
