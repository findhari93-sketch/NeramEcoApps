export const dynamic = 'force-dynamic';

/**
 * Register/Check User API
 *
 * This API registers a Firebase user in Supabase or returns existing user data.
 * Called after successful Firebase authentication to sync user with database.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyIdToken } from '@/lib/firebase-admin';
import { getOrCreateUserFromFirebase, updateUser, getUserByFirebaseUid, getSupabaseAdminClient, computeAccountTier, createAutoMessage, schedulePhoneDrip, insertFunnelEvent, linkAnonymousEvents } from '@neram/database';

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

    // Track registration start
    await insertFunnelEvent(adminClient, {
      user_id: null,
      anonymous_id: null,
      funnel: 'auth',
      event: 'register_user_started',
      status: 'started',
      error_message: null,
      error_code: null,
      metadata: { firebase_uid: decodedToken.uid },
      device_session_id: null,
      device_type: null,
      browser: null,
      os: null,
      ip_address: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
      source_app: 'app',
      page_url: null,
    }).catch(() => {});

    // Get or create user in Supabase
    const { user, isNewUser } = await getOrCreateUserFromFirebase({
      uid: decodedToken.uid,
      email: decodedToken.email || null,
      phoneNumber: decodedToken.phone_number || null,
      displayName: decodedToken.name || null,
      photoURL: decodedToken.picture || null,
    });

    // Track registration completion
    await insertFunnelEvent(adminClient, {
      user_id: user.id,
      anonymous_id: null,
      funnel: 'auth',
      event: 'register_user_completed',
      status: 'completed',
      error_message: null,
      error_code: null,
      metadata: { is_new_user: isNewUser },
      device_session_id: null,
      device_type: null,
      browser: null,
      os: null,
      ip_address: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
      source_app: 'app',
      page_url: null,
    }).catch(() => {});

    // Update last login time (use admin client to bypass RLS)
    // Also sync Google avatar for users who authenticated before avatar_url was stored
    const lastLoginUpdate: { last_login_at: string; avatar_url?: string } = {
      last_login_at: new Date().toISOString(),
    };
    if (!user.avatar_url && decodedToken.picture) {
      lastLoginUpdate.avatar_url = decodedToken.picture;
    }
    await updateUser(user.id, lastLoginUpdate as any, adminClient);

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

      // Schedule phone verification drip emails (fire and forget — must not fail registration)
      if (user.user_type === 'lead' && !user.phone_verified && user.email) {
        schedulePhoneDrip(user.id, {
          userName: user.name,
          email: user.email,
        }, adminClient).catch((err) => {
          console.error('schedulePhoneDrip failed (non-blocking):', err);
        });
      }
    }

    // Compute account tier from user_type + classroom link
    const accountTier = computeAccountTier(
      user.user_type,
      (user as any).linked_classroom_email ?? null
    );

    // Check if user is enrolled (has student_profiles record)
    // Enrolled students should skip the initial onboarding questionnaire
    let onboardingCompleted = (user as any).onboarding_completed ?? false;
    if (!onboardingCompleted) {
      const { data: studentProfile } = await adminClient
        .from('student_profiles')
        .select('id')
        .eq('user_id', user.id)
        .limit(1)
        .maybeSingle();
      if (studentProfile) {
        onboardingCompleted = true;
        // Persist so we don't check every time
        await updateUser(user.id, { onboarding_completed: true } as any, adminClient).catch(() => {});
      }
    }

    // Also skip wizard for applicants (leads who filled the application form)
    if (!onboardingCompleted) {
      const { data: leadProfile } = await adminClient
        .from('lead_profiles')
        .select('id')
        .eq('user_id', user.id)
        .in('status', ['submitted', 'approved', 'under_review', 'enrolled', 'partial_payment'])
        .is('deleted_at', null)
        .limit(1)
        .maybeSingle();
      if (leadProfile) {
        onboardingCompleted = true;
        await updateUser(user.id, { onboarding_completed: true } as any, adminClient).catch(() => {});
      }
    }

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
        onboarding_completed: onboardingCompleted,
        account_tier: accountTier,
      },
      isNewUser,
    }, { headers: corsHeaders });

  } catch (error) {
    console.error('Error registering user:', error);
    // Track registration failure
    try {
      const adminClient = getSupabaseAdminClient();
      await insertFunnelEvent(adminClient, {
        user_id: null,
        anonymous_id: null,
        funnel: 'auth',
        event: 'register_user_failed',
        status: 'failed',
        error_message: error instanceof Error ? error.message : 'Unknown error',
        error_code: null,
        metadata: {},
        device_session_id: null,
        device_type: null,
        browser: null,
        os: null,
        ip_address: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
        source_app: 'app',
        page_url: null,
      });
    } catch { /* don't fail on tracking failure */ }
    return NextResponse.json(
      { error: 'Failed to register user' },
      { status: 500, headers: corsHeaders }
    );
  }
}