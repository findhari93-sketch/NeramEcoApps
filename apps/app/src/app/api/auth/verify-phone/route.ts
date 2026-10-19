export const dynamic = 'force-dynamic';

/**
 * Verify Phone API
 *
 * Updates user's phone number and phone_verified status in Supabase
 * after successful Firebase phone verification.
 */

import { NextRequest, NextResponse } from 'next/server';
import { isSamePhone } from '@/lib/phone-match';
import { verifyIdToken } from '@/lib/firebase-admin';
import { getUserByFirebaseUid, updateUser, getOrCreateUserFromFirebase, checkPhoneExists, findVerifiedPhoneOwner, getSupabaseAdminClient, insertFunnelEvent, recordDuplicateCandidate, linkPhoneAttempts, normalizeAttemptPhone, recordPhoneAttempt, recordFirstTouch, queueFirstTouchWhatsApp, claimFunnelStage } from '@neram/database';
import { isRecentAccountWithoutOrigin, isValidAnonymousId, resolveSignupFirstTouch, resolveSignupLastTouch } from '@neram/database/analytics';
import { clientIpFromHeaders, signupGeoFromHeaders } from '@neram/database/signup-geo';
import { alertNewSignup, recordSignupGeo } from '@neram/database/signup-alert';

import { getCorsHeaders } from '@/lib/cors';

export async function OPTIONS(req: NextRequest) {
  const corsHeaders = getCorsHeaders(req.headers.get('Origin'));
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function POST(req: NextRequest) {
  const corsHeaders = getCorsHeaders(req.headers.get('Origin'));
  try {
    const body = await req.json().catch(() => ({}));
    const { idToken, phoneNumber } = body;

    if (!idToken || !phoneNumber) {
      return NextResponse.json(
        { error: 'ID token and phone number are required' },
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

    // Only the number Firebase verified by OTP (the token's phone_number claim)
    // may be marked verified. Without this, any signed-in user could claim any number.
    if (!isSamePhone(decodedToken.phone_number, phoneNumber)) {
      return NextResponse.json(
        { error: 'PHONE_NOT_VERIFIED', message: 'This phone number has not been verified for your account.' },
        { status: 403, headers: corsHeaders }
      );
    }

    const adminClient = getSupabaseAdminClient();

    // Where this person came from: the body (LoginModal sends the shared cookies,
    // which a cross-origin call from the marketing site does not carry) or the
    // cookie header (same-origin calls from this app).
    const cookieHeader = req.headers.get('cookie');
    const origin = {
      anonymousId: isValidAnonymousId(body.anonymousId) ? body.anonymousId : null,
      firstTouch: resolveSignupFirstTouch({ bodyFirstTouch: body.first_touch, bodyTouches: body.touches, cookieHeader }),
      lastTouch: resolveSignupLastTouch({ bodyTouches: body.touches, cookieHeader }) as Record<string, unknown> | null,
    };

    // Get user from Supabase (use admin client to bypass RLS)
    let user = await getUserByFirebaseUid(decodedToken.uid, adminClient);
    if (user && isRecentAccountWithoutOrigin(user)) {
      // register-user lost the race to an earlier call that knew less; fill the gaps.
      await recordFirstTouch(adminClient, user.id, origin);
    }

    if (!user) {
      // Fallback: create user if register-user hadn't completed
      try {
        const result = await getOrCreateUserFromFirebase({
          uid: decodedToken.uid,
          email: decodedToken.email || null,
          emailVerified: decodedToken.email_verified === true,
          phoneNumber: phoneNumber,
          displayName: decodedToken.name || null,
        });
        user = result.user;
        // register-user never ran for this account: keep its origin and place here.
        if (result.isNewUser) {
          await recordFirstTouch(adminClient, user.id, origin);
          await recordSignupGeo(adminClient, user.id, signupGeoFromHeaders(req.headers));
        }
      } catch (createError) {
        console.error('Failed to create fallback user:', createError);
        return NextResponse.json(
          { error: 'User not found and could not be created' },
          { status: 404, headers: corsHeaders }
        );
      }
    }

    // Only a VERIFIED owner blocks this number. A row where someone merely
    // typed it (capture-phone, an old unverified form) must not lock out the
    // student who just proved it by OTP; that pair goes to staff as a weak
    // duplicate instead.
    const typedElsewhere = await checkPhoneExists(phoneNumber, user.id, adminClient);
    const existingPhoneUser = typedElsewhere ? await findVerifiedPhoneOwner(phoneNumber, user.id, adminClient) : null;
    if (typedElsewhere && !existingPhoneUser) {
      await recordDuplicateCandidate(
        { userA: user.id, userB: typedElsewhere.id, reason: 'phone_otp_conflict', confidence: 'likely', detectedBy: 'signin' },
        adminClient,
      ).catch(() => {});
    }
    if (existingPhoneUser) {
      await insertFunnelEvent(adminClient, {
        user_id: user.id,
        anonymous_id: null,
        funnel: 'auth',
        event: 'phone_already_exists',
        status: 'failed',
        error_message: 'Phone number already registered with another account',
        error_code: 'PHONE_ALREADY_EXISTS',
        metadata: {},
        device_session_id: null,
        device_type: null,
        browser: null,
        os: null,
        ip_address: clientIpFromHeaders(req.headers),
        source_app: 'app',
        page_url: null,
      }).catch(() => {});

      // The caller just proved (OTP) that they own this phone, and another row
      // holds it: almost always the same person with two accounts (phone-first
      // apply form, then Google). Queue the pair for a human; never auto-merge.
      await recordDuplicateCandidate(
        { userA: user.id, userB: existingPhoneUser.id, reason: 'phone_otp_conflict', confidence: 'strong', detectedBy: 'signin' },
        adminClient,
      );

      return NextResponse.json(
        {
          error: 'PHONE_ALREADY_EXISTS',
          message: 'This phone number is already registered with another account. Please use a different phone number or sign in with the existing account.',
        },
        { status: 409, headers: corsHeaders }
      );
    }

    // Update user with verified phone (use admin client to bypass RLS)
    const updatedUser = await updateUser(user.id, {
      phone: phoneNumber,
      phone_verified: true,
    }, adminClient);

    // The number's row in phone_attempts gets its tick. Attempts typed while
    // signed out (phone-first sign-in) move onto this account first.
    const verifiedPhone = normalizeAttemptPhone(phoneNumber);
    if (verifiedPhone) {
      const anonymousId = isValidAnonymousId(body.anonymousId) ? body.anonymousId : null;
      await linkPhoneAttempts(anonymousId, user.id, adminClient);
      await recordPhoneAttempt(
        { userId: user.id, anonymousId, phone: verifiedPhone, event: 'verified', sourceApp: 'app' },
        adminClient,
      );
    }

    // Track successful phone verification
    await insertFunnelEvent(adminClient, {
      user_id: user.id,
      anonymous_id: null,
      funnel: 'auth',
      event: 'otp_verified',
      status: 'completed',
      error_message: null,
      error_code: null,
      metadata: {},
      device_session_id: null,
      device_type: null,
      browser: null,
      os: null,
      ip_address: clientIpFromHeaders(req.headers),
      source_app: 'app',
      page_url: null,
    }).catch(() => {});

    // Google Ads "Sign-up (OTP verified)": the first phone verification of a
    // lead account, recorded once in the DB. The browser fires the conversion
    // only when this is true, so a returning login never counts.
    const signupConversion =
      user.user_type === 'lead' &&
      (await claimFunnelStage(adminClient, user.id, 'signup_verified', {
        metadata: { value_inr: 100 },
        sourceApp: 'app',
      }));

    // First verified phone of a new account: tell staff (bell + phone push).
    await alertNewSignup(adminClient, user.id);
    // A Google-first sign-in was queued an email welcome (no phone then); now
    // that the phone is verified it gets the WhatsApp welcome instead.
    await queueFirstTouchWhatsApp(adminClient, user.id);

    return NextResponse.json({
      success: true,
      signupConversion,
      user: {
        id: updatedUser.id,
        name: updatedUser.name,
        email: updatedUser.email,
        phone: updatedUser.phone,
        phone_verified: updatedUser.phone_verified,
      },
    }, { headers: corsHeaders });

  } catch (error) {
    console.error('Error verifying phone:', error);
    return NextResponse.json(
      { error: 'Failed to verify phone' },
      { status: 500, headers: corsHeaders }
    );
  }
}