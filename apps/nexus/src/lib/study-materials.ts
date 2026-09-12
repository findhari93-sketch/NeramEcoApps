/**
 * Shared server helpers for the Study Materials API routes.
 *
 * Resolves the requesting Nexus user, derives a student's "exam set" from their active
 * classroom enrolments (used for audience filtering), and asserts staff access.
 */
import {
  getSupabaseAdminClient,
  getFileById,
  getFolderById,
  isFolderVisibleToStudent,
  effectiveDownloadable,
  hasActiveDownloadGrant,
  type NexusStudyFile,
  type NexusStudyFolder,
} from '@neram/database';
import { verifyMsToken } from '@/lib/ms-verify';
import { ApiError } from '@/lib/api-errors';
import { TtlCache } from '@/lib/ttl-cache';
import {
  can,
  isInternalStaff as isInternalStaffRole,
  resolveStaffRole,
  type Capability,
  type StaffRole,
} from '@/lib/staff-capabilities';

export interface RequestUser {
  id: string;
  user_type: string | null;
  student_program: string | null;
  name: string | null;
  /** Nexus authority tier. Null until the staff_role backfill reaches this row. */
  staff_role: string | null;
  /** Tutor eligibility. Orthogonal to staff_role. */
  can_teach: boolean | null;
}

/**
 * Nexus user rows we have already looked up, keyed by ms_oid.
 *
 * Resolving a caller costs two round trips: identify the token, then find the matching
 * row. ms-verify now caches the first; this caches the second, so a warm request
 * reaches its own work with no preamble at all.
 *
 * Shorter than the identity TTL on purpose. This row carries `staff_role` and
 * `can_teach`, which decide what the caller may do, so a demotion should take effect
 * quickly. Half a minute is the accepted window, and it is small next to the hour-long
 * life of the access token the caller is holding regardless.
 */
const USER_ROW_TTL_MS = 30_000;
const requestUserCache = new TtlCache<RequestUser>(USER_ROW_TTL_MS);

/** Test seam, and the hook to call if a route ever needs a caller re-read immediately. */
export function invalidateRequestUser(msOid: string): void {
  requestUserCache.delete(msOid);
}

/**
 * Verify the MS/test/impersonation token and load the matching Nexus user row.
 *
 * @param authHeader the FULL `Authorization` header value, including the
 *   "Bearer " prefix, i.e. `request.headers.get('Authorization')`.
 *   Do NOT pass `extractBearerToken(...)`: verifyMsToken checks for the prefix
 *   itself and a bare token fails with "Missing or invalid Authorization
 *   header". (The parameter used to be named `tokenString`, which read like it
 *   wanted the token alone and caused exactly that bug.)
 */
export async function getRequestUser(authHeader: string | null): Promise<RequestUser> {
  const msUser = await verifyMsToken(authHeader);

  // Defence in depth. verifyMsToken already rejects parent tokens unless the
  // caller passes allowParent, and this helper never does, so in practice this
  // is unreachable. It stays because it costs nothing and it means a future
  // change to that default cannot silently open the staff surface to parents.
  if (msUser.parentUserId) {
    throw new ApiError('Parent accounts cannot access this resource.', 403);
  }

  // Cached AFTER the parent refusal above, never before, so a cache hit can never be
  // used to skip that check.
  const cached = requestUserCache.get(msUser.oid);
  if (cached) return cached;

  const supabase = getSupabaseAdminClient();
  const { data: user } = await supabase
    .from('users')
    .select('id, user_type, student_program, name, staff_role, can_teach')
    .eq('ms_oid', msUser.oid)
    .single();
  if (!user) throw new Error('User not found');

  requestUserCache.set(msUser.oid, user as RequestUser);
  return user as RequestUser;
}

export function isStaff(user: RequestUser): boolean {
  return staffRoleOf(user) !== null;
}

export function assertStaff(user: RequestUser): void {
  if (!isStaff(user)) throw new Error('Not authorized');
}

export function isAdmin(user: RequestUser): boolean {
  return staffRoleOf(user) === 'admin';
}

/** The caller's effective Nexus tier (staff_role, falling back to user_type). */
export function staffRoleOf(user: RequestUser): StaffRole | null {
  return resolveStaffRole(user);
}

/**
 * admin or manager: the internal core team, who act across ALL classes.
 * An external `teacher` is additionally session-scoped, see ./staff-scope.
 */
export function isInternalStaff(user: RequestUser): boolean {
  return isInternalStaffRole(staffRoleOf(user));
}

/** Does the caller hold this capability? Fail-closed. */
export function hasCapability(user: RequestUser, capability: Capability): boolean {
  return can(staffRoleOf(user), capability, user.can_teach !== false);
}

/**
 * Capability gate for a route handler. Throws a 403 ApiError naming the missing
 * capability, so a denial is debuggable from the response instead of collapsing
 * into a generic "Not authorized".
 *
 * Use this instead of an inline `user_type === 'teacher' || 'admin'` check. A
 * bare assertStaff() still means "any staff tier" and is correct for reads that
 * every staff member may perform.
 */
export function assertCapability(user: RequestUser, capability: Capability): void {
  if (!hasCapability(user, capability)) {
    throw new ApiError(`Not authorized: this action requires ${capability}.`, 403);
  }
}

/**
 * Owner-or-admin gate for mutating a shared repository row (subject/topic).
 * Admin and manager may act on anything (they own the org-wide repository); a
 * teacher only on rows they created; a row with no recorded owner (legacy data)
 * is internal-staff-only. Throws a 403 ApiError otherwise.
 */
export function assertCanMutate(user: RequestUser, createdBy: string | null | undefined): void {
  if (isInternalStaff(user)) return;
  if (createdBy && createdBy === user.id) return;
  throw new ApiError('You can only edit or delete items you created.', 403);
}

/**
 * The consolidated single classroom (type='common') is the merged B.Arch cohort, which
 * prepares for both NATA and JEE Paper 2. Expand it to those exams so exam-tagged Study
 * Materials stay visible after the single-classroom consolidation (a 'common' student would
 * otherwise match no exam-targeted folder).
 */
const COMMON_CLASSROOM_EXAMS = ['nata', 'jee'];

/**
 * Distinct classroom types ('nata' | 'jee' | ...) across the student's active enrolments.
 * Used as the student's "exam set" for audience filtering. Empty when unknown (treated as
 * show-all by isFolderVisibleToStudent). The consolidated 'common' classroom expands to the
 * exams it serves (see COMMON_CLASSROOM_EXAMS).
 */
export async function getStudentExamSet(userId: string): Promise<string[]> {
  const supabase = getSupabaseAdminClient();
  const { data } = await supabase
    .from('nexus_enrollments')
    .select('classroom:nexus_classrooms(type)')
    .eq('user_id', userId)
    .eq('is_active', true);

  const types = new Set<string>();
  for (const row of (data as any[]) || []) {
    const classroom = row.classroom;
    const type = Array.isArray(classroom) ? classroom[0]?.type : classroom?.type;
    if (!type) continue;
    if (type === 'common') {
      for (const e of COMMON_CLASSROOM_EXAMS) types.add(e);
    } else {
      types.add(type);
    }
  }
  return [...types];
}

export interface StudyFileAccess {
  user: RequestUser;
  staff: boolean;
  file: NexusStudyFile;
  folder: NexusStudyFolder;
  /** Staff always; else the file or folder setting; else an active download grant. */
  downloadable: boolean;
}

/**
 * May this caller read this study file, and may they keep a copy?
 *
 * The one copy of the rule every byte-serving study route applies: the
 * chapter's own content and its slides. A student must be in the folder's
 * audience. Downloading is allowed for staff, when the file or its folder
 * allows it, or while a teacher's time-limited grant covers the file.
 *
 * Throws ApiError 404 when the file or folder is gone and 403 when the student
 * is outside the audience.
 *
 * @param authHeader the full Authorization header value, as getRequestUser takes it.
 */
export async function authorizeStudyFileRequest(authHeader: string | null, fileId: string): Promise<StudyFileAccess> {
  const user = await getRequestUser(authHeader);

  const file = (await getFileById(fileId)) as NexusStudyFile | null;
  if (!file) throw new ApiError('File not found', 404);
  const folder = (await getFolderById(file.folder_id)) as NexusStudyFolder | null;
  if (!folder) throw new ApiError('Folder not found', 404);

  const staff = isStaff(user);
  if (!staff) {
    const studentExams = await getStudentExamSet(user.id);
    if (!isFolderVisibleToStudent(folder, studentExams, user.student_program)) {
      throw new ApiError('Not available', 403);
    }
  }

  // A grant is only looked up when nothing cheaper already allows it.
  const downloadable =
    staff || effectiveDownloadable(file, folder) || (await hasActiveDownloadGrant(user.id, file));

  return { user, staff, file, folder, downloadable };
}
