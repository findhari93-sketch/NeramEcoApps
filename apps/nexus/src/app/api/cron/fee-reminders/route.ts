import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import { assertCronRequest } from '@/lib/cron-auth';
import { runFeeReminders } from '@/lib/fee-reminders';

export const maxDuration = 60;

/**
 * GET /api/cron/fee-reminders            (Vercel cron, 05:00 UTC = 10:30 IST)
 * GET /api/cron/fee-reminders?dryRun=1   (same auth; plans, sends nothing)
 *
 * Retries queued "Check your details" sends, reconciles installments, and
 * reminds students about their second installment 3 days before and on the day.
 * All the rules live in lib/fee-reminders.ts. Staff hear about due and overdue
 * installments from Admin's own cron, not this one.
 */
export async function GET(request: NextRequest) {
  const unauthorized = assertCronRequest(request, { required: true });
  if (unauthorized) return unauthorized;
  const dryRun = request.nextUrl.searchParams.get('dryRun') === '1';

  try {
    const report = await runFeeReminders(getSupabaseAdminClient() as any, {
      origin: request.nextUrl.origin,
      dryRun,
    });
    return NextResponse.json(report);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Fee reminders failed';
    console.error('[cron/fee-reminders]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
