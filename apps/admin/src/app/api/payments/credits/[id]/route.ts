export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import { assignCredit, ignoreCredit, kickPaymentOutbox } from '@neram/database/payments';
import { actingAdminId } from '@/lib/fee-request';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MESSAGES: Record<string, string> = {
  CREDIT_NOT_FOUND: 'That credit is gone. Refresh the list.',
  CREDIT_TAKEN: 'That credit was already matched or ignored.',
  INTENT_NOT_FOUND: 'That payment request no longer exists.',
  INTENT_NOT_OPEN: 'That student has already paid, or the request closed.',
  WRONG_STATE: 'The order changed state meanwhile. Refresh and look again.',
  REASON_REQUIRED: 'Say why, in a few words.',
};

/**
 * POST /api/payments/credits/[id]
 *   { action: 'assign', intentId, force? }   the credit pays that student's open request
 *   { action: 'ignore', reason }             not a fee
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> | { id: string } }) {
  const { id } = await Promise.resolve(params as any);
  const body = await request.json().catch(() => null);
  const adminId = actingAdminId(request, body);
  if (!adminId) return NextResponse.json({ error: 'Sign in again to continue.' }, { status: 401 });
  if (!UUID.test(id) || !body || typeof body !== 'object') return NextResponse.json({ error: 'Bad request' }, { status: 400 });

  try {
    const supabase = getSupabaseAdminClient();
    if (body.action === 'assign') {
      if (typeof body.intentId !== 'string' || !UUID.test(body.intentId)) return NextResponse.json({ error: 'Pick a student first.' }, { status: 400 });
      const r = await assignCredit(supabase, { creditId: id, intentId: body.intentId, staffId: adminId, force: body.force === true });
      if (!r.ok) {
        if (r.code === 'AMOUNT_MISMATCH') return NextResponse.json({ error: 'The amounts do not agree.', code: r.code, creditPaise: r.creditPaise, intentPaise: r.intentPaise }, { status: 409 });
        return NextResponse.json({ error: MESSAGES[r.code] || 'Could not assign it.', code: r.code }, { status: 409 });
      }
      kickPaymentOutbox(supabase).catch(() => undefined);
      return NextResponse.json({ success: true, attemptId: r.attemptId });
    }
    if (body.action === 'ignore') {
      const r = await ignoreCredit(supabase, { creditId: id, reason: String(body.reason || ''), staffId: adminId });
      if (!r.ok) return NextResponse.json({ error: MESSAGES[r.code] || 'Could not ignore it.', code: r.code }, { status: r.code === 'REASON_REQUIRED' ? 400 : 409 });
      return NextResponse.json({ success: true });
    }
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error: any) {
    console.error('[payments/credits/[id]] failed:', error?.message);
    return NextResponse.json({ error: 'Could not update the credit.' }, { status: 500 });
  }
}
