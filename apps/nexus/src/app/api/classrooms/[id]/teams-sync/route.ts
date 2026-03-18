import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
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

    // Verify teacher role
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const { data: enrollment } = await supabase
      .from('nexus_enrollments')
      .select('role')
      .eq('user_id', user.id)
      .eq('classroom_id', classroomId)
      .single();

    if (!enrollment || enrollment.role !== 'teacher') {
      return NextResponse.json({ error: 'Only teachers can sync Teams members' }, { status: 403 });
    }

    const result = await syncClassroomToTeam(classroomId);

    return NextResponse.json({ result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Teams sync failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
