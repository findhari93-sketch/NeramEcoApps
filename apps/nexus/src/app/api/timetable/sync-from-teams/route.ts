import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { canUser } from '@/lib/staff-capabilities';
import { getAppOnlyToken } from '@/lib/graph-app-token';
import { fetchGroupCalendarView } from '@/lib/teams-meeting-sync';

/**
 * POST /api/timetable/sync-from-teams
 * Import online meeting events from the Teams group calendar into the Nexus timetable.
 * Teacher-only.
 */
export async function POST(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const { classroom_id, quick, past_days, future_days } = await request.json();

    if (!classroom_id) {
      return NextResponse.json({ error: 'classroom_id is required' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient();

    // Verify teacher role
    const { data: user } = await supabase
      .from('users')
      .select('id, user_type, staff_role, can_teach')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Importing meetings from Teams writes classes into the timetable, so it is a
    // scheduling action. Gating on the capability instead of on a teacher
    // enrollment also stops an admin who is not enrolled from being rejected.
    if (!canUser(user, 'teach.timetable.schedule')) {
      return NextResponse.json(
        { error: 'Only the Neram team can import classes from Teams.' },
        { status: 403 },
      );
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

    // Fetch online meeting events from the group calendar.
    //
    // Two very different callers:
    //  - quick=true is the silent background auto-sync: a tight window is enough,
    //    it runs constantly and only needs to catch the next class or two.
    //  - the manual "Import from Teams" button is a backfill. Teachers expect it
    //    to pull the whole history of classes already run in the channel, not
    //    just the last week, so it defaults to a wide look-back (a full term) and
    //    accepts an even wider range from the caller. Anything older than this is
    //    almost certainly not worth importing as a fresh class.
    const token = await getAppOnlyToken();
    const now = new Date();
    const clampDays = (v: unknown, fallback: number) =>
      Math.min(Math.max(Math.round(Number(v)) || fallback, 1), 365);
    const pastDays = quick ? 1 : clampDays(past_days, 180);
    const futureDays = quick ? 14 : clampDays(future_days, 60);
    const maxEvents = quick ? 20 : 300;
    const pastDate = new Date(now.getTime() - pastDays * 24 * 60 * 60 * 1000).toISOString();
    const futureDate = new Date(now.getTime() + futureDays * 24 * 60 * 60 * 1000).toISOString();

    const events = await fetchGroupCalendarView(
      token,
      classroom.ms_team_id,
      pastDate,
      futureDate,
      maxEvents
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
      const joinUrl = event.joinUrl;
      if (!joinUrl) {
        continue;
      }

      // The shared fetcher deliberately keeps cancelled events so the reconciler
      // in teams-meeting-sync can act on them. This route only imports, so a
      // cancelled meeting must never become a live class here.
      if (event.isCancelled) {
        skipped++;
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
        // Graph returns IST thanks to the Prefer: outlook.timezone header
        const scheduledDate = event.start.substring(0, 10);
        const startTime = event.start.substring(11, 16);
        const endTime = event.end.substring(11, 16);

        // Resolve organizer -> teacher_id
        let teacherId = user.id;
        const organizerName = event.organizerName;

        if (event.organizerEmail) {
          const { data: organizer } = await supabase
            .from('users')
            .select('id')
            .eq('email', event.organizerEmail)
            .single();

          if (organizer) {
            teacherId = organizer.id;
          }
        }

        // Extract description
        const description = event.bodyContent
          ? event.bodyContent
              .replace(/<[^>]*>/g, '')
              .replace(/&nbsp;/g, ' ')
              .trim()
              .substring(0, 500) || null
          : null;

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
