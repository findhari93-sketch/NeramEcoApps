/**
 * Deciding which Entra directory accounts may be offered as addable students.
 *
 * History, and why this file exists: the original filter guessed at staff from the
 * mailbox name, dropping any UPN that *contained* one of
 * ['admin', 'teacher', 'hari', 'shanthi', 'paramesh', 'tamil']. On 2026-07-28 a new
 * student account, Harimadhu@neramclasses.com, signed into Nexus and never appeared
 * in the teacher "Not yet in class" list, because "harimadhu" contains "hari". The
 * same rule was also hiding Paramesh@nerasmclasses.onmicrosoft.com, a real student
 * matching a pattern that corresponds to no staff member at all.
 *
 * That failure mode is structural, not a bad list. Those substrings are ordinary
 * components of Tamil names (Hariharan, Haripriya, Harini, Tamilarasan, Tamilselvi),
 * so a name-based rule will keep silently swallowing real students, and silently is
 * the problem: a teacher cannot tell the difference between "not in the directory"
 * and "filtered out".
 *
 * So staff are identified by who they are, not what they are called. Every staff
 * Entra account already carries user_type 'teacher'/'admin' (and now staff_role) on
 * its `users` row, which is authoritative, self-maintaining, and cannot false
 * positive on a student's name. What stays here is only what the directory itself
 * tells us: the account is usable, it is a person rather than a shared mailbox, and
 * it belongs to the organisation.
 *
 * Pure, so the rule is unit-testable without a Graph token or a database.
 */

/** The Graph fields this module needs. Matches the $select in available-students. */
export interface EntraDirectoryUser {
  id: string;
  displayName?: string | null;
  userPrincipalName?: string | null;
  mail?: string | null;
  accountEnabled?: boolean | null;
  /** 'Member' or 'Guest'. B2B invitees are Guests and are never students. */
  userType?: string | null;
  /** When the account was created. Lets the newest joiners be listed first. */
  createdDateTime?: string | null;
}

/** The `users` columns that decide whether someone may be enrolled as a student. */
export interface EnrollmentBlockRow {
  ms_oid?: string | null;
  email?: string | null;
  personal_email?: string | null;
  linked_classroom_email?: string | null;
  is_alumni?: boolean | null;
  user_type?: string | null;
  staff_role?: string | null;
}

/**
 * Shared and service mailboxes. These live in the tenant but are not people, so they
 * must never be offered as students. Matched on the local part only: "support" is a
 * service mailbox, "supportraj" is a person.
 */
const SERVICE_LOCAL_PARTS = new Set([
  'noreply', 'no-reply', 'donotreply', 'do-not-reply', 'support', 'info', 'contact',
  'hello', 'office', 'accounts', 'billing', 'help', 'mail', 'team', 'postmaster',
  'webmaster', 'hr', 'careers', 'jobs', 'enquiry', 'enquiries', 'noreply-neram',
]);

/**
 * Domains that belong to the organisation. `nerasmclasses` is the tenant's original
 * onmicrosoft.com domain (note the typo, it is real and still in use) and
 * `neram.co.in` is the legacy one.
 */
const ORG_DOMAINS = ['neramclasses.com', 'nerasmclasses.onmicrosoft.com', 'neram.co.in'];

/** Local part of an address, lowercased. Empty string when there is no address. */
function localPart(address: string): string {
  return address.split('@')[0] || '';
}

/** Domain of an address, lowercased. Empty string when there is no domain. */
function domainPart(address: string): string {
  const at = address.lastIndexOf('@');
  return at === -1 ? '' : address.slice(at + 1);
}

/** True when the address sits on one of the organisation's own domains. */
export function isOrgDomain(address: string | null | undefined): boolean {
  const domain = domainPart(String(address || '').trim().toLowerCase());
  if (!domain) return false;
  // Suffix match, so a tenant subdomain still counts, but neramclasses@gmail.com
  // (which the old `includes('neramclasses')` test accepted) does not.
  return ORG_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`));
}

/**
 * True when this directory account is a real, usable organisation person: enabled,
 * not a shared mailbox, on an org domain.
 *
 * Says nothing about whether they are staff or a student. That is decided from the
 * `users` table by isBlockedFromStudentEnrollment, because the directory does not
 * know the difference and guessing from the name is what broke this before.
 */
export function isOrgPersonAccount(user: EntraDirectoryUser): boolean {
  if (!user.accountEnabled) return false;

  const upn = String(user.userPrincipalName || '').trim().toLowerCase();
  if (!upn) return false;

  // B2B guests. Their UPN is rewritten onto our own tenant domain
  // (jayashree84_gmail.com#EXT#@nerasmclasses.onmicrosoft.com), so a domain test
  // alone reads them as staff or students. Two live examples were being offered as
  // addable students before this check existed. userType is checked explicitly
  // rather than defaulted, so a null from a trimmed $select still falls through to
  // the #EXT# test rather than silently dropping a real member.
  if (String(user.userType || '').toLowerCase() === 'guest') return false;
  if (upn.includes('#ext#')) return false;

  if (SERVICE_LOCAL_PARTS.has(localPart(upn))) return false;

  return isOrgDomain(upn);
}

/** ms_oids and every known address of everyone who must never be offered. */
export interface EnrollmentBlocklist {
  oids: Set<string>;
  emails: Set<string>;
}

/**
 * Fold `users` rows into a blocklist.
 *
 * Matches on ms_oid AND on every address we hold, not the oid alone: some graduated
 * rows carry a null or mismatched ms_oid (a Google-first signup whose oid lives on a
 * duplicate row), and a UPN's casing can differ from the stored email. Address
 * matching closes both gaps.
 */
export function buildEnrollmentBlocklist(rows: EnrollmentBlockRow[]): EnrollmentBlocklist {
  const oids = new Set<string>();
  const emails = new Set<string>();

  for (const row of rows || []) {
    if (row.ms_oid) oids.add(row.ms_oid);
    for (const address of [row.email, row.personal_email, row.linked_classroom_email]) {
      if (address) emails.add(String(address).trim().toLowerCase());
    }
  }

  return { oids, emails };
}

/**
 * True when this directory account belongs to someone who must not be added as a
 * student: a graduated student, or any staff member.
 */
export function isBlockedFromStudentEnrollment(
  user: EntraDirectoryUser,
  blocklist: EnrollmentBlocklist
): boolean {
  if (blocklist.oids.has(user.id)) return true;

  const upn = String(user.userPrincipalName || '').trim().toLowerCase();
  const mail = String(user.mail || '').trim().toLowerCase();

  return (!!upn && blocklist.emails.has(upn)) || (!!mail && blocklist.emails.has(mail));
}

/**
 * The whole rule in one call: directory accounts that may be offered as students for
 * this classroom, given who is already enrolled and who is blocked.
 */
export function selectAddableStudents(
  directory: EntraDirectoryUser[],
  enrolledOids: Set<string>,
  blocklist: EnrollmentBlocklist
): EntraDirectoryUser[] {
  return (directory || []).filter(
    (user) =>
      isOrgPersonAccount(user) &&
      !enrolledOids.has(user.id) &&
      !isBlockedFromStudentEnrollment(user, blocklist)
  );
}

/** One nexus_enrollments student row with its user and classroom, as the route selects it. */
export interface StudentEnrollmentRow {
  user_id: string;
  is_active: boolean | null;
  removed_at?: string | null;
  removal_reason_category?: string | null;
  classroom?: { name?: string | null } | null;
  user?: (EnrollmentBlockRow & { id?: string; name?: string | null; academic_year?: string | null }) | null;
}

/** Someone who was a student in some classroom and is active in none. */
export interface PastStudentRecord extends EnrollmentBlockRow {
  user_id: string;
  name: string | null;
  academic_year: string | null;
  last_classroom: string | null;
  removal_reason: string | null;
  removed_at: string | null;
}

/**
 * Fold every student enrollment into the people who are active nowhere.
 *
 * These left a class (usually "course completed") without going through
 * Graduate, so is_alumni is still false and the blocklist cannot see them.
 */
export function foldPastStudents(rows: StudentEnrollmentRow[]): PastStudentRecord[] {
  const byUser = new Map<string, { active: boolean; latest: StudentEnrollmentRow }>();

  for (const row of rows || []) {
    if (!row?.user_id) continue;
    const seen = byUser.get(row.user_id);
    if (!seen) {
      byUser.set(row.user_id, { active: !!row.is_active, latest: row });
      continue;
    }
    seen.active = seen.active || !!row.is_active;
    if ((row.removed_at || '') > (seen.latest.removed_at || '')) seen.latest = row;
  }

  const past: PastStudentRecord[] = [];
  for (const [userId, { active, latest }] of byUser) {
    if (active) continue;
    const user = latest.user ?? null;
    past.push({
      user_id: userId,
      name: user?.name ?? null,
      ms_oid: user?.ms_oid ?? null,
      email: user?.email ?? null,
      personal_email: user?.personal_email ?? null,
      linked_classroom_email: user?.linked_classroom_email ?? null,
      academic_year: user?.academic_year ?? null,
      last_classroom: latest.classroom?.name ?? null,
      removal_reason: latest.removal_reason_category ?? null,
      removed_at: latest.removed_at ?? null,
    });
  }
  return past;
}

export interface AddableSplit {
  fresh: EntraDirectoryUser[];
  past: Array<{ user: EntraDirectoryUser; record: PastStudentRecord }>;
}

/**
 * Separate addable directory accounts into genuinely new ones (newest first)
 * and past students, matched on ms_oid and on every address we hold, the same
 * way the blocklist matches, so a null or stale oid still lands correctly.
 */
export function splitAddableStudents(
  addable: EntraDirectoryUser[],
  pastRecords: PastStudentRecord[]
): AddableSplit {
  const byOid = new Map<string, PastStudentRecord>();
  const byEmail = new Map<string, PastStudentRecord>();
  for (const record of pastRecords || []) {
    if (record.ms_oid) byOid.set(record.ms_oid, record);
    for (const address of [record.email, record.personal_email, record.linked_classroom_email]) {
      if (address) byEmail.set(String(address).trim().toLowerCase(), record);
    }
  }

  const fresh: EntraDirectoryUser[] = [];
  const past: AddableSplit['past'] = [];
  for (const user of addable || []) {
    const upn = String(user.userPrincipalName || '').trim().toLowerCase();
    const mail = String(user.mail || '').trim().toLowerCase();
    let record = byOid.get(user.id);
    if (!record && upn) record = byEmail.get(upn);
    if (!record && mail) record = byEmail.get(mail);
    if (record) past.push({ user, record });
    else fresh.push(user);
  }

  fresh.sort((a, b) => {
    const aCreated = a.createdDateTime || '';
    const bCreated = b.createdDateTime || '';
    if (aCreated !== bCreated) return bCreated.localeCompare(aCreated);
    return (a.displayName || '').localeCompare(b.displayName || '');
  });
  past.sort((a, b) => (a.user.displayName || '').localeCompare(b.user.displayName || ''));

  return { fresh, past };
}
