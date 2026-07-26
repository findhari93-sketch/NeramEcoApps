import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import { assertCronRequest } from '@/lib/cron-auth';
import { istToday, computeAbsencesForClass } from '@/lib/class-absences';
import {
  syncClassAttendance,
  CLASS_SYNC_COLUMNS,
  type AttendanceSyncFailure,
  type ClassMeetingRow,
} from '@/lib/attendance-sync';

/**
 * GET /api/cron/sync-attendance
 *
 * Pull Teams attendance for recently finished classes, unattended.
 *
 * This is the piece that was previously declared impossible: the old sync read
 * attendance off the DELEGATED `/me/onlineMeetings`, so it needed a signed-in
 * teacher and a cron could never run it. Attendance now resolves app-only on
 * behalf of the meeting's real organizer, so no user is involved at all.
 *
 * Scheduled twice daily (see apps/nexus/vercel.json). The 8:50 pm IST pass runs
 * ten minutes BEFORE class-followups, which computes absences from whatever
 * attendance is already recorded; that ordering is the whole point. The late pass
 * picks up reports Graph had not published yet and classes that ended after 9 pm.
 *
 * Doubles as the backfill tool: `?days=60&limit=40`, repeat until pending is 0.
 */

/** Minutes after a class ends before Teams can be expected to have a report. */
const REPORT_GRACE_MINUTES = 20;

/** Give up after this many failed attempts so a dead report stops costing calls. */
const MAX_ATTEMPTS = 6;

export async function GET(request: NextRequest) {
  const unauthorized = assertCronRequest(request);
  if (unauthorized) return unauthorized;

  try {
    const supabase = getSupabaseAdminClient() as any;
    const params = request.nextUrl.searchParams;
    const days = Math.min(Math.max(Number(params.get('days') ?? 7), 1), 400);
    const limit = Math.min(Math.max(Number(params.get('limit') ?? 40), 1), 100);

    const today = istToday();
    const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().substring(0, 10);

    const { data: candidates, error } = await supabase
      .from('nexus_scheduled_classes')
      .select(`${CLASS_SYNC_COLUMNS}, end_time, attendance_sync_attempts, attendance_sync_status, status, publish_state`)
      .not('teams_meeting_id', 'is', null)
      .is('attendance_synced_at', null)
      .neq('status', 'cancelled')
      .eq('publish_state', 'published')
      .gte('scheduled_date', from)
      .lte('scheduled_date', today)
      .lt('attendance_sync_attempts', MAX_ATTEMPTS)
      .order('scheduled_date', { ascending: false })
      .order('start_time', { ascending: false })
      .limit(limit);

    if (error) throw error;

    // A class whose end time has not passed (plus grace) has no report yet, so
    // calling Graph for it only burns an attempt against the cap.
    const cutoff = Date.now() - REPORT_GRACE_MINUTES * 60 * 1000;
    const due = (candidates || []).filter((cls: any) => {
      const endMs = new Date(`${cls.scheduled_date}T${cls.end_time.substring(0, 5)}:00+05:30`).getTime();
      return endMs < cutoff;
    });

    if (due.length === 0) {
      return NextResponse.json({ candidates: candidates?.length ?? 0, due: 0, results: {} });
    }

    const tally: Record<string, number> = {};
    let syncedRows = 0;
    let absencesRecomputed = 0;

    // Concurrency of 3: Graph's cloud-communications endpoints throttle hard, and
    // a batch of 40 classes is 2 to 3 calls each.
    const queue = [...due];
    const workers = Array.from({ length: Math.min(3, queue.length) }, async () => {
      while (queue.length > 0) {
        const cls = queue.shift();
        if (!cls) break;
        try {
          const result = await syncClassAttendance(supabase, cls as ClassMeetingRow);
          const key = result.ok ? 'ok' : (result.code as AttendanceSyncFailure);
          tally[key] = (tally[key] ?? 0) + 1;

          if (result.ok) {
            syncedRows += result.synced;
            // Absences derive from attendance, so recompute now that it is fresh.
            await computeAbsencesForClass(supabase, cls).catch(() => {});
            absencesRecomputed++;
          }
        } catch (err) {
          tally.exception = (tally.exception ?? 0) + 1;
          console.error(`[cron sync-attendance] class ${cls.id} failed:`, err);
        }
      }
    });

    await Promise.all(workers);

    return NextResponse.json({
      candidates: candidates?.length ?? 0,
      due: due.length,
      syncedRows,
      absencesRecomputed,
      results: tally,
    });
  } catch (err) {
    console.error('[cron sync-attendance] failed:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Attendance sync failed' },
      { status: 500 },
    );
  }
}
