import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { canUser } from '@/lib/staff-capabilities';
import { createTeamForClassroom } from '@/lib/teams-sync';

/**
 * POST /api/classrooms/[id]/teams-create
 * Create a new Teams team and link it to the classroom.
 * The requesting teacher becomes the team owner.
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

    // Creating the classroom's Microsoft Team is internal-team work.
    //
    // This previously gated on a teacher ENROLLMENT in the classroom, which
    // rejected an admin who happened not to be enrolled: the opposite of every
    // other route, where an admin manages any classroom. The capability check is
    // the consistent gate.
    if (!canUser(user, 'structure.classroom.teams_link')) {
      return NextResponse.json(
        { error: 'Only the Neram team can create the Teams team for a classroom.' },
        { status: 403 },
      );
    }

    // Get classroom details for team name
    const { data: classroom } = await supabase
      .from('nexus_classrooms')
      .select('name, description, ms_team_id')
      .eq('id', classroomId)
      .single();

    if (!classroom) {
      return NextResponse.json({ error: 'Classroom not found' }, { status: 404 });
    }

    if (classroom.ms_team_id) {
      return NextResponse.json({ error: 'Classroom already has a linked team' }, { status: 409 });
    }

    const teamId = await createTeamForClassroom(
      classroomId,
      classroom.name,
      classroom.description || '',
      msUser.oid
    );

    return NextResponse.json({
      teamId,
      teamName: classroom.name,
      message: 'Team created and linked successfully',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create team';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
