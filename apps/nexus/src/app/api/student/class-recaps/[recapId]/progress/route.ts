import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient, upsertRecapProgress } from '@neram/database';

/**
 * POST /api/student/class-recaps/[recapId]/progress
 * Lightweight resume heartbeat. Body: { last_video_position_seconds }
 * Accepts a ?token= for navigator.sendBeacon on unload.
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
    const pos = Number(body.last_video_position_seconds);
    await upsertRecapProgress(user.id, recapId, {
      last_video_position_seconds: Number.isFinite(pos) ? Math.max(0, Math.round(pos)) : 0,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save progress';
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
