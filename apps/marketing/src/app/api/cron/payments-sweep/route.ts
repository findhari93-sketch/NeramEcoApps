export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextResponse } from 'next/server';
import { createAdminClient } from '@neram/database';
import { sweepPayments, getPaymentMethods, getPaymentWatchers } from '@neram/database/payments';

/**
 * Every 10 minutes (apps/marketing/vercel.json): expire payment orders past
 * their window and open intents past their expiry with nothing live under
 * them, retry unmatched credits, finish inbox rows whose first run died, and
 * ring the bell for a silent watcher. Protected by CRON_SECRET like the other crons.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const supabase = createAdminClient();
    const [methods, watchers] = await Promise.all([getPaymentMethods(supabase), getPaymentWatchers(supabase)]);
    const result = await sweepPayments(supabase, new Date(), { policy: methods.upiAuto, watchers, silentAfterMinutes: methods.upiAuto.silentAfterMinutes });
    return NextResponse.json({ ok: true, ...result });
  } catch (error: any) {
    console.error('[cron/payments-sweep] failed:', error?.message);
    return NextResponse.json({ ok: false, error: error?.message || 'failed' }, { status: 500 });
  }
}
