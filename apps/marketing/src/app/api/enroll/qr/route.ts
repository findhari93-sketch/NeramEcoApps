export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, getDirectEnrollmentLinkByToken } from '@neram/database';
import { offerFromLink, amountDueToday, buildUpiUri, paymentReference } from '@neram/database/student-pay';
import { getPaymentPayee } from '@neram/database/payment-payee';

/**
 * GET /api/enroll/qr?token=<link token>&scheme=full|installment
 *
 * A PNG of the UPI QR for what the student owes today, for the "pay later",
 * reminder and expiry emails (Gmail blocks data: images). The amount comes
 * from the link's offer, never the query. Anyone with the link token can
 * fetch it, which is the same audience as the link itself; it holds no secret.
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token') || '';
  const scheme = request.nextUrl.searchParams.get('scheme') === 'installment' ? 'installment' : 'full';
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(token)) return new NextResponse('Not found', { status: 404 });

  try {
    const supabase = createAdminClient();
    const link: any = await getDirectEnrollmentLinkByToken(token, supabase);
    if (!link || link.payment_mode !== 'student_pays' || !['active', 'payment_submitted'].includes(String(link.status))) {
      return new NextResponse('Not found', { status: 404 });
    }
    const offer = offerFromLink(link);
    const amount = amountDueToday(offer, scheme) ?? offer.fullAmount;
    if (!(amount > 0)) return new NextResponse('Not found', { status: 404 });

    const payee = await getPaymentPayee(supabase);
    const uri = buildUpiUri({ vpa: payee.upiId, payeeName: payee.payeeName, amount, note: paymentReference(link.id) });
    const QR = await import('qrcode');
    const png: Buffer = await QR.toBuffer(uri, { type: 'png', width: 512, margin: 2, errorCorrectionLevel: 'M' });
    return new NextResponse(new Uint8Array(png), {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=3600',
        'Content-Disposition': `inline; filename="neram-pay-${Math.round(amount)}.png"`,
      },
    });
  } catch (error: any) {
    console.error('[enroll/qr] failed:', error?.message);
    return new NextResponse('Error', { status: 500 });
  }
}
