export const dynamic = 'force-dynamic';
export const maxDuration = 300;

import { NextResponse } from 'next/server';
import { cronGate } from '@/lib/marketing-ai/guard';
import { errorResponse } from '@/lib/marketing-ai/http';
import { agentContext, runAnalyze } from '@/lib/marketing-ai/pipeline';

/**
 * GET /api/cron/marketing-ai/analyze (Vercel Cron; see apps/admin/vercel.json)
 *
 * Rules, AI, recommendations, measurement, autopilot and the digest email. 06:30 IST, after ingest.
 * Fails closed: a missing CRON_SECRET refuses the call.
 */
export async function GET(request: Request) {
  const gate = cronGate(request);
  if (gate) return gate;
  try {
    const ctx = await agentContext();
    const { runId, stats } = await runAnalyze(ctx, { trigger: 'cron', by: null });
    return NextResponse.json({ success: true, runId, stats });
  } catch (err) {
    return errorResponse(err, 'cron analyze');
  }
}
