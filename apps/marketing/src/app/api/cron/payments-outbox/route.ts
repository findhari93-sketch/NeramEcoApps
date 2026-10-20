export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextResponse } from 'next/server';
import { createAdminClient } from '@neram/database';
import { runPaymentOutbox } from '@neram/database/payments';

/**
 * Every 5 minutes (apps/marketing/vercel.json; every minute once Instant UPI
 * ships in Phase 2, when a student is waiting on the result): run the payment outbox. Each job
 * (fulfil an intent, flag a duplicate, later the emails) was written in the
 * same transaction as the state change that caused it; this is what makes a
 * payment's side effects exactly-once even when the request that paid died.
 * Protected by CRON_SECRET like the other crons.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const result = await runPaymentOutbox(createAdminClient(), { limit: 50, lockSeconds: 120 });
    return NextResponse.json({ ok: true, ...result });
  } catch (error: any) {
    console.error('[cron/payments-outbox] failed:', error?.message);
    return NextResponse.json({ ok: false, error: error?.message || 'failed' }, { status: 500 });
  }
}
