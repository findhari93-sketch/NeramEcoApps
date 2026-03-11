import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';

/**
 * GET /api/attendance?scheduled_class_id={id}
 *
 * Returns attendance records for a specific scheduled class.
 */
export async function GET(request: NextRequest) {
  try {
    await verifyMsToken(request.headers.get('Authorization'));

    const classId = request.nextUrl.searchParams.get('scheduled_class_id');

    if (!classId) {
      return NextResponse.json({ error: 'Missing scheduled_class_id parameter' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient();

    const { data, error } = await supabase
      .from('nexus_attendance')
      .select('id, student_id, attended, marked_at, student:users!nexus_attendance_student_id_fkey(id, name, email, avatar_url)')
      .eq('scheduled_class_id', classId)
      .order('marked_at', { ascending: true });

    if (error) throw error;

    return NextResponse.json({ attendance: data || [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load attendance';
    console.error('Attendance GET error:', message);
    return NextResponse.json({ error: message }, { status: 401 });
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
    const msUser = await verifyMsToken(request.headers.get('Authorization'));

    const body = await request.json();
    const { scheduled_class_id, attendees } = body;

    if (!scheduled_class_id || !Array.isArray(attendees) || attendees.length === 0) {
      return NextResponse.json(
        { error: 'Missing required fields: scheduled_class_id, attendees (array)' },
        { status: 400 },
      );
    }

    const supabase = getSupabaseAdminClient();

    // Look up user
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Get the class to find the classroom_id, then verify teacher role
    const { data: scheduledClass } = await supabase
      .from('nexus_scheduled_classes')
      .select('classroom_id')
      .eq('id', scheduled_class_id)
      .single();

    if (!scheduledClass) {
      return NextResponse.json({ error: 'Class not found' }, { status: 404 });
    }

    const { data: enrollment } = await supabase
      .from('nexus_enrollments')
      .select('role')
      .eq('classroom_id', scheduledClass.classroom_id)
      .eq('user_id', user.id)
      .eq('role', 'teacher')
      .single();

    if (!enrollment) {
      return NextResponse.json({ error: 'Only teachers can mark attendance' }, { status: 403 });
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

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to mark attendance';
    console.error('Attendance POST error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
