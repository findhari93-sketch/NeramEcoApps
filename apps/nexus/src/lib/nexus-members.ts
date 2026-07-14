/**
 * Nexus membership source of truth for admin management screens.
 *
 * Why this lives in apps/nexus (not packages/database): the admin Users screen
 * must list only people who belong to Nexus, not the whole ecosystem users table
 * (which also holds marketing leads and Tools-app signups). Editing a shared
 * package would rebuild all 4 apps, so we keep this scoped to Nexus, mirroring
 * geo-students.ts.
 *
 * A "Nexus member" is defined exactly as /api/auth/me enforces access:
 *   (A) staff:   users.user_type IN ('teacher','admin')
 *   (B) student: users.user_type = 'student' AND users.is_alumni = false
 *                AND an ACTIVE enrollment (nexus_enrollments.is_active = true,
 *                role = 'student') in an ACTIVE classroom (nexus_classrooms.is_active = true)
 * Alumni and leads are excluded. This gives the Users list exact parity with the
 * teacher Students screens.
 */
import { getSupabaseAdminClient } from '@neram/database';

/**
 * Resolve the set of user ids that belong to Nexus (staff UNION active-access
 * students). Returns a de-duplicated array of user ids.
 */
export async function getNexusMemberUserIds(): Promise<string[]> {
  const supabase = getSupabaseAdminClient() as any;

  // (A) Staff: teachers + admins, but only those with a real Microsoft/Entra
  // identity ("licensed" staff). We exclude rows with no ms_oid (e.g. the local
  // admin@test.com seed) and the synthetic `test-oid-*` accounts the Playwright
  // test-login route creates, so only genuine licensed teachers/admins show.
  const { data: staff, error: staffErr } = await supabase
    .from('users')
    .select('id, ms_oid')
    .in('user_type', ['teacher', 'admin']);

  if (staffErr) {
    console.error('getNexusMemberUserIds: staff query failed', staffErr);
    return [];
  }

  const isLicensedStaff = (ms_oid: string | null | undefined): boolean =>
    !!ms_oid && !ms_oid.startsWith('test-oid-');

  // (B) Active-access students. Archiving a classroom must drop its students.
  const { data: classrooms, error: classErr } = await supabase
    .from('nexus_classrooms')
    .select('id')
    .eq('is_active', true);

  if (classErr) {
    console.error('getNexusMemberUserIds: classrooms query failed', classErr);
    return [];
  }
  const classroomIds = (classrooms || []).map((c: any) => c.id);

  const ids = new Set<string>(
    (staff || []).filter((s: any) => isLicensedStaff(s.ms_oid)).map((s: any) => s.id),
  );

  if (classroomIds.length > 0) {
    // Active student enrollments in those classrooms, non-alumni students only.
    const { data: enrollments, error: enrErr } = await supabase
      .from('nexus_enrollments')
      .select('user_id, user:users!nexus_enrollments_user_id_fkey!inner(id, is_alumni, user_type)')
      .eq('is_active', true)
      .eq('role', 'student')
      .in('classroom_id', classroomIds)
      .eq('users.is_alumni', false)
      .eq('users.user_type', 'student');

    if (enrErr) {
      console.error('getNexusMemberUserIds: enrollments query failed', enrErr);
      return [];
    }
    for (const e of enrollments || []) {
      if (e.user_id) ids.add(e.user_id);
    }
  }

  return Array.from(ids);
}
