export const dynamic = 'force-dynamic';

/**
 * Register/Check User API
 *
 * This API registers a Firebase user in Supabase or returns existing user data.
 * Called after successful Firebase authentication to sync user with database.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyIdToken } from '@/lib/firebase-admin';
import { getOrCreateUserFromFirebase, updateUser, getUserByFirebaseUid, getSupabaseAdminClient, computeAccountTier, createAutoMessage } from '@neram/database';

import { getCorsHeaders } from '@/lib/cors';

export async function OPTIONS(req: NextRequest) {
  const corsHeaders = getCorsHeaders(req.headers.get('Origin'));
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function POST(req: NextRequest) {
  const corsHeaders = getCorsHeaders(req.headers.get('Origin'));
  try {
    const { idToken } = await req.json();

    if (!idToken) {
      return NextResponse.json(
        { error: 'ID token is required' },
        { status: 400, headers: corsHeaders }
      );
    }

    // Verify the Firebase ID token
    let decodedToken;
    try {
      decodedToken = await verifyIdToken(idToken);
    } catch (tokenError) {
      console.error('Firebase token verification failed:', tokenError);
      return NextResponse.json(
        { error: 'Invalid authentication token' },
        { status: 401, headers: corsHeaders }
      );
    }

    const adminClient = getSupabaseAdminClient();

    // Get or create user in Supabase
    const { user, isNewUser } = await getOrCreateUserFromFirebase({
      uid: decodedToken.uid,
      email: decodedToken.email || null,
      phoneNumber: decodedToken.phone_number || null,
      displayName: decodedToken.name || null,
      photoURL: decodedToken.picture || null,
    });

    // Update last login time (use admin client to bypass RLS)
    await updateUser(user.id, {
      last_login_at: new Date().toISOString(),
    }, adminClient);

    // Schedule auto first-touch message for new users (30 min delay)
    if (isNewUser) {
      try {
        const phone = decodedToken.phone_number || user.phone;
        const email = decodedToken.email || user.email;
        const channel = phone ? 'whatsapp' : 'email';
        // Use text-only template for new registrations (state unknown at this point)
        // Video templates (Tamil) are used in backfill for Tamil Nadu leads
        const templateName = 'first_touch_quick_question';
        const delayMs = 30 * 60 * 1000; // 30 minutes

        await createAutoMessage({
          user_id: user.id,
          message_type: 'first_touch',
          channel: channel as 'whatsapp' | 'email',
          template_name: templateName,
          send_after: new Date(Date.now() + delayMs).toISOString(),
          metadata: {
            user_name: user.name || decodedToken.name || null,
            phone: phone || null,
            email: email || null,
          },
        }, adminClient);
      } catch (autoMsgErr) {
        // Don't fail registration if auto-message scheduling fails
        console.error('Failed to schedule auto first-touch:', autoMsgErr);
      }
    }

    // Compute account tier from user_type + classroom link
    const accountTier = computeAccountTier(
      user.user_type,
      (user as any).linked_classroom_email ?? null
    );

    return NextResponse.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        avatar_url: user.avatar_url,
        phone_verified: user.phone_verified,
        email_verified: user.email_verified,
        user_type: user.user_type,
        status: user.status,
        onboarding_completed: (user as any).onboarding_completed ?? false,
        account_tier: accountTier,
      },
      isNewUser,
    }, { headers: corsHeaders });

  } catch (error) {
    console.error('Error registering user:', error);
    return NextResponse.json(
      { error: 'Failed to register user' },
      { status: 500, headers: corsHeaders }
    );
  }
}