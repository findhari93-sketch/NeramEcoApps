// @ts-nocheck — course plan tables not yet in generated types
import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import {
  getSupabaseAdminClient,
  getCoursePlansByClassroom,
  createCoursePlan,
} from '@neram/database';

/**
 * GET /api/course-plans?classroom_id={id}
 * List plans for a classroom. Students only see active plans.
 */
export async function GET(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const classroomId = request.nextUrl.searchParams.get('classroom_id');

    if (!classroomId) {
      return NextResponse.json({ error: 'Missing classroom_id' }, { status: 400 });
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

    const { data: enrollment } = await supabase
      .from('nexus_enrollments')
      .select('role')
      .eq('user_id', user.id)
      .eq('classroom_id', classroomId)
      .eq('is_active', true)
      .single();

    if (!enrollment) {
      return NextResponse.json({ error: 'Not enrolled in this classroom' }, { status: 403 });
    }

    const plans = await getCoursePlansByClassroom(classroomId, supabase);

    // Students only see active plans
    const filtered = enrollment.role === 'student'
      ? plans.filter((p: any) => p.status === 'active')
      : plans;

    return NextResponse.json({ plans: filtered, role: enrollment.role });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load course plans';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/course-plans
 * Create a new course plan. Teacher-only.
 */
export async function POST(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const body = await request.json();
    const {
      classroom_id, name, description, duration_weeks,
      days_per_week, sessions_per_day, teaching_team,
    } = body;

    if (!classroom_id || !name || !duration_weeks) {
      return NextResponse.json({ error: 'Missing required fields: classroom_id, name, duration_weeks' }, { status: 400 });
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

    const { data: enrollment } = await supabase
      .from('nexus_enrollments')
      .select('role')
      .eq('user_id', user.id)
      .eq('classroom_id', classroom_id)
      .eq('is_active', true)
      .single();

    if (!enrollment || enrollment.role !== 'teacher') {
      return NextResponse.json({ error: 'Only teachers can create course plans' }, { status: 403 });
    }

    const plan = await createCoursePlan({
      classroom_id,
      name,
      description,
      duration_weeks,
      days_per_week: days_per_week || ['mon', 'tue', 'wed', 'thu', 'fri'],
      sessions_per_day: sessions_per_day || [{ slot: 'am', label: 'Morning' }],
      teaching_team,
      created_by: user.id,
    }, supabase);

    return NextResponse.json({ plan }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create course plan';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
