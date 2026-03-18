import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';

/**
 * GET /api/timetable/recap?class_id={id}&classroom_id={id}
 *
 * Returns meeting recap: recording, transcript, attendance summary,
 * average rating, reviews, RSVP vs actual attendance comparison.
 */
export async function GET(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const classId = request.nextUrl.searchParams.get('class_id');
    const classroomId = request.nextUrl.searchParams.get('classroom_id');

    if (!classId || !classroomId) {
      return NextResponse.json({ error: 'Missing class_id and classroom_id' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient() as any;

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
      return NextResponse.json({ error: 'Not enrolled' }, { status: 403 });
    }

    // Get class details
    const { data: cls, error: clsErr } = await supabase
      .from('nexus_scheduled_classes')
      .select('id, title, status, recording_url, transcript_url, recording_duration_minutes, teams_meeting_id')
      .eq('id', classId)
      .eq('classroom_id', classroomId)
      .single();

    if (clsErr || !cls) {
      return NextResponse.json({ error: 'Class not found' }, { status: 404 });
    }

    // Attendance summary
    const { data: attendance } = await supabase
      .from('nexus_attendance')
      .select('student_id, attended, duration_minutes')
      .eq('scheduled_class_id', classId);

    const present = (attendance || []).filter((a: any) => a.attended).length;
    const absent = (attendance || []).filter((a: any) => !a.attended).length;

    // RSVP summary
    const { data: rsvps } = await supabase
      .from('nexus_class_rsvp')
      .select('response')
      .eq('scheduled_class_id', classId);

    const rsvpAttending = (rsvps || []).filter((r: any) => r.response === 'attending').length;
    const rsvpNotAttending = (rsvps || []).filter((r: any) => r.response === 'not_attending').length;

    // Reviews
    const { data: reviews } = await supabase
      .from('nexus_class_reviews')
      .select('rating, comment, student:users!nexus_class_reviews_student_id_fkey(id, name, avatar_url)')
      .eq('scheduled_class_id', classId)
      .order('created_at', { ascending: false });

    const ratings = (reviews || []).map((r: any) => r.rating);
    const averageRating = ratings.length > 0 ? ratings.reduce((a: number, b: number) => a + b, 0) / ratings.length : null;

    // For students, only return their own review
    let studentReviews = reviews || [];
    if (enrollment.role === 'student') {
      studentReviews = studentReviews.filter((r: any) => r.student?.id === user.id);
    }

    return NextResponse.json({
      recording_url: cls.recording_url,
      transcript_url: cls.transcript_url,
      recording_duration_minutes: cls.recording_duration_minutes,
      has_teams_meeting: !!cls.teams_meeting_id,
      attendance: {
        present,
        absent,
        total: present + absent,
      },
      rsvp: {
        attending: rsvpAttending,
        not_attending: rsvpNotAttending,
        total: rsvpAttending + rsvpNotAttending,
      },
      rsvp_vs_actual: {
        said_would_attend: rsvpAttending,
        actually_attended: present,
      },
      average_rating: averageRating ? parseFloat(averageRating.toFixed(1)) : null,
      review_count: ratings.length,
      reviews: studentReviews,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load recap';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
