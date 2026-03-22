import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import {
  upsertWatchSession,
  upsertWatchHistory,
} from '@neram/database/queries/nexus';

/**
 * POST /api/library/watch-session
 *
 * Upsert a watch session heartbeat.
 * Body: { session_id, video_id, watched_seconds, furthest_position, completion_pct,
 *         play_count, pause_count, seek_count, rewind_count, replay_segments, device_type }
 */
export async function POST(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient();

    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 401 });
    }

    const body = await request.json();
    const {
      session_id,
      video_id,
      watched_seconds,
      furthest_position,
      completion_pct,
      play_count,
      pause_count,
      seek_count,
      rewind_count,
      replay_segments,
      device_type,
    } = body;

    if (!session_id || !video_id) {
      return NextResponse.json(
        { error: 'Missing required fields: session_id, video_id' },
        { status: 400 },
      );
    }

    // Upsert the watch session
    const session = await upsertWatchSession(user.id, {
      id: session_id,
      video_id,
      watched_seconds: watched_seconds || 0,
      furthest_position_seconds: furthest_position || 0,
      completion_pct: completion_pct || 0,
      play_count: play_count || 0,
      pause_count: pause_count || 0,
      seek_count: seek_count || 0,
      rewind_count: rewind_count || 0,
      replay_segments: replay_segments || [],
      device_type: device_type || null,
    });

    // Also update watch history for resume position
    const completed = (completion_pct || 0) >= 90;
    await upsertWatchHistory({
      student_id: user.id,
      video_id,
      last_position_seconds: furthest_position || 0,
      total_watched_seconds: watched_seconds || 0,
      completed,
    });

    return NextResponse.json({ data: session });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to upsert watch session';
    console.error('Watch session POST error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
