import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { recordWatchReport } from '@/lib/recap-watch-record';
import { errorResponse } from '@/lib/api-errors';

/**
 * POST /api/student/class-recaps/[recapId]/progress
 *
 * Watch heartbeat: every 30 seconds of playback, on pause, on a passed
 * checkpoint, and on the way out of the page.
 *
 * The current player sends cumulative totals for its viewing session (v2, see
 * lib/watch-ledger.ts), which the server turns into credited seconds and the
 * stretches actually played, so a lost request costs nothing. A page still on
 * the previous build sends deltas and takes the old path (recap-watch-record.ts).
 *
 * The ?token= query parameter is legacy. It exists because navigator.sendBeacon
 * cannot set headers, but a Microsoft access token in a URL leaks into access
 * logs and Referer headers, so the client now uses fetch with keepalive and a
 * normal Authorization header instead.
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
    const result = await recordWatchReport(supabase, user.id, recapId, body);
    return NextResponse.json(result);
  } catch (err) {
    return errorResponse(err, 'Failed to save progress');
  }
}
