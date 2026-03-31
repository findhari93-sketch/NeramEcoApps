import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken, extractBearerToken } from '@/lib/ms-verify';
import { getAppOnlyToken } from '@/lib/graph-app-token';
import { getSupabaseAdminClient } from '@neram/database';

/**
 * POST /api/timetable/teams-meeting
 * Creates a Microsoft Teams meeting for a scheduled class.
 *
 * Pass { auto: true } to auto-determine behavior from classroom config:
 *   - If classroom has linked team → creates a group calendar event (real Teams meeting)
 *   - If no linked team → creates standalone meeting + personal calendar invites
 *   - Always creates meeting link
 *
 * Or pass { scope } for explicit control:
 *   - link_only: standalone online meeting (join URL only)
 *   - channel_meeting: group calendar event on linked Teams team (proper Teams meeting)
 *   - calendar_event: standalone meeting + Outlook calendar invites to enrolled users
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

    // Verify teacher role & get user info
    const { data: user } = await supabase
      .from('users')
      .select('id, email')
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

    // Get classroom info (need ms_team_id for scope determination)
    const { data: classroom } = await supabase
      .from('nexus_classrooms')
      .select('ms_team_id, name')
      .eq('id', classroom_id)
      .single();

    // Determine scope
    let scope: string;
    if (auto) {
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

    // Race condition guard
    if (scheduledClass.teams_meeting_id) {
      return NextResponse.json({
        class: scheduledClass,
        meeting: {
          id: scheduledClass.teams_meeting_id,
          joinUrl: scheduledClass.teams_meeting_join_url || scheduledClass.teams_meeting_url,
          scope: scheduledClass.teams_meeting_scope,
        },
        alreadyExists: true,
      });
    }

    const ensureSec = (t: string) => t.length === 5 ? `${t}:00` : t;
    const extras: Record<string, unknown> = {};
    let meetingId: string;
    let joinUrl: string;

    if (scope === 'channel_meeting' && classroom?.ms_team_id) {
      // ── REAL TEAMS MEETING via group calendar (app-only token) ──
      // Uses app-only token (client credentials) which has Group.ReadWrite.All
      // This creates a proper Teams meeting visible in the channel with join bar.
      // Falls back to standalone meeting + channel post if group calendar fails.
      try {
        const appToken = await getAppOnlyToken();
        const result = await createGroupCalendarEvent(
          supabase, appToken, classroom.ms_team_id, classroom_id,
          scheduledClass.batch_id, scheduledClass, user.email || '', ensureSec
        );
        meetingId = result.meetingId;
        joinUrl = result.joinUrl;
        extras.invitedCount = result.attendeeCount;
        extras.channelPosted = true;
      } catch (groupErr) {
        console.error('Group calendar failed, falling back to standalone:', groupErr);
        // Fallback: standalone meeting + channel post + calendar invites
        const meeting = await createStandaloneMeeting(token, scheduledClass, ensureSec);
        meetingId = meeting.id;
        joinUrl = meeting.joinWebUrl;

        // Post to Teams channel (best-effort)
        try {
          await postToTeamsChannel(supabase, token, classroom.ms_team_id, scheduledClass, meeting);
          extras.channelPosted = true;
        } catch {
          // non-blocking
        }

        // Send calendar invites
        const invited = await createPersonalCalendarEvent(
          supabase, token, classroom_id,
          scheduledClass.batch_id, scheduledClass, meeting, user.email || '', ensureSec
        );
        extras.invitedCount = invited;
      }
    } else if (scope === 'calendar_event') {
      // ── STANDALONE MEETING + PERSONAL CALENDAR INVITES ──
      const meeting = await createStandaloneMeeting(token, scheduledClass, ensureSec);
      meetingId = meeting.id;
      joinUrl = meeting.joinWebUrl;

      // Send personal calendar invites to all enrolled users
      const invited = await createPersonalCalendarEvent(
        supabase, token, classroom_id,
        scheduledClass.batch_id, scheduledClass, meeting, user.email || '', ensureSec
      );
      extras.invitedCount = invited;
    } else {
      // ── LINK ONLY ──
      const meeting = await createStandaloneMeeting(token, scheduledClass, ensureSec);
      meetingId = meeting.id;
      joinUrl = meeting.joinWebUrl;
    }

    // Update the scheduled class with meeting info
    const { data: updated, error: updateError } = await supabase
      .from('nexus_scheduled_classes')
      .update({
        teams_meeting_id: meetingId,
        teams_meeting_url: joinUrl,
        teams_meeting_join_url: joinUrl,
        teams_meeting_scope: scope,
      })
      .eq('id', class_id)
      .select('*')
      .single();

    if (updateError) throw updateError;

    return NextResponse.json({
      class: updated,
      meeting: { id: meetingId, joinUrl, scope },
      ...extras,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create Teams meeting';
    console.error('Teams meeting creation error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * Create a standalone online meeting via /me/onlineMeetings.
 * Used for link_only and calendar_event scopes.
 */
async function createStandaloneMeeting(
  token: string,
  scheduledClass: Record<string, unknown>,
  ensureSec: (t: string) => string,
) {
  const startDateTime = `${scheduledClass.scheduled_date}T${ensureSec(scheduledClass.start_time as string)}+05:30`;
  const endDateTime = `${scheduledClass.scheduled_date}T${ensureSec(scheduledClass.end_time as string)}+05:30`;

  const res = await fetch('https://graph.microsoft.com/v1.0/me/onlineMeetings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      subject: scheduledClass.title,
      startDateTime,
      endDateTime,
      lobbyBypassSettings: { scope: 'organization' },
      allowedPresenters: 'organizer',
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => 'Unknown error');
    throw new Error(`Failed to create Teams meeting: ${res.status} ${errText}`);
  }

  return await res.json();
}

/**
 * Create a proper Teams meeting via the group (team) calendar.
 * This creates a real Teams meeting that:
 * - Shows up in the Teams channel with native meeting UI (purple join bar)
 * - Appears in all attendees' Outlook calendars
 * - Has proper meeting options, attendee tracking, lobby settings
 * - Supports recording, transcript, attendance reports natively
 */
async function createGroupCalendarEvent(
  supabase: ReturnType<typeof getSupabaseAdminClient>,
  token: string,
  teamId: string,
  classroomId: string,
  batchId: string | null,
  scheduledClass: Record<string, unknown>,
  creatorEmail: string,
  ensureSec: (t: string) => string,
): Promise<{ meetingId: string; joinUrl: string; attendeeCount: number }> {
  // Fetch all enrolled users (students + teachers) for attendee list
  const attendees = await getEnrolledAttendees(supabase, classroomId, batchId, creatorEmail);

  const eventPayload = {
    subject: scheduledClass.title as string,
    body: {
      contentType: 'HTML',
      content: scheduledClass.description
        ? `<p>${scheduledClass.description}</p>`
        : `<p>Scheduled class: <strong>${scheduledClass.title}</strong></p>`,
    },
    start: {
      dateTime: `${scheduledClass.scheduled_date}T${ensureSec(scheduledClass.start_time as string)}`,
      timeZone: 'Asia/Kolkata',
    },
    end: {
      dateTime: `${scheduledClass.scheduled_date}T${ensureSec(scheduledClass.end_time as string)}`,
      timeZone: 'Asia/Kolkata',
    },
    isOnlineMeeting: true,
    onlineMeetingProvider: 'teamsForBusiness',
    attendees,
  };

  const res = await fetch(
    `https://graph.microsoft.com/v1.0/groups/${teamId}/calendar/events`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(eventPayload),
    }
  );

  if (!res.ok) {
    const errText = await res.text().catch(() => 'Unknown error');
    throw new Error(`Failed to create group calendar event: ${res.status} ${errText}`);
  }

  const event = await res.json();
  const joinUrl = event.onlineMeeting?.joinUrl || '';
  // Use the event ID as the meeting identifier (for later recording/attendance sync)
  const meetingId = event.id || '';

  return { meetingId, joinUrl, attendeeCount: attendees.length };
}

/**
 * Create a personal calendar event with meeting link and invite enrolled users.
 * Used when no team is linked (calendar_event scope).
 */
async function createPersonalCalendarEvent(
  supabase: ReturnType<typeof getSupabaseAdminClient>,
  token: string,
  classroomId: string,
  batchId: string | null,
  scheduledClass: Record<string, unknown>,
  meeting: Record<string, unknown>,
  creatorEmail: string,
  ensureSec: (t: string) => string,
): Promise<number> {
  const attendees = await getEnrolledAttendees(supabase, classroomId, batchId, creatorEmail);

  if (attendees.length === 0) return 0;

  const eventPayload = {
    subject: scheduledClass.title as string,
    start: {
      dateTime: `${scheduledClass.scheduled_date}T${ensureSec(scheduledClass.start_time as string)}`,
      timeZone: 'Asia/Kolkata',
    },
    end: {
      dateTime: `${scheduledClass.scheduled_date}T${ensureSec(scheduledClass.end_time as string)}`,
      timeZone: 'Asia/Kolkata',
    },
    isOnlineMeeting: true,
    onlineMeetingProvider: 'teamsForBusiness',
    onlineMeeting: { joinUrl: meeting.joinWebUrl },
    attendees,
    body: {
      contentType: 'HTML',
      content: `<p>You are invited to <strong>${scheduledClass.title}</strong>.</p>
<p><a href="${meeting.joinWebUrl}">Join Microsoft Teams Meeting</a></p>`,
    },
  };

  const res = await fetch('https://graph.microsoft.com/v1.0/me/events', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(eventPayload),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    console.error('Failed to create personal calendar event:', res.status, errText);
  }

  return attendees.length;
}

/**
 * Fetch enrolled students AND teachers as calendar attendees.
 * Excludes the meeting creator (they're already the organizer).
 */
async function getEnrolledAttendees(
  supabase: ReturnType<typeof getSupabaseAdminClient>,
  classroomId: string,
  batchId: string | null,
  creatorEmail: string,
): Promise<Array<{ emailAddress: { address: string; name: string }; type: 'required' }>> {
  // Fetch all enrolled users (both students and teachers)
  let query = supabase
    .from('nexus_enrollments')
    .select('user_id, role, users!nexus_enrollments_user_id_fkey!inner(email, name)')
    .eq('classroom_id', classroomId)
    .eq('is_active', true);

  // Batch filtering only applies to students; teachers always get invited
  if (batchId) {
    // Students in this batch OR all teachers
    query = query.or(`batch_id.eq.${batchId},role.eq.teacher`);
  }

  const { data: enrollments } = await query;

  return (enrollments || [])
    .map((e: Record<string, unknown>) => {
      const u = e.users as Record<string, unknown> | null;
      return { email: u?.email as string | undefined, name: u?.name as string | undefined };
    })
    .filter((u): u is { email: string; name: string | undefined } =>
      !!u.email && u.email.toLowerCase() !== creatorEmail?.toLowerCase()
    )
    .map((u) => ({
      emailAddress: { address: u.email, name: u.name || u.email },
      type: 'required' as const,
    }));
}

/**
 * Post a meeting notification to the Teams General channel (fallback).
 * Used when group calendar event creation fails.
 */
async function postToTeamsChannel(
  supabase: ReturnType<typeof getSupabaseAdminClient>,
  token: string,
  teamId: string,
  scheduledClass: Record<string, unknown>,
  meeting: Record<string, unknown>,
) {
  // Get the General channel
  const channelsRes = await fetch(
    `https://graph.microsoft.com/v1.0/teams/${teamId}/channels?$filter=displayName eq 'General'`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!channelsRes.ok) return;

  const channelsData = await channelsRes.json();
  const generalChannel = channelsData.value?.[0];
  if (!generalChannel) return;

  const messageBody = {
    body: {
      contentType: 'html',
      content: `<h3>📅 ${scheduledClass.title}</h3>
<p><strong>Date:</strong> ${scheduledClass.scheduled_date}<br/>
<strong>Time:</strong> ${scheduledClass.start_time} – ${scheduledClass.end_time}</p>
<p><a href="${meeting.joinWebUrl}">🔗 Join Meeting</a></p>`,
    },
  };

  await fetch(
    `https://graph.microsoft.com/v1.0/teams/${teamId}/channels/${generalChannel.id}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messageBody),
    }
  );
}
