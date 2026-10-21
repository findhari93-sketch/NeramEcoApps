export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseToken } from '../../_lib/auth';
import { describePaymentOptions, loadPaymentOptions, paymentActions } from '@/lib/aintra/payments';

const NO_STORE = { 'Cache-Control': 'no-store' };

/**
 * GET /api/aintra/pay-options (Firebase auth): the payment buttons for the
 * signed-in student's own Aintra pay card. Per-user and holds their enrolment
 * link, so never cached. Read only.
 */
export async function GET(request: NextRequest) {
  const auth = await verifyFirebaseToken(request);
  if (!auth) return NextResponse.json({ error: 'SIGN_IN_REQUIRED' }, { status: 401, headers: NO_STORE });
  try {
    const options = await loadPaymentOptions(auth.userId);
    return NextResponse.json(
      {
        actions: paymentActions(options, true),
        pending: options.pendingClaim,
        summary: describePaymentOptions(options),
      },
      { headers: NO_STORE },
    );
  } catch (err) {
    console.error('[aintra/pay-options]', err);
    return NextResponse.json({ error: 'Could not load your fees. Please try again.' }, { status: 500, headers: NO_STORE });
  }
}
