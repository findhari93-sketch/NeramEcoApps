import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken, extractBearerToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';

/**
 * POST /api/timetable/teams-meeting
 * Creates a Microsoft Teams meeting for a scheduled class.
 *
 * Pass { auto: true } to auto-determine behavior from classroom config:
 *   - If classroom has linked team → channel post + calendar invites
 *   - If no linked team → calendar invites only
 *   - Always creates meeting link
 *
 * Or pass { scope } for explicit control:
 *   - link_only: standalone online meeting (join URL only)
 *   - channel_meeting: online meeting + post to linked Teams channel
 *   - calendar_event: online meeting + Outlook calendar invites to enrolled students
 */
export async function POST(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const token = extractBearerToken(request.headers.get('Authorization'))!;
    const { class_id, classroom_id, scope: explicitScope, auto } = await request.json();

    if (!class_id || !classroom_id) {
      return NextResponse.json({ error: 'Missing class_id and classroom_id' }, { status: 400 });
    }

    if (explicitScope && !['link_only', 'channel_meeting', 'calendar_event'].includes(explicitScope)) {
      return NextResponse.json({ error: 'Invalid scope' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient();

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
      .eq('classroom_id', classroom_id)
      .single();

    if (!enrollment || enrollment.role !== 'teacher') {
      return NextResponse.json({ error: 'Only teachers can create meetings' }, { status: 403 });
    }

    // Determine scope: explicit scope, or auto-determine from classroom config
    let scope: string;
    if (auto) {
      const { data: classroom } = await supabase
        .from('nexus_classrooms')
        .select('ms_team_id')
        .eq('id', classroom_id)
        .single();

      // If team linked → channel_meeting + calendar_event, else → calendar_event only
      scope = classroom?.ms_team_id ? 'channel_meeting' : 'calendar_event';
    } else {
      scope = explicitScope || 'link_only';
    }

    // Get the scheduled class details
    const { data: scheduledClass } = await supabase
      .from('nexus_scheduled_classes')
      .select('*')
      .eq('id', class_id)
      .eq('classroom_id', classroom_id)
      .single();

    if (!scheduledClass) {
      return NextResponse.json({ error: 'Class not found' }, { status: 404 });
    }

    // Build date-times
    const startDateTime = `${scheduledClass.scheduled_date}T${scheduledClass.start_time}:00+05:30`;
    const endDateTime = `${scheduledClass.scheduled_date}T${scheduledClass.end_time}:00+05:30`;

    // Step 1: Create the online meeting (common to all scopes)
    const meetingPayload = {
      subject: scheduledClass.title,
      startDateTime,
      endDateTime,
      lobbyBypassSettings: { scope: 'organization' },
      allowedPresenters: 'organizer',
    };

    const graphRes = await fetch('https://graph.microsoft.com/v1.0/me/onlineMeetings', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(meetingPayload),
    });

    if (!graphRes.ok) {
      const errText = await graphRes.text().catch(() => 'Unknown error');
      throw new Error(`Failed to create Teams meeting: ${graphRes.status} ${errText}`);
    }

    const meeting = await graphRes.json();

    // Update the scheduled class with meeting info
    const { data: updated, error: updateError } = await supabase
      .from('nexus_scheduled_classes')
      .update({
        teams_meeting_id: meeting.id,
        teams_meeting_url: meeting.joinWebUrl,
        teams_meeting_join_url: meeting.joinWebUrl,
        teams_meeting_scope: scope,
      })
      .eq('id', class_id)
      .select('*')
      .single();

    if (updateError) throw updateError;

    // Step 2: Scope-specific actions
    const extras: Record<string, unknown> = {};

    if (scope === 'channel_meeting') {
      // Post meeting card to the linked Teams channel
      await postToTeamsChannel(supabase, token, classroom_id, scheduledClass as Record<string, unknown>, meeting);
      extras.channelPosted = true;
    }

    // Calendar invites: send for 'calendar_event' scope, or in auto mode (always send invites)
    if (scope === 'calendar_event' || (auto && scope === 'channel_meeting')) {
      // Create Outlook calendar event with attendee invites
      const invited = await createCalendarEvent(
        supabase, token, classroom_id,
        (scheduledClass as Record<string, unknown>).batch_id as string | null,
        scheduledClass as Record<string, unknown>, meeting
      );
      extras.invitedCount = invited;
    }

    return NextResponse.json({
      class: updated,
      meeting: {
        id: meeting.id,
        joinUrl: meeting.joinWebUrl,
        scope,
      },
      ...extras,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create Teams meeting';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * Post a meeting link card to the classroom's linked Teams channel (General).
 */
async function postToTeamsChannel(
  supabase: ReturnType<typeof getSupabaseAdminClient>,
  token: string,
  classroomId: string,
  scheduledClass: Record<string, unknown>,
  meeting: Record<string, unknown>,
) {
  // Get the linked team ID
  const { data: classroom } = await supabase
    .from('nexus_classrooms')
    .select('ms_team_id, name')
    .eq('id', classroomId)
    .single();

  if (!classroom?.ms_team_id) {
    throw new Error('Classroom has no linked Teams team. Link a team first in classroom settings.');
  }

  // Get the General channel of the team
  const channelsRes = await fetch(
    `https://graph.microsoft.com/v1.0/teams/${classroom.ms_team_id}/channels?$filter=displayName eq 'General'`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!channelsRes.ok) {
    throw new Error('Failed to fetch Teams channels');
  }

  const channelsData = await channelsRes.json();
  const generalChannel = channelsData.value?.[0];

  if (!generalChannel) {
    throw new Error('General channel not found in the linked team');
  }

  // Post an Adaptive Card–style message to the channel
  const messageBody = {
    body: {
      contentType: 'html',
      content: `<h3>📅 ${scheduledClass.title}</h3>
<p><strong>Date:</strong> ${scheduledClass.scheduled_date}<br/>
<strong>Time:</strong> ${scheduledClass.start_time} – ${scheduledClass.end_time}</p>
<p><a href="${meeting.joinWebUrl}">🔗 Join Meeting</a></p>`,
    },
  };

  const postRes = await fetch(
    `https://graph.microsoft.com/v1.0/teams/${classroom.ms_team_id}/channels/${generalChannel.id}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messageBody),
    }
  );

  if (!postRes.ok) {
    const errText = await postRes.text().catch(() => '');
    console.error('Failed to post to Teams channel:', postRes.status, errText);
    // Don't throw — meeting was already created, channel post is best-effort
  }
}

/**
 * Create an Outlook calendar event with the meeting link and invite enrolled students.
 */
async function createCalendarEvent(
  supabase: ReturnType<typeof getSupabaseAdminClient>,
  token: string,
  classroomId: string,
  batchId: string | null,
  scheduledClass: Record<string, unknown>,
  meeting: Record<string, unknown>,
): Promise<number> {
  // Fetch enrolled student emails
  let query = supabase
    .from('nexus_enrollments')
    .select('user_id, users!inner(email)')
    .eq('classroom_id', classroomId)
    .eq('role', 'student')
    .eq('is_active', true);

  if (batchId) {
    query = query.eq('batch_id', batchId);
  }

  const { data: enrollments } = await query;

  const attendees = (enrollments || [])
    .map((e: Record<string, unknown>) => {
      const users = e.users as Record<string, unknown> | null;
      return users?.email as string | undefined;
    })
    .filter((email): email is string => !!email)
    .map((email) => ({
      emailAddress: { address: email, name: email },
      type: 'required' as const,
    }));

  if (attendees.length === 0) {
    return 0;
  }

  // Create calendar event with online meeting
  const eventPayload = {
    subject: scheduledClass.title as string,
    start: {
      dateTime: `${scheduledClass.scheduled_date}T${scheduledClass.start_time}:00`,
      timeZone: 'Asia/Kolkata',
    },
    end: {
      dateTime: `${scheduledClass.scheduled_date}T${scheduledClass.end_time}:00`,
      timeZone: 'Asia/Kolkata',
    },
    isOnlineMeeting: true,
    onlineMeetingProvider: 'teamsForBusiness',
    onlineMeeting: {
      joinUrl: meeting.joinWebUrl,
    },
    attendees,
    body: {
      contentType: 'HTML',
      content: `<p>You are invited to <strong>${scheduledClass.title}</strong>.</p>
<p><a href="${meeting.joinWebUrl}">Join Microsoft Teams Meeting</a></p>`,
    },
  };

  const eventRes = await fetch('https://graph.microsoft.com/v1.0/me/events', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(eventPayload),
  });

  if (!eventRes.ok) {
    const errText = await eventRes.text().catch(() => '');
    console.error('Failed to create calendar event:', eventRes.status, errText);
    // Don't throw — meeting was already created
  }

  return attendees.length;
}
