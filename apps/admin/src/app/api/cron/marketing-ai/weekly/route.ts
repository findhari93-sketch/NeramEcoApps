export const dynamic = 'force-dynamic';
export const maxDuration = 300;

import { NextResponse } from 'next/server';
import { cronGate } from '@/lib/marketing-ai/guard';
import { errorResponse } from '@/lib/marketing-ai/http';
import { agentContext, runWeekly } from '@/lib/marketing-ai/pipeline';

/**
 * GET /api/cron/marketing-ai/weekly (Vercel Cron; see apps/admin/vercel.json)
 *
 * The weekly AI report: last week against the week before, what the agent
 * changed, and three next steps. Mondays 07:30 IST, after that morning's analyze.
 * Fails closed: a missing CRON_SECRET refuses the call.
 */
export async function GET(request: Request) {
  const gate = cronGate(request);
  if (gate) return gate;
  try {
    const ctx = await agentContext();
    const { runId, stats } = await runWeekly(ctx, { trigger: 'cron', by: null });
    return NextResponse.json({ success: true, runId, stats });
  } catch (err) {
    return errorResponse(err, 'cron weekly');
  }
}
