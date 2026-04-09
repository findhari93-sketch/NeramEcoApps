// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, getLeadProfileByPaymentToken } from '@neram/database';

/**
 * GET /api/pay/link/[token]
 * Validate a shareable payment link token.
 * Returns masked phone and application details (no sensitive data).
 * Used by the payment link page to decide whether to show OTP or an error.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  const client = createAdminClient();
  const lead = await getLeadProfileByPaymentToken(params.token, client);

  if (!lead) {
    return NextResponse.json({ error: 'invalid' }, { status: 404 });
  }

  if (lead.payment_link_expires_at && new Date(lead.payment_link_expires_at) < new Date()) {
    return NextResponse.json({ error: 'expired' }, { status: 410 });
  }

  if (lead.status !== 'approved') {
    return NextResponse.json({ error: 'not_approved' }, { status: 403 });
  }

  const phone = lead.users?.phone;
  const maskedPhone = phone ? `+91 ****${phone.slice(-5)}` : null;

  return NextResponse.json({
    applicationNumber: lead.application_number,
    maskedPhone,
    userId: lead.user_id,
    alreadyLinked: !!(lead.users?.firebase_uid),
  });
}
