export const dynamic = 'force-dynamic';

/**
 * Capture Phone Intent API
 *
 * Saves the phone number to the user record BEFORE OTP verification.
 * Called immediately when user submits phone number, even before Firebase sends the SMS.
 * This ensures we retain the phone number as a lead even if OTP verification fails.
 *
 * The phone is saved with phone_verified=false (unchanged from current state).
 * The verify-phone route later sets phone_verified=true on OTP success.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyIdToken } from '@/lib/firebase-admin';
import { getUserByFirebaseUid, getSupabaseAdminClient, insertFunnelEvent } from '@neram/database';
import { getCorsHeaders } from '@/lib/cors';

export async function OPTIONS(req: NextRequest) {
  const corsHeaders = getCorsHeaders(req.headers.get('Origin'));
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function POST(req: NextRequest) {
  const corsHeaders = getCorsHeaders(req.headers.get('Origin'));
  try {
    const { idToken, phoneNumber } = await req.json();

    if (!idToken || !phoneNumber) {
      return NextResponse.json({ error: 'idToken and phoneNumber required' }, { status: 400, headers: corsHeaders });
    }

    // Validate phone format
    const cleaned = phoneNumber.replace(/\D/g, '');
    if (cleaned.length < 10) {
      return NextResponse.json({ error: 'Invalid phone number' }, { status: 400, headers: corsHeaders });
    }

    const formattedPhone = phoneNumber.startsWith('+') ? phoneNumber : `+91${cleaned.slice(-10)}`;

    let decodedToken;
    try {
      decodedToken = await verifyIdToken(idToken);
    } catch {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401, headers: corsHeaders });
    }

    const adminClient = getSupabaseAdminClient();
    const db = adminClient as any;

    const user = await getUserByFirebaseUid(decodedToken.uid, adminClient);
    if (!user) {
      return NextResponse.json({ captured: false }, { headers: corsHeaders });
    }

    // Only save if user doesn't already have a verified phone (don't overwrite)
    if (!user.phone_verified) {
      await db
        .from('users')
        .update({ phone: formattedPhone, updated_at: new Date().toISOString() })
        .eq('id', user.id);
    }

    // Track as funnel events for analytics
    // phone_number_entered = user typed their number
    // otp_requested = OTP is about to be sent (this call happens right before Firebase sends SMS)
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;
    await insertFunnelEvent(adminClient, {
      user_id: user.id,
      anonymous_id: null,
      funnel: 'auth',
      event: 'phone_number_entered',
      status: 'started',
      error_message: null,
      error_code: null,
      metadata: { phone: formattedPhone },
      device_session_id: null,
      device_type: null,
      browser: null,
      os: null,
      ip_address: ip,
      source_app: 'app',
      page_url: null,
    }).catch(() => {});
    await insertFunnelEvent(adminClient, {
      user_id: user.id,
      anonymous_id: null,
      funnel: 'auth',
      event: 'otp_requested',
      status: 'started',
      error_message: null,
      error_code: null,
      metadata: { phone: formattedPhone },
      device_session_id: null,
      device_type: null,
      browser: null,
      os: null,
      ip_address: ip,
      source_app: 'app',
      page_url: null,
    }).catch(() => {});

    return NextResponse.json({ captured: true }, { headers: corsHeaders });
  } catch (error) {
    // Non-critical: don't fail the user flow if capture fails
    console.error('capture-phone error:', error);
    return NextResponse.json({ captured: false }, { headers: corsHeaders });
  }
}
