import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';

/**
 * GET /api/timetable/rsvp/context?class_id={id}
 *
 * Backs the shareable one-tap RSVP page (/student/rsvp/[classId]). The link
 * carries only a class id, so this resolves the class + classroom, verifies the
 * signed-in student is enrolled, and returns their current RSVP (default-attending:
 * null means attending). Mirrors the resolveCaller/default-attending model in
 * ../route.ts.
 */
export async function GET(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const classId = request.nextUrl.searchParams.get('class_id');
    if (!classId) {
      return NextResponse.json({ error: 'Missing class_id' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient() as any;

    // The class tells us which classroom to check enrollment against.
    const { data: cls } = await supabase
      .from('nexus_scheduled_classes')
      .select(
        'id, title, scheduled_date, start_time, end_time, classroom_id, status, ' +
          'course_topic:nexus_course_topics(title), topic:nexus_topics(title)',
      )
      .eq('id', classId)
      .single();

    if (!cls) {
      return NextResponse.json({ error: 'Class not found' }, { status: 404 });
    }

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
      .eq('classroom_id', cls.classroom_id)
      .eq('is_active', true)
      .maybeSingle();

    // Not enrolled in this class's classroom → friendly "not your class" on the page.
    if (!enrollment) {
      return NextResponse.json({ error: 'You are not enrolled in this class', code: 'not_enrolled' }, { status: 403 });
    }

    // Default-attending: only a not_attending row is meaningful.
    const { data: rsvp } = await supabase
      .from('nexus_class_rsvp')
      .select('*')
      .eq('scheduled_class_id', classId)
      .eq('student_id', user.id)
      .maybeSingle();

    return NextResponse.json({
      class: {
        id: cls.id,
        title: cls.title,
        scheduled_date: cls.scheduled_date,
        start_time: cls.start_time,
        end_time: cls.end_time,
        classroom_id: cls.classroom_id,
        status: cls.status,
        topic: cls.course_topic?.title || cls.topic?.title || null,
      },
      role: enrollment.role,
      myRsvp: rsvp?.response === 'not_attending' ? rsvp : null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load RSVP context';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
