import { NextResponse } from 'next/server';
import {
  getSupabaseAdminClient,
  getExam,
  loadClassroomRoster,
  type NexusExam,
} from '@neram/database';
import { verifyMsToken } from '@/lib/ms-verify';

/**
 * Who is allowed to touch an exam, and the roster it is sat by.
 *
 * One place, because an exam has three separate surfaces (schedule,
 * invigilate, publish) and a permission check copied three times is a
 * permission check that will differ three ways.
 */

export interface ExamCaller {
  id: string;
  user_type: string;
  staff_role: string | null;
  can_teach: boolean;
  name: string | null;
}

export type ExamAccess =
  | { ok: true; caller: ExamCaller; exam: NexusExam }
  | { ok: false; response: NextResponse };

/** Staff means anyone with a staff_role or the teaching flag, never user_type === 'admin'. */
export function isStaff(caller: { user_type: string; staff_role: string | null; can_teach: boolean }): boolean {
  return Boolean(caller.staff_role) || caller.can_teach || caller.user_type === 'teacher' || caller.user_type === 'admin';
}

export async function resolveExamCaller(
  authHeader: string | null,
): Promise<{ ok: true; caller: ExamCaller } | { ok: false; response: NextResponse }> {
  if (!authHeader) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  // verifyMsToken throws on a bad token rather than returning null.
  let oid: string;
  try {
    const verified = await verifyMsToken(authHeader);
    if (!verified?.oid) throw new Error('No oid on the token');
    oid = verified.oid;
  } catch {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const supabase = getSupabaseAdminClient();
  const { data: user } = await supabase
    .from('users')
    .select('id, user_type, staff_role, can_teach, name')
    .eq('ms_oid', oid)
    .maybeSingle();

  if (!user) {
    return { ok: false, response: NextResponse.json({ error: 'User not found' }, { status: 404 }) };
  }

  return {
    ok: true,
    caller: {
      id: (user as any).id,
      user_type: (user as any).user_type,
      staff_role: (user as any).staff_role ?? null,
      can_teach: Boolean((user as any).can_teach),
      name: (user as any).name ?? null,
    },
  };
}

/** Staff-only access to one exam. */
export async function requireExamStaff(
  authHeader: string | null,
  examId: string,
): Promise<ExamAccess> {
  const resolved = await resolveExamCaller(authHeader);
  if (!resolved.ok) return resolved;

  // Gate on capability, never on user_type === 'admin': a manager is
  // user_type 'student' with a staff_role, and checking the type locks them out.
  if (!isStaff(resolved.caller)) {
    return { ok: false, response: NextResponse.json({ error: 'Staff only' }, { status: 403 }) };
  }

  const exam = await getExam(examId);
  if (!exam) {
    return { ok: false, response: NextResponse.json({ error: 'Exam not found' }, { status: 404 }) };
  }

  return { ok: true, caller: resolved.caller, exam };
}

export interface ExamRosterStudent {
  id: string;
  name: string;
  avatar_url: string | null;
}

/**
 * The students an exam is sat by.
 *
 * loadClassroomRoster already restricts to role = 'student' and drops alumni and
 * removed enrolments. Dormant students are INCLUDED here, unlike most surfaces:
 * dormant means "we have stopped chasing them", not "they are not in this
 * class", and an exam roster that quietly omitted them would under-report the
 * absentees a teacher needs to see.
 */
export async function loadExamRoster(classroomId: string): Promise<ExamRosterStudent[]> {
  // No userColumns needed: id, name and avatar_url are already in
  // loadClassroomRoster's BASE_USER_COLUMNS. `name` is the real display
  // column on users -- there is no full_name, and asking for one makes
  // PostgREST reject the whole request (see the identical trap documented in
  // test-analytics.ts, which this file had drifted back into).
  const roster = await loadClassroomRoster(classroomId, { includeDormant: true });

  return roster.members
    .map((m: any) => ({
      id: m.user?.id ?? m.user_id,
      name: m.user?.name || 'Student',
      avatar_url: m.user?.avatar_url ?? null,
    }))
    .filter((s) => Boolean(s.id));
}
