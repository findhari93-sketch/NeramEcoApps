import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient, restoreEnrollment, createUserNotification } from '@neram/database';

/**
 * POST /api/classrooms/[id]/enrollments/restore
 * Restore a previously removed student enrollment.
 * Body: { enrollment_id: string }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient() as any;

    const { data: caller } = await supabase
      .from('users')
      .select('id, user_type')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!caller || !['teacher', 'admin'].includes(caller.user_type)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { enrollment_id } = body;

    if (!enrollment_id) {
      return NextResponse.json({ error: 'enrollment_id is required' }, { status: 400 });
    }

    await restoreEnrollment(enrollment_id, caller.id, supabase);

    // Send notification to restored student
    try {
      const { data: enrollment } = await supabase
        .from('nexus_enrollments')
        .select('user_id')
        .eq('id', enrollment_id)
        .single();

      const { data: classroom } = await supabase
        .from('nexus_classrooms')
        .select('name')
        .eq('id', id)
        .single();

      if (enrollment && classroom) {
        await createUserNotification(
          {
            user_id: enrollment.user_id,
            event_type: 'classroom_restored',
            title: 'Restored to Classroom',
            message: `You have been restored to "${classroom.name}".`,
            metadata: { classroom_id: id, classroom_name: classroom.name },
          },
          supabase
        );
      }
    } catch (notifErr) {
      console.warn('Failed to send restore notification:', notifErr);
    }

    return NextResponse.json({ restored: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to restore student';
    console.error('Enrollment restore error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
