import { getSupabaseAdminClient } from '@neram/database';
import { listUserClassroomIds, loadClassroomRoster, usersShareClassroom } from '@neram/database/queries/nexus';
import { ApiError } from '@/lib/api-errors';
import { extractBearerToken } from '@/lib/ms-verify';
import { isInternalStaff, isStaff, type RequestUser } from '@/lib/study-materials';

/**
 * Who may open whose sketchbook.
 *
 * Internal staff (admin, manager) see every student. A teacher sees a student
 * when they share an active classroom. Membership is the access rule, exactly
 * as everywhere else in Nexus; there is no per-feature grant.
 */
export async function assertStaffSeesStudent(caller: RequestUser, studentId: string): Promise<void> {
  if (!isStaff(caller)) throw new ApiError('Not authorized', 403);
  if (isInternalStaff(caller)) return;
  const ok = await usersShareClassroom(caller.id, studentId);
  if (!ok) throw new ApiError('You do not teach this student.', 403);
}

/** The classrooms whose sketchbooks this staff member flips through. */
export async function staffClassroomIds(caller: RequestUser): Promise<string[]> {
  if (!isStaff(caller)) throw new ApiError('Not authorized', 403);
  if (isInternalStaff(caller)) {
    const { data, error } = await getSupabaseAdminClient().from('nexus_classrooms').select('id').eq('is_active', true);
    if (error) throw new ApiError('Failed to load classrooms', 500);
    return (data || []).map((c: { id: string }) => c.id);
  }
  return listUserClassroomIds(caller.id, 'teacher');
}

/**
 * The one classroom this teacher and this student share.
 *
 * Featuring used to make the teacher pick from a dropdown of their own
 * classrooms. There is one real teaching classroom, so the question had a single
 * possible answer and the teacher still had to give it, on the way to praising a
 * teenager for a drawing. The server already knew the answer: it re-checked the
 * pick against exactly this intersection and rejected a wrong one.
 *
 * So resolve the overlap instead of asking. An explicit `requested` is still
 * honoured and still checked, which keeps every existing caller working. More
 * than one shared classroom is a 409, and only then does the sheet ask, from the
 * classroom list it already holds.
 */
export function pickSharedClassroom(
  teacherRoomIds: string[],
  studentRoomIds: string[],
  requested?: string | null,
): string {
  const shared = teacherRoomIds.filter((id) => studentRoomIds.includes(id));
  // An explicit pick is still checked against the same intersection, with the
  // same words, so the DELETE path and any older caller behave exactly as before.
  if (requested) {
    if (!shared.includes(requested)) throw new ApiError('That classroom does not hold both of you.', 403);
    return requested;
  }
  if (shared.length === 0) throw new ApiError('That classroom does not hold both of you.', 403);
  if (shared.length === 1) return shared[0];
  throw new ApiError('You teach this student in more than one classroom. Choose which one to feature in.', 409);
}

/** The database half of pickSharedClassroom. */
export async function resolveSharedClassroom(
  caller: RequestUser,
  studentId: string,
  requested?: string | null,
): Promise<string> {
  const [mine, theirs] = await Promise.all([
    staffClassroomIds(caller),
    listUserClassroomIds(studentId, 'student'),
  ]);
  return pickSharedClassroom(mine, theirs, requested);
}

/**
 * The students whose sketchbooks this staff member flips through: every TRACKED
 * student in the classrooms they teach, or in the one classroom asked for.
 *
 * Dormant students are left out (founder rule, 2026-09-13: a paused student
 * appears in no list and no count). This also feeds the Flip through inbox and
 * the sketchbook and drawing-review nav badges, so all three agree with the
 * Class rhythm screen. A dormant student's own sketchbook still opens from their
 * profile, because assertStaffSeesStudent is an access check, not a roster.
 *
 * `loadClassroomRoster(null, ...)` (every classroom) does not restrict to
 * active classrooms, only nexus_enrollments.is_active, so it cannot be used
 * as a one-shot internal-staff shortcut without pulling in archived
 * classrooms too. Every caller therefore goes through the same per-classroom
 * Promise.all as a teacher would, scoped to the active classrooms
 * staffClassroomIds already restricts internal staff to.
 */
export async function staffStudentIds(caller: RequestUser, classroomId: string | null): Promise<string[]> {
  const mine = await staffClassroomIds(caller);
  if (classroomId) {
    if (!mine.includes(classroomId)) throw new ApiError('You do not teach this classroom.', 403);
    const roster = await loadClassroomRoster(classroomId);
    return roster.ids;
  }
  const rosters = await Promise.all(mine.map((id) => loadClassroomRoster(id)));
  return [...new Set(rosters.flatMap((r) => r.ids))];
}

/** Nexus's own test, impersonation and parent tokens are not Microsoft's. */
export function isRealGraphToken(token: string | null): boolean {
  return !!token && !/^(test_|imp_|par_)/.test(token);
}

/** The delegated Graph bearer, or a 400 that says why Teams posting is off. */
export function realGraphToken(authHeader: string | null): string {
  const token = extractBearerToken(authHeader);
  if (!isRealGraphToken(token)) {
    throw new ApiError('Posting to Teams needs a Microsoft sign-in.', 400);
  }
  return token as string;
}
