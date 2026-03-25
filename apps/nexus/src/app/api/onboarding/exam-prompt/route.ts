import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import {
  getExamPlansNeedingPrompt,
  updateExamPlanPrompt,
} from '@neram/database/queries/nexus';

/**
 * GET /api/onboarding/exam-prompt?classroom=<id>
 * Check if student has exam plans that need prompting
 */
export async function GET(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient();

    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const classroomId = request.nextUrl.searchParams.get('classroom');
    if (!classroomId) {
      return NextResponse.json({ error: 'classroom param required' }, { status: 400 });
    }

    const plansNeedingPrompt = await getExamPlansNeedingPrompt(user.id, classroomId);

    return NextResponse.json({ plans: plansNeedingPrompt });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to check exam prompts';
    console.error('Exam prompt GET error:', message);
    return NextResponse.json({ error: message }, { status: 401 });
  }
}

/**
 * POST /api/onboarding/exam-prompt
 * Respond to an exam prompt
 * Body: { plan_id, action: 'applied' | 'planning' | 'snooze' | 'not_writing', application_number? }
 */
export async function POST(request: NextRequest) {
  try {
    await verifyMsToken(request.headers.get('Authorization'));

    const body = await request.json();
    const { plan_id, action, application_number } = body;

    if (!plan_id || !action) {
      return NextResponse.json({ error: 'plan_id and action required' }, { status: 400 });
    }

    if (!['applied', 'planning', 'snooze', 'not_writing'].includes(action)) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    await updateExamPlanPrompt(plan_id, action, { application_number });

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update exam prompt';
    console.error('Exam prompt POST error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
