export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import { reviewAttempt, rejectHeldAttempt, reconcileAttempt, disputeAttempt, resolveDispute, kickPaymentOutbox } from '@neram/database/payments';
import { actingAdminId } from '@/lib/fee-request';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MESSAGES: Record<string, string> = {
  NOT_FOUND: 'That payment is gone. Refresh the list.',
  WRONG_STATE: 'The payment changed state meanwhile. Refresh and look again.',
  STATEMENT_REQUIRED: 'Tick "I found this in the bank statement" first.',
  REASON_REQUIRED: 'Say why, in a few words.',
  INTENT_ALREADY_PAID: 'This student is already paid up by another payment. Nothing to confirm.',
  INTENT_NOT_OPEN: 'The payment request has closed. Extend the link first.',
};

/**
 * POST /api/payments/attempts/[id]  (staff)
 *   { action: 'confirm', statementChecked: true, note? }   a held Instant UPI order is real: enrol
 *   { action: 'reject', note }                              it is not: the student is told
 *   { action: 'reconcile' }                                 an auto-confirmed payment is in the statement
 *   { action: 'dispute', note }                             it is not in the statement
 *   { action: 'resolve', outcome: 'keep' | 'reverse', note? }
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> | { id: string } }) {
  const { id } = await Promise.resolve(params as any);
  const body = await request.json().catch(() => null);
  const adminId = actingAdminId(request, body);
  if (!adminId) return NextResponse.json({ error: 'Sign in again to continue.' }, { status: 401 });
  if (!UUID.test(id) || !body || typeof body !== 'object') return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  const note = typeof body.note === 'string' ? body.note : '';

  try {
    const supabase = getSupabaseAdminClient();
    let result: { ok: boolean; code?: string; state?: string };
    switch (body.action) {
      case 'confirm':
        result = await reviewAttempt(supabase, { attemptId: id, decision: 'verify', staffId: adminId, note, statementChecked: body.statementChecked === true });
        if (result.ok) kickPaymentOutbox(supabase).catch(() => undefined);
        break;
      case 'reject':
        // The credit goes back to Unmatched; the money is still in the bank.
        result = await rejectHeldAttempt(supabase, { attemptId: id, staffId: adminId, note });
        break;
      case 'reconcile':
        result = await reconcileAttempt(supabase, { attemptId: id, staffId: adminId });
        break;
      case 'dispute':
        result = await disputeAttempt(supabase, { attemptId: id, staffId: adminId, note });
        break;
      case 'resolve':
        if (body.outcome !== 'keep' && body.outcome !== 'reverse') return NextResponse.json({ error: 'Say how it was resolved.' }, { status: 400 });
        result = await resolveDispute(supabase, { attemptId: id, staffId: adminId, outcome: body.outcome, note });
        break;
      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }
    if (!result.ok) {
      const code = result.code || 'WRONG_STATE';
      const status = code === 'STATEMENT_REQUIRED' || code === 'REASON_REQUIRED' ? 400 : code === 'NOT_FOUND' ? 404 : 409;
      return NextResponse.json({ error: MESSAGES[code] || 'Could not update the payment.', code, state: result.state }, { status });
    }
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[payments/attempts/[id]] failed:', error?.message);
    return NextResponse.json({ error: 'Could not update the payment.' }, { status: 500 });
  }
}
