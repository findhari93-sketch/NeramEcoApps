import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { isStaffRoleAny, resolveStaffRole } from '@/lib/staff-capabilities';

/**
 * POST /api/timetable/[classId]/prewatch/[resourceId]/progress
 *
 * The watch heartbeat for one "watch before class" video. Takes exactly what
 * useVideoProgress sends every 30 seconds and on pause:
 *   { last_video_position_seconds, watched_delta_seconds, duration_seconds }
 *
 * All the rules live in the nexus_bump_class_video_view RPC, in one round trip:
 * the attachment must sit on this class, the student must be actively enrolled
 * in its classroom, the delta is capped, and "watched" is 80 percent of real
 * playback. A request that fails a check is dropped silently, like a stale
 * beacon, so this answers 200 either way.
 *
 * Staff watching to check a video are not students and are not recorded.
 */

interface Ctx {
  params: { classId: string; resourceId: string };
}

function int(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
}

export async function POST(request: NextRequest, { params }: Ctx) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient() as any;

    const { data: user } = await supabase
      .from('users')
      .select('id, user_type, staff_role, can_teach')
      .eq('ms_oid', msUser.oid)
      .maybeSingle();
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    if (isStaffRoleAny(resolveStaffRole(user))) return NextResponse.json({ ok: true, recorded: false });

    const body = await request.json().catch(() => ({}));
    const { error } = await supabase.rpc('nexus_bump_class_video_view', {
      p_student: user.id,
      p_class: params.classId,
      p_resource: params.resourceId,
      p_pos: int(body?.last_video_position_seconds),
      p_watched_delta: int(body?.watched_delta_seconds),
      p_duration: int(body?.duration_seconds),
    });
    if (error) throw error;

    return NextResponse.json({ ok: true, recorded: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : (err as any)?.message || 'Failed to save progress';
    if (/Missing or invalid Authorization/.test(message)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[prewatch/progress] error:', message);
    return NextResponse.json({ error: 'Could not save progress' }, { status: 500 });
  }
}
