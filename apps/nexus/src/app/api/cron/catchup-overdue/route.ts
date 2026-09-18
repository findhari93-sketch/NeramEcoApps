import { NextRequest, NextResponse } from 'next/server';
import { getNexusSetting, getSupabaseAdminClient } from '@neram/database';
import { assertCronRequest } from '@/lib/cron-auth';
import { sweepOverdueMissedClasses } from '@/lib/catchup-overdue';
import { FEATURE_FLAGS_KEY, isFeatureEnabled, resolveFlags } from '@/lib/feature-flags';
import { sweepTestChase } from '@/lib/test-chase';

export const dynamic = 'force-dynamic';

/**
 * GET /api/cron/catchup-overdue
 *
 * Daily. Finds every class a student missed whose deadline has passed, nudges
 * them once, and tells each classroom's teachers how many names are on their
 * chase list.
 *
 * Daily rather than folded into the weekly catchup-pace sweep, which is a
 * separate route for a separate reason. A quota measured in weeks deserves a
 * weekly reminder; a class missed on Tuesday and due before Thursday does not,
 * and waiting until the following Monday to say so is six days of silence about
 * the exact thing this feature exists to prevent. The per-student cooldown lives
 * in the sweep, so running daily still messages nobody more than once a week.
 *
 * Runs at 10:00 IST, in the morning rather than after class, so a student reads
 * it with a day in front of them to do something about it.
 *
 * SECOND PASS: the test chase (lib/test-chase.ts), which messages the students
 * whose catch-up is the thing standing between them and a test they never sat.
 * It rides here rather than on a cron of its own precisely because this job has
 * already messaged some of those students about the same classes this morning;
 * it is handed the ids the first pass reached and skips them. Off until
 * `staff.test-chase` is switched on in Features. ?dryRun=1 decides and reports
 * without sending or writing anything, and works whether the flag is on or not.
 */
export async function GET(request: NextRequest) {
  const unauthorized = assertCronRequest(request);
  if (unauthorized) return unauthorized;
  const dryRun = request.nextUrl.searchParams.get('dryRun') === '1';

  const startedAt = Date.now();
  try {
    const supabase = getSupabaseAdminClient() as any;
    const result = dryRun
      ? { ...EMPTY_SWEEP, skipped: 'dry run' }
      : await sweepOverdueMissedClasses(supabase);

    const setting = await getNexusSetting(FEATURE_FLAGS_KEY).catch(() => null);
    const flags = resolveFlags((setting?.value as Record<string, boolean>) || {});
    const chaseOn = isFeatureEnabled('staff.test-chase', flags);
    const chase =
      chaseOn || dryRun
        ? await sweepTestChase(supabase, {
            skipStudentIds: new Set(result.nudgedStudentIds || []),
            dryRun: dryRun || !chaseOn,
          })
        : null;

    return NextResponse.json({ ok: true, ...result, chase, ms: Date.now() - startedAt });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Overdue catch-up sweep failed';
    console.error('[cron catchup-overdue] failed:', message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

/** A dry run reports the chase alone, so the first pass is not re-run to get there. */
const EMPTY_SWEEP = {
  scanned: 0,
  overdue: 0,
  studentsNudged: 0,
  nudgedStudentIds: [] as string[],
  teachersNotified: 0,
  capped: false,
  errors: [] as string[],
};
