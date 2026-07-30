import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import { assertCronRequest } from '@/lib/cron-auth';
import { sweepOverdueMissedClasses } from '@/lib/catchup-overdue';

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
 */
export async function GET(request: NextRequest) {
  const unauthorized = assertCronRequest(request);
  if (unauthorized) return unauthorized;

  const startedAt = Date.now();
  try {
    const supabase = getSupabaseAdminClient() as any;
    const result = await sweepOverdueMissedClasses(supabase);
    return NextResponse.json({ ok: true, ...result, ms: Date.now() - startedAt });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Overdue catch-up sweep failed';
    console.error('[cron catchup-overdue] failed:', message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
