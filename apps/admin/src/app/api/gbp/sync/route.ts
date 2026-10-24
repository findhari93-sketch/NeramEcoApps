export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * POST /api/gbp/sync  the "Sync now" button on Admin > Google reviews.
 * Same work as the daily cron. Staff only (admin API middleware).
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import { NOT_CONNECTED_MESSAGE, getGbpClient } from '@/lib/gbp/server';
import { recordNotConnected, runGbpSync } from '@/lib/gbp/sync';
import { MARKETING_CACHE_TAGS, revalidateMarketing } from '@/lib/marketing-revalidate';
import { UPSTREAM_FAILED } from '@/lib/upstream-status';

export async function POST(request: NextRequest) {
  const supabase = getSupabaseAdminClient() as any;
  const gbp = getGbpClient();
  if ('missing' in gbp) {
    await recordNotConnected(supabase, 'manual', gbp.missing);
    return NextResponse.json({ error: NOT_CONNECTED_MESSAGE, missing: gbp.missing }, { status: 409 });
  }
  const summary = await runGbpSync({ supabase, client: gbp.client, trigger: 'manual' });
  if (summary.locations > 0) {
    await revalidateMarketing([MARKETING_CACHE_TAGS.centers], { adminOrigin: request.nextUrl.origin });
  }
  return NextResponse.json(summary, { status: summary.status === 'failed' ? UPSTREAM_FAILED : 200 });
}
