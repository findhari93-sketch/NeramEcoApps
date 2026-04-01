import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import { getAppOnlyToken } from '@/lib/graph-app-token';

/**
 * GET /api/cron/sync-teams-meetings
 *
 * Called every 10 minutes by Vercel Cron.
 * Syncs online meetings from Teams group calendars into Nexus timetable
 * for ALL classrooms that have a linked Teams team (ms_team_id).
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
    // Look back 1 day and forward 14 days (same as quick mode)
    const pastDate = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString();
    const futureDate = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString();

    let totalImported = 0;
    let totalSkipped = 0;
    const errors: string[] = [];

    for (const classroom of classrooms) {
      try {
        const result = await syncClassroom(supabase, token, classroom, pastDate, futureDate);
        totalImported += result.imported;
        totalSkipped += result.skipped;
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
): Promise<{ imported: number; skipped: number; errors: string[] }> {
  // Fetch events from Teams group calendar
  const events = await fetchGroupCalendarView(token, classroom.ms_team_id, pastDate, futureDate);

  // Get existing meetings for dedup
  const { data: existingClasses } = await supabase
    .from('nexus_scheduled_classes')
    .select('teams_meeting_id, teams_meeting_url')
    .eq('classroom_id', classroom.id)
    .not('teams_meeting_url', 'is', null);

  const existingMeetingIds = new Set(
    (existingClasses || []).map((c: any) => c.teams_meeting_id).filter(Boolean)
  );
  const existingJoinUrls = new Set(
    (existingClasses || []).map((c: any) => c.teams_meeting_url).filter(Boolean)
  );

  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const event of events) {
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

      // Resolve organizer -> teacher_id
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

      // Extract description (strip HTML)
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
        errors.push(`${event.subject}: ${insertError.message}`);
      } else {
        imported++;
        existingMeetingIds.add(event.id);
        existingJoinUrls.add(joinUrl);
      }
    } catch (err) {
      errors.push(`${event.subject}: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }

  return { imported, skipped, errors };
}

/**
 * Fetch online meeting events from a Teams group calendar.
 * Max 20 events (cron runs frequently, no need for deep history).
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
    `&$top=20` +
    `&$orderby=start/dateTime desc` +
    `&$select=id,subject,start,end,onlineMeeting,organizer,body,isOnlineMeeting`;

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
    if (event.isOnlineMeeting && event.onlineMeeting?.joinUrl) {
      events.push(event);
    }
  }

  return events;
}
