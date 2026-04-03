// @ts-nocheck — course plan tables not yet in generated types
import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken, extractBearerToken } from '@/lib/ms-verify';
import {
  getSupabaseAdminClient,
  createScheduledClass,
  updateSession,
} from '@neram/database';

/**
 * POST /api/course-plans/[id]/sessions/push
 * Push a single session to the timetable as a scheduled class.
 *
 * Body: { session_id, scheduled_date, start_time?, end_time?, create_teams_meeting? }
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
    const { session_id, scheduled_date, start_time, end_time, create_teams_meeting } = body;

    if (!session_id || !scheduled_date) {
      return NextResponse.json({ error: 'Missing session_id and scheduled_date' }, { status: 400 });
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

    // Get plan to verify teacher role and get classroom + session defaults
    const { data: plan } = await supabase
      .from('nexus_course_plans')
      .select('classroom_id, sessions_per_day')
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

    // Get session details
    const { data: session } = await supabase
      .from('nexus_course_plan_sessions')
      .select('*, topic:nexus_topics(id, name)')
      .eq('id', session_id)
      .eq('plan_id', planId)
      .single();

    if (!session) {
      return NextResponse.json({ error: 'Session not found in this plan' }, { status: 404 });
    }

    // Check not already pushed
    if (session.scheduled_class_id) {
      return NextResponse.json({ error: 'Session already pushed to timetable' }, { status: 409 });
    }

    // Determine start/end times from body or session defaults
    const resolvedStartTime = start_time || session.start_time || '09:00';
    const resolvedEndTime = end_time || session.end_time || '10:00';

    // Create scheduled class
    const scheduledClass = await createScheduledClass({
      classroom_id: plan.classroom_id,
      title: session.title || `Session ${session.day_number}`,
      scheduled_date,
      start_time: resolvedStartTime,
      end_time: resolvedEndTime,
      teacher_id: session.teacher_id || user.id,
      topic_id: session.topic_id || null,
      status: 'scheduled',
      description: session.notes || null,
    }, supabase);

    // Update session with scheduled_class_id and status
    await updateSession(session_id, {
      scheduled_class_id: scheduledClass.id,
      status: 'scheduled',
    }, supabase);

    // Optionally create Teams meeting (best-effort)
    let teamsMeeting = null;
    if (create_teams_meeting && token) {
      try {
        const ensureSec = (t: string) => t.length === 5 ? `${t}:00` : t;
        const startDateTime = `${scheduled_date}T${ensureSec(resolvedStartTime)}+05:30`;
        const endDateTime = `${scheduled_date}T${ensureSec(resolvedEndTime)}+05:30`;

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

          // Update scheduled class with Teams meeting info
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

    return NextResponse.json({
      scheduled_class: scheduledClass,
      teams_meeting: teamsMeeting ? { id: teamsMeeting.id, joinUrl: teamsMeeting.joinWebUrl } : null,
    }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to push session to timetable';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
