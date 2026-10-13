export const dynamic = 'force-dynamic';

/**
 * Capture Phone Intent API (Marketing)
 *
 * The same contract as the app's route (apps/app/src/app/api/auth/capture-phone):
 * every number typed into the phone dialog lands in phone_attempts, signed in
 * or not ('entered' on Send OTP, then 'otp_sent' or 'failed'), so staff can
 * call a student whose OTP never went out. Signed in with an unverified phone,
 * 'entered' also saves the number on the user record.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { getApps } from 'firebase-admin/app';
import {
  getUserByFirebaseUid,
  getSupabaseAdminClient,
  linkPhoneAttempts,
  parsePhoneCaptureBody,
  recordPhoneAttempt,
} from '@neram/database';

function getCorsHeaders(origin: string | null) {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

export async function OPTIONS(req: NextRequest) {
  return NextResponse.json({}, { headers: getCorsHeaders(req.headers.get('Origin')) });
}

export async function POST(req: NextRequest) {
  const corsHeaders = getCorsHeaders(req.headers.get('Origin'));
  try {
    const body = await req.json().catch(() => ({}));
    const capture = parsePhoneCaptureBody(body, req.headers.get('cookie'));
    if (!capture) {
      return NextResponse.json({ error: 'Invalid phone number or event' }, { status: 400, headers: corsHeaders });
    }

    let firebaseUid: string | null = null;
    if (body.idToken && getApps().length > 0) {
      try {
        firebaseUid = (await getAuth().verifyIdToken(body.idToken)).uid;
      } catch {
        firebaseUid = null;
      }
    }

    const adminClient = getSupabaseAdminClient();
    const db = adminClient as any;
    const user = firebaseUid ? await getUserByFirebaseUid(firebaseUid, adminClient) : null;

    if (!user && !capture.anonymousId) {
      return NextResponse.json({ captured: false }, { headers: corsHeaders });
    }

    if (user && capture.anonymousId && capture.event === 'entered') {
      await linkPhoneAttempts(capture.anonymousId, user.id, adminClient);
    }
    const captured = await recordPhoneAttempt(
      {
        userId: user?.id ?? null,
        anonymousId: capture.anonymousId,
        phone: capture.phone,
        event: capture.event,
        source: capture.source,
        sourceApp: 'marketing',
        errorCode: capture.errorCode,
        errorMessage: capture.errorMessage,
      },
      adminClient,
    );

    if (user && !user.phone_verified && capture.event === 'entered') {
      const { error: phoneError } = await db
        .from('users')
        .update({ phone: capture.phone, updated_at: new Date().toISOString() })
        .eq('id', user.id);
      if (phoneError) {
        console.error('capture-phone: phone update failed:', phoneError.message);
      }

      const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;
      const now = new Date().toISOString();
      // phone_number_entered = user typed their number
      // otp_requested = OTP is about to be sent (this call happens right before Firebase sends SMS)
      // Query builders are thenables with no .catch(): calling it threw a
      // TypeError, so these events were never written. Read the error instead.
      const { error: funnelError } = await db.from('user_funnel_events').insert(
        (['phone_number_entered', 'otp_requested'] as const).map((event) => ({
          user_id: user.id,
          anonymous_id: capture.anonymousId,
          funnel: 'auth',
          event,
          status: 'started',
          metadata: { phone: capture.phone },
          source_app: 'marketing',
          ip_address: ip,
          created_at: now,
        })),
      );
      if (funnelError) {
        console.error('capture-phone: funnel event insert failed:', funnelError.message);
      }
    }

    return NextResponse.json({ captured }, { headers: corsHeaders });
  } catch (error) {
    console.error('capture-phone error:', error);
    return NextResponse.json({ captured: false }, { headers: corsHeaders });
  }
}
