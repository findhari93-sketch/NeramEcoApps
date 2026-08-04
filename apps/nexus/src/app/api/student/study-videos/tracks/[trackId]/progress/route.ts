import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient, upsertRecapProgress } from '@neram/database';
import { getRequestUser } from '@/lib/study-materials';
import { assertCanSeeTrack, trackErrorResponse } from '@/lib/study-video-access';

/**
 * POST /api/student/study-videos/tracks/[trackId]/progress
 *
 * Where the student got to, and how much of it they actually watched.
 *
 * Straight through to nexus_bump_recap_progress, the same RPC the class recaps
 * use: position is GREATEST-monotonic, watched_seconds accumulates with a 60
 * second per-call cap so a tab left open cannot manufacture watch time, and a
 * completed track is never knocked back to in_progress.
 *
 * watched_seconds matters more than position here. A student who drags the
 * scrubber to the end moves position and leaves watched_seconds at zero, which
 * is exactly what any "did they really watch it" report has to read.
 */
export async function POST(request: NextRequest, { params }: { params: { trackId: string } }) {
  try {
    const user = await getRequestUser(request.headers.get('Authorization'));
    await assertCanSeeTrack(user, params.trackId);

    const body = await request.json().catch(() => ({}));
    const position = Math.max(0, Math.round(Number(body.last_video_position_seconds) || 0));
    const watched = Math.max(0, Math.round(Number(body.watched_delta_seconds) || 0));
    const duration = Math.max(0, Math.round(Number(body.duration_seconds) || 0));
    // Capped: this is a client-reported counter, and an honest flush carries a
    // handful at most. Without a bound a broken client could inflate a student's
    // record into something a tutor would act on.
    const blocked = Math.min(50, Math.max(0, Math.round(Number(body.blocked_seeks_delta) || 0)));

    // `as any`: nexus_class_recap* tables and RPCs are absent from
    // database.generated.ts. Same convention as class-recaps.ts and the recap
    // routes; regenerating mid-feature would churn every @ts-nocheck file.
    const supabase = getSupabaseAdminClient() as any;
    const { error } = await supabase.rpc('nexus_bump_recap_progress', {
      p_student: user.id,
      p_recap: params.trackId,
      p_pos: position,
      p_watched_delta: watched,
      p_duration: duration,
    });

    // The RPC is the fast path, not the only one. An older database without it
    // must still record a position rather than silently lose the watch.
    if (error) {
      await upsertRecapProgress(user.id, params.trackId, {
        last_video_position_seconds: position,
      });
    }

    // Separate from the RPC on purpose (see 20260820090200). `col = col + n` is
    // a single atomic statement, so two flushes racing cannot lose a count.
    if (blocked > 0) {
      await supabase.rpc('nexus_increment_blocked_seeks', {
        p_student: user.id,
        p_recap: params.trackId,
        p_delta: blocked,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const { error, status } = trackErrorResponse(err);
    return NextResponse.json({ error }, { status });
  }
}
