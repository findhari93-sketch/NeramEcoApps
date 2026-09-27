/**
 * Shared gate for the staff lifecycle routes (api/students/[id]/activity and
 * api/students/[id]/lifecycle).
 *
 * They authorise exactly like the core profile route (api/students/[id]):
 * a verified caller holding `coord.student.view`, a `classroom` parameter, and
 * a student row enrolled in that classroom. Anything else is a 400 or 404, so
 * these routes cannot be used to read the history of someone who is not on the
 * roster the caller is looking at.
 */
import { NextRequest } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import { ApiError, throwIfReadFailed } from '@/lib/api-errors';
import { assertCapability, getRequestUser, type RequestUser } from '@/lib/study-materials';

export async function authoriseStudentLifecycleRead(
  request: NextRequest,
  studentId: string,
): Promise<{ caller: RequestUser; classroomId: string }> {
  const caller = await getRequestUser(request.headers.get('Authorization'));
  assertCapability(caller, 'coord.student.view');

  const classroomId = request.nextUrl.searchParams.get('classroom');
  if (!classroomId) throw new ApiError('Missing classroom parameter', 400);

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('nexus_enrollments')
    .select('user_id')
    .eq('classroom_id', classroomId)
    .eq('user_id', studentId)
    .eq('role', 'student')
    .limit(1)
    .maybeSingle();
  throwIfReadFailed(error, 'the enrolment');
  if (!data) throw new ApiError('Student not enrolled in this classroom', 404);

  return { caller, classroomId };
}
