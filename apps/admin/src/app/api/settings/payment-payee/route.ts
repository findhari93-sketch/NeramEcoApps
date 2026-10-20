export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import { getPaymentPayee, savePaymentPayee, getPaymentQrCodes, savePaymentQrCodes, getEnrolmentLinkDays, saveEnrolmentLinkDays } from '@neram/database/payment-payee';
import { parsePaymentPayee, validatePaymentPayee } from '@neram/database/student-pay';
import { actingAdminId } from '@/lib/fee-request';

/** GET: where students pay (UPI ID, trust bank account, access-until label). */
export async function GET(request: Request) {
  if (!actingAdminId(request)) return NextResponse.json({ error: 'Sign in again to continue.' }, { status: 401 });
  const supabase = getSupabaseAdminClient();
  const [payee, qrCodes, linkDays] = await Promise.all([getPaymentPayee(supabase), getPaymentQrCodes(supabase), getEnrolmentLinkDays(supabase)]);
  return NextResponse.json({ payee, qrCodes, linkDays });
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
    const supabase = getSupabaseAdminClient();
    await savePaymentPayee(supabase, payee, adminId);
    if (Array.isArray(body.qrCodes)) await savePaymentQrCodes(supabase, body.qrCodes, adminId);
    if (body.linkDays !== undefined) await saveEnrolmentLinkDays(supabase, Number(body.linkDays), adminId);
    const [qrCodes, linkDays] = await Promise.all([getPaymentQrCodes(supabase), getEnrolmentLinkDays(supabase)]);
    return NextResponse.json({ success: true, payee, qrCodes, linkDays });
  } catch (error: any) {
    console.error('[payment-payee] save failed:', error?.message);
    return NextResponse.json({ error: 'Could not save. Try again.' }, { status: 500 });
  }
}
