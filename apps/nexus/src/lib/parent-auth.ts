/**
 * Server helpers for the parent portal.
 *
 * The parent counterpart to the staff gates in lib/study-materials.ts. Kept in
 * its own module on purpose: that file is a staff-authorization surface, and
 * mixing the two would make it easy to reach for the wrong gate.
 *
 * THE RULE: a valid parent token proves only WHO the parent is. It never proves
 * WHICH child they may see. RLS gives us nothing here (Nexus authenticates via
 * MSAL, so auth.uid() is always null and every parent-related policy on the
 * nexus_* tables is dead code), so there is NO database-level safety net.
 * Every route that takes a student id from the request MUST call assertParentOf
 * or resolveChildContext before touching child data.
 */

import { getSupabaseAdminClient, getCurrentBatch } from '@neram/database';
import { verifyMsToken } from '@/lib/ms-verify';
import { ApiError } from '@/lib/api-errors';

export interface ParentUser {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  loginId: string;
  mustChangePassword: boolean;
  tokenVersion: number;
}

export interface ParentChild {
  id: string;
  name: string | null;
  avatar_url: string | null;
  relationship: string;
  is_primary: boolean;
  classroom_id: string | null;
  classroom_name: string | null;
}

export interface GetParentUserOptions {
  /**
   * Allow a parent who has not yet set their own password. ONLY the
   * password-change route passes this. Everything else must reject them, or the
   * forced change becomes a client-side redirect anyone can skip with curl.
   */
  allowPasswordChangePending?: boolean;
}

/**
 * Resolve the signed-in parent from an Authorization header.
 *
 * Throws 403 if the token is valid but is not a parent token, so a teacher or
 * student token can never reach a /api/parent/** route by accident.
 */
export async function getParentUser(
  authHeader: string | null,
  opts: GetParentUserOptions = {}
): Promise<ParentUser> {
  const msUser = await verifyMsToken(authHeader, { allowParent: true });

  if (!msUser.parentUserId) {
    // A valid staff or student token. Opting in above means "parents allowed",
    // not "anyone allowed", so non-parents are turned away here.
    throw new ApiError('This area is for parent accounts only.', 403);
  }

  const supabase = getSupabaseAdminClient();
  const { data: cred } = await supabase
    .from('nexus_parent_credentials')
    // Single literal: a concatenated select string widens to `string` and
    // collapses PostgREST's compile-time row inference.
    .select(
      'login_id, must_change_password, token_version, is_active, parent:users!nexus_parent_credentials_parent_user_id_fkey(id, name, email, phone)'
    )
    .eq('parent_user_id', msUser.parentUserId)
    .maybeSingle();

  if (!cred || cred.is_active !== true) {
    throw new ApiError('Parent access has been revoked', 401);
  }

  const parent = cred.parent as unknown as {
    id: string;
    name: string | null;
    email: string | null;
    phone: string | null;
  } | null;

  if (!parent) {
    throw new ApiError('Parent account is no longer valid', 401);
  }

  if (cred.must_change_password && !opts.allowPasswordChangePending) {
    // A distinct code so the client can route to /parent/set-password instead of
    // showing a generic "not allowed" screen.
    const err = new ApiError('Set a new password to continue.', 403);
    (err as ApiError & { code?: string }).code = 'password_change_required';
    throw err;
  }

  return {
    id: parent.id,
    name: parent.name,
    email: parent.email,
    phone: parent.phone,
    loginId: cred.login_id,
    mustChangePassword: !!cred.must_change_password,
    tokenVersion: cred.token_version,
  };
}

/**
 * Every child currently linked to this parent.
 * Phase 1 always returns 0 or 1, but the shape is an array from the start so
 * adding a sibling switcher later is purely additive.
 */
export async function listParentChildren(parentUserId: string): Promise<ParentChild[]> {
  const supabase = getSupabaseAdminClient();

  const { data: links } = await supabase
    .from('nexus_parent_links')
    .select(
      'student_user_id, relationship, is_primary, classroom_id, student:users!nexus_parent_links_student_user_id_fkey(id, name, avatar_url, is_alumni)'
    )
    .eq('parent_user_id', parentUserId)
    .eq('is_active', true)
    .is('revoked_at', null);

  const rows = (links || []).filter((l: any) => l.student);
  if (rows.length === 0) return [];

  // Resolve each child's live classroom rather than trusting the denormalised
  // classroom_id, which can go stale across a year-end rollover.
  const classroomByChild = await getChildClassrooms(
    rows.map((l: any) => l.student_user_id)
  );

  return rows
    // A graduated child's parent loses the portal at the same moment the child
    // loses Nexus. Mirrors the alumni gate in /api/auth/me.
    .filter((l: any) => !l.student.is_alumni)
    .map((l: any) => {
      const classroom = classroomByChild.get(l.student_user_id) || null;
      return {
        id: l.student.id,
        name: l.student.name,
        avatar_url: l.student.avatar_url,
        relationship: l.relationship || 'parent',
        is_primary: l.is_primary !== false,
        classroom_id: classroom?.id ?? l.classroom_id ?? null,
        classroom_name: classroom?.name ?? null,
      };
    })
    .sort((a, b) => Number(b.is_primary) - Number(a.is_primary));
}

export interface ChildClassroom {
  id: string;
  name: string;
  type: string | null;
  academic_year: string | null;
  is_active: boolean | null;
  is_archived: boolean | null;
  ms_team_id: string | null;
  enrollmentRole: 'student';
}

/**
 * The live classroom for each of these students, current academic year first.
 *
 * Applies exactly the same filter and ordering as the student path in
 * /api/auth/me (drop is_active=false and is_archived=true, then sort the current
 * batch code first), so a parent's classroom list can never disagree with their
 * child's. Extracted here rather than duplicated so there is one implementation.
 */
export async function getChildClassrooms(
  childIds: string[]
): Promise<Map<string, ChildClassroom>> {
  const result = new Map<string, ChildClassroom>();
  if (!childIds.length) return result;

  const supabase = getSupabaseAdminClient();

  // nexus_enrollments references users twice (user_id, removed_by), so a bare
  // `user:users(...)` embed is ambiguous. We only need the classroom here.
  const { data: enrollments } = await supabase
    .from('nexus_enrollments')
    .select('user_id, role, classroom:nexus_classrooms(*)')
    .in('user_id', childIds)
    .eq('role', 'student')
    .eq('is_active', true);

  let currentBatchCode: string | null = null;
  try {
    currentBatchCode = (await getCurrentBatch(supabase)).code;
  } catch {
    currentBatchCode = null;
  }

  const live = (enrollments || []).filter(
    (e: any) =>
      e.classroom && e.classroom.is_active !== false && e.classroom.is_archived !== true
  );

  live.sort((a: any, b: any) => {
    const ay = a.classroom?.academic_year || '';
    const by = b.classroom?.academic_year || '';
    if (currentBatchCode) {
      if (ay === currentBatchCode && by !== currentBatchCode) return -1;
      if (by === currentBatchCode && ay !== currentBatchCode) return 1;
    }
    return by.localeCompare(ay);
  });

  // First wins, which after the sort is the current-year classroom.
  for (const e of live as any[]) {
    if (!result.has(e.user_id)) {
      result.set(e.user_id, { ...e.classroom, enrollmentRole: 'student' });
    }
  }

  return result;
}

/**
 * THE gate. Throws 403 unless an active, non-revoked link joins these two.
 *
 * Call this in every route that accepts a student id from the request, before
 * reading any child data. There is no RLS fallback if you forget.
 */
export async function assertParentOf(parentUserId: string, studentId: string): Promise<void> {
  if (!parentUserId || !studentId) {
    throw new ApiError('You do not have access to this student.', 403);
  }

  const supabase = getSupabaseAdminClient();
  const { data: link } = await supabase
    .from('nexus_parent_links')
    .select('id')
    .eq('parent_user_id', parentUserId)
    .eq('student_user_id', studentId)
    .eq('is_active', true)
    .is('revoked_at', null)
    .maybeSingle();

  if (!link) {
    // Deliberately the same message whether the student does not exist or is
    // simply not theirs, so this cannot be used to probe for enrolled students.
    throw new ApiError('You do not have access to this student.', 403);
  }
}

export interface ChildContext {
  child: ParentChild;
  classroomId: string;
}

/**
 * Resolve which child a request is about, and their classroom.
 *
 * With no `requestedStudentId` this picks the primary child, which is what a
 * single-child parent always gets. With one, it validates the request against
 * the link set, so it doubles as assertParentOf for the common case.
 */
export async function resolveChildContext(
  parentUserId: string,
  requestedStudentId?: string | null
): Promise<ChildContext> {
  const children = await listParentChildren(parentUserId);

  if (children.length === 0) {
    throw new ApiError('No student is linked to this parent login.', 404);
  }

  const child = requestedStudentId
    ? children.find((c) => c.id === requestedStudentId)
    : children[0];

  if (!child) {
    throw new ApiError('You do not have access to this student.', 403);
  }

  if (!child.classroom_id) {
    throw new ApiError(
      `${child.name || 'Your child'} is not currently in an active class.`,
      404
    );
  }

  return { child, classroomId: child.classroom_id };
}
