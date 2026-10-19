export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import { getPaymentPayee, savePaymentPayee } from '@neram/database/payment-payee';
import { parsePaymentPayee, validatePaymentPayee } from '@neram/database/student-pay';
import { actingAdminId } from '@/lib/fee-request';

/** GET: where students pay (UPI ID, trust bank account, access-until label). */
export async function GET(request: Request) {
  if (!actingAdminId(request)) return NextResponse.json({ error: 'Sign in again to continue.' }, { status: 401 });
  const payee = await getPaymentPayee(getSupabaseAdminClient());
  return NextResponse.json({ payee });
}

/** PUT: replace it. Every student-pays link reads it live, so it applies at once. */
export async function PUT(request: Request) {
  const body = await request.json().catch(() => null);
  const adminId = actingAdminId(request, body);
  if (!adminId) return NextResponse.json({ error: 'Sign in again to continue.' }, { status: 401 });
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Bad request' }, { status: 400 });

  const payee = parsePaymentPayee(body.payee ?? body);
  const fieldErrors = validatePaymentPayee(payee);
  if (Object.keys(fieldErrors).length) {
    return NextResponse.json({ error: 'Check the highlighted fields.', fieldErrors }, { status: 400 });
  }
  try {
    await savePaymentPayee(getSupabaseAdminClient(), payee, adminId);
    return NextResponse.json({ success: true, payee });
  } catch (error: any) {
    console.error('[payment-payee] save failed:', error?.message);
    return NextResponse.json({ error: 'Could not save. Try again.' }, { status: 500 });
  }
}
