import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken, extractBearerToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { canRunSession, isInternalStaff, resolveStaffRole } from '@/lib/staff-capabilities';
import { buildStaffAttendees, type StaffCalendarRow } from '@/lib/class-attendees';
import { resolveClassAttendees, createCalendarEventForJoinUrl } from '@/lib/class-calendar';

/**
 * POST /api/timetable/[classId]/repair-meeting
 *
 * Gives a calendar entry to a class that has a Teams join link and nothing else.
 *
 * Classes ended up in that state whenever the group-calendar write was refused:
 * the route fell back to /me/onlineMeetings, which returns a join URL and creates
 * no calendar item for anybody, so the class was posted to the channel and the
 * group chat while being invisible on every calendar including the tutor's.
 *
 * The repair deliberately reuses the EXISTING join URL rather than creating a new
 * meeting, so the links already sent to the channel, the group chat and WhatsApp
 * keep working. That is also why it is a separate endpoint from meeting creation:
 * creating would mint a new link and orphan the old one.
 *
 * The "already done" check reads teams_organizer_event_id, NOT
 * teams_calendar_event_id. A channel meeting stores the GROUP calendar event id
 * in the latter, and a group calendar is not any person's calendar: it is not in
 * the tutor's mailbox and neither Outlook nor Teams desktop shows it in the
 * personal calendar view. Gating on it meant this endpoint answered "already on
 * the calendar, nothing to fix" for exactly the classes that needed fixing.
 */

interface Ctx {
  params: { classId: string };
}

export async function POST(request: NextRequest, { params }: Ctx) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const token = extractBearerToken(request.headers.get('Authorization'));
    if (!token) {
      return NextResponse.json({ error: 'Missing Microsoft token' }, { status: 401 });
    }

    const supabase = getSupabaseAdminClient() as any;

    const { data: user } = await supabase
      .from('users')
      .select('id, name, email, user_type, staff_role, can_teach')
      .eq('ms_oid', msUser.oid)
      .single();
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const { data: cls } = await supabase
      .from('nexus_scheduled_classes')
      .select(
        'id, classroom_id, batch_id, teacher_id, title, description, scheduled_date, start_time, end_time, status, teams_meeting_id, teams_meeting_join_url, teams_meeting_url, teams_calendar_event_id, teams_organizer_event_id',
      )
      .eq('id', params.classId)
      .single();
    if (!cls) {
      return NextResponse.json({ error: 'Class not found' }, { status: 404 });
    }

    // Same access rule as linking assignments: internal staff reach any
    // classroom, an external teacher only the classes they tutor.
    const { data: enrollment } = await supabase
      .from('nexus_enrollments')
      .select('role')
      .eq('user_id', user.id)
      .eq('classroom_id', cls.classroom_id)
      .eq('is_active', true)
      .maybeSingle();

    if (!enrollment && !isInternalStaff(resolveStaffRole(user))) {
      return NextResponse.json({ error: 'Not enrolled' }, { status: 403 });
    }
    if (!canRunSession(user, cls.teacher_id)) {
      return NextResponse.json({ error: 'Only this class tutor or an admin can fix the invites' }, { status: 403 });
    }

    const joinUrl = cls.teams_meeting_join_url || cls.teams_meeting_url;
    if (!joinUrl) {
      return NextResponse.json(
        { error: 'This class has no Teams meeting yet. Create the meeting first.' },
        { status: 400 },
      );
    }
    if (cls.teams_organizer_event_id) {
      return NextResponse.json(
        { error: 'This class is already on your calendar. Nothing to fix.' },
        { status: 409 },
      );
    }
    if (cls.status === 'cancelled') {
      return NextResponse.json(
        { error: 'This class is cancelled, so there is nothing to invite anyone to.' },
        { status: 400 },
      );
    }

    // The tutor is required on the invite, internal staff optional, exactly as at
    // creation time. Resolve the tutor's mailbox the same way too.
    let tutorEmail = user.email || '';
    if (cls.teacher_id && cls.teacher_id !== user.id) {
      const { data: tutor } = await supabase
        .from('users')
        .select('email')
        .eq('id', cls.teacher_id)
        .single();
      if (tutor?.email) tutorEmail = tutor.email;
    }

    const { data: staff } = await supabase
      .from('users')
      .select('name, email, ms_oid, user_type, staff_role, is_disabled')
      .in('user_type', ['teacher', 'admin']);
    const staffAttendees = buildStaffAttendees((staff || []) as StaffCalendarRow[], tutorEmail);

    const { attendees, skipped } = await resolveClassAttendees(
      supabase,
      cls.classroom_id,
      cls.batch_id,
      user.email || '',
      staffAttendees,
    );

    const { eventId, error: graphError } = await createCalendarEventForJoinUrl(
      token,
      cls,
      joinUrl,
      attendees,
    );

    if (!eventId) {
      const denied = /access.?denied|forbidden|403|unauthor|401/i.test(graphError || '');
      return NextResponse.json(
        {
          error: denied
            ? 'Microsoft refused the calendar write. Sign out of Nexus and sign back in, then try again.'
            : 'Could not create the calendar invite right now. Please try again in a moment.',
        },
        { status: 502 },
      );
    }

    // teams_organizer_event_id always: this event is in the caller's own mailbox,
    // which is the whole point. teams_calendar_event_id only when it was empty,
    // so a repaired channel meeting keeps pointing at its group event and the
    // cancel/move paths still find it.
    await supabase
      .from('nexus_scheduled_classes')
      .update({
        teams_organizer_event_id: eventId,
        ...(cls.teams_calendar_event_id ? {} : { teams_calendar_event_id: eventId }),
        teams_meeting_degraded: false,
      })
      .eq('id', cls.id);

    return NextResponse.json({
      success: true,
      calendarEventId: eventId,
      invited: attendees.length,
      notInvited: skipped,
      message: skipped.length
        ? `Invites sent to ${attendees.length}. ${skipped.length} could not be invited because they have no email on file.`
        : `Invites sent to ${attendees.length}.`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to repair the meeting';
    console.error('Repair meeting error:', message);
    return NextResponse.json(
      { error: 'Could not fix the calendar invites right now. Please try again in a moment.' },
      { status: 500 },
    );
  }
}
