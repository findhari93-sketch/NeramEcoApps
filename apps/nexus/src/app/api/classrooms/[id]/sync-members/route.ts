import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { syncClassroomToTeam } from '@/lib/teams-sync';

/**
 * POST /api/classrooms/[id]/sync-members
 * Trigger a full member sync from Nexus enrollments to the linked Teams team.
 * Teacher-only.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient();

    // Verify teacher/admin role
    const { data: user } = await supabase
      .from('users')
      .select('id, user_type')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user || !['teacher', 'admin'].includes(user.user_type || '')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Verify classroom has a linked team
    const { data: classroom } = await supabase
      .from('nexus_classrooms')
      .select('ms_team_id, name')
      .eq('id', id)
      .single();

    if (!classroom?.ms_team_id) {
      return NextResponse.json(
        { error: 'This classroom has no linked Teams team' },
        { status: 400 }
      );
    }

    const result = await syncClassroomToTeam(id);

    return NextResponse.json({
      message: `Synced members to "${classroom.name}" Teams team`,
      ...result,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to sync members';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
