import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import { recordWatchReport } from '@/lib/recap-watch-record';
import { getRequestUser } from '@/lib/study-materials';
import { assertCanSeeTrack, trackErrorResponse } from '@/lib/study-video-access';

/**
 * POST /api/student/study-videos/tracks/[trackId]/progress
 *
 * Where the student got to, and how much of it they actually watched.
 *
 * The same ledger the class recaps use (lib/recap-watch-record.ts): position is
 * GREATEST-monotonic, credited seconds are capped by real elapsed time so a
 * tab left open cannot manufacture watch time, the stretches actually played
 * are kept, and a completed track is never knocked back to in_progress.
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
    // `as any`: nexus_class_recap* tables and RPCs are absent from
    // database.generated.ts. Same convention as class-recaps.ts and the recap
    // routes; regenerating mid-feature would churn every @ts-nocheck file.
    const supabase = getSupabaseAdminClient() as any;
    const result = await recordWatchReport(supabase, user.id, params.trackId, body);
    return NextResponse.json(result);
  } catch (err) {
    const { error, status } = trackErrorResponse(err);
    return NextResponse.json({ error }, { status });
  }
}
