import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { getExamRecallDashboardStats } from '@neram/database/queries';

/**
 * GET /api/exam-recall/dashboard?classroom_id=...&exam_year=...
 *
 * Get dashboard stats for exam recall. Only teachers/admins.
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
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (!['teacher', 'admin'].includes(user.user_type ?? '')) {
      return NextResponse.json({ error: 'Forbidden: only teachers and admins can view dashboard stats' }, { status: 403 });
    }

    const params = request.nextUrl.searchParams;
    const classroomId = params.get('classroom_id');

    if (!classroomId) {
      return NextResponse.json({ error: 'Missing classroom_id parameter' }, { status: 400 });
    }

    const examYearParam = params.get('exam_year');
    const examYear = examYearParam ? parseInt(examYearParam, 10) : undefined;

    const stats = await getExamRecallDashboardStats(classroomId, examYear);

    return NextResponse.json(stats);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to get dashboard stats';
    console.error('[exam-recall/dashboard] GET error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
