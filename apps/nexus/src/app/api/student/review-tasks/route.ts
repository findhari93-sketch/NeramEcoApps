import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { getStudentReviewTasks } from '@neram/database';

/**
 * GET /api/student/review-tasks
 *
 * Get pending review tasks for the authenticated student.
 */
export async function GET(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient() as any;

    // Get user ID from MS OID
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 401 });
    }

    const tasks = await getStudentReviewTasks(user.id);
    return NextResponse.json({ tasks });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load tasks';
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
