import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { getAppOnlyToken } from '@/lib/graph-app-token';

/**
 * POST /api/timetable/sync-from-teams
 * Import online meeting events from the Teams group calendar into the Nexus timetable.
 * Teacher-only.
 */
export async function POST(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const { classroom_id } = await request.json();

    if (!classroom_id) {
      return NextResponse.json({ error: 'classroom_id is required' }, { status: 400 });
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
      return NextResponse.json({ error: 'Only teachers can sync from Teams' }, { status: 403 });
    }

    // Get linked team
    const { data: classroom } = await supabase
      .from('nexus_classrooms')
      .select('ms_team_id, name')
      .eq('id', classroom_id)
      .single();

    if (!classroom?.ms_team_id) {
      return NextResponse.json({ error: 'Classroom has no linked Teams team' }, { status: 400 });
    }

    // Fetch online meeting events from the group calendar
    const token = await getAppOnlyToken();
    const now = new Date();
    const pastDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const futureDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();

    const events = await fetchGroupCalendarView(
      token,
      classroom.ms_team_id,
      pastDate,
      futureDate
    );

    // Get existing meetings for dedup
    const { data: existingClasses } = await supabase
      .from('nexus_scheduled_classes')
      .select('teams_meeting_id, teams_meeting_url')
      .eq('classroom_id', classroom_id)
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
    const meetings: { title: string; scheduled_date: string; status: string }[] = [];

    for (const event of events) {
      const joinUrl = event.onlineMeeting?.joinUrl;
      if (!joinUrl) {
        continue;
      }

      // Dedup by event ID
      if (existingMeetingIds.has(event.id)) {
        skipped++;
        continue;
      }

      // Dedup by join URL (catches Nexus-created meetings)
      if (existingJoinUrls.has(joinUrl)) {
        skipped++;
        continue;
      }

      try {
        // Parse date/time — Graph returns IST thanks to Prefer: outlook.timezone header
        const startStr = event.start.dateTime as string;
        const endStr = event.end.dateTime as string;

        const scheduledDate = startStr.substring(0, 10);
        const startTime = startStr.substring(11, 16);
        const endTime = endStr.substring(11, 16);

        // Resolve organizer -> teacher_id
        let teacherId = user.id;
        const organizerName = event.organizer?.emailAddress?.name || null;

        if (event.organizer?.emailAddress?.address) {
          const { data: organizer } = await supabase
            .from('users')
            .select('id')
            .eq('email', event.organizer.emailAddress.address)
            .single();

          if (organizer) {
            teacherId = organizer.id;
          }
        }

        // Extract description
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
            classroom_id,
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
          meetings.push({ title: event.subject, scheduled_date: scheduledDate, status: 'imported' });
          existingMeetingIds.add(event.id);
          existingJoinUrls.add(joinUrl);
        }
      } catch (err) {
        errors.push(`${event.subject}: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }

    return NextResponse.json({ imported, skipped, errors, meetings });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to sync from Teams';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * Fetch online meeting events from a Teams group calendar using calendarView.
 * Handles pagination, returns max 100 events.
 */
async function fetchGroupCalendarView(
  token: string,
  groupId: string,
  startDateTime: string,
  endDateTime: string,
): Promise<any[]> {
  const events: any[] = [];
  let url: string | null =
    `https://graph.microsoft.com/v1.0/groups/${groupId}/calendarView` +
    `?startDateTime=${encodeURIComponent(startDateTime)}` +
    `&endDateTime=${encodeURIComponent(endDateTime)}` +
    `&$top=50` +
    `&$orderby=start/dateTime desc` +
    `&$select=id,subject,start,end,onlineMeeting,organizer,body,isOnlineMeeting`;

  while (url && events.length < 100) {
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
      if (event.isOnlineMeeting && event.onlineMeeting?.joinUrl) {
        events.push(event);
      }
    }

    url = data['@odata.nextLink'] || null;
  }

  return events;
}
