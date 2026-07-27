import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { canUser } from '@/lib/staff-capabilities';
import { syncClassroomToTeam } from '@/lib/teams-sync';

/**
 * POST /api/classrooms/[id]/teams-sync
 * Full sync: reconcile Nexus enrollments with Teams team members.
 * Only teachers can trigger this.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: classroomId } = await params;
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient();

    const { data: user } = await supabase
      .from('users')
      .select('id, user_type, staff_role, can_teach')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Same fix as teams-create: gate on the capability, not on holding a teacher
    // enrollment in this specific classroom, so an admin is not rejected.
    if (!canUser(user, 'structure.classroom.teams_link')) {
      return NextResponse.json(
        { error: 'Only the Neram team can sync Teams members.' },
        { status: 403 },
      );
    }

    const result = await syncClassroomToTeam(classroomId);

    return NextResponse.json({ result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Teams sync failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
