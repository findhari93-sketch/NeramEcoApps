import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken, extractBearerToken } from '@/lib/ms-verify';
import { getAppOnlyToken } from '@/lib/graph-app-token';
import { addMemberToTeam } from '@/lib/teams-sync';
import { getSupabaseAdminClient } from '@neram/database';
import {
  buildStaffAttendees,
  type GraphAttendee,
  type StaffCalendarRow,
} from '@/lib/class-attendees';
import { resolveClassAttendees } from '@/lib/class-calendar';

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
 *
 * Whatever path is taken, teams_calendar_event_id records whether a calendar
 * entry actually exists. Do not infer that from teams_meeting_scope: the scope
 * is also written on the failure path, and reading it as a result is how classes
 * came to display "Calendar invites" when nobody had been invited.
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
      .select('id, email, name')
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
      .select('ms_team_id, ms_group_chat_id, ms_channel_id, name')
      .eq('id', classroom_id)
      .single();

    // Determine scope.
    //
    // A linked team overrides an explicit `calendar_event`, and that is the whole
    // point rather than an inconvenience. Where the recording ends up is decided
    // here and nowhere else: a channel meeting stores it in the team's document
    // library, where every member can watch it forever, while a calendar event
    // makes a standalone `@thread.v2` meeting whose recording goes to the
    // ORGANIZER'S OneDrive and is shared only with the people on the invite. One
    // class scheduled that way in July left the recording out of the channel and
    // invisible to every teacher who was not invited. So the choice is refused
    // whenever there is a team to hold the recording, for `auto` and explicit
    // callers alike. `link_only` is left alone: it deliberately creates no
    // calendar entry at all and is not a recording path.
    let scope: string;
    let scopeUpgraded = false;
    if (auto) {
      scope = classroom?.ms_team_id ? 'channel_meeting' : 'calendar_event';
    } else {
      scope = explicitScope || 'link_only';
      if (scope === 'calendar_event' && classroom?.ms_team_id) {
        scope = 'channel_meeting';
        scopeUpgraded = true;
      }
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
    if (scopeUpgraded) {
      extras.scopeUpgraded = true;
      extras.scopeNote =
        'This class has a Teams team, so it was scheduled as a channel meeting. The recording then lands in the team files where every student and teacher can watch it, instead of in your personal OneDrive.';
    }
    let meetingId = '';
    let joinUrl = '';
    // The Outlook / group event id, empty when no calendar entry was created.
    let calendarEventId = '';
    // The subset of the above that is in the CALLER'S OWN mailbox. A group
    // calendar event is not: it lives in the M365 group's mailbox, which neither
    // Outlook nor Teams desktop renders in the personal calendar view, and the
    // organizer is not on its attendee list because they are the organizer. So
    // this stays empty on the group path, which is exactly what tells the class
    // panel to offer "Add to my calendar".
    let organizerEventId = '';
    let degraded = false;

    // Resolve the tutor (who takes the class) and the scheduler (the caller) so the
    // meeting can be put on the tutor's calendar and both are named in the Teams post.
    const schedulerName = user.name || user.email || 'Neram Classes';
    let tutorName = schedulerName;
    let tutorEmail = user.email || '';
    const tutorClassId = (scheduledClass as Record<string, unknown>).teacher_id as string | null;
    if (tutorClassId && tutorClassId !== user.id) {
      const { data: tutor } = await supabase
        .from('users')
        .select('name, email')
        .eq('id', tutorClassId)
        .single();
      if (tutor) {
        tutorName = tutor.name || tutor.email || schedulerName;
        tutorEmail = tutor.email || '';
      }
    }
    const postMeta = { tutorName, schedulerName };

    // Who sees this class on their Teams calendar: the tutor (required) plus the
    // internal core team (optional). External teachers are invited only to the
    // classes they tutor. See buildStaffAttendees.
    const staffAttendees = await getStaffAttendees(supabase, tutorEmail);

    if (scope === 'channel_meeting' && classroom?.ms_team_id) {
      // ── CHANNEL MEETING: proper group calendar event (shows in Teams channel + sends invites) ──
      // Writing to the team's group calendar requires the organizer to be a
      // MEMBER of that M365 group. Being only an owner is NOT enough: Microsoft
      // gates the group mailbox/calendar on membership, so an owner-only teacher
      // gets 403 ErrorAccessDenied here. So on the first failure we self-heal by
      // adding the organizer as a member (app-only, idempotent) and retry once,
      // keeping the teacher as the meeting organizer (so /me/onlineMeetings-based
      // auto-record and Class Capture transcripts keep working). Only if the
      // retry still fails (usually brand-new membership not yet provisioned on
      // the group mailbox) do we fall back to a standalone link so the teacher is
      // never left with no meeting.
      const teamId = classroom.ms_team_id; // narrowed to string by the guard above
      const createGroupEvent = () =>
        createGroupCalendarEvent(
          supabase, token, teamId, classroom_id,
          scheduledClass.batch_id, scheduledClass, user.email || '', ensureSec,
          staffAttendees, postMeta,
        );

      try {
        const result = await createGroupEvent();
        meetingId = result.meetingId;
        joinUrl = result.joinUrl;
        calendarEventId = result.meetingId;
        extras.attendeeCount = result.attendeeCount;
        if (result.skipped.length) extras.notInvited = result.skipped;
      } catch (firstErr) {
        console.error('Group calendar event failed; adding organizer as team member and retrying:', firstErr);
        let retried = false;
        try {
          if (!msUser.oid) throw new Error('Missing organizer ms_oid for team membership self-heal');
          await addMemberToTeam(teamId, msUser.oid);
          const result = await createGroupEvent();
          meetingId = result.meetingId;
          joinUrl = result.joinUrl;
          calendarEventId = result.meetingId;
          extras.attendeeCount = result.attendeeCount;
          if (result.skipped.length) extras.notInvited = result.skipped;
          extras.membershipHealed = true;
          retried = true;
        } catch (retryErr) {
          console.error('Group calendar event still failed after membership self-heal:', retryErr);
        }

        if (!retried) {
          // The group calendar is out of reach. Writing to it needs delegated
          // Group.ReadWrite.All, and membership self-heal cannot supply a
          // permission the token never carried, so this is where a tenant
          // without that consent always lands.
          //
          // Falling back to /me/onlineMeetings ALONE is what left the class
          // invisible to everybody: that endpoint returns a join link and
          // creates no calendar item for anyone, by design. So fall back all
          // the way to a personal calendar event, which needs only
          // Calendars.ReadWrite, and the tutor plus every student still get
          // the class on their Teams calendar.
          const fallback = await createMeetingWithInvites(
            supabase, token, classroom_id, scheduledClass.batch_id, scheduledClass,
            user.email || '', ensureSec, staffAttendees,
          );
          meetingId = fallback.meetingId;
          joinUrl = fallback.joinUrl;
          calendarEventId = fallback.calendarEventId;
          // This one IS in the caller's mailbox: createMeetingWithInvites writes
          // to /me/events, not to the group calendar.
          organizerEventId = fallback.calendarEventId;
          extras.invitedCount = fallback.invitedCount;
          if (fallback.skipped.length) extras.notInvited = fallback.skipped;
          // The stored scope reflects what was actually created.
          scope = 'calendar_event';
          degraded = true;
          extras.degraded = true;
          extras.note = fallback.calendarEventId
            ? 'Microsoft would not let us write to the class team calendar, so the meeting went on your own calendar instead and the invites were sent. Native channel meetings start working once the team calendar permission is granted.'
            : 'Created the Teams meeting link, but Microsoft refused both calendars, so no invite was sent. Open the class and use "Fix calendar invites" once access is restored.';
        }
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
      // Keep the channel + message IDs so cancelling the class can later remove
      // this announcement, instead of leaving a dead card in the channel.
      try {
        const posted = await postToTeamsChannel(supabase, token, classroom.ms_team_id, scheduledClass, { joinWebUrl: joinUrl }, MEETING_CHANNEL_NAME, classroom.ms_channel_id ?? null, buildRsvpUrl(request, scheduledClass.id), postMeta);
        extras.channelPosted = true;
        if (posted) {
          extras.teams_channel_id = posted.channelId;
          extras.teams_channel_message_id = posted.messageId;
        }
      } catch (err) {
        console.error('Channel post failed (non-blocking):', err);
      }
    } else if (scope === 'calendar_event') {
      // ── STANDALONE MEETING + PERSONAL CALENDAR INVITES ──
      const created = await createMeetingWithInvites(
        supabase, token, classroom_id, scheduledClass.batch_id, scheduledClass,
        user.email || '', ensureSec, staffAttendees,
      );
      meetingId = created.meetingId;
      joinUrl = created.joinUrl;
      calendarEventId = created.calendarEventId;
      organizerEventId = created.calendarEventId;
      extras.invitedCount = created.invitedCount;
      if (created.skipped.length) extras.notInvited = created.skipped;
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
        const chatMessageId = await postToTeamsGroupChat(token, classroom.ms_group_chat_id, buildMeetingHtml(scheduledClass, joinUrl, buildRsvpUrl(request, scheduledClass.id), postMeta));
        extras.groupChatPosted = true;
        if (chatMessageId) extras.teams_group_chat_message_id = chatMessageId;
      } catch (err) {
        console.error('Group chat post failed (non-blocking):', err);
      }
    }

    // Update the scheduled class with meeting info. Cast to any: the channel/chat
    // message-ID columns are newer than the generated Database type, like the
    // other recent Nexus timetable columns.
    const meetingUpdate: Record<string, unknown> = {
      teams_meeting_id: meetingId,
      teams_meeting_url: joinUrl,
      teams_meeting_join_url: joinUrl,
      teams_meeting_scope: scope,
      // The fact, not the intent. NULL here means the class has a join link and
      // nobody was invited, which is what the repair action looks for.
      teams_calendar_event_id: calendarEventId || null,
      // NULL here means the class is not on the scheduling teacher's own
      // calendar, even when it is on the team's, which is what the class panel's
      // "Add to my calendar" action looks for.
      teams_organizer_event_id: organizerEventId || null,
      teams_meeting_degraded: degraded,
    };
    if (extras.teams_channel_id) meetingUpdate.teams_channel_id = extras.teams_channel_id;
    if (extras.teams_channel_message_id) meetingUpdate.teams_channel_message_id = extras.teams_channel_message_id;
    if (extras.teams_group_chat_message_id) meetingUpdate.teams_group_chat_message_id = extras.teams_group_chat_message_id;

    const { data: updated, error: updateError } = await supabase
      .from('nexus_scheduled_classes')
      .update(meetingUpdate as never)
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
      ? 'Could not create a Teams meeting: Microsoft denied access. Sign out of Nexus and sign back in, then try again.'
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
 * Create a standalone Teams meeting AND put it on the organizer's calendar with
 * invites to everyone enrolled.
 *
 * The two calls are deliberately welded together. A meeting without a calendar
 * event is a join link that nobody was told about: /me/onlineMeetings does not
 * create a calendar item for the organizer, let alone the students. Splitting
 * these apart is precisely how the 403 fallback used to leave a class that
 * looked scheduled and reached no one.
 */
async function createMeetingWithInvites(
  supabase: ReturnType<typeof getSupabaseAdminClient>,
  token: string,
  classroomId: string,
  batchId: string | null,
  scheduledClass: Record<string, unknown>,
  creatorEmail: string,
  ensureSec: (t: string) => string,
  extraAttendees: GraphAttendee[] = [],
): Promise<{
  meetingId: string;
  joinUrl: string;
  calendarEventId: string;
  invitedCount: number;
  skipped: string[];
}> {
  const meeting = await createStandaloneMeeting(token, scheduledClass, ensureSec);
  const invite = await createPersonalCalendarEvent(
    supabase, token, classroomId, batchId, scheduledClass, meeting,
    creatorEmail, ensureSec, extraAttendees,
  );
  return {
    meetingId: meeting.id,
    joinUrl: meeting.joinWebUrl,
    calendarEventId: invite.eventId,
    invitedCount: invite.invited,
    skipped: invite.skipped,
  };
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
  extraAttendees: GraphAttendee[] = [],
  meta?: PostMeta,
): Promise<{ meetingId: string; joinUrl: string; attendeeCount: number; skipped: string[] }> {
  // Enrolled users (students + teachers) plus all teaching staff, so the tutor and
  // every teacher get the class on their calendar.
  const { attendees, skipped } = await resolveClassAttendees(supabase, classroomId, batchId, creatorEmail, extraAttendees);

  const tutorLine = meta?.tutorName?.trim()
    ? `<p><strong>Tutor:</strong> ${meta.tutorName.trim()}</p>`
    : '';
  const eventPayload = {
    subject: scheduledClass.title as string,
    body: {
      contentType: 'HTML',
      content: `${tutorLine}${
        scheduledClass.description
          ? `<p>${scheduledClass.description}</p>`
          : `<p>Scheduled class: <strong>${scheduledClass.title}</strong></p>`
      }`,
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

  return { meetingId, joinUrl, attendeeCount: attendees.length, skipped };
}

/**
 * Create a personal calendar event with meeting link and invite enrolled users.
 * Used when no team is linked (calendar_event scope) and as the fallback when
 * the group calendar refuses the write.
 *
 * Returns the created event id, which is the only trustworthy proof that a
 * calendar entry exists. An empty id means nobody was invited.
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
  extraAttendees: GraphAttendee[] = [],
): Promise<{ eventId: string; invited: number; skipped: string[] }> {
  const { attendees, skipped } = await resolveClassAttendees(supabase, classroomId, batchId, creatorEmail, extraAttendees);

  // Deliberately no early return on an empty attendee list. The organizer's own
  // calendar entry is the point: a teacher whose class has no other invitees
  // still needs the class to show up in their Teams calendar.

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
    return { eventId: '', invited: 0, skipped };
  }

  const event = await res.json().catch(() => null);
  return { eventId: (event?.id as string) || '', invited: attendees.length, skipped };
}

/**
 * Load the staff rows and apply the attendee rule. The rule itself lives in
 * @/lib/class-attendees (pure, unit tested); this only does the fetch.
 */
async function getStaffAttendees(
  supabase: ReturnType<typeof getSupabaseAdminClient>,
  tutorEmail: string,
): Promise<GraphAttendee[]> {
  const { data: staff } = await supabase
    .from('users')
    .select('name, email, ms_oid, user_type, staff_role, is_disabled')
    .in('user_type', ['teacher', 'admin']);

  return buildStaffAttendees((staff || []) as StaffCalendarRow[], tutorEmail);
}

/** Default channel to announce scheduled meetings in (falls back to General). */
const MEETING_CHANNEL_NAME = 'Class Meeting Details';

/** Tutor + scheduler names surfaced in the Teams channel/chat announcement. */
type PostMeta = { tutorName?: string; schedulerName?: string };

/** Shared HTML body for the channel post and the group-chat post. */
function buildMeetingHtml(scheduledClass: Record<string, unknown>, joinUrl: string, rsvpUrl?: string, meta?: PostMeta): string {
  const desc = (scheduledClass.description as string | null | undefined)?.trim();
  const tutorName = meta?.tutorName?.trim();
  const schedulerName = meta?.schedulerName?.trim();
  const tutorLine = tutorName
    ? `<p>👩‍🏫 <strong>Tutor:</strong> ${tutorName}${
        schedulerName && schedulerName !== tutorName
          ? ` &nbsp;·&nbsp; <strong>Scheduled by:</strong> ${schedulerName}`
          : ''
      }</p>`
    : '';
  return `<h3>📅 ${scheduledClass.title}</h3>
<p><strong>Date:</strong> ${scheduledClass.scheduled_date}<br/>
<strong>Time:</strong> ${scheduledClass.start_time} to ${scheduledClass.end_time} (IST)</p>
${tutorLine}${desc ? `<p>${desc.replace(/\n/g, '<br/>')}</p>` : ''}
<p><a href="${joinUrl}">🔗 Join Meeting</a></p>${
    rsvpUrl
      ? `\n<p>✋ Can't make it? <a href="${rsvpUrl}">Tap to RSVP</a> (you're marked attending by default).</p>`
      : ''
  }`;
}

/** Absolute URL of the student RSVP page for a class, shared into Teams/WhatsApp. */
function buildRsvpUrl(request: NextRequest, classId: unknown): string {
  if (!classId) return '';
  const base = process.env.NEXT_PUBLIC_NEXUS_URL || request.nextUrl.origin;
  return `${base.replace(/\/$/, '')}/student/rsvp/${classId}`;
}

/**
 * Post a meeting announcement to a Teams channel. When the classroom has an
 * explicitly linked channel (channelId), post there directly. Otherwise resolve
 * the dedicated "Class Meeting Details" channel by name, falling back to General,
 * so teams without the linked channel keep working.
 */
async function postToTeamsChannel(
  supabase: ReturnType<typeof getSupabaseAdminClient>,
  token: string,
  teamId: string,
  scheduledClass: Record<string, unknown>,
  meeting: Record<string, unknown>,
  channelName: string = MEETING_CHANNEL_NAME,
  channelId: string | null = null,
  rsvpUrl?: string,
  meta?: PostMeta,
): Promise<{ channelId: string; messageId: string } | null> {
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

  // Prefer the classroom's explicitly linked channel; else resolve by name.
  const channel = channelId
    ? { id: channelId }
    : (await findChannel(channelName)) || (await findChannel('General'));
  if (!channel) return null;

  const messageBody = {
    body: {
      contentType: 'html',
      content: buildMeetingHtml(scheduledClass, (meeting.joinWebUrl as string) || '', rsvpUrl, meta),
    },
  };

  const res = await fetch(
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

  if (!res.ok) return null;
  // Return the channel + message IDs so the class can later softDelete this card.
  const posted = await res.json().catch(() => null);
  if (!posted?.id) return null;
  return { channelId: channel.id as string, messageId: posted.id as string };
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
): Promise<string | null> {
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

  // Return the message ID so the class can later softDelete this announcement.
  const posted = await res.json().catch(() => null);
  return (posted?.id as string) || null;
}
