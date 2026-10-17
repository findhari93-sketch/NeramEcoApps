export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@neram/database';
import { UUID_REGEX, actingAdminId } from '@/lib/fee-request';
import { sendRecordCheck } from '@/lib/record-check-send';

/**
 * POST /api/students/record-check  Body: { userId }
 * "Send to student to check": supersedes any live check, queues a new one and
 * asks Nexus to send it through Neram Assistant. Nexus retries a queued check
 * daily when it cannot be reached now.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const userId = String(body?.userId || '');
  if (!UUID_REGEX.test(userId)) return NextResponse.json({ error: 'A valid userId is required.' }, { status: 400 });
  const adminId = actingAdminId(request, body);
  try {
    const result = await sendRecordCheck(createAdminClient(), request, { userId, adminId });
    if (result.needsFee) return NextResponse.json({ error: result.message }, { status: 400 });
    return NextResponse.json({
      check: result.check,
      delivered: result.delivered,
      channel: result.channel,
      message: result.message,
    });
  } catch (err: any) {
    console.error('[record-check] POST failed:', err?.message);
    return NextResponse.json({ error: 'Could not start the check. Try again.' }, { status: 500 });
  }
}
