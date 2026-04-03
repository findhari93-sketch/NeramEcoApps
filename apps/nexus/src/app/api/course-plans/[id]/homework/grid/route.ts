// @ts-nocheck — course plan tables not yet in generated types
import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import {
  getSupabaseAdminClient,
  getHomeworkGradingGrid,
} from '@neram/database';

/**
 * GET /api/course-plans/[id]/homework/grid
 * Grading grid data. Teacher-only.
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

    // Get plan to find classroom
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
      return NextResponse.json({ error: 'Only teachers can view the grading grid' }, { status: 403 });
    }

    const grid = await getHomeworkGradingGrid(planId, plan.classroom_id, supabase);

    return NextResponse.json(grid);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load grading grid';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
