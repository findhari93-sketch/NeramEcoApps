// @ts-nocheck — course plan tables not yet in generated types
import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken, extractBearerToken } from '@/lib/ms-verify';
import {
  getSupabaseAdminClient,
  createScheduledClass,
  updateSession,
  updateWeekDates,
} from '@neram/database';

/** Map day-of-week string to JS day number (0=Sun, 1=Mon, ..., 6=Sat) */
const DAY_MAP: Record<string, number> = {
  sun: 0, sunday: 0,
  mon: 1, monday: 1,
  tue: 2, tuesday: 2,
  wed: 3, wednesday: 3,
  thu: 4, thursday: 4,
  fri: 5, friday: 5,
  sat: 6, saturday: 6,
};

/** Get the date for a given day-of-week relative to a start date (that week) */
function getDateForDay(startDate: string, dayOfWeek: string): string {
  const start = new Date(startDate + 'T00:00:00');
  const startDay = start.getDay(); // 0-6
  const targetDay = DAY_MAP[dayOfWeek.toLowerCase()] ?? 1;
  let diff = targetDay - startDay;
  if (diff < 0) diff += 7;
  const result = new Date(start);
  result.setDate(result.getDate() + diff);
  return result.toISOString().split('T')[0];
}

/**
 * POST /api/course-plans/[id]/sessions/push-week
 * Bulk push an entire week of sessions to the timetable.
 *
 * Body: { week_id, start_date, create_teams_meetings? }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: planId } = await params;
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const token = extractBearerToken(request.headers.get('Authorization'));
    const body = await request.json();
    const { week_id, start_date, create_teams_meetings } = body;

    if (!week_id || !start_date) {
      return NextResponse.json({ error: 'Missing week_id and start_date' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient();

    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Get plan to verify teacher role
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
      return NextResponse.json({ error: 'Only teachers can push sessions to timetable' }, { status: 403 });
    }

    // Get all unpushed sessions for this week
    const { data: sessions } = await supabase
      .from('nexus_course_plan_sessions')
      .select('*')
      .eq('plan_id', planId)
      .eq('week_id', week_id)
      .eq('status', 'planned')
      .is('scheduled_class_id', null)
      .order('day_number', { ascending: true });

    if (!sessions || sessions.length === 0) {
      return NextResponse.json({ error: 'No unpushed sessions found for this week' }, { status: 400 });
    }

    const results: any[] = [];
    let latestDate = start_date;

    for (const session of sessions) {
      const scheduledDate = session.day_of_week
        ? getDateForDay(start_date, session.day_of_week)
        : start_date;

      if (scheduledDate > latestDate) latestDate = scheduledDate;

      const resolvedStartTime = session.start_time || '09:00';
      const resolvedEndTime = session.end_time || '10:00';

      // Create scheduled class
      const scheduledClass = await createScheduledClass({
        classroom_id: plan.classroom_id,
        title: session.title || `Session ${session.day_number}`,
        scheduled_date: scheduledDate,
        start_time: resolvedStartTime,
        end_time: resolvedEndTime,
        teacher_id: session.teacher_id || user.id,
        topic_id: session.topic_id || null,
        status: 'scheduled',
        description: session.notes || null,
      }, supabase);

      // Update session
      await updateSession(session.id, {
        scheduled_class_id: scheduledClass.id,
        status: 'scheduled',
      }, supabase);

      // Optionally create Teams meeting (best-effort)
      let teamsMeeting = null;
      if (create_teams_meetings && token) {
        try {
          const ensureSec = (t: string) => t.length === 5 ? `${t}:00` : t;
          const startDateTime = `${scheduledDate}T${ensureSec(resolvedStartTime)}+05:30`;
          const endDateTime = `${scheduledDate}T${ensureSec(resolvedEndTime)}+05:30`;

          const res = await fetch('https://graph.microsoft.com/v1.0/me/onlineMeetings', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              subject: session.title || `Session ${session.day_number}`,
              startDateTime,
              endDateTime,
              lobbyBypassSettings: { scope: 'organization' },
              allowedPresenters: 'organizer',
            }),
          });

          if (res.ok) {
            teamsMeeting = await res.json();

            await supabase
              .from('nexus_scheduled_classes')
              .update({
                teams_meeting_id: teamsMeeting.id,
                teams_meeting_url: teamsMeeting.joinWebUrl,
                teams_meeting_join_url: teamsMeeting.joinWebUrl,
                teams_meeting_scope: 'link_only',
              })
              .eq('id', scheduledClass.id);
          }
        } catch (teamsErr) {
          console.error('Teams meeting creation failed (non-blocking):', teamsErr);
        }
      }

      results.push({
        session_id: session.id,
        scheduled_class: scheduledClass,
        teams_meeting: teamsMeeting ? { id: teamsMeeting.id, joinUrl: teamsMeeting.joinWebUrl } : null,
      });
    }

    // Update week dates
    await updateWeekDates(week_id, start_date, latestDate, supabase);

    return NextResponse.json({
      pushed: results,
      count: results.length,
      week: { id: week_id, start_date, end_date: latestDate },
    }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to push week to timetable';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
