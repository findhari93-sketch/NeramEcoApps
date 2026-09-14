import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import { getRequestUser } from '@/lib/study-materials';
import { ApiError, errorResponse } from '@/lib/api-errors';
import { staffClassroomIds } from '@/lib/sketchbook-access';
import { senderAppConfig } from '@/lib/teams-sender';

/**
 * GET    /api/teams/sender?classroom=<id>   (staff)  whose Teams sends this class's reminders
 * DELETE /api/teams/sender?classroom=<id>   (staff)  stop sending from my Teams
 *
 * Disconnecting forgets the caller's token entirely and clears every classroom
 * that named them, so nothing keeps sending as a teacher who said stop.
 */
export async function GET(request: NextRequest) {
  try {
    const caller = await getRequestUser(request.headers.get('Authorization'));
    const classroomId = request.nextUrl.searchParams.get('classroom') || '';
    const mine = await staffClassroomIds(caller);
    if (!classroomId || !mine.includes(classroomId)) throw new ApiError('You do not teach this classroom.', 403);

    const supabase = getSupabaseAdminClient() as any;
    const { data: room } = await supabase.from('nexus_classrooms').select('reminder_sender_id').eq('id', classroomId).maybeSingle();
    const senderId: string | null = room?.reminder_sender_id ?? null;
    const { data: sender } = senderId
      ? await supabase
          .from('nexus_teams_senders')
          .select('user_id, display_name, connected_at, last_used_at, last_error, revoked_at')
          .eq('user_id', senderId)
          .maybeSingle()
      : { data: null };

    return NextResponse.json(
      {
        available: senderAppConfig() !== null,
        sender: sender
          ? {
              isMe: sender.user_id === caller.id,
              name: sender.display_name,
              connectedAt: sender.connected_at,
              lastUsedAt: sender.last_used_at,
              working: !sender.revoked_at,
              problem: sender.revoked_at ? sender.last_error || 'The connection stopped working' : null,
            }
          : null,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err) {
    return errorResponse(err, 'Could not read the Teams connection');
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const caller = await getRequestUser(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient() as any;
    const { error: roomsError } = await supabase
      .from('nexus_classrooms')
      .update({ reminder_sender_id: null })
      .eq('reminder_sender_id', caller.id);
    if (roomsError) throw roomsError;
    const { error } = await supabase.from('nexus_teams_senders').delete().eq('user_id', caller.id);
    if (error) throw error;
    return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return errorResponse(err, 'Could not disconnect Teams');
  }
}
