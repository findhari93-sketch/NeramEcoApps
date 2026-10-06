export const dynamic = 'force-dynamic';
export const maxDuration = 300;

import { NextResponse } from 'next/server';
import { cronGate } from '@/lib/marketing-ai/guard';
import { errorResponse } from '@/lib/marketing-ai/http';
import { agentContext, runIngest } from '@/lib/marketing-ai/pipeline';

/**
 * GET /api/cron/marketing-ai/ingest (Vercel Cron; see apps/admin/vercel.json)
 *
 * Pull the last 35 days of Google Ads data into ads_entity_daily. 06:00 IST.
 * Fails closed: a missing CRON_SECRET refuses the call.
 */
export async function GET(request: Request) {
  const gate = cronGate(request);
  if (gate) return gate;
  try {
    const ctx = await agentContext();
    const { runId, stats } = await runIngest(ctx, { trigger: 'cron', by: null });
    return NextResponse.json({ success: true, runId, stats });
  } catch (err) {
    return errorResponse(err, 'cron ingest');
  }
}
