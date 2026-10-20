export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@neram/database';
import {
  getIntentById,
  getPaymentMethods,
  watcherHealth,
  createInstantUpiOrder,
  attemptStatusView,
} from '@neram/database/payments';
import { getPaymentPayee } from '@neram/database/payment-payee';
import { paymentReference } from '@neram/database/student-pay';
import { verifyFirebaseToken } from '../../_lib/auth';
import { ownsIntent } from '../_lib/owner';
import { ipHash } from '../_lib/watcher';

/**
 * POST /api/payments/attempts (Firebase auth)  { intentId, method: 'upi_auto' }
 *
 * Starts an Instant UPI order: a 30-minute window, the intent's amount plus a
 * unique paise tag, and the UPI link/QR for it. Offered only while Instant UPI
 * is on and the office phone is alive; in shadow mode the match is held for
 * staff instead of enrolling. The amount is never read from the body.
 */
export async function POST(request: NextRequest) {
  const auth = await verifyFirebaseToken(request);
  if (!auth) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  if (body.method !== 'upi_auto') return NextResponse.json({ error: 'Only Instant UPI orders start here.' }, { status: 400 });
  if (typeof body.intentId !== 'string') return NextResponse.json({ error: 'intentId is required' }, { status: 400 });

  try {
    const supabase = createAdminClient();
    const intent = await getIntentById(supabase, body.intentId);
    if (!intent || !ownsIntent(intent, auth.userId)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const methods = await getPaymentMethods(supabase);
    if (!methods.upiAuto.enabled) {
      return NextResponse.json({ error: 'Instant UPI is not available right now. Pay with the QR and send the screenshot.', code: 'METHOD_OFF' }, { status: 409 });
    }
    const health = await watcherHealth(supabase, methods.upiAuto.silentAfterMinutes);
    if (!health.smsHealthy) {
      return NextResponse.json({ error: 'Instant confirmation is paused for a moment. Pay with the QR and send the screenshot.', code: 'WATCHERS_SILENT' }, { status: 409 });
    }

    const payee = await getPaymentPayee(supabase);
    const note = intent.enrollment_link_id ? paymentReference(intent.enrollment_link_id) : `NRM ${intent.id.replace(/-/g, '').slice(-6).toUpperCase()}`;
    const order = await createInstantUpiOrder(supabase, {
      intent,
      payee: { upiId: payee.upiId, payeeName: payee.payeeName },
      orderMinutes: methods.upiAuto.orderMinutes,
      paymentNote: note,
      clientIpHash: ipHash(request),
      clientUa: request.headers.get('user-agent'),
    });
    if (!order.ok) {
      const message = order.code === 'TAGS_EXHAUSTED' ? 'Too many payments of this amount are in progress right now. Pay with the QR and send the screenshot.' : 'This payment is already complete.';
      return NextResponse.json({ error: message, code: order.code }, { status: 409 });
    }
    return NextResponse.json({
      success: true,
      data: {
        attemptId: order.attempt.id,
        ...attemptStatusView(order.attempt, intent, null),
        upiUri: order.upiUri,
        payeeName: payee.payeeName,
        upiId: payee.upiId,
        note,
        reused: order.reused,
        mode: methods.upiAuto.shadowMode ? 'shadow' : 'live',
      },
    });
  } catch (error: any) {
    console.error('[payments/attempts] failed:', error?.message);
    return NextResponse.json({ error: 'Could not start the payment. Try again.' }, { status: 500 });
  }
}
