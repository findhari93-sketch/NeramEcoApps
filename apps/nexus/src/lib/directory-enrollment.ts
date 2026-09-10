/**
 * Turning a Microsoft directory account into the Nexus user to enroll.
 *
 * The enrollments route used to look the account up by ms_oid and, on a miss,
 * insert a brand new users row. A student who paid through the marketing link
 * already has a row (Google login, no ms_oid), so adding their new
 * @neramclasses.com account created a second student. The unusable copy then
 * collected false absences and held the real catch-up journey.
 *
 * The order now:
 *   1. The teacher already said which record it is (linkUserId): attach to it.
 *   2. The reconciler recognises the person (ms_oid, recorded link, email, phone,
 *      personal email): attach to that.
 *   3. A student in this classroom with no Microsoft account looks like the same
 *      person: stop and ask, unless the teacher already answered "different".
 *   4. Otherwise create.
 *
 * Database and Graph access sit behind DirectoryEnrollStore so this ordering is
 * unit-tested without either.
 */

import {
  findIdentityCandidates,
  type IdentityCandidate,
  type IdentityCandidateRow,
} from './identity-candidates';

export const LINK_TARGET_MISSING = 'That student record no longer exists. Refresh and try again.';
export const LINK_TARGET_OTHER_ACCOUNT = 'That student is already linked to a different Microsoft account.';
export const ACCOUNT_HAS_OWN_RECORD =
  'This Microsoft account already has its own Nexus record. Merge the two records in Admin before linking.';
export const CREATE_FAILED = 'Could not create a Nexus record for this Microsoft account.';

export interface DirectoryHints {
  phones: string[];
  emails: string[];
}

export interface ReconcileRequest {
  msOid: string;
  upn: string;
  name: string;
  phoneHints: string[];
  emailHints: string[];
  allowCreate: boolean;
  userType: string;
}

export interface DirectoryEnrollStore {
  getUser(userId: string): Promise<{ id: string; ms_oid: string | null } | null>;
  findUserIdByMsOid(msOid: string): Promise<string | null>;
  linkMicrosoft(userId: string, msOid: string, upn: string, actorId: string): Promise<void>;
  listClassroomStudentsWithoutMicrosoft(classroomId: string): Promise<IdentityCandidateRow[]>;
  getDirectoryHints(msOid: string): Promise<DirectoryHints>;
  reconcile(request: ReconcileRequest): Promise<string | null>;
}

export interface ResolveDirectoryUserInput {
  classroomId: string;
  msOid: string;
  upn: string;
  name: string;
  role: string;
  userType: string;
  linkUserId: string | null;
  confirmNew: boolean;
  actorId: string;
}

export type ResolveDirectoryUserResult =
  | { kind: 'resolved'; userId: string; how: 'linked' | 'matched' | 'created' }
  | { kind: 'possible_duplicate'; candidates: IdentityCandidate[] }
  | { kind: 'conflict'; status: 404 | 409; error: string };

export async function resolveDirectoryUser(
  store: DirectoryEnrollStore,
  input: ResolveDirectoryUserInput,
): Promise<ResolveDirectoryUserResult> {
  const { msOid, upn, name, linkUserId, confirmNew, actorId, classroomId, userType } = input;

  // 1. The teacher picked the record.
  if (linkUserId) {
    const target = await store.getUser(linkUserId);
    if (!target) return { kind: 'conflict', status: 404, error: LINK_TARGET_MISSING };
    if (target.ms_oid && target.ms_oid !== msOid) {
      return { kind: 'conflict', status: 409, error: LINK_TARGET_OTHER_ACCOUNT };
    }
    const owner = await store.findUserIdByMsOid(msOid);
    if (owner && owner !== target.id) {
      return { kind: 'conflict', status: 409, error: ACCOUNT_HAS_OWN_RECORD };
    }
    if (!target.ms_oid) await store.linkMicrosoft(target.id, msOid, upn, actorId);
    return { kind: 'resolved', userId: target.id, how: 'linked' };
  }

  // Duplicates are a student problem. A teacher's phone must never pull their
  // account onto a student's Google record, so staff skip hints and the question.
  const isStudent = input.role === 'student';
  const hints: DirectoryHints = isStudent ? await store.getDirectoryHints(msOid) : { phones: [], emails: [] };

  // 2. The reconciler recognises the person. A match is attached, never duplicated.
  const matched = await store.reconcile({
    msOid,
    upn,
    name,
    phoneHints: hints.phones,
    emailHints: hints.emails,
    allowCreate: false,
    userType,
  });
  if (matched) return { kind: 'resolved', userId: matched, how: 'matched' };

  // 3. Someone already enrolled here may be the same person.
  if (isStudent && !confirmNew) {
    const rows = await store.listClassroomStudentsWithoutMicrosoft(classroomId);
    const candidates = findIdentityCandidates({ name, upn, phones: hints.phones, emails: hints.emails }, rows);
    if (candidates.length) return { kind: 'possible_duplicate', candidates };
  }

  // 4. A genuinely new person.
  const created = await store.reconcile({
    msOid,
    upn,
    name,
    phoneHints: [],
    emailHints: [],
    allowCreate: true,
    userType,
  });
  if (!created) return { kind: 'conflict', status: 409, error: CREATE_FAILED };
  return { kind: 'resolved', userId: created, how: 'created' };
}
