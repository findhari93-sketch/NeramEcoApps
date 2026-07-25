import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { createChannelForClassroom } from '@/lib/teams-sync';

/**
 * POST /api/classrooms/[id]/teams-channel
 * Create a channel inside the classroom's linked Team and link it to the classroom.
 * Scheduled-meeting announcements for this classroom then post to this channel.
 * Body: { name: string }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: classroomId } = await params;
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient();

    // Verify caller
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
      return NextResponse.json({ error: 'Only teachers can create channels' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) {
      return NextResponse.json({ error: 'Channel name is required' }, { status: 400 });
    }

    const { data: classroom } = await supabase
      .from('nexus_classrooms')
      .select('ms_team_id')
      .eq('id', classroomId)
      .single();

    if (!classroom) {
      return NextResponse.json({ error: 'Classroom not found' }, { status: 404 });
    }
    if (!classroom.ms_team_id) {
      return NextResponse.json(
        { error: 'Link a Microsoft Team to this classroom before creating a channel' },
        { status: 409 }
      );
    }

    const { channelId, channelName } = await createChannelForClassroom(
      classroomId,
      classroom.ms_team_id,
      name
    );

    return NextResponse.json({ channelId, channelName, message: 'Channel created and linked' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create channel';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
