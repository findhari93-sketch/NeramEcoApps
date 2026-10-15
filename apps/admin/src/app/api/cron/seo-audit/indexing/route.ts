export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * GET /api/cron/seo-audit/indexing (Vercel Cron, 03:30 UTC; see apps/admin/vercel.json)
 *
 * Half an hour after the daily run has inspected and crawled, sends today's
 * ask-Google pages to Google's Indexing API and marks them asked
 * (lib/seo-audit/indexing-api.ts). Does nothing unless SEO_INDEXING_API=on.
 * Fails closed: a missing CRON_SECRET refuses the call.
 */
import { NextResponse } from 'next/server';
import { isAuthorizedCron } from '@/lib/marketing-ai/guard';
import { runJob } from '@/lib/seo-audit/jobs';

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const result = await runJob('indexing', 'cron', { deadline: Date.now() + 100_000 });
  return NextResponse.json({ success: true, ...result });
}
