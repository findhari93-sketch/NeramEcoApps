export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createAdminClient } from '@neram/database';
import { getPaymentMethods, watcherHealth } from '@neram/database/payments';

/**
 * GET /api/payments/methods
 * Which ways to pay are on right now, in the order the Pay step shows them.
 * Instant UPI needs the switch on and the office PHONE heard from within the
 * silence window (UPI credits arrive only there). In shadow mode it is still
 * offered: the match is held for staff instead of enrolling at once, and the
 * Pay step says so. Public: it reveals only configuration.
 */
export async function GET() {
  try {
    const supabase = createAdminClient();
    const m = await getPaymentMethods(supabase);
    const mode: 'live' | 'shadow' = m.upiAuto.shadowMode ? 'shadow' : 'live';
    let instant: { available: boolean; reason: string | null; orderMinutes: number; mode: 'live' | 'shadow' } = { available: false, reason: 'off', orderMinutes: m.upiAuto.orderMinutes, mode };
    if (m.upiAuto.enabled) {
      const health = await watcherHealth(supabase, m.upiAuto.silentAfterMinutes);
      instant = health.smsHealthy ? { available: true, reason: null, orderMinutes: m.upiAuto.orderMinutes, mode } : { available: false, reason: 'watchers_silent', orderMinutes: m.upiAuto.orderMinutes, mode };
    }
    return NextResponse.json(
      {
        upiAuto: instant,
        upiProof: { available: m.upiProof.enabled },
        bankProof: { available: m.bankProof.enabled },
        razorpay: { available: m.razorpay.enabled, feePercent: m.razorpay.feePercent },
      },
      { headers: { 'Cache-Control': 'private, max-age=30' } },
    );
  } catch (error: any) {
    console.error('[payments/methods] failed:', error?.message);
    return NextResponse.json({ upiAuto: { available: false, reason: 'error', orderMinutes: 30, mode: 'shadow' }, upiProof: { available: true }, bankProof: { available: true }, razorpay: { available: false, feePercent: 0 } });
  }
}
