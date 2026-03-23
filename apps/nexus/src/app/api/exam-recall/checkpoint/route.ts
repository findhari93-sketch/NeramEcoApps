import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { getCheckpointStatus } from '@neram/database/queries';

/**
 * GET /api/exam-recall/checkpoint?classroom_id=...&exam_date=...&session_number=...
 *
 * Get checkpoint status for the current user.
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

    const params = request.nextUrl.searchParams;
    const classroomId = params.get('classroom_id');
    const examDate = params.get('exam_date');
    const sessionNumber = params.get('session_number');

    if (!classroomId || !examDate || sessionNumber == null) {
      return NextResponse.json(
        { error: 'Missing required params: classroom_id, exam_date, session_number' },
        { status: 400 },
      );
    }

    const status = await getCheckpointStatus(
      user.id,
      classroomId,
      examDate,
      parseInt(sessionNumber, 10),
    );

    return NextResponse.json(status);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to get checkpoint status';
    console.error('[exam-recall/checkpoint] GET error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
