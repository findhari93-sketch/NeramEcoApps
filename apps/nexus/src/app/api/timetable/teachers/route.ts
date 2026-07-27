import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import { getRequestUser, assertStaff } from '@/lib/study-materials';
import { canTutor } from '@/lib/staff-capabilities';
import { errorResponse } from '@/lib/api-errors';

/**
 * GET /api/timetable/teachers
 *
 * Staff eligible to be the "Teacher (tutor)" of a class, for the picker in the
 * class scheduler. Any staff member may call.
 *
 * Eligibility is `can_teach`, NOT the authority tier: an office manager holds
 * every other manager power but never stands in front of a class, so they must
 * not appear here. A visiting teacher does appear. See @/lib/staff-capabilities.
 *
 * `isSelf` flags the caller so the dialog can default the tutor to whoever is
 * scheduling, but only when that person is themselves eligible.
 *
 * Excluded: identity-less rows, test-login seeds (test-oid-*, present for real
 * because local E2E runs write to the real database), and disabled accounts.
 *
 * This is only the picker. The authoritative check is assertCanTutor() on every
 * write to nexus_scheduled_classes.teacher_id, so hiding someone here is a
 * convenience and not the enforcement point.
 */
export async function GET(request: NextRequest) {
  try {
    const caller = await getRequestUser(request.headers.get('Authorization'));
    assertStaff(caller);

    const supabase = getSupabaseAdminClient() as any;

    const { data: staff, error } = await supabase
      .from('users')
      .select('id, name, email, avatar_url, ms_oid, user_type, staff_role, can_teach, is_disabled')
      .in('user_type', ['teacher', 'admin'])
      .order('name', { ascending: true });

    if (error) throw error;

    const teachers = (staff || [])
      .filter(
        (s: any) =>
          s.email &&
          s.ms_oid &&
          !String(s.ms_oid).startsWith('test-oid-') &&
          s.is_disabled !== true &&
          canTutor(s),
      )
      .map((s: any) => ({
        id: s.id,
        name: s.name || s.email,
        email: s.email,
        avatar_url: s.avatar_url || null,
        user_type: s.user_type,
        staff_role: s.staff_role,
        isSelf: s.id === caller.id,
      }));

    return NextResponse.json({ teachers });
  } catch (err) {
    return errorResponse(err, 'Failed to load teachers');
  }
}
