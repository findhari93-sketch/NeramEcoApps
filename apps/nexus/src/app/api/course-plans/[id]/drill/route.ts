// @ts-nocheck — course plan tables not yet in generated types
import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import {
  getSupabaseAdminClient,
  getDrillQuestions,
  getAllDrillQuestions,
  createDrillQuestion,
  updateDrillQuestion,
} from '@neram/database';

/**
 * GET /api/course-plans/[id]/drill
 * Students get active-only drill questions; teachers get all.
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

    // Get plan to verify enrollment
    const { data: plan } = await supabase
      .from('nexus_course_plans')
      .select('classroom_id')
      .eq('id', planId)
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

    if (!enrollment) {
      return NextResponse.json({ error: 'Not enrolled in this classroom' }, { status: 403 });
    }

    const drills = enrollment.role === 'teacher'
      ? await getAllDrillQuestions(planId, supabase)
      : await getDrillQuestions(planId, supabase);

    return NextResponse.json({ drills, role: enrollment.role });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load drill questions';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/course-plans/[id]/drill
 * Create or update a drill question. Teacher-only.
 * If body has `drill_id`, updates. Otherwise creates.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: planId } = await params;
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const body = await request.json();
    const { drill_id, ...data } = body;
    const supabase = getSupabaseAdminClient();

    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Get plan to verify teacher role
    const { data: plan } = await supabase
      .from('nexus_course_plans')
      .select('classroom_id')
      .eq('id', planId)
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
      return NextResponse.json({ error: 'Only teachers can manage drill questions' }, { status: 403 });
    }

    let drill;
    if (drill_id) {
      drill = await updateDrillQuestion(drill_id, data, supabase);
    } else {
      drill = await createDrillQuestion({
        plan_id: planId,
        ...data,
      }, supabase);
    }

    return NextResponse.json({ drill }, { status: drill_id ? 200 : 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save drill question';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
