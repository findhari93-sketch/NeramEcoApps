import { NextRequest, NextResponse } from 'next/server';
import {
  getSupabaseAdminClient,
  listActiveJourneys,
  getCatchupBacklog,
  ensureCatchupJourney,
  markJourneyNudged,
  markJourneyCompleted,
} from '@neram/database';
import { assertCronRequest } from '@/lib/cron-auth';
import { sendNudge } from '@/lib/nudge-delivery';
import { computeCatchupPace, describeCatchupPace } from '@/lib/catchup-pace';

export const dynamic = 'force-dynamic';

/**
 * Weekly catch-up pacing sweep.
 *
 * Weekly, not daily, because the quota is weekly. A daily reminder about a
 * target measured in weeks is just noise, and noise is how notifications get
 * muted.
 *
 * Three jobs, in this order:
 *   1. Reconcile. Generate any backlog the enrolment hook missed, and pick up
 *      classes published after a student joined.
 *   2. Nudge students who have slipped behind their quota.
 *   3. Tell each classroom's teachers how many need a hand.
 *
 * This is a separate route rather than an addition to class-followups, whose
 * header states as a contract that it never messages students. Bolting student
 * messaging onto it would break that promise silently.
 */

/** Do not chase the same student twice in a week, even if the cron reruns. */
const NUDGE_COOLDOWN_DAYS = 6;
/** Hard cap per run. See listActiveJourneys for why this exists. */
const MAX_JOURNEYS_PER_RUN = 200;

export async function GET(request: NextRequest) {
  const unauthorized = assertCronRequest(request);
  if (unauthorized) return unauthorized;

  const supabase = getSupabaseAdminClient() as any;
  const startedAt = Date.now();

  const stats = {
    journeys: 0,
    reconciled: 0,
    behind: 0,
    nudged: 0,
    completed: 0,
    teachersNotified: 0,
    capped: false,
    errors: [] as string[],
  };

  try {
    const journeys = await listActiveJourneys({ limit: MAX_JOURNEYS_PER_RUN }, supabase);
    stats.journeys = journeys.length;
    stats.capped = journeys.length === MAX_JOURNEYS_PER_RUN;

    const cooldownBefore = new Date(Date.now() - NUDGE_COOLDOWN_DAYS * 86_400_000).toISOString();
    const behindByClassroom = new Map<string, number>();
    const toNudge: Array<{ journeyId: string; studentId: string; message: string }> = [];

    for (const journey of journeys) {
      try {
        // Reconciliation. Cheap when there is nothing new: the upsert ignores
        // duplicates, so a settled journey costs two reads and no writes.
        const res = await ensureCatchupJourney(journey.student_id, journey.classroom_id, {}, supabase);
        if (res.itemsInserted > 0) stats.reconciled += 1;

        const backlog = await getCatchupBacklog(journey.student_id, journey.classroom_id, supabase);
        if (!backlog) continue;

        const quota = journey.weekly_quota ?? 2;
        const pace = computeCatchupPace({
          started_on: journey.started_on,
          weekly_quota: quota,
          total_items: backlog.totals.total,
          completed_items: backlog.totals.completed,
        });

        if (pace.state === 'done') {
          // Only close a journey with nothing left AND nothing pending a
          // teacher, or a published recap tomorrow would reopen a "finished"
          // journey and the student would never hear about it.
          if (backlog.totals.pendingTeacher === 0) {
            await markJourneyCompleted(journey.id, supabase);
            stats.completed += 1;
          }
          continue;
        }

        if (pace.state !== 'behind') continue;
        stats.behind += 1;
        behindByClassroom.set(
          journey.classroom_id,
          (behindByClassroom.get(journey.classroom_id) || 0) + 1,
        );

        if (journey.last_nudged_at && journey.last_nudged_at > cooldownBefore) continue;
        toNudge.push({
          journeyId: journey.id,
          studentId: journey.student_id,
          message: describeCatchupPace(pace, quota),
        });
      } catch (err) {
        stats.errors.push(
          `journey ${journey.id}: ${err instanceof Error ? err.message : 'unknown error'}`,
        );
      }
    }

    // Nudge. One message each, and the wording is the same sentence the student
    // sees on their own screen, so the two never contradict each other.
    for (const n of toNudge) {
      try {
        await sendNudge({
          studentIds: [n.studentId],
          subject: 'Your catch-up list',
          plain: `${n.message}\n\nOpen Nexus and pick up where you left off.`,
          teamsText: n.message,
          eventType: 'catchup_behind_pace',
          metadata: { journey_id: n.journeyId },
        });
        await markJourneyNudged(n.journeyId, supabase);
        stats.nudged += 1;
      } catch (err) {
        stats.errors.push(
          `nudge ${n.studentId}: ${err instanceof Error ? err.message : 'unknown error'}`,
        );
      }
    }

    // Tell the teachers. One row per classroom, matching how class-followups
    // reports: a per-student row would bury the signal.
    for (const [classroomId, count] of behindByClassroom) {
      try {
        const { data: staff } = await supabase
          .from('nexus_enrollments')
          .select('user_id')
          .eq('classroom_id', classroomId)
          .eq('role', 'teacher')
          .eq('is_active', true);

        const rows = (staff || []).map((s: any) => ({
          classroom_id: classroomId,
          user_id: s.user_id,
          event_type: 'catchup_needs_attention',
          title: `${count} ${count === 1 ? 'student is' : 'students are'} behind on catch-up`,
          message: 'Open the catch-up dashboard to see who needs a hand.',
          metadata: { count },
        }));
        if (rows.length > 0) {
          await supabase.from('nexus_timetable_notifications').insert(rows);
          stats.teachersNotified += rows.length;
        }
      } catch (err) {
        stats.errors.push(
          `classroom ${classroomId}: ${err instanceof Error ? err.message : 'unknown error'}`,
        );
      }
    }

    if (stats.capped) {
      // Never let a bounded run read as full coverage.
      console.warn(
        `[cron catchup-pace] hit the ${MAX_JOURNEYS_PER_RUN} journey cap; some students were not checked this run`,
      );
    }

    return NextResponse.json({ ok: true, ...stats, ms: Date.now() - startedAt });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Catch-up pacing sweep failed';
    console.error('[cron catchup-pace] failed:', message);
    return NextResponse.json({ ok: false, error: message, ...stats }, { status: 500 });
  }
}
