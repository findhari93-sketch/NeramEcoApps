import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { notifyWeekPublished } from '@/lib/timetable-notifications';

/**
 * Release a planned week to students.
 *
 * The teacher builds the week as drafts, rearranging freely while students see
 * nothing, then publishes once. That flips every draft in the range to
 * published and sends ONE summary notification, instead of the five separate
 * "New Class Scheduled" alerts a five-class week used to produce as it was
 * being assembled.
 *
 * Teams meetings are deliberately NOT created here. Creating one needs the
 * teacher's delegated Graph token (Calendars.ReadWrite), which this route does
 * not hold, and doing it server-side with app-only credentials would change the
 * meeting organizer. The response reports which published classes still lack a
 * meeting so the planner can prompt for them with the teacher's own token.
 */

/** GET /api/timetable/publish-week?classroom_id&week_start&week_end — what would publish. */
export async function GET(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const classroomId = request.nextUrl.searchParams.get('classroom_id');
    const weekStart = request.nextUrl.searchParams.get('week_start');
    const weekEnd = request.nextUrl.searchParams.get('week_end');

    if (!classroomId || !weekStart || !weekEnd) {
      return NextResponse.json(
        { error: 'Missing classroom_id, week_start and week_end' },
        { status: 400 },
      );
    }

    const supabase = getSupabaseAdminClient() as any;
    const guard = await assertTeacher(supabase, msUser.oid, classroomId);
    if (guard) return guard;

    const { data, error } = await supabase
      .from('nexus_scheduled_classes')
      .select('id, title, scheduled_date, start_time, end_time, teams_meeting_id')
      .eq('classroom_id', classroomId)
      .eq('publish_state', 'draft')
      .gte('scheduled_date', weekStart)
      .lte('scheduled_date', weekEnd)
      .neq('status', 'cancelled')
      .order('scheduled_date', { ascending: true })
      .order('start_time', { ascending: true });

    if (error) throw error;

    const drafts = data || [];
    return NextResponse.json({
      drafts,
      count: drafts.length,
      missingMeeting: drafts.filter((c: any) => !c.teams_meeting_id).length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load the week';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/timetable/publish-week
 * Body: { classroom_id, week_start, week_end }
 */
export async function POST(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const { classroom_id, week_start, week_end } = await request.json();

    if (!classroom_id || !week_start || !week_end) {
      return NextResponse.json(
        { error: 'Missing classroom_id, week_start and week_end' },
        { status: 400 },
      );
    }

    const supabase = getSupabaseAdminClient() as any;
    const guard = await assertTeacher(supabase, msUser.oid, classroom_id);
    if (guard) return guard;

    // Cancelled drafts are excluded: publishing should not resurrect a class
    // the teacher already decided against.
    const { data: published, error } = await supabase
      .from('nexus_scheduled_classes')
      .update({ publish_state: 'published', published_at: new Date().toISOString() })
      .eq('classroom_id', classroom_id)
      .eq('publish_state', 'draft')
      .gte('scheduled_date', week_start)
      .lte('scheduled_date', week_end)
      .neq('status', 'cancelled')
      .select('id, title, scheduled_date, teams_meeting_id');

    if (error) throw error;

    const rows = published || [];

    if (rows.length === 0) {
      return NextResponse.json({
        published: 0,
        classes: [],
        missingMeeting: [],
        message: 'Nothing to publish. Every class in this week is already live.',
      });
    }

    // One summary, not one per class. Never let a notification failure make the
    // publish look like it failed: the classes are already live at this point.
    try {
      await notifyWeekPublished(classroom_id, week_start, rows.length);
    } catch (notifyErr) {
      console.error('[publish-week] notification failed:', notifyErr);
    }

    return NextResponse.json({
      published: rows.length,
      classes: rows,
      // The planner turns these into "Create Teams meeting" prompts, which it
      // runs with the teacher's own delegated token.
      missingMeeting: rows.filter((c: any) => !c.teams_meeting_id).map((c: any) => c.id),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to publish the week';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** Returns a response to send when the caller may not manage this classroom. */
async function assertTeacher(
  supabase: any,
  msOid: string,
  classroomId: string,
): Promise<NextResponse | null> {
  const { data: user } = await supabase.from('users').select('id').eq('ms_oid', msOid).single();
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const { data: classroom } = await supabase
    .from('nexus_classrooms')
    .select('is_archived')
    .eq('id', classroomId)
    .single();

  if (classroom?.is_archived) {
    return NextResponse.json(
      { error: 'This classroom is archived and read-only' },
      { status: 409 },
    );
  }

  const { data: enrollment } = await supabase
    .from('nexus_enrollments')
    .select('role')
    .eq('user_id', user.id)
    .eq('classroom_id', classroomId)
    .eq('is_active', true)
    .maybeSingle();

  if (!enrollment || enrollment.role !== 'teacher') {
    return NextResponse.json({ error: 'Only teachers can publish the week' }, { status: 403 });
  }

  return null;
}
