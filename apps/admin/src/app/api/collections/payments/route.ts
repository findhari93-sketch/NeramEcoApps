export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, recordOfficePayment } from '@neram/database';
import { UUID_REGEX, actingAdminId, parseLine } from '@/lib/fee-request';

/**
 * POST /api/collections/payments  Body: { userId, line: { key, amount, paidOn, method, reference } }
 * Collections' "Record payment": one office payment against the plan already set.
 * The line key makes a double click record the money once.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const userId = String(body?.userId || '');
  if (!UUID_REGEX.test(userId)) return NextResponse.json({ error: 'A valid userId is required.' }, { status: 400 });
  const adminId = actingAdminId(request, body);
  if (!adminId) return NextResponse.json({ error: 'Sign in again to save.' }, { status: 401 });
  try {
    const result = await recordOfficePayment({ userId, line: parseLine(body?.line), adminId }, createAdminClient());
    return NextResponse.json({ success: true, ...result });
  } catch (err: any) {
    if (err?.name === 'StudentFeeError') {
      return NextResponse.json({ error: err.message, fieldErrors: err.fieldErrors || [] }, { status: 400 });
    }
    console.error('[collections/payments] POST failed:', err?.message);
    return NextResponse.json({ error: 'Could not record the payment. Try again.' }, { status: 500 });
  }
}
