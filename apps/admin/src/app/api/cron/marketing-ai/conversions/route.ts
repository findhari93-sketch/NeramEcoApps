export const dynamic = 'force-dynamic';
export const maxDuration = 300;

import { NextResponse } from 'next/server';
import { cronGate } from '@/lib/marketing-ai/guard';
import { errorResponse } from '@/lib/marketing-ai/http';
import { agentContext, runConversions } from '@/lib/marketing-ai/pipeline';

/**
 * GET /api/cron/marketing-ai/conversions (Vercel Cron; see apps/admin/vercel.json)
 *
 * Upload OTP-verified sign-ups (and demo bookings, paid admissions) to Google Ads.
 * Every 6 hours, so Smart Bidding hears about a sign-up the same day.
 * Fails closed: a missing CRON_SECRET refuses the call.
 */
export async function GET(request: Request) {
  const gate = cronGate(request);
  if (gate) return gate;
  try {
    const ctx = await agentContext();
    const { runId, stats } = await runConversions(ctx, { trigger: 'cron', by: null });
    return NextResponse.json({ success: true, runId, stats });
  } catch (err) {
    return errorResponse(err, 'cron conversions');
  }
}
