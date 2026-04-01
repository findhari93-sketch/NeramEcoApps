import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import { getAppOnlyToken } from '@/lib/graph-app-token';

/**
 * GET /api/cron/sync-teams-meetings
 *
 * Called every 10 minutes by Supabase pg_cron.
 * Full bidirectional sync between Teams group calendars and Nexus timetable:
 *
 * 1. IMPORT: New meetings in Teams → create in Nexus
 * 2. CANCEL DETECT: Meetings deleted/cancelled in Teams → mark cancelled in Nexus
 * 3. UPDATE: Meeting time/title changed in Teams → update in Nexus
 *
 * Uses app-only token (no user interaction needed).
 */
export async function GET() {
  try {
    const supabase = getSupabaseAdminClient();

    // Find all classrooms with linked Teams teams
    const { data: classrooms, error: clsError } = await supabase
      .from('nexus_classrooms')
      .select('id, name, ms_team_id')
      .not('ms_team_id', 'is', null)
      .eq('is_active', true);

    if (clsError) throw clsError;
    if (!classrooms || classrooms.length === 0) {
      return NextResponse.json({ message: 'No classrooms with linked Teams teams', synced: 0 });
    }

    const token = await getAppOnlyToken();
    const now = new Date();
    const pastDate = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString();
    const futureDate = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString();

    let totalImported = 0;
    let totalSkipped = 0;
    let totalCancelled = 0;
    let totalUpdated = 0;
    const errors: string[] = [];

    for (const classroom of classrooms) {
      if (!classroom.ms_team_id) continue;
      try {
        const result = await syncClassroom(supabase, token, classroom as { id: string; name: string; ms_team_id: string }, pastDate, futureDate);
        totalImported += result.imported;
        totalSkipped += result.skipped;
        totalCancelled += result.cancelled;
        totalUpdated += result.updated;
        if (result.errors.length > 0) {
          errors.push(`${classroom.name}: ${result.errors.join(', ')}`);
        }
      } catch (err) {
        errors.push(`${classroom.name}: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }

    return NextResponse.json({
      classrooms: classrooms.length,
      imported: totalImported,
      skipped: totalSkipped,
      cancelled: totalCancelled,
      updated: totalUpdated,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    console.error('Cron sync-teams-meetings error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to sync Teams meetings' },
      { status: 500 }
    );
  }
}

async function syncClassroom(
  supabase: ReturnType<typeof getSupabaseAdminClient>,
  token: string,
  classroom: { id: string; name: string; ms_team_id: string },
  pastDate: string,
  futureDate: string,
): Promise<{ imported: number; skipped: number; cancelled: number; updated: number; errors: string[] }> {
  // Fetch current events from Teams group calendar
  const teamsEvents = await fetchGroupCalendarView(token, classroom.ms_team_id, pastDate, futureDate);

  // Build a map of Teams event IDs for quick lookup
  const teamsEventMap = new Map<string, any>();
  for (const event of teamsEvents) {
    teamsEventMap.set(event.id, event);
  }

  // Get all Nexus classes with Teams meeting IDs for this classroom (scheduled/live only)
  const { data: nexusClasses } = await supabase
    .from('nexus_scheduled_classes')
    .select('id, teams_meeting_id, teams_meeting_url, title, scheduled_date, start_time, end_time, status')
    .eq('classroom_id', classroom.id)
    .not('teams_meeting_id', 'is', null)
    .in('status', ['scheduled', 'live'])
    .gte('scheduled_date', pastDate.substring(0, 10))
    .lte('scheduled_date', futureDate.substring(0, 10));

  const existingMeetingIds = new Set(
    (nexusClasses || []).map((c: any) => c.teams_meeting_id).filter(Boolean)
  );
  const existingJoinUrls = new Set(
    (nexusClasses || []).map((c: any) => c.teams_meeting_url).filter(Boolean)
  );

  let imported = 0;
  let skipped = 0;
  let cancelled = 0;
  let updated = 0;
  const errors: string[] = [];

  // ─── 1. IMPORT new meetings from Teams → Nexus ───
  for (const event of teamsEvents) {
    const joinUrl = event.onlineMeeting?.joinUrl;
    if (!joinUrl) continue;

    if (existingMeetingIds.has(event.id) || existingJoinUrls.has(joinUrl)) {
      skipped++;
      continue;
    }

    try {
      const startStr = event.start.dateTime as string;
      const endStr = event.end.dateTime as string;
      const scheduledDate = startStr.substring(0, 10);
      const startTime = startStr.substring(11, 16);
      const endTime = endStr.substring(11, 16);

      let teacherId: string | null = null;
      const organizerName = event.organizer?.emailAddress?.name || null;

      if (event.organizer?.emailAddress?.address) {
        const { data: organizer } = await supabase
          .from('users')
          .select('id')
          .eq('email', event.organizer.emailAddress.address)
          .single();
        if (organizer) teacherId = organizer.id;
      }

      let description: string | null = null;
      if (event.body?.content) {
        description = event.body.content
          .replace(/<[^>]*>/g, '')
          .replace(/&nbsp;/g, ' ')
          .trim()
          .substring(0, 500) || null;
      }

      const { error: insertError } = await supabase
        .from('nexus_scheduled_classes')
        .insert({
          classroom_id: classroom.id,
          title: event.subject || 'Teams Meeting',
          scheduled_date: scheduledDate,
          start_time: startTime,
          end_time: endTime,
          teacher_id: teacherId,
          organizer_name: organizerName,
          description,
          teams_meeting_id: event.id,
          teams_meeting_url: joinUrl,
          teams_meeting_join_url: joinUrl,
          teams_meeting_scope: 'channel_meeting',
          target_scope: 'classroom',
          status: 'scheduled',
        });

      if (insertError) {
        errors.push(`Import ${event.subject}: ${insertError.message}`);
      } else {
        imported++;
        existingMeetingIds.add(event.id);
        existingJoinUrls.add(joinUrl);
      }
    } catch (err) {
      errors.push(`Import ${event.subject}: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }

  // ─── 2. CANCEL DETECT: Nexus meetings no longer in Teams → mark cancelled ───
  // If a Nexus class has a teams_meeting_id but that event no longer exists in Teams,
  // it was cancelled/deleted in Teams → cancel it in Nexus too.
  for (const nexusClass of nexusClasses || []) {
    if (!nexusClass.teams_meeting_id) continue;
    if (nexusClass.status !== 'scheduled') continue;

    if (!teamsEventMap.has(nexusClass.teams_meeting_id)) {
      // Meeting was deleted/cancelled in Teams — cancel in Nexus
      try {
        const { error: cancelError } = await supabase
          .from('nexus_scheduled_classes')
          .update({ status: 'cancelled' })
          .eq('id', nexusClass.id);

        if (cancelError) {
          errors.push(`Cancel ${nexusClass.title}: ${cancelError.message}`);
        } else {
          cancelled++;
        }
      } catch (err) {
        errors.push(`Cancel ${nexusClass.title}: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }
  }

  // ─── 3. UPDATE: Detect time/title changes in Teams → update Nexus ───
  for (const nexusClass of nexusClasses || []) {
    if (!nexusClass.teams_meeting_id) continue;
    if (nexusClass.status !== 'scheduled') continue;

    const teamsEvent = teamsEventMap.get(nexusClass.teams_meeting_id);
    if (!teamsEvent) continue; // Already handled by cancel detect

    try {
      const startStr = teamsEvent.start.dateTime as string;
      const endStr = teamsEvent.end.dateTime as string;
      const teamsDate = startStr.substring(0, 10);
      const teamsStartTime = startStr.substring(11, 16);
      const teamsEndTime = endStr.substring(11, 16);
      const teamsTitle = teamsEvent.subject || 'Teams Meeting';

      // Normalize Nexus times (may have :00 seconds suffix)
      const nexusStart = nexusClass.start_time.substring(0, 5);
      const nexusEnd = nexusClass.end_time.substring(0, 5);

      // Check if anything changed
      const changed =
        nexusClass.title !== teamsTitle ||
        nexusClass.scheduled_date !== teamsDate ||
        nexusStart !== teamsStartTime ||
        nexusEnd !== teamsEndTime;

      if (changed) {
        const { error: updateError } = await supabase
          .from('nexus_scheduled_classes')
          .update({
            title: teamsTitle,
            scheduled_date: teamsDate,
            start_time: teamsStartTime,
            end_time: teamsEndTime,
          })
          .eq('id', nexusClass.id);

        if (updateError) {
          errors.push(`Update ${nexusClass.title}: ${updateError.message}`);
        } else {
          updated++;
        }
      }
    } catch (err) {
      errors.push(`Update ${nexusClass.title}: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }

  return { imported, skipped, cancelled, updated, errors };
}

/**
 * Fetch ALL calendar events (not just online meetings) from a Teams group calendar.
 * Includes cancelled events via isCancelled field.
 * Max 50 events per classroom.
 */
async function fetchGroupCalendarView(
  token: string,
  groupId: string,
  startDateTime: string,
  endDateTime: string,
): Promise<any[]> {
  const events: any[] = [];
  const url =
    `https://graph.microsoft.com/v1.0/groups/${groupId}/calendarView` +
    `?startDateTime=${encodeURIComponent(startDateTime)}` +
    `&endDateTime=${encodeURIComponent(endDateTime)}` +
    `&$top=50` +
    `&$orderby=start/dateTime desc` +
    `&$select=id,subject,start,end,onlineMeeting,organizer,body,isOnlineMeeting,isCancelled`;

  const res = await fetch(url, {
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
    // Only include online meetings that are NOT cancelled
    if (event.isOnlineMeeting && event.onlineMeeting?.joinUrl && !event.isCancelled) {
      events.push(event);
    }
  }

  return events;
}
