import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { getEngagementDashboard } from '@neram/database/queries/nexus';

/**
 * GET /api/library/engagement/dashboard
 *
 * Teacher engagement dashboard.
 * Query params: classroom, period (daily/weekly/monthly/all)
 */
export async function GET(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient();

    const { data: user } = await supabase
      .from('users')
      .select('id, user_type')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 401 });
    }

    // Only teachers and admins can view the engagement dashboard
    if (user.user_type !== 'teacher' && user.user_type !== 'admin') {
      return NextResponse.json({ error: 'Forbidden: teacher/admin only' }, { status: 403 });
    }

    const params = request.nextUrl.searchParams;
    const classroomId = params.get('classroom') || undefined;
    const period = (params.get('period') as 'daily' | 'weekly' | 'monthly' | 'all') || 'weekly';

    const dashboard = await getEngagementDashboard({
      classroomId,
      period,
    });

    return NextResponse.json({ data: dashboard });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load engagement dashboard';
    console.error('Engagement dashboard GET error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
