import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { updateCampaignStudentStatus } from '@neram/database';

/**
 * POST /api/student/review-tasks/complete
 * Body: { task_id, screenshot_url? }
 *
 * Student self-reports that they completed a review.
 */
export async function POST(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient() as any;

    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 401 });
    }

    const body = await request.json();
    const { task_id, screenshot_url } = body;

    if (!task_id) {
      return NextResponse.json({ error: 'task_id required' }, { status: 400 });
    }

    // Verify this task belongs to the student
    const { data: task } = await supabase
      .from('review_campaign_students')
      .select('student_id')
      .eq('id', task_id)
      .single();

    if (!task || task.student_id !== user.id) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    const result = await updateCampaignStudentStatus(task_id, {
      status: 'completed',
      screenshot_url: screenshot_url || undefined,
    });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to complete';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
