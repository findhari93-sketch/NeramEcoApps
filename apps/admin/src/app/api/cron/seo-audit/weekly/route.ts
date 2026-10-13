export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * GET /api/cron/seo-audit/weekly (Vercel Cron; see apps/admin/vercel.json)
 *
 * Mondays: re-run the rules and email the SEO Health digest to SEO_DIGEST_TO.
 * Fails closed: a missing CRON_SECRET refuses the call.
 */
import { NextResponse } from 'next/server';
import { isAuthorizedCron } from '@/lib/marketing-ai/guard';
import { runWeekly } from '@/lib/seo-audit/jobs';

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const result = await runWeekly('cron');
  return NextResponse.json({ success: true, ...result });
}
