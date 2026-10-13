export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * GET /api/cron/seo-audit/daily (Vercel Cron; see apps/admin/vercel.json)
 *
 * SEO Health, every morning: Search Console search data, URL Inspection for up
 * to 400 URLs, our crawl of pages not crawled this week, then the rules. See
 * lib/seo-audit/jobs.ts. Fails closed: a missing CRON_SECRET refuses the call.
 * Before the Search Console key is set, search and inspect record
 * "not_connected" and the crawl and rules still run.
 */
import { NextResponse } from 'next/server';
import { isAuthorizedCron } from '@/lib/marketing-ai/guard';
import { runDaily } from '@/lib/seo-audit/jobs';

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const result = await runDaily('cron');
  return NextResponse.json({ success: true, ...result });
}
