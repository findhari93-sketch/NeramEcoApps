import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { getDashboardGamification } from '@neram/database/queries/nexus';

/**
 * GET /api/gamification/dashboard?classroom_id={id}
 *
 * Returns dashboard widget data:
 * - Top 3 this week
 * - Current user's rank
 * - Recent badge feed
 */
export async function GET(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));

    const classroomId = request.nextUrl.searchParams.get('classroom_id');
    if (!classroomId) {
      return NextResponse.json({ error: 'Missing classroom_id' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient();
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const dashboard = await getDashboardGamification(classroomId, user.id);
    return NextResponse.json(dashboard);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load gamification dashboard';
    console.error('Gamification dashboard error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
