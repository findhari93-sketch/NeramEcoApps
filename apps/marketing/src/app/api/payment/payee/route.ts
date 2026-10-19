import { NextResponse } from 'next/server';
import { createAdminClient } from '@neram/database';
import { getPaymentPayee } from '@neram/database/payment-payee';

// Where students pay by UPI or bank transfer. Public (it is printed on the
// payment pages), cached for an hour; Admin > Settings > Payment details edits it.
export const revalidate = 3600;

export async function GET() {
  const payee = await getPaymentPayee(createAdminClient());
  return NextResponse.json({ payee });
}
