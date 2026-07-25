/**
 * Shared Teams <-> Nexus meeting reconciliation.
 *
 * One implementation used by BOTH the on-page-load sync (api/timetable/sync-now) and
 * the daily cron (api/cron/sync-teams-meetings), so the two can never drift again.
 *
 * Three jobs per classroom:
 *   1. IMPORT   - a live Teams group-calendar meeting with no Nexus row -> insert one.
 *   2. CANCEL   - a Nexus channel_meeting class whose Teams event is EXPLICITLY
 *                 isCancelled -> mark it cancelled. (Only channel meetings live in the
 *                 group calendar; and we cancel ONLY on an explicit isCancelled flag,
 *                 matched by join URL, never merely because an event is missing from the
 *                 fetched window. Absence-based inference is what wrongly cancelled every
 *                 freshly-created class.)
 *   3. UPDATE   - a matched Teams event whose time/title changed -> update the Nexus row.
 *
 * Uses an app-only (client-credentials) Graph token supplied by the caller.
 */

import { getSupabaseAdminClient } from '@neram/database';

type AdminClient = ReturnType<typeof getSupabaseAdminClient>;

/** A calendar event trimmed to what reconciliation needs. */
export interface TeamsCalendarEvent {
  id: string;
  joinUrl: string | null;
  isCancelled: boolean;
  subject: string;
  start: string; // "YYYY-MM-DDTHH:mm:ss" in IST (Prefer header)
  end: string;
  organizerName: string | null;
  organizerEmail: string | null;
  bodyContent: string | null;
}

/** A class the reconciler just cancelled, so the caller can announce it. */
export interface CancelledClass {
  id: string;
  classroom_id: string;
  title: string;
  scheduled_date: string;
  start_time: string;
  end_time: string;
  teams_channel_id: string | null;
  teams_channel_message_id: string | null;
  teams_group_chat_message_id: string | null;
}

export interface SyncClassroomResult {
  imported: number;
  updated: number;
  cancelled: number;
  cancelledClasses: CancelledClass[];
  errors: string[];
}

/**
 * Fetch calendar events from a Teams group calendar, INCLUDING cancelled ones.
 * Only keeps online meetings that carry a join URL (the reliable match key).
 */
export async function fetchGroupCalendarView(
  token: string,
  groupId: string,
  startDateTime: string,
  endDateTime: string,
  maxEvents = 100,
): Promise<TeamsCalendarEvent[]> {
  const events: TeamsCalendarEvent[] = [];
  let url: string | null =
    `https://graph.microsoft.com/v1.0/groups/${groupId}/calendarView` +
    `?startDateTime=${encodeURIComponent(startDateTime)}` +
    `&endDateTime=${encodeURIComponent(endDateTime)}` +
    `&$top=50` +
    `&$orderby=start/dateTime desc` +
    `&$select=id,subject,start,end,onlineMeeting,organizer,body,isOnlineMeeting,isCancelled`;

  while (url && events.length < maxEvents) {
    const res: Response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Prefer: 'outlook.timezone="Asia/Kolkata"',
      },
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Failed to fetch group calendar: ${res.status} ${errText}`);
    }

    const data = await res.json();
    for (const event of data.value || []) {
      const joinUrl: string | null = event.onlineMeeting?.joinUrl ?? null;
      // Keep online meetings that have a join URL; cancelled ones are kept too so
      // cancel-detect can act on an explicit isCancelled flag.
      if (event.isOnlineMeeting && joinUrl) {
        events.push({
          id: event.id,
          joinUrl,
          isCancelled: !!event.isCancelled,
          subject: event.subject || 'Teams Meeting',
          start: event.start?.dateTime as string,
          end: event.end?.dateTime as string,
          organizerName: event.organizer?.emailAddress?.name ?? null,
          organizerEmail: event.organizer?.emailAddress?.address ?? null,
          bodyContent: event.body?.content ?? null,
        });
      }
    }

    url = data['@odata.nextLink'] || null;
  }

  return events;
}

/** Plain-text a Graph HTML body down to a short description. */
function toDescription(html: string | null): string | null {
  if (!html) return null;
  return (
    html
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .trim()
      .substring(0, 500) || null
  );
}

/**
 * Reconcile one classroom's Teams group calendar with its Nexus classes.
 * Pure of any announcement side effects; returns what it cancelled so the caller
 * can announce (delegated vs app-only posting differs by caller).
 */
export async function syncClassroomMeetings(
  supabase: AdminClient,
  token: string,
  classroom: { id: string; ms_team_id: string },
  pastISO: string,
  futureISO: string,
): Promise<SyncClassroomResult> {
  const result: SyncClassroomResult = {
    imported: 0,
    updated: 0,
    cancelled: 0,
    cancelledClasses: [],
    errors: [],
  };

  const teamsEvents = await fetchGroupCalendarView(token, classroom.ms_team_id, pastISO, futureISO);

  // Match key is the join URL: stable across create vs calendarView, unlike event ids.
  const eventByJoinUrl = new Map<string, TeamsCalendarEvent>();
  for (const e of teamsEvents) {
    if (e.joinUrl) eventByJoinUrl.set(e.joinUrl, e);
  }

  // Existing Nexus classes in the window (all statuses, so completed classes are not
  // re-imported and dedup works on both id and url).
  const { data: nexusClasses } = await supabase
    .from('nexus_scheduled_classes')
    .select(
      'id, classroom_id, teams_meeting_id, teams_meeting_url, teams_meeting_join_url, teams_meeting_scope, title, scheduled_date, start_time, end_time, status, created_at, teams_channel_id, teams_channel_message_id, teams_group_chat_message_id',
    )
    .eq('classroom_id', classroom.id)
    .not('teams_meeting_id', 'is', null)
    .gte('scheduled_date', pastISO.substring(0, 10))
    .lte('scheduled_date', futureISO.substring(0, 10)) as {
    data:
      | Array<{
          id: string;
          classroom_id: string;
          teams_meeting_id: string | null;
          teams_meeting_url: string | null;
          teams_meeting_join_url: string | null;
          teams_meeting_scope: string | null;
          title: string;
          scheduled_date: string;
          start_time: string;
          end_time: string;
          status: string | null;
          created_at: string | null;
          teams_channel_id: string | null;
          teams_channel_message_id: string | null;
          teams_group_chat_message_id: string | null;
        }>
      | null;
  };

  const existingMeetingIds = new Set(
    (nexusClasses || []).map((c) => c.teams_meeting_id).filter(Boolean),
  );
  const existingJoinUrls = new Set(
    (nexusClasses || [])
      .flatMap((c) => [c.teams_meeting_join_url, c.teams_meeting_url])
      .filter(Boolean) as string[],
  );

  // ─── 1. IMPORT new, non-cancelled Teams meetings ───
  for (const event of teamsEvents) {
    if (event.isCancelled || !event.joinUrl) continue;
    if (existingMeetingIds.has(event.id) || existingJoinUrls.has(event.joinUrl)) continue;

    try {
      let teacherId: string | null = null;
      if (event.organizerEmail) {
        const { data: organizer } = await supabase
          .from('users')
          .select('id')
          .eq('email', event.organizerEmail)
          .single();
        if (organizer) teacherId = organizer.id;
      }

      const { error } = await supabase.from('nexus_scheduled_classes').insert({
        classroom_id: classroom.id,
        title: event.subject,
        scheduled_date: event.start.substring(0, 10),
        start_time: event.start.substring(11, 16),
        end_time: event.end.substring(11, 16),
        teacher_id: teacherId,
        organizer_name: event.organizerName,
        description: toDescription(event.bodyContent),
        teams_meeting_id: event.id,
        teams_meeting_url: event.joinUrl,
        teams_meeting_join_url: event.joinUrl,
        teams_meeting_scope: 'channel_meeting',
        target_scope: 'classroom',
        status: 'scheduled',
      } as never);

      if (error) {
        result.errors.push(`Import ${event.subject}: ${error.message}`);
      } else {
        result.imported++;
        existingMeetingIds.add(event.id);
        existingJoinUrls.add(event.joinUrl);
      }
    } catch (err) {
      result.errors.push(`Import ${event.subject}: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }

  // Grace window: never cancel a class created in the last 30 minutes, its Teams
  // event may still be propagating into the group calendarView.
  const graceCutoff = Date.now() - 30 * 60 * 1000;

  for (const cls of nexusClasses || []) {
    // Only channel meetings live in the group calendar; other scopes must never be
    // auto-cancelled here.
    if (cls.teams_meeting_scope !== 'channel_meeting') continue;
    if (cls.status !== 'scheduled') continue;
    if (cls.created_at && new Date(cls.created_at).getTime() > graceCutoff) continue;

    const joinUrl = cls.teams_meeting_join_url || cls.teams_meeting_url;
    const matched = joinUrl ? eventByJoinUrl.get(joinUrl) : undefined;

    // ─── 2. CANCEL only on an EXPLICIT isCancelled flag from Teams ───
    if (matched?.isCancelled) {
      const { error } = await supabase
        .from('nexus_scheduled_classes')
        .update({ status: 'cancelled' } as never)
        .eq('id', cls.id);
      if (error) {
        result.errors.push(`Cancel ${cls.title}: ${error.message}`);
      } else {
        result.cancelled++;
        result.cancelledClasses.push({
          id: cls.id,
          classroom_id: cls.classroom_id,
          title: cls.title,
          scheduled_date: cls.scheduled_date,
          start_time: cls.start_time,
          end_time: cls.end_time,
          teams_channel_id: cls.teams_channel_id,
          teams_channel_message_id: cls.teams_channel_message_id,
          teams_group_chat_message_id: cls.teams_group_chat_message_id,
        });
      }
      continue;
    }

    // ─── 3. UPDATE a matched, live event whose time/title changed ───
    if (matched && !matched.isCancelled) {
      const teamsDate = matched.start.substring(0, 10);
      const teamsStart = matched.start.substring(11, 16);
      const teamsEnd = matched.end.substring(11, 16);
      const changed =
        cls.title !== matched.subject ||
        cls.scheduled_date !== teamsDate ||
        cls.start_time.substring(0, 5) !== teamsStart ||
        cls.end_time.substring(0, 5) !== teamsEnd;

      if (changed) {
        const { error } = await supabase
          .from('nexus_scheduled_classes')
          .update({
            title: matched.subject,
            scheduled_date: teamsDate,
            start_time: teamsStart,
            end_time: teamsEnd,
          } as never)
          .eq('id', cls.id);
        if (error) {
          result.errors.push(`Update ${cls.title}: ${error.message}`);
        } else {
          result.updated++;
        }
      }
    }
  }

  return result;
}
