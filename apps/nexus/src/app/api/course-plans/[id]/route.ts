// @ts-nocheck — course plan tables not yet in generated types
import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import {
  getSupabaseAdminClient,
  getCoursePlanById,
  updateCoursePlan,
} from '@neram/database';

/**
 * GET /api/course-plans/[id]
 * Get plan detail. Verify enrollment in plan's classroom.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: planId } = await params;
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

    const plan = await getCoursePlanById(planId, supabase);

    if (!plan) {
      return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
    }

    // Verify enrollment in plan's classroom
    const { data: enrollment } = await supabase
      .from('nexus_enrollments')
      .select('role')
      .eq('user_id', user.id)
      .eq('classroom_id', plan.classroom_id)
      .eq('is_active', true)
      .single();

    if (!enrollment) {
      return NextResponse.json({ error: 'Not enrolled in this classroom' }, { status: 403 });
    }

    return NextResponse.json({ plan, role: enrollment.role });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load course plan';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * PUT /api/course-plans/[id]
 * Update plan. Teacher-only.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: planId } = await params;
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const body = await request.json();
    const supabase = getSupabaseAdminClient();

    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Get the plan to find its classroom
    const { data: existingPlan } = await supabase
      .from('nexus_course_plans')
      .select('classroom_id')
      .eq('id', planId)
      .single();

    if (!existingPlan) {
      return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
    }

    const { data: enrollment } = await supabase
      .from('nexus_enrollments')
      .select('role')
      .eq('user_id', user.id)
      .eq('classroom_id', existingPlan.classroom_id)
      .eq('is_active', true)
      .single();

    if (!enrollment || enrollment.role !== 'teacher') {
      return NextResponse.json({ error: 'Only teachers can update course plans' }, { status: 403 });
    }

    const plan = await updateCoursePlan(planId, body, supabase);

    return NextResponse.json({ plan });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update course plan';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
