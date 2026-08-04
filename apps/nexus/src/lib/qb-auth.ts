/**
 * Shared helper for verifying Question Bank access in API routes.
 *
 * Staff get access from their tier. Students must be enrolled in the classroom
 * AND the classroom must have QB switched on.
 *
 * That student check is the point of this module, and it was previously NOT
 * performed: the function documented it, imported the two helpers needed for it,
 * then returned `ok: true` for every authenticated caller regardless of
 * enrolment. Any signed-in user could read the whole Question Bank.
 */

import { NextResponse } from 'next/server';
import { verifyMsToken } from './ms-verify';
import {
  getSupabaseAdminClient,
  getUserRoleInClassroom,
  isQBEnabledForClassroom,
} from '@neram/database';
import { resolveStaffRole } from './staff-capabilities';

export interface QBCaller {
  id: string;
  user_type: string;
  /**
   * Carried so callers can gate on the tier rather than on user_type alone.
   * A manager row has user_type='student' with staff_role='manager', and a
   * `['teacher','admin'].includes(user_type)` check refuses them: that is how
   * tag creation came to 403 for people who could edit the wrap-up asking for it.
   */
  staff_role?: string | null;
  can_teach?: boolean | null;
}

export type QBAccessResult =
  | { ok: true; caller: QBCaller }
  | { ok: false; response: NextResponse };

/**
 * Verify that the caller has access to the Question Bank for the given classroom.
 *
 * - Staff (admin/manager/teacher): always allowed, no enrollment check.
 * - Students: must be enrolled in the classroom AND the classroom must have QB
 *   enabled.
 * - A student request with no classroomId is a 400: without a classroom there is
 *   nothing to authorise against, and defaulting to "allow" is what caused the
 *   original hole.
 */
export async function verifyQBAccess(
  authHeader: string | null,
  classroomId: string | null | undefined,
): Promise<QBAccessResult> {
  if (!authHeader) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  let msUser;
  try {
    msUser = await verifyMsToken(authHeader);
  } catch {
    return { ok: false, response: NextResponse.json({ error: 'Invalid token' }, { status: 401 }) };
  }

  const supabase = getSupabaseAdminClient();
  const { data: caller } = await supabase
    .from('users')
    .select('id, user_type, staff_role, can_teach')
    .eq('ms_oid', msUser.oid)
    .single();

  if (!caller) {
    return { ok: false, response: NextResponse.json({ error: 'User not found' }, { status: 404 }) };
  }

  const asCaller: QBCaller = {
    id: caller.id,
    user_type: caller.user_type ?? 'student',
    staff_role: caller.staff_role ?? null,
    can_teach: caller.can_teach ?? null,
  };

  // Any staff tier reaches the Question Bank without an enrollment check: they
  // author and review its content.
  if (resolveStaffRole(caller) !== null) {
    return { ok: true, caller: asCaller };
  }

  // ── Students ───────────────────────────────────────────────────────────────
  if (!classroomId) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'classroom_id is required' }, { status: 400 }),
    };
  }

  const role = await getUserRoleInClassroom(caller.id, classroomId).catch(() => null);
  if (!role) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'You are not enrolled in this classroom.' },
        { status: 403 },
      ),
    };
  }

  const qbEnabled = await isQBEnabledForClassroom(classroomId).catch(() => false);
  if (!qbEnabled) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'The Question Bank is not open for your classroom yet.' },
        { status: 403 },
      ),
    };
  }

  return { ok: true, caller: asCaller };
}

/**
 * Gate the routes that write a `student_custom` test.
 *
 * verifyQBAccess answers "may you touch the Question Bank", which is not the
 * same question. Staff short-circuit its enrolment check, so on its own it lets
 * a teacher create a paper stamped `created_by_student = <the teacher>`, which
 * then surfaces in the teacher hub's "Student tests" list as if a student had
 * built it. Pairing the two gives the real rule: a student's own paper is
 * created only by a genuine student, and only one enrolled in the classroom.
 *
 * Impersonation still works as intended. A `View as student` token resolves to
 * the target student, so the caller here IS the student, not the teacher.
 *
 * Returns a response to send back, or null when the caller may proceed.
 */
export function refuseUnlessStudent(caller: QBCaller): NextResponse | null {
  if (resolveStaffRole(caller) === null) return null;
  return NextResponse.json(
    { error: 'Only students build their own practice papers. Use the teacher test builder instead.' },
    { status: 403 },
  );
}
