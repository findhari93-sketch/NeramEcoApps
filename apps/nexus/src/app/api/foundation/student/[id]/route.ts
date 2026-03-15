import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { getStudentFoundationDetail } from '@neram/database/queries/nexus';

/**
 * GET /api/foundation/student/[id]
 *
 * Returns a specific student's detailed foundation progress.
 * Used by teachers and parents.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const { id: studentId } = await params;
    const supabase = getSupabaseAdminClient();

    const { data: user } = await supabase
      .from('users')
      .select('id, user_type')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Verify access: must be teacher or linked parent
    if (user.user_type === 'parent') {
      const { data: parentLink } = await supabase
        .from('nexus_parent_links')
        .select('id')
        .eq('parent_user_id', user.id)
        .eq('student_user_id', studentId)
        .eq('is_active', true)
        .single();

      if (!parentLink) {
        return NextResponse.json({ error: 'Not authorized to view this student' }, { status: 403 });
      }
    } else {
      // Must be teacher
      const { data: teacherEnrollment } = await supabase
        .from('nexus_enrollments')
        .select('role')
        .eq('user_id', user.id)
        .eq('role', 'teacher')
        .limit(1)
        .single();

      if (!teacherEnrollment) {
        return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
      }
    }

    // Get student info
    const { data: student } = await supabase
      .from('users')
      .select('id, name, email, avatar_url')
      .eq('id', studentId)
      .single();

    const chapters = await getStudentFoundationDetail(studentId);

    return NextResponse.json({ student, chapters });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load student progress';
    console.error('Foundation student detail GET error:', message);
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
