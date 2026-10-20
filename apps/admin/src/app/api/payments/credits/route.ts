export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import { getPaymentMethods, getPaymentWatchers, listCreditsDesk } from '@neram/database/payments';
import { actingAdminId } from '@/lib/fee-request';

/**
 * GET /api/payments/credits: the Bank credits desk (Collections › Bank credits).
 * Held orders to confirm, unmatched credits to assign or ignore, auto-confirmed
 * payments to tick against the statement, disputes, shadow matches, and health.
 */
export async function GET(request: Request) {
  if (!actingAdminId(request)) return NextResponse.json({ error: 'Sign in again to continue.' }, { status: 401 });
  try {
    const supabase = getSupabaseAdminClient();
    const [methods, watchers] = await Promise.all([getPaymentMethods(supabase), getPaymentWatchers(supabase)]);
    const desk = await listCreditsDesk(supabase, { policy: methods.upiAuto });
    return NextResponse.json({ ...desk, watchers }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error: any) {
    console.error('[payments/credits] failed:', error?.message);
    return NextResponse.json({ error: 'Could not load the bank credits.' }, { status: 500 });
  }
}
