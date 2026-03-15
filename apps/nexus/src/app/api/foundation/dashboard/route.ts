import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { getFoundationDashboard } from '@neram/database/queries/nexus';

/**
 * GET /api/foundation/dashboard?classroom={id}&batch={id}
 *
 * Returns all students' foundation progress for the teacher dashboard.
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

    // Verify user is a teacher
    const { data: teacherEnrollment } = await supabase
      .from('nexus_enrollments')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'teacher')
      .limit(1)
      .single();

    if (!teacherEnrollment) {
      return NextResponse.json({ error: 'Only teachers can access this dashboard' }, { status: 403 });
    }

    const classroomId = request.nextUrl.searchParams.get('classroom') || undefined;
    const batchId = request.nextUrl.searchParams.get('batch') || undefined;

    const students = await getFoundationDashboard({
      classroom_id: classroomId,
      batch_id: batchId,
    });

    return NextResponse.json({ students });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load dashboard';
    console.error('Foundation dashboard GET error:', message);
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
