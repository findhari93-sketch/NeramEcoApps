import {
  getCurrentBatch,
  enrollUserInDefaultClassroom,
} from '@neram/database';
import { addStudentToClassroomTeams } from '@neram/auth';

/**
 * Shared "put this student in the single classroom" helper used by the admin
 * flows that create or (re)assign current-batch students. Kept in the app layer
 * (not @neram/database) so the Microsoft Graph calls stay out of the DB package.
 *
 * Enrolls the user into the one active classroom (type='common'), then best-effort
 * syncs their Microsoft Team + global group-chat membership. Never throws; returns
 * a small result the caller can log or surface.
 */
export async function syncUserToDefaultClassroom(
  supabase: any,
  userId: string,
  source = 'enroll'
): Promise<{ success: boolean; classroomId?: string; sync?: any; error?: string }> {
  try {
    const { classroom } = await enrollUserInDefaultClassroom(userId, {}, supabase);

    // Resolve the student's Teams email (UPN) for the Graph adds. Prefer the
    // provisioned ms_teams_email; fall back to the linked classroom email / primary.
    const { data: profile } = await supabase
      .from('student_profiles')
      .select('ms_teams_email')
      .eq('user_id', userId)
      .maybeSingle();
    const { data: user } = await supabase
      .from('users')
      .select('email, linked_classroom_email')
      .eq('id', userId)
      .maybeSingle();
    const upn = profile?.ms_teams_email || user?.linked_classroom_email || user?.email || null;

    const sync = await addStudentToClassroomTeams(supabase, {
      classroomId: classroom.id,
      userId,
      upn,
      source,
    });
    return { success: true, classroomId: classroom.id, sync };
  } catch (err: any) {
    return { success: false, error: err?.message || 'unknown_error' };
  }
}

/** True when the given YYYY-YY year is the admin-set current registry batch. */
export async function isCurrentBatch(supabase: any, academicYear: string): Promise<boolean> {
  try {
    const code = (await getCurrentBatch(supabase)).code;
    return !!code && code === academicYear;
  } catch {
    return false;
  }
}
