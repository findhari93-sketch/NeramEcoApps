export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { setStuckPhonePersonHandled } from '@neram/database';
import { getRequestAdminId } from '@/lib/request-admin';

/**
 * POST /api/phone-attempts/done { userId | anonymousId, done: boolean }
 * Mark a person stuck at phone sign-in as handled (called, helped), or put
 * them back on the to-call list. Their next Send OTP reopens them anyway.
 * Staff only (middleware.ts stamps who).
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const userId = typeof body.userId === 'string' && body.userId ? body.userId : null;
    const anonymousId = typeof body.anonymousId === 'string' && body.anonymousId ? body.anonymousId : null;
    if (!userId && !anonymousId) {
      return NextResponse.json({ error: 'Say whose numbers to mark.' }, { status: 400 });
    }
    const changed = await setStuckPhonePersonHandled(
      { userId, anonymousId },
      { done: body.done !== false, by: getRequestAdminId(request) },
    );
    return NextResponse.json({ changed });
  } catch (error) {
    console.error('Phone attempts done error:', error);
    return NextResponse.json({ error: 'Could not save that. Try again.' }, { status: 500 });
  }
}
