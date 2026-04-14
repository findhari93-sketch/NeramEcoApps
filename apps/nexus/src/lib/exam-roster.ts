import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Get the aggregated student roster across all classrooms the viewer shares.
 * This replaces classroom-specific student queries for exam data.
 *
 * A teacher sees ALL students from ALL classrooms they teach.
 * A student sees ALL students from ALL classrooms they are enrolled in.
 */
export async function getExamRoster(
  db: SupabaseClient,
  viewerUserId: string,
): Promise<{ studentIds: string[]; isTeacher: boolean }> {
  // Get all classrooms the viewer is enrolled in
  const { data: myEnrollments } = await (db as any)
    .from('nexus_enrollments')
    .select('classroom_id, role')
    .eq('user_id', viewerUserId)
    .eq('is_active', true);

  if (!myEnrollments || myEnrollments.length === 0) {
    return { studentIds: [], isTeacher: false };
  }

  const isTeacher = myEnrollments.some(
    (e: any) => e.role === 'teacher' || e.role === 'admin',
  );
  const classroomIds = myEnrollments.map((e: any) => e.classroom_id);

  // Get all unique student IDs across those classrooms
  const { data: allStudentEnrollments } = await (db as any)
    .from('nexus_enrollments')
    .select('user_id')
    .in('classroom_id', classroomIds)
    .eq('role', 'student')
    .eq('is_active', true);

  const studentIds = [
    ...new Set((allStudentEnrollments || []).map((e: any) => e.user_id)),
  ] as string[];

  return { studentIds, isTeacher };
}

/**
 * Get student names and academic year info for a list of student IDs.
 */
export async function getStudentInfo(
  db: SupabaseClient,
  studentIds: string[],
  classroomIds?: string[],
): Promise<{
  nameMap: Record<string, string>;
  academicYearMap: Record<string, string | null>;
}> {
  const nameMap: Record<string, string> = {};
  const academicYearMap: Record<string, string | null> = {};

  if (studentIds.length === 0) return { nameMap, academicYearMap };

  const { data: users } = await db
    .from('users')
    .select('id, first_name, last_name, name')
    .in('id', studentIds);

  for (const u of users || []) {
    nameMap[u.id] =
      u.first_name && u.last_name
        ? `${u.first_name} ${u.last_name}`
        : u.name || 'Unknown';
  }

  // Get academic year from onboarding (use any classroom)
  if (classroomIds && classroomIds.length > 0) {
    const { data: onboarding } = await (db as any)
      .from('nexus_student_onboarding')
      .select('student_id, academic_year')
      .in('classroom_id', classroomIds)
      .in('student_id', studentIds);

    for (const o of onboarding || []) {
      if (!academicYearMap[o.student_id]) {
        academicYearMap[o.student_id] = o.academic_year;
      }
    }
  }

  return { nameMap, academicYearMap };
}
