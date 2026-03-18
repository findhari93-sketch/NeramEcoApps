import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';

/**
 * GET /api/timetable/rsvp-dashboard?classroom_id={id}&class_id={id}
 * OR
 * GET /api/timetable/rsvp-dashboard?classroom_id={id}&start={date}&end={date}
 *
 * Teacher-only. Returns full RSVP breakdown with student names, responses, and reasons.
 */
export async function GET(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const classroomId = request.nextUrl.searchParams.get('classroom_id');
    const classId = request.nextUrl.searchParams.get('class_id');
    const start = request.nextUrl.searchParams.get('start');
    const end = request.nextUrl.searchParams.get('end');

    if (!classroomId) {
      return NextResponse.json({ error: 'Missing classroom_id' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient() as any;

    // Verify teacher role
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

    if (!enrollment || enrollment.role !== 'teacher') {
      return NextResponse.json({ error: 'Only teachers can view the RSVP dashboard' }, { status: 403 });
    }

    // Get enrolled students for this classroom
    const { data: students } = await supabase
      .from('nexus_enrollments')
      .select('user_id, batch_id, user:users!nexus_enrollments_user_id_fkey(id, name, avatar_url)')
      .eq('classroom_id', classroomId)
      .eq('role', 'student')
      .eq('is_active', true);

    const allStudents = (students || []).map((s: any) => ({
      id: s.user_id,
      name: s.user?.name || 'Unknown',
      avatar_url: s.user?.avatar_url || null,
      batch_id: s.batch_id,
    }));

    if (classId) {
      // Single class RSVP breakdown
      const breakdown = await getClassRsvpBreakdown(supabase, classId, allStudents);
      return NextResponse.json(breakdown);
    }

    if (start && end) {
      // Aggregate across date range
      const { data: classes } = await supabase
        .from('nexus_scheduled_classes')
        .select('id, title, scheduled_date, start_time, end_time, batch_id, status')
        .eq('classroom_id', classroomId)
        .gte('scheduled_date', start)
        .lte('scheduled_date', end)
        .neq('status', 'cancelled')
        .order('scheduled_date', { ascending: true })
        .order('start_time', { ascending: true });

      const breakdowns = await Promise.all(
        (classes || []).map(async (cls: any) => {
          const breakdown = await getClassRsvpBreakdown(supabase, cls.id, allStudents);
          return {
            class_id: cls.id,
            title: cls.title,
            scheduled_date: cls.scheduled_date,
            start_time: cls.start_time,
            end_time: cls.end_time,
            batch_id: cls.batch_id,
            status: cls.status,
            ...breakdown,
          };
        })
      );

      return NextResponse.json({ classes: breakdowns });
    }

    return NextResponse.json({ error: 'Provide class_id or start+end date range' }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load RSVP dashboard';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function getClassRsvpBreakdown(
  supabase: any,
  classId: string,
  allStudents: Array<{ id: string; name: string; avatar_url: string | null; batch_id: string | null }>
) {
  const { data: rsvps } = await supabase
    .from('nexus_class_rsvp')
    .select('student_id, response, reason, responded_at')
    .eq('scheduled_class_id', classId);

  const rsvpMap = new Map<string, any>();
  for (const r of rsvps || []) {
    rsvpMap.set(r.student_id, r);
  }

  const attending: any[] = [];
  const notAttending: any[] = [];
  const noResponse: any[] = [];

  for (const student of allStudents) {
    const rsvp = rsvpMap.get(student.id);
    if (!rsvp) {
      noResponse.push({ ...student });
    } else if (rsvp.response === 'attending') {
      attending.push({ ...student, responded_at: rsvp.responded_at });
    } else {
      notAttending.push({
        ...student,
        reason: rsvp.reason || null,
        responded_at: rsvp.responded_at,
      });
    }
  }

  return {
    attending,
    not_attending: notAttending,
    no_response: noResponse,
    summary: {
      attending: attending.length,
      not_attending: notAttending.length,
      no_response: noResponse.length,
      total: allStudents.length,
    },
  };
}
