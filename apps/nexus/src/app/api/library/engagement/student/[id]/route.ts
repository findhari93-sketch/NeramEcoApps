import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { getStudentEngagement } from '@neram/database/queries/nexus';

/**
 * GET /api/library/engagement/student/[id]
 *
 * Per-student engagement detail.
 * Query param: period (daily/weekly/monthly/all)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
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

    // Only teachers and admins can view student engagement
    if (user.user_type !== 'teacher' && user.user_type !== 'admin') {
      return NextResponse.json({ error: 'Forbidden: teacher/admin only' }, { status: 403 });
    }

    const { id: studentId } = await params;
    const period = (request.nextUrl.searchParams.get('period') as 'daily' | 'weekly' | 'monthly' | 'all') || 'weekly';

    const engagement = await getStudentEngagement(studentId, period);

    return NextResponse.json({ data: engagement });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load student engagement';
    console.error('Student engagement GET error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
