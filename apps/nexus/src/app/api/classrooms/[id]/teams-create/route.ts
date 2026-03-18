import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
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
      return NextResponse.json({ error: 'Only teachers can create Teams teams' }, { status: 403 });
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
