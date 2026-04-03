// @ts-nocheck — course plan tables not yet in generated types
import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import {
  getSupabaseAdminClient,
  reviewHomework,
} from '@neram/database';

/**
 * POST /api/course-plans/homework/[hwId]/review
 * Teacher review of a homework submission.
 * Body: { submission_id, points_earned?, teacher_feedback?, status }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ hwId: string }> }
) {
  try {
    const { hwId: homeworkId } = await params;
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const body = await request.json();
    const { submission_id, points_earned, teacher_feedback, status } = body;

    if (!submission_id) {
      return NextResponse.json({ error: 'Missing submission_id' }, { status: 400 });
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

    // Get homework to verify teacher role
    const { data: homework } = await supabase
      .from('nexus_course_plan_homework')
      .select('plan_id')
      .eq('id', homeworkId)
      .single();

    if (!homework) {
      return NextResponse.json({ error: 'Homework not found' }, { status: 404 });
    }

    const { data: plan } = await supabase
      .from('nexus_course_plans')
      .select('classroom_id')
      .eq('id', homework.plan_id)
      .single();

    if (!plan) {
      return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
    }

    const { data: enrollment } = await supabase
      .from('nexus_enrollments')
      .select('role')
      .eq('user_id', user.id)
      .eq('classroom_id', plan.classroom_id)
      .eq('is_active', true)
      .single();

    if (!enrollment || enrollment.role !== 'teacher') {
      return NextResponse.json({ error: 'Only teachers can review homework' }, { status: 403 });
    }

    const submission = await reviewHomework(submission_id, user.id, {
      points_earned,
      teacher_feedback,
      status: status || 'reviewed',
    }, supabase);

    return NextResponse.json({ submission });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to review homework';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
