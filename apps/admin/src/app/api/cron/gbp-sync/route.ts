export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
// Ten centres, a few pages of reviews each: well under a minute.
export const maxDuration = 120;

/**
 * GET /api/cron/gbp-sync
 *
 * Daily (apps/admin/vercel.json). Reads every centre's Google reviews and its
 * live Google rating, and confirms students' "I posted it" against real
 * reviews. See lib/gbp/sync.ts.
 *
 * Guarded by CRON_SECRET like the other crons. Until the GBP_* credentials are
 * set it records a "not connected" run and answers 200, so the cron is quiet
 * rather than failing every night while Google reviews the API request.
 */
import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import { getGbpClient } from '@/lib/gbp/server';
import { recordNotConnected, runGbpSync } from '@/lib/gbp/sync';
import { MARKETING_CACHE_TAGS, revalidateMarketing } from '@/lib/marketing-revalidate';

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabaseAdminClient() as any;
  const gbp = getGbpClient();
  if ('missing' in gbp) {
    await recordNotConnected(supabase, 'cron', gbp.missing);
    return NextResponse.json({ skipped: 'not_connected', missing: gbp.missing });
  }

  const summary = await runGbpSync({ supabase, client: gbp.client, trigger: 'cron' });
  // Ratings changed: the centre and review pages quote them.
  if (summary.locations > 0) {
    await revalidateMarketing([MARKETING_CACHE_TAGS.centers], { adminOrigin: new URL(request.url).origin });
  }
  return NextResponse.json(summary, { status: summary.status === 'failed' ? 500 : 200 });
}
