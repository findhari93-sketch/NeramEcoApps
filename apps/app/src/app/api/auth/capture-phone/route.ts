export const dynamic = 'force-dynamic';

/**
 * Capture Phone Intent API
 *
 * Called by the phone dialog the moment Send OTP is tapped (event 'entered'),
 * then again when Firebase accepts the number ('otp_sent') or sending fails
 * ('failed'). Every number lands in phone_attempts, signed in or not (a
 * signed-out visitor is keyed by the anonymous id and moved onto the account
 * at sign-up), so staff can call a student whose OTP never went out.
 * Signals say what the student did next (otp_checked, help, closed,
 * skipped, tab_closed; a closing tab sends no token, the visitor id finds
 * the row) and the user agent gives the device and browser, so Admin can
 * tell "the student stopped" from "our sign-in broke".
 *
 * Signed in with an unverified phone, 'entered' also saves the number on the
 * user record (phone_verified stays false). verify-phone sets it to true.
 * Never fails the sign-in: errors are logged and answered with captured:false.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyIdToken } from '@/lib/firebase-admin';
import {
  getUserByFirebaseUid,
  getSupabaseAdminClient,
  insertFunnelEvent,
  describeUserAgent,
  linkPhoneAttempts,
  parsePhoneCaptureBody,
  recordPhoneAttempt,
} from '@neram/database';
import { getCorsHeaders } from '@/lib/cors';

export async function OPTIONS(req: NextRequest) {
  const corsHeaders = getCorsHeaders(req.headers.get('Origin'));
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function POST(req: NextRequest) {
  const corsHeaders = getCorsHeaders(req.headers.get('Origin'));
  try {
    const body = await req.json().catch(() => ({}));
    const capture = parsePhoneCaptureBody(body, req.headers.get('cookie'));
    if (!capture) {
      return NextResponse.json({ error: 'Invalid phone number or event' }, { status: 400, headers: corsHeaders });
    }

    // A signed-out caller (phone-first sign-in) has no token; an expired token
    // falls back to the anonymous id rather than losing the number.
    let firebaseUid: string | null = null;
    if (body.idToken) {
      try {
        firebaseUid = (await verifyIdToken(body.idToken)).uid;
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
    const { device, browser } = describeUserAgent(req.headers.get('user-agent'));
    const captured = await recordPhoneAttempt(
      {
        userId: user?.id ?? null,
        anonymousId: capture.anonymousId,
        phone: capture.phone,
        event: capture.event,
        source: capture.source,
        sourceApp: 'app',
        errorCode: capture.errorCode,
        errorMessage: capture.errorMessage,
        device,
        browser,
      },
      adminClient,
    );

    if (user && capture.event === 'entered') {
      // Only save if user doesn't already have a verified phone (don't overwrite)
      if (!user.phone_verified) {
        const { error: phoneError } = await db
          .from('users')
          .update({ phone: capture.phone, updated_at: new Date().toISOString() })
          .eq('id', user.id);
        if (phoneError) console.error('capture-phone: phone update failed:', phoneError.message);
      }

      // phone_number_entered = user typed their number
      // otp_requested = OTP is about to be sent (this call happens right before Firebase sends SMS)
      const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;
      for (const event of ['phone_number_entered', 'otp_requested'] as const) {
        await insertFunnelEvent(adminClient, {
          user_id: user.id,
          anonymous_id: capture.anonymousId,
          funnel: 'auth',
          event,
          status: 'started',
          error_message: null,
          error_code: null,
          metadata: { phone: capture.phone },
          device_session_id: null,
          device_type: null,
          browser: null,
          os: null,
          ip_address: ip,
          source_app: 'app',
          page_url: null,
        }).catch(() => {});
      }
    }

    return NextResponse.json({ captured }, { headers: corsHeaders });
  } catch (error) {
    // Non-critical: don't fail the user flow if capture fails
    console.error('capture-phone error:', error);
    return NextResponse.json({ captured: false }, { headers: corsHeaders });
  }
}
