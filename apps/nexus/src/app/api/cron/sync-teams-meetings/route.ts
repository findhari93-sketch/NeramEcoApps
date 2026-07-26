import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import { assertCronRequest } from '@/lib/cron-auth';
import { getAppOnlyToken } from '@/lib/graph-app-token';
import { syncClassroomMeetings } from '@/lib/teams-meeting-sync';
import { announceCancellationToTeams } from '@/lib/teams-class-announcements';
import { notifyClassCancelled } from '@/lib/timetable-notifications';

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
export async function GET(request: NextRequest) {
  const unauthorized = assertCronRequest(request);
  if (unauthorized) return unauthorized;

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
    // 90-day lookback (not just 1 day): the UPDATE step also backfills organizer_name/
    // organizer_email for classes already in Nexus, so a wider window is what makes
    // already-scheduled historical classes self-heal their organizer data over time.
    const pastDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const futureDate = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString();

    let totalImported = 0;
    let totalSkipped = 0;
    let totalCancelled = 0;
    let totalUpdated = 0;
    const errors: string[] = [];

    for (const classroom of classrooms) {
      if (!classroom.ms_team_id) continue;
      try {
        const result = await syncClassroomMeetings(
          supabase,
          token,
          classroom as { id: string; ms_team_id: string },
          pastDate,
          futureDate,
        );
        totalImported += result.imported;
        totalCancelled += result.cancelled;
        totalUpdated += result.updated;

        // A class cancelled from within Teams: post a "Cancelled" card (best-effort,
        // app-only) and notify students in-app.
        for (const cancelled of result.cancelledClasses) {
          await announceCancellationToTeams(token, supabase, cancelled.classroom_id, cancelled, cancelled).catch(
            () => {},
          );
          await notifyClassCancelled(
            cancelled.classroom_id,
            cancelled.title,
            cancelled.scheduled_date,
            cancelled.id,
          ).catch(() => {});
        }

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
