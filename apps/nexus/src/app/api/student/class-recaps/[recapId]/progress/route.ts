import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient, upsertRecapProgress } from '@neram/database';

/**
 * POST /api/student/class-recaps/[recapId]/progress
 *
 * Watch heartbeat, roughly every 10 seconds of playback plus on pause, on a
 * passed checkpoint, and on the way out of the page.
 * Body: { last_video_position_seconds, watched_delta_seconds, duration_seconds }
 *
 * Writes through nexus_bump_recap_progress so positions only ever move forward
 * and watched_seconds accumulates under a per-call cap. Doing it in the database
 * matters because these arrive concurrently: a keepalive flush fired on unload
 * regularly overlaps the interval flush that preceded it, and a read-modify-write
 * would let the older number win.
 *
 * The ?token= query parameter is legacy. It exists because navigator.sendBeacon
 * cannot set headers, but a Microsoft access token in a URL leaks into access
 * logs and Referer headers, so the client now uses fetch with keepalive and a
 * normal Authorization header instead. Kept working for one release only.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ recapId: string }> },
) {
  try {
    const authHeader = request.headers.get('Authorization');
    const queryToken = request.nextUrl.searchParams.get('token');
    const msUser = await verifyMsToken(authHeader || (queryToken ? `Bearer ${queryToken}` : null));

    const { recapId } = await params;
    const supabase = getSupabaseAdminClient() as any;
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('ms_oid', msUser.oid)
      .single();
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const body = await request.json().catch(() => ({}));
    const num = (v: unknown) => {
      const n = Number(v);
      return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
    };
    const pos = num(body.last_video_position_seconds);
    const watchedDelta = num(body.watched_delta_seconds);
    const duration = num(body.duration_seconds);

    const { error: rpcErr } = await supabase.rpc('nexus_bump_recap_progress', {
      p_student: user.id,
      p_recap: recapId,
      p_pos: pos,
      p_watched_delta: watchedDelta,
      p_duration: duration,
    });

    if (rpcErr) {
      // Covers the window between this code deploying and the migration landing.
      // Loses only the monotonic guarantee, which is no worse than the behaviour
      // this route had before the RPC existed.
      console.warn('[recap-progress] RPC unavailable, falling back:', rpcErr.message);
      await upsertRecapProgress(user.id, recapId, {
        last_video_position_seconds: pos,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save progress';
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
