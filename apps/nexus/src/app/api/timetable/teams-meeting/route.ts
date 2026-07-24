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
      .select('ms_team_id, ms_group_chat_id, name')
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
      // ── CHANNEL MEETING: proper group calendar event (shows in Teams channel + sends invites) ──
      // Writing to the team's group calendar requires the organizer to be a
      // member/owner of that M365 group. If that call is denied (403
      // ErrorAccessDenied) or otherwise fails, we don't want the teacher left
      // with no meeting: fall back to a standalone meeting link (uses
      // OnlineMeetings.ReadWrite, which is not membership-gated) and still
      // announce it in the channel.
      try {
        const result = await createGroupCalendarEvent(
          supabase, token, classroom.ms_team_id, classroom_id,
          scheduledClass.batch_id, scheduledClass, user.email || '', ensureSec
        );
        meetingId = result.meetingId;
        joinUrl = result.joinUrl;
        extras.attendeeCount = result.attendeeCount;
      } catch (err) {
        console.error('Group calendar event failed, falling back to standalone meeting:', err);
        const meeting = await createStandaloneMeeting(token, scheduledClass, ensureSec);
        meetingId = meeting.id;
        joinUrl = meeting.joinWebUrl;
        // The stored scope reflects what was actually created.
        scope = 'calendar_event';
        extras.degraded = true;
        extras.note =
          'Created a standalone Teams meeting link because the team calendar was not writable (you may not be a member of the team). To get a native channel meeting, ask an admin to add you to the team.';
      }

      // Enable auto-record on the linked online meeting (best-effort, non-blocking).
      // The group calendar event does not take recordAutomatically directly, so we
      // resolve the online meeting by its join URL and PATCH the flag.
      if (joinUrl) {
        try {
          await enableAutoRecord(token, joinUrl);
          extras.autoRecord = true;
        } catch (err) {
          console.error('Auto-record enable failed (non-blocking):', err);
        }
      }

      // Post to Teams channel (best-effort, non-blocking). Worth doing on the
      // fallback path too so the standalone link still appears in the channel.
      try {
        await postToTeamsChannel(supabase, token, classroom.ms_team_id, scheduledClass, { joinWebUrl: joinUrl });
        extras.channelPosted = true;
      } catch (err) {
        console.error('Channel post failed (non-blocking):', err);
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

    // Post the meeting to the class Teams group chat (best-effort, non-blocking).
    // Works for any scope as long as we have a join URL and the classroom has a
    // linked group chat. The teacher's delegated token must carry ChatMessage.Send.
    if (joinUrl && classroom?.ms_group_chat_id) {
      try {
        await postToTeamsGroupChat(token, classroom.ms_group_chat_id, buildMeetingHtml(scheduledClass, joinUrl));
        extras.groupChatPosted = true;
      } catch (err) {
        console.error('Group chat post failed (non-blocking):', err);
      }
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
    // Reaching here means even the standalone fallback failed. Keep the raw Graph
    // text in the server logs, but show the teacher a clear, actionable message.
    const message = err instanceof Error ? err.message : 'Failed to create Teams meeting';
    console.error('Teams meeting creation error:', message);
    const friendly = /access.?denied|forbidden|403|unauthor|invalid.*token|401/i.test(message)
      ? 'Could not create a Teams meeting: Microsoft denied access. Sign out of Nexus and sign back in, then try again. If it keeps failing, make sure your account is a member of the class team.'
      : 'Could not create a Teams meeting right now. Please try again in a moment.';
    return NextResponse.json({ error: friendly }, { status: 500 });
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

  const post = (body: Record<string, unknown>) =>
    fetch('https://graph.microsoft.com/v1.0/me/onlineMeetings', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

  // First try the full body: auto-record + lobby/presenter options. Some tenant
  // meeting policies reject these extras with a 4xx, so on a client error we
  // retry with just the essentials rather than hard-failing (auto-record is then
  // re-applied best-effort by enableAutoRecord after the meeting exists).
  let res = await post({
    subject: scheduledClass.title,
    startDateTime,
    endDateTime,
    recordAutomatically: true,
    lobbyBypassSettings: {
      scope: (scheduledClass.lobby_bypass as string) || 'organization',
    },
    allowedPresenters: (scheduledClass.allowed_presenters as string) || 'organizer',
  });

  if (!res.ok && res.status >= 400 && res.status < 500) {
    console.error(`Standalone meeting rejected extras (${res.status}); retrying with a minimal body`);
    res = await post({ subject: scheduledClass.title, startDateTime, endDateTime });
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => 'Unknown error');
    throw new Error(`Failed to create Teams meeting: ${res.status} ${errText}`);
  }

  return await res.json();
}

/**
 * Best-effort: turn on auto-recording for the online meeting behind a join URL.
 * Resolves the meeting via the organizer's /me/onlineMeetings (delegated token)
 * then PATCHes recordAutomatically. Only effective if the organizer's Teams
 * meeting policy permits auto-recording; throws are caught by the caller.
 */
async function enableAutoRecord(token: string, joinUrl: string): Promise<void> {
  const filter = `JoinWebUrl eq '${joinUrl.replace(/'/g, "''")}'`;
  const lookupRes = await fetch(
    `https://graph.microsoft.com/v1.0/me/onlineMeetings?$filter=${encodeURIComponent(filter)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!lookupRes.ok) return;

  const lookup = await lookupRes.json();
  const meetingId = lookup.value?.[0]?.id as string | undefined;
  if (!meetingId) return;

  await fetch(`https://graph.microsoft.com/v1.0/me/onlineMeetings/${meetingId}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ recordAutomatically: true }),
  });
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

/** Default channel to announce scheduled meetings in (falls back to General). */
const MEETING_CHANNEL_NAME = 'Class Meeting Details';

/** Shared HTML body for the channel post and the group-chat post. */
function buildMeetingHtml(scheduledClass: Record<string, unknown>, joinUrl: string): string {
  const desc = (scheduledClass.description as string | null | undefined)?.trim();
  return `<h3>📅 ${scheduledClass.title}</h3>
<p><strong>Date:</strong> ${scheduledClass.scheduled_date}<br/>
<strong>Time:</strong> ${scheduledClass.start_time} to ${scheduledClass.end_time} (IST)</p>
${desc ? `<p>${desc.replace(/\n/g, '<br/>')}</p>` : ''}
<p><a href="${joinUrl}">🔗 Join Meeting</a></p>`;
}

/**
 * Post a meeting announcement to a Teams channel. Targets the dedicated
 * "Class Meeting Details" channel by name and falls back to General when it does
 * not exist, so teams without the channel keep working.
 */
async function postToTeamsChannel(
  supabase: ReturnType<typeof getSupabaseAdminClient>,
  token: string,
  teamId: string,
  scheduledClass: Record<string, unknown>,
  meeting: Record<string, unknown>,
  channelName: string = MEETING_CHANNEL_NAME,
) {
  // Resolve the target channel by display name, falling back to General.
  const findChannel = async (name: string) => {
    const res = await fetch(
      `https://graph.microsoft.com/v1.0/teams/${teamId}/channels?$filter=displayName eq '${name.replace(/'/g, "''")}'`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data.value?.[0] ?? null;
  };

  const channel = (await findChannel(channelName)) || (await findChannel('General'));
  if (!channel) return;

  const messageBody = {
    body: {
      contentType: 'html',
      content: buildMeetingHtml(scheduledClass, (meeting.joinWebUrl as string) || ''),
    },
  };

  await fetch(
    `https://graph.microsoft.com/v1.0/teams/${teamId}/channels/${channel.id}/messages`,
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

/**
 * Post a meeting announcement to a Teams group chat.
 * Uses the teacher's delegated token (they are a member of the chat); requires
 * the delegated ChatMessage.Send scope. Best-effort, throws on failure so the
 * caller can log and continue.
 */
async function postToTeamsGroupChat(
  token: string,
  chatId: string,
  html: string,
) {
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/chats/${chatId}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ body: { contentType: 'html', content: html } }),
    }
  );

  if (!res.ok) {
    const errText = await res.text().catch(() => 'Unknown error');
    throw new Error(`Failed to post to group chat: ${res.status} ${errText}`);
  }
}
