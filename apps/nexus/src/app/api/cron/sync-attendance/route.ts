import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient, getNexusSetting } from '@neram/database';
import { assertCronRequest } from '@/lib/cron-auth';
import { FEATURE_FLAGS_KEY, resolveFlags, isFeatureEnabled } from '@/lib/feature-flags';
import { istToday, computeAbsencesForClass } from '@/lib/class-absences';
import {
  syncClassAttendance,
  CLASS_SYNC_COLUMNS,
  type AttendanceSyncFailure,
  type ClassMeetingRow,
} from '@/lib/attendance-sync';
import { syncClassRecordingLinks, type RecordingSyncSummary } from '@/lib/recording-backfill';
import { syncClassTranscripts, type TranscriptSyncSummary } from '@/lib/transcript-sync';
import { runRecapAutodraft } from '@/lib/recap-autodraft';
import { announcePublishedRecaps } from '@/lib/recap-announce';
import { runWrapUpAutodraft } from '@/lib/wrapup-autodraft';

/**
 * GET /api/cron/sync-attendance
 *
 * Everything that has to happen to a class after it ends, in one pass:
 *
 *   attendance -> recording link -> transcript -> recap draft -> wrap-up draft
 *
 * The name is now narrower than the job. It stays because the Vercel schedule and
 * every runbook refer to it, and because attendance is still the only
 * schedule-critical half: it runs ten minutes before class-followups, which
 * computes absences from whatever attendance is recorded by then.
 *
 * Each later stage is best-effort and can never fail the request. They are here
 * rather than on schedules of their own because each one needs what the stage
 * before it just worked out, and because a separate schedule would mean another
 * set of Vercel invocations for no gain.
 *
 * This is the piece that was previously declared impossible: the old sync read
 * attendance off the DELEGATED `/me/onlineMeetings`, so it needed a signed-in
 * teacher and a cron could never run it. Attendance now resolves app-only on
 * behalf of the meeting's real organizer, so no user is involved at all.
 *
 * Transcripts ride along here rather than in a cron of their own, deliberately.
 * They need exactly what attendance already worked out, the organizer oid and the
 * resolved onlineMeeting id, they want the same end-time grace, and a second
 * schedule would mean a second set of Vercel invocations for no gain. Running
 * second in the same request also means the transcript step sees the
 * `online_meeting_id` the attendance step just cached.
 *
 * Scheduled at 8:50 pm IST and then every fifteen minutes until 00:15 (see
 * apps/nexus/vercel.json). The 8:50 pass is fixed where it is because it runs ten
 * minutes BEFORE class-followups, which computes absences from whatever
 * attendance is recorded by then; that ordering is the whole point.
 *
 * The quarter-hourly passes after it exist for the RECAP stage. A recap needs a
 * transcript and a recording, and those arrive at different times: the transcript
 * about twenty minutes after the class, the recording whenever Teams finishes
 * publishing it, which is somewhere between the two. Two fixed passes a night
 * meant whichever one held the second half found the first half stale, and every
 * recap fell through to the 06:00 sweep the next morning. Polling closes that
 * gap: each pass is a no-op costing three reads unless a class became complete
 * since the last one.
 *
 * Doubles as the backfill tool: `?days=400&limit=100`, repeat until both
 * `due` counts are 0. Every class it cannot resolve settles to `unavailable`
 * after MAX attempts, so repeated runs converge instead of retrying forever.
 */

/** Minutes after a class ends before Teams can be expected to have a report. */
const REPORT_GRACE_MINUTES = 20;

/** Give up after this many failed attempts so a dead report stops costing calls. */
const MAX_ATTEMPTS = 6;

/**
 * Gemini generations this request may spend, across recaps AND wrap-ups together.
 *
 * One key serves all four apps in the monorepo, so a burst here is not a slow
 * cron, it is a 429 for marketing, admin and the student app at the same moment.
 * Recaps draw first (a student who missed tonight cannot catch up without one) and
 * wrap-ups take the remainder. Anything not reached tonight is picked up by the
 * 23:30 pass or the nightly sweeps.
 */
const GEMINI_CALLS_PER_RUN = 6;

/**
 * Recaps this pass may draft.
 *
 * Two, not the sweep's own six, because this route now runs sixteen times a day
 * rather than twice. A normal evening has one class, so two covers it with room
 * to spare; six per pass would let a backlog spend the whole of
 * `nexus.recap-questions-cron`'s 60-call daily allowance before midnight and
 * leave nothing for wrap-ups or for the other three apps sharing the key.
 *
 * A backlog is not urgent anyway. It drains two per pass through the evening,
 * and whatever is left is picked up by the 06:00 sweep, which keeps the larger
 * cap precisely because it runs once at a quiet hour.
 */
const RECAP_DRAFTS_PER_PASS = 2;

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

    const tally: Record<string, number> = {};
    let syncedRows = 0;
    let absencesRecomputed = 0;

    if (due.length > 0) {
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
    }

    // Recording links, second.
    //
    // Nothing filled recording_url on a schedule before this: only a human
    // pressing Sync, Generate or Backfill. That one gap stalled the entire video
    // chain, because syncClassYouTubeBackups selects on `recording_url IS NOT
    // NULL`, so a class nobody opened was never backed up and Teams deleted its
    // only copy after about six months.
    //
    // Ahead of transcripts on purpose: the transcript ladder's last rung looks for
    // a .vtt beside the recording, and the 00:40 IST YouTube cron needs the link
    // to exist by tonight rather than whenever somebody next opens the panel.
    let recordings: RecordingSyncSummary | { error: string };
    try {
      recordings = await syncClassRecordingLinks(supabase, { days, limit });
    } catch (err) {
      console.error('[cron sync-attendance] recording link sync failed:', err);
      recordings = { error: err instanceof Error ? err.message : 'recording sync failed' };
    }

    // Transcripts, third, so they can use the online_meeting_id the attendance
    // pass just resolved and cached. Its own candidate scan, because a class can
    // need a transcript long after its attendance settled. Never allowed to fail
    // the request: attendance is the schedule-critical half of this cron.
    let transcripts: TranscriptSyncSummary | { error: string };
    try {
      transcripts = await syncClassTranscripts(supabase, { days, limit, graceMinutes: REPORT_GRACE_MINUTES });
    } catch (err) {
      console.error('[cron sync-attendance] transcript sync failed:', err);
      transcripts = { error: err instanceof Error ? err.message : 'transcript sync failed' };
    }

    // Recaps, fourth. A transcript landing is the nearest thing this stack has to
    // a "class ended" event: Teams has finished processing a session that ran
    // about twenty minutes ago, which is exactly when its catch-up material can
    // be built. Generating here rather than waiting for the nightly sweep is the
    // difference between a student who missed tonight being able to catch up
    // tonight, and being told to come back tomorrow.
    //
    // UNSCOPED, deliberately, and this is the fix for the defect that made every
    // recap late.
    //
    // It used to run only over the classes whose transcripts arrived in THIS
    // pass. A recap needs two things, a transcript and a recording, and on a
    // normal evening they arrive in DIFFERENT passes: the transcript twenty
    // minutes after the class, the recording whenever Teams finishes publishing
    // it. So the pass holding the transcript found no recording and generated
    // nothing, and the pass that got the recording had an empty storedClassIds
    // and returned before looking at anything. Neither half could ever see the
    // other, and every class fell through to the 06:00 sweep nine and a half
    // hours later. Scoping to an event is only safe when one event is sufficient.
    //
    // The candidate query is cheap, batched and capped, so sweeping each pass
    // costs three reads and picks the class up in whichever pass completes it.
    // Never allowed to fail the request: attendance is the schedule-critical
    // half of this cron and recaps must not jeopardise it.
    // Still the trigger for WRAP-UPS below, which genuinely are event-shaped: a
    // wrap-up is written from the transcript alone, so the pass that stored it
    // has everything it needs. Recaps also need a recording, which is why they
    // could not use this and now sweep instead.
    const storedClassIds = (transcripts as TranscriptSyncSummary)?.storedClassIds;

    let recaps: unknown = { skipped: 'nothing eligible' };
    try {
      const run = await runRecapAutodraft(supabase, { limit: RECAP_DRAFTS_PER_PASS });
      recaps = {
        scanned: run.scanned,
        generated: run.drafted,
        skipped: run.skipped,
        rateLimited: run.rateLimited,
        published: run.outcomes.filter((o) => o.ok && o.published).length,
        held: run.outcomes.filter((o) => o.ok && o.held).length,
        told: await announcePublishedRecaps(supabase, run.outcomes),
      };
    } catch (err) {
      console.error('[cron sync-attendance] recap pipeline failed:', err);
      recaps = { error: err instanceof Error ? err.message : 'recap pipeline failed' };
    }

    // Wrap-ups, fifth and last.
    //
    // Same event trigger as recaps, and for the same reason: the transcript that
    // just landed is what a wrap-up is written from. Without this a class kept the
    // Teams meeting subject as its title until a teacher opened the panel and
    // pressed two buttons, which is why production classes were still called
    // "Class by Ar Hari Babu" weeks later.
    //
    // It writes with content_edited_by NULL, which both locks the Teams reconciler
    // out of the title and marks the row machine-written, so a teacher's own edit
    // is never overwritten and the class is never drafted twice.
    //
    // GEMINI BUDGET IS SHARED WITH THE RECAP PASS ABOVE. There is one
    // GEMINI_API_KEY across all four apps, so what is spent here is not available
    // to marketing, admin or the student app. The recap sweep goes first because a
    // student who missed tonight cannot catch up without one, and wrap-ups take
    // whatever is left. On a night where recaps used the whole allowance, wrap-ups
    // wait for the 23:30 pass.
    let wrapups: unknown = { skipped: 'no transcripts stored' };
    if (Array.isArray(storedClassIds) && storedClassIds.length > 0) {
      try {
        const setting = await getNexusSetting(FEATURE_FLAGS_KEY);
        const flags = resolveFlags((setting?.value as Record<string, boolean>) || {});
        if (!isFeatureEnabled('staff.auto-wrapup', flags)) {
          wrapups = { skipped: 'feature disabled' };
        } else {
          // `scanned`, not `generated`. A recap that was attempted and FAILED
          // still spent a Gemini call, so counting only successes would let a bad
          // night spend nine calls against a budget of six.
          const spent = (recaps as { scanned?: number })?.scanned ?? 0;
          const run = await runWrapUpAutodraft(supabase, {
            classIds: storedClassIds,
            limit: Math.max(0, GEMINI_CALLS_PER_RUN - spent),
          });
          wrapups = {
            scanned: run.scanned,
            drafted: run.drafted,
            skipped: run.skipped,
            rateLimited: run.rateLimited,
          };
        }
      } catch (err) {
        console.error('[cron sync-attendance] wrap-up pipeline failed:', err);
        wrapups = { error: err instanceof Error ? err.message : 'wrap-up pipeline failed' };
      }
    }

    return NextResponse.json({
      candidates: candidates?.length ?? 0,
      due: due.length,
      syncedRows,
      absencesRecomputed,
      results: tally,
      recordings,
      transcripts,
      recaps,
      wrapups,
    });
  } catch (err) {
    console.error('[cron sync-attendance] failed:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Attendance sync failed' },
      { status: 500 },
    );
  }
}
