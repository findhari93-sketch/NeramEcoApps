import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import { assertCronRequest } from '@/lib/cron-auth';
import { runRecapAutodraft, MAX_DRAFTS_PER_RUN } from '@/lib/recap-autodraft';

export const dynamic = 'force-dynamic';

/**
 * GET /api/cron/recap-autodraft
 *
 * Nightly. Turns recorded classes that already have a stored transcript into
 * recaps, checkpoints and quiz questions included.
 *
 * It DOES publish. A generation that clears every check in recap-quality goes
 * straight to students, because a recap waiting on a human is a recap that never
 * arrives: nine classes sat recorded and transcribed for a month with no recap
 * at all. Anything short of the bar is held instead and raises an alert, so the
 * only material that reaches a student unread is material the checks vouched for.
 *
 * This is the straggler sweep. The main path is event-driven, off the back of
 * the transcript landing in /api/cron/sync-attendance, roughly twenty minutes
 * after a class ends. This catches whatever that missed: a late transcript, a
 * night Gemini refused, a class that failed under the retry cap.
 *
 * Runs at 06:00 IST, well clear of the evening attendance and follow-up crons,
 * so a slow Gemini call cannot delay the work that has to finish before people
 * wake up.
 */

/** `required` because a press of this endpoint spends Gemini quota. */
const CRON_GUARD = { required: true } as const;

export async function GET(request: NextRequest) {
  const unauthorized = assertCronRequest(request, CRON_GUARD);
  if (unauthorized) return unauthorized;

  const supabase = getSupabaseAdminClient() as any;
  const startedAt = Date.now();

  try {
    const run = await runRecapAutodraft(supabase, { limit: MAX_DRAFTS_PER_RUN });

    // Tell the teachers, once per classroom. A row per recap would bury the
    // signal on a night that drafts three at once.
    //
    // Published recaps only. A held one has already alerted every teacher on the
    // TopBar bell via notifyHeld, which is the surface people actually see;
    // adding it here as well would say "ready to review" about something that is
    // stuck, and say it on a screen that only renders on the timetable page.
    let notified = 0;
    for (const [classroomId, count] of run.publishedByClassroom) {
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
          event_type: 'recap_draft_ready',
          title:
            count === 1
              ? 'A class recap is open for catch-up'
              : `${count} class recaps are open for catch-up`,
          message:
            'Checkpoints and questions were built from the transcript and cleared the automatic checks. Students who missed the class can catch up now.',
          metadata: { count },
        }));

        if (rows.length > 0) {
          // Best effort. The event type arrives with migration 20260808090000,
          // and a notification nobody gets is not a reason to lose the drafts.
          const { error } = await supabase.from('nexus_timetable_notifications').insert(rows);
          if (error) {
            console.warn('[cron recap-autodraft] notification insert refused:', error.message);
          } else {
            notified += rows.length;
          }
        }
      } catch (err) {
        console.warn('[cron recap-autodraft] could not notify a classroom:', err);
      }
    }

    if (run.rateLimited) {
      // Never let a run that stopped early read as full coverage.
      console.warn(
        '[cron recap-autodraft] Gemini refused, run stopped early. Remaining classes will be drafted tomorrow.',
      );
    }

    return NextResponse.json({
      ok: true,
      scanned: run.scanned,
      drafted: run.drafted,
      skipped: run.skipped,
      rateLimited: run.rateLimited,
      teachersNotified: notified,
      outcomes: run.outcomes,
      ms: Date.now() - startedAt,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Recap auto-draft failed';
    console.error('[cron recap-autodraft] failed:', message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
