import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser, assertCapability } from '@/lib/study-materials';
import { assertSessionAccess } from '@/lib/staff-scope';
import { errorResponse } from '@/lib/api-errors';
import { getSupabaseAdminClient } from '@neram/database';
import { recordGamificationEvent } from '@neram/database/queries/nexus';

/**
 * GET /api/attendance?scheduled_class_id={id}
 *
 * Returns attendance records for a specific scheduled class.
 */
export async function GET(request: NextRequest) {
  try {
    // Staff-only, and session-scoped: an external teacher may read the register
    // for classes they tutor, the internal team for any class. Previously this
    // only verified the token, so a student's token returned the whole register.
    const caller = await getRequestUser(request.headers.get('Authorization'));
    assertCapability(caller, 'coord.attendance.view');

    const classId = request.nextUrl.searchParams.get('scheduled_class_id');

    if (!classId) {
      return NextResponse.json({ error: 'Missing scheduled_class_id parameter' }, { status: 400 });
    }

    await assertSessionAccess(caller, classId);

    const supabase = getSupabaseAdminClient();

    const { data, error } = await supabase
      .from('nexus_attendance')
      .select('id, student_id, attended, marked_at, student:users!nexus_attendance_student_id_fkey(id, name, email, avatar_url)')
      .eq('scheduled_class_id', classId)
      .order('marked_at', { ascending: true });

    if (error) throw error;

    return NextResponse.json({ attendance: data || [] });
  } catch (err) {
    console.error('Attendance GET error:', err instanceof Error ? err.message : err);
    // errorResponse maps 401 auth vs 403 authorization vs 404, instead of
    // labelling every failure as 401.
    return errorResponse(err, 'Failed to load attendance');
  }
}

/**
 * POST /api/attendance
 *
 * Mark attendance for a class.
 * Body: { scheduled_class_id, attendees: [{ user_id, present: boolean }] }
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getRequestUser(request.headers.get('Authorization'));
    assertCapability(user, 'teach.attendance.mark');

    const body = await request.json();
    const { scheduled_class_id, attendees } = body;

    if (!scheduled_class_id || !Array.isArray(attendees) || attendees.length === 0) {
      return NextResponse.json(
        { error: 'Missing required fields: scheduled_class_id, attendees (array)' },
        { status: 400 },
      );
    }

    // An external teacher marks only the classes they tutor; the internal team
    // marks any class.
    //
    // This replaces a per-classroom teacher-ENROLLMENT check, which had the side
    // effect of refusing an admin who was not enrolled: the opposite of every
    // other route, and the reason the office could not reconcile a register.
    await assertSessionAccess(user, scheduled_class_id);

    const supabase = getSupabaseAdminClient();

    // classroom_id is still needed below to resolve each student's batch for the
    // gamification event.
    const { data: scheduledClass } = await supabase
      .from('nexus_scheduled_classes')
      .select('classroom_id')
      .eq('id', scheduled_class_id)
      .single();

    if (!scheduledClass) {
      return NextResponse.json({ error: 'Class not found' }, { status: 404 });
    }

    // Upsert attendance records
    const records = attendees.map((a: { user_id: string; present: boolean }) => ({
      scheduled_class_id,
      student_id: a.user_id,
      attended: a.present,
      marked_at: new Date().toISOString(),
      marked_by: user.id,
    }));

    const { error } = await supabase
      .from('nexus_attendance')
      .upsert(records, { onConflict: 'scheduled_class_id,student_id' });

    if (error) throw error;

    // Record gamification points for students marked present
    const presentStudents = attendees.filter((a: { user_id: string; present: boolean }) => a.present);
    if (presentStudents.length > 0) {
      // Get batch_id for students in this classroom
      const { data: enrollments } = await supabase
        .from('nexus_enrollments')
        .select('user_id, batch_id')
        .eq('classroom_id', scheduledClass.classroom_id)
        .in('user_id', presentStudents.map((a: { user_id: string }) => a.user_id));

      const batchMap: Record<string, string | null> = {};
      for (const e of enrollments || []) {
        batchMap[(e as any).user_id] = (e as any).batch_id;
      }

      // Fire-and-forget: don't block attendance response
      Promise.allSettled(
        presentStudents.map((a: { user_id: string }) =>
          recordGamificationEvent({
            student_id: a.user_id,
            classroom_id: scheduledClass.classroom_id,
            batch_id: batchMap[a.user_id] || null,
            event_type: 'class_attended',
            points: 10,
            source_id: `att_${scheduled_class_id}_${a.user_id}`,
            activity_type: 'class_attended',
            activity_title: 'Attended class',
            metadata: { scheduled_class_id },
          })
        )
      ).catch(() => {});
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Attendance POST error:', err instanceof Error ? err.message : err);
    return errorResponse(err, 'Failed to mark attendance');
  }
}
