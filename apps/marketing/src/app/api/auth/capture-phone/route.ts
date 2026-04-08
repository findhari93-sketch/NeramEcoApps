export const dynamic = 'force-dynamic';

/**
 * Capture Phone Intent API (Marketing)
 *
 * Saves the phone number to the user record BEFORE OTP verification.
 * Called immediately when user submits phone number, before Firebase sends the SMS.
 * Ensures phone is retained as a lead even if OTP verification fails.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { getApps } from 'firebase-admin/app';
import { getUserByFirebaseUid, getSupabaseAdminClient } from '@neram/database';

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
    const { idToken, phoneNumber } = await req.json();
    if (!idToken || !phoneNumber) {
      return NextResponse.json({ error: 'idToken and phoneNumber required' }, { status: 400, headers: corsHeaders });
    }

    const cleaned = phoneNumber.replace(/\D/g, '');
    if (cleaned.length < 10) {
      return NextResponse.json({ error: 'Invalid phone number' }, { status: 400, headers: corsHeaders });
    }
    const formattedPhone = phoneNumber.startsWith('+') ? phoneNumber : `+91${cleaned.slice(-10)}`;

    if (getApps().length === 0) {
      return NextResponse.json({ captured: false }, { headers: corsHeaders });
    }

    let decodedToken;
    try {
      decodedToken = await getAuth().verifyIdToken(idToken);
    } catch {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401, headers: corsHeaders });
    }

    const adminClient = getSupabaseAdminClient();
    const db = adminClient as any;
    const user = await getUserByFirebaseUid(decodedToken.uid, adminClient);

    if (user && !user.phone_verified) {
      await db
        .from('users')
        .update({ phone: formattedPhone, updated_at: new Date().toISOString() })
        .eq('id', user.id);

      const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;
      const now = new Date().toISOString();
      // phone_number_entered = user typed their number
      // otp_requested = OTP is about to be sent (this call happens right before Firebase sends SMS)
      await db.from('user_funnel_events').insert([
        {
          user_id: user.id,
          funnel: 'auth',
          event: 'phone_number_entered',
          status: 'started',
          metadata: { phone: formattedPhone },
          source_app: 'marketing',
          ip_address: ip,
          created_at: now,
        },
        {
          user_id: user.id,
          funnel: 'auth',
          event: 'otp_requested',
          status: 'started',
          metadata: { phone: formattedPhone },
          source_app: 'marketing',
          ip_address: ip,
          created_at: now,
        },
      ]).catch(() => {});
    }

    return NextResponse.json({ captured: true }, { headers: corsHeaders });
  } catch (error) {
    console.error('capture-phone error:', error);
    return NextResponse.json({ captured: false }, { headers: corsHeaders });
  }
}
