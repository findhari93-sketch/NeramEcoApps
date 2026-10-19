export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import { actingAdminId } from '@/lib/fee-request';

/**
 * GET /api/fee-claims?status=pending|verified|rejected (default pending)
 * Balance payments students submitted from the pay balance page.
 */
export async function GET(request: NextRequest) {
  if (!actingAdminId(request)) return NextResponse.json({ error: 'Sign in again to continue.' }, { status: 401 });
  const status = new URL(request.url).searchParams.get('status') || 'pending';
  if (!['pending', 'verified', 'rejected'].includes(status)) {
    return NextResponse.json({ error: 'Unknown status.' }, { status: 400 });
  }
  try {
    const supabase = getSupabaseAdminClient() as any;
    const { data, error } = await supabase
      .from('fee_payment_claims')
      .select('id, user_id, amount, method, utr, paid_on, status, installment_number, rejection_reason, created_at, verified_at, user:users!fee_payment_claims_user_id_fkey(name, phone, email)')
      .eq('status', status)
      .order('created_at', { ascending: status === 'pending' })
      .limit(100);
    if (error) throw error;
    return NextResponse.json({
      success: true,
      data: (data || []).map((c: any) => ({
        id: c.id,
        userId: c.user_id,
        studentName: c.user?.name || null,
        studentPhone: c.user?.phone || null,
        studentEmail: c.user?.email || null,
        amount: Number(c.amount) || 0,
        method: c.method,
        utr: c.utr,
        paidOn: c.paid_on,
        status: c.status,
        installmentNumber: c.installment_number,
        rejectionReason: c.rejection_reason,
        submittedAt: c.created_at,
        verifiedAt: c.verified_at,
      })),
    });
  } catch (error: any) {
    console.error('[fee-claims] list failed:', error?.message);
    return NextResponse.json({ error: 'Could not load payments to verify.' }, { status: 500 });
  }
}
