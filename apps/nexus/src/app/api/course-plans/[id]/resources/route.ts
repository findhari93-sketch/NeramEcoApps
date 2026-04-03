// @ts-nocheck — course plan tables not yet in generated types
import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import {
  getSupabaseAdminClient,
  getResourcesByPlan,
  createResource,
} from '@neram/database';

/**
 * GET /api/course-plans/[id]/resources?topic_id={topicId}&session_id={sessionId}
 * List resources for a plan with optional filters.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: planId } = await params;
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const topicId = request.nextUrl.searchParams.get('topic_id') || undefined;
    const sessionId = request.nextUrl.searchParams.get('session_id') || undefined;
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

    const resources = await getResourcesByPlan(planId, {
      topic_id: topicId,
      session_id: sessionId,
    }, supabase);

    return NextResponse.json({ resources, role: enrollment.role });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load resources';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/course-plans/[id]/resources
 * Create a resource. Teacher-only.
 */
export async function POST(
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
      return NextResponse.json({ error: 'Only teachers can create resources' }, { status: 403 });
    }

    const resource = await createResource({
      plan_id: planId,
      ...body,
    }, supabase);

    return NextResponse.json({ resource }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create resource';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
