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
import { getRequestUser } from './study-materials';
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

type ResolvedCaller =
  | { ok: true; caller: QBCaller; isStaff: boolean }
  | { ok: false; response: NextResponse };

/**
 * Who is asking. Shared by both verifiers so the token check, the users lookup
 * and the staff-tier resolution cannot drift apart between them.
 */
async function resolveQBCaller(authHeader: string | null): Promise<ResolvedCaller> {
  if (!authHeader) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  // getRequestUser is verifyMsToken plus this exact users lookup, with the resolved row
  // held for 30 seconds. Doing it by hand here meant every Question Bank request paid the
  // lookup again, and a QB screen fires several endpoints at once. The two failures stay
  // distinguishable: a bad token is still 401, an unknown caller still 404. Parent tokens
  // are still refused, by getRequestUser rather than by verifyMsToken's default.
  let caller;
  try {
    caller = await getRequestUser(authHeader);
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    return message === 'User not found'
      ? { ok: false, response: NextResponse.json({ error: 'User not found' }, { status: 404 }) }
      : { ok: false, response: NextResponse.json({ error: 'Invalid token' }, { status: 401 }) };
  }

  return {
    ok: true,
    isStaff: resolveStaffRole(caller) !== null,
    caller: {
      id: caller.id,
      user_type: caller.user_type ?? 'student',
      staff_role: caller.staff_role ?? null,
      can_teach: caller.can_teach ?? null,
    },
  };
}

/**
 * Verify the caller is staff, for a Question Bank resource only staff may touch:
 * original papers, answer keys, activation, the tag registry.
 *
 * Exists because the routes it replaces each hand-rolled the same check as
 * `['teacher','admin'].includes(caller.user_type)`, which refuses a manager: a
 * manager row is user_type='student' carrying staff_role='manager'. Every
 * paper route was therefore closed to the very people who curate papers.
 * resolveStaffRole is the one function that knows what staff means, so asking
 * it here means the answer cannot drift route by route again.
 */
export async function verifyQBStaff(authHeader: string | null): Promise<QBAccessResult> {
  const resolved = await resolveQBCaller(authHeader);
  if (!resolved.ok) return resolved;
  if (!resolved.isStaff) {
    return { ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { ok: true, caller: resolved.caller };
}

/**
 * Verify access to a Question Bank resource that is NOT scoped to a classroom:
 * the global tag registry, a student's own folder tree, a student's own paper.
 *
 * Staff pass exactly as they do in verifyQBAccess. A student passes when they
 * hold at least one active enrolment in a classroom with the Question Bank
 * switched on, which is the real question for these resources. Asking them for
 * a classroom_id they have no way to supply is what produced the developer
 * message a student ended up reading on screen.
 */
export async function verifyQBAccessAnyClassroom(
  authHeader: string | null,
): Promise<QBAccessResult> {
  const resolved = await resolveQBCaller(authHeader);
  if (!resolved.ok) return resolved;
  const { caller, isStaff } = resolved;

  if (isStaff) return { ok: true, caller };

  const refused = NextResponse.json(
    { error: 'The Question Bank is not open for your classroom yet.' },
    { status: 403 },
  );

  const supabase = getSupabaseAdminClient() as any;
  const { data: enrolments } = await supabase
    .from('nexus_enrollments')
    .select('classroom_id')
    .eq('user_id', caller.id)
    .eq('role', 'student')
    .eq('is_active', true);

  const classroomIds = [
    ...new Set(((enrolments || []) as { classroom_id: string }[]).map((e) => e.classroom_id)),
  ].filter(Boolean);
  if (classroomIds.length === 0) return { ok: false, response: refused };

  // One query for the whole set rather than isQBEnabledForClassroom per row: a
  // student on several term cohorts would otherwise cost a round trip each.
  const { data: links } = await supabase
    .from('nexus_qb_classroom_links')
    .select('classroom_id, is_active')
    .in('classroom_id', classroomIds)
    .eq('is_active', true)
    .limit(1);

  if (!links || links.length === 0) return { ok: false, response: refused };

  return { ok: true, caller };
}

/**
 * Verify that the caller has access to the Question Bank for the given classroom.
 *
 * - Staff (admin/manager/teacher): always allowed, no enrollment check.
 * - Students: must be enrolled in the classroom AND the classroom must have QB
 *   enabled.
 * - A student request with no classroomId is a 400: without a classroom there is
 *   nothing to authorise against, and defaulting to "allow" is what caused the
 *   original hole.
 *
 * WHICH HELPER TO REACH FOR
 *
 * Use this one when the request names a classroom and the data it returns is
 * scoped to that classroom. Use verifyQBAccessAnyClassroom below when the
 * resource is not classroom scoped at all: the global tag registry, a student's
 * own folder tree, a student's own paper. Passing a hardcoded `null` here for
 * those was a 400 for every student, and it is what took the whole student test
 * builder off the air (NXS-0114).
 */
export async function verifyQBAccess(
  authHeader: string | null,
  classroomId: string | null | undefined,
): Promise<QBAccessResult> {
  const resolved = await resolveQBCaller(authHeader);
  if (!resolved.ok) return resolved;
  const { caller, isStaff } = resolved;

  // Any staff tier reaches the Question Bank without an enrollment check: they
  // author and review its content.
  if (isStaff) return { ok: true, caller };

  // ── Students ───────────────────────────────────────────────────────────────
  if (!classroomId) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'classroom_id is required' }, { status: 400 }),
    };
  }

  // "Are you in this classroom" and "is the bank open for it" are independent
  // questions, and were asked one after the other on every request. Every QB
  // screen fires several endpoints at once, so that second serial hop was being
  // paid several times over per page. The order of the checks below is
  // unchanged: enrolment still answers before the feature gate, so a student in
  // no classroom keeps getting 'not enrolled' rather than 'not open yet'.
  const [role, qbEnabled] = await Promise.all([
    getUserRoleInClassroom(caller.id, classroomId).catch(() => null),
    isQBEnabledForClassroom(classroomId).catch(() => false),
  ]);

  if (!role) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'You are not enrolled in this classroom.' },
        { status: 403 },
      ),
    };
  }

  if (!qbEnabled) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'The Question Bank is not open for your classroom yet.' },
        { status: 403 },
      ),
    };
  }

  return { ok: true, caller };
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
