export const dynamic = 'force-dynamic';

/**
 * Verify Phone API (Marketing)
 *
 * Updates user's phone number and phone_verified status in Supabase
 * after successful Firebase phone verification on the enrollment page.
 */

import { NextRequest, NextResponse } from 'next/server';
import { isSamePhone } from '@/lib/phone';
import { getAuth } from 'firebase-admin/auth';
import { getApps } from 'firebase-admin/app';
import {
  getUserByFirebaseUid,
  updateUser,
  getOrCreateUserFromFirebase,
  checkPhoneExists,
  findVerifiedPhoneOwner,
  getSupabaseAdminClient, recordDuplicateCandidate,
  linkPhoneAttempts,
  normalizeAttemptPhone,
  recordPhoneAttempt,
  queueFirstTouchWhatsApp,
  recordFirstTouch,
  claimFunnelStage,
  resolveDuplicatesFor,
  normalisePhoneE164,
  getUserById,
} from '@neram/database';
import {
  isRecentAccountWithoutOrigin,
  isValidAnonymousId,
  resolveSignupFirstTouch,
  resolveSignupLastTouch,
} from '@neram/database/analytics';

// Firebase Admin is initialized in _lib/auth.ts — ensure it's imported
import '@/app/api/_lib/auth';
import { alertNewSignup } from '@neram/database/signup-alert';

function verifyIdToken(idToken: string) {
  if (!getApps().length) {
    throw new Error('Firebase Admin not initialized');
  }
  return getAuth().verifyIdToken(idToken);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { idToken, phoneNumber } = body;

    if (!idToken || !phoneNumber) {
      return NextResponse.json(
        { error: 'ID token and phone number are required' },
        { status: 400 }
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
        { status: 401 }
      );
    }

    // Only the number Firebase verified by OTP (the token's phone_number claim)
    // may be marked verified. Without this, any signed-in user could claim any number.
    if (!isSamePhone(decodedToken.phone_number, phoneNumber)) {
      return NextResponse.json(
        { error: 'PHONE_NOT_VERIFIED', message: 'This phone number has not been verified for your account.' },
        { status: 403 }
      );
    }

    const adminClient = getSupabaseAdminClient();

    // Where this person came from (body from LoginModal, else the shared cookies).
    const cookieHeader = req.headers.get('cookie');
    const origin = {
      anonymousId: isValidAnonymousId(body.anonymousId) ? body.anonymousId : null,
      firstTouch: resolveSignupFirstTouch({ bodyFirstTouch: body.first_touch, bodyTouches: body.touches, cookieHeader }),
      lastTouch: resolveSignupLastTouch({ bodyTouches: body.touches, cookieHeader }) as Record<string, unknown> | null,
    };

    // Get user from Supabase
    let user = await getUserByFirebaseUid(decodedToken.uid, adminClient);
    if (user && isRecentAccountWithoutOrigin(user)) {
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
        if (result.isNewUser) await recordFirstTouch(adminClient, user.id, origin);
      } catch (createError) {
        console.error('Failed to create fallback user:', createError);
        return NextResponse.json(
          { error: 'User not found and could not be created' },
          { status: 404 }
        );
      }
    }

    // Only a VERIFIED owner blocks this number (the app's rule). A row where
    // someone merely typed it (capture-phone, a staff-entered demo booking, an
    // old unverified form) must not lock out the student who just proved it by
    // OTP; that pair goes to staff as a weak duplicate instead.
    const typedElsewhere = await checkPhoneExists(phoneNumber, user.id, adminClient);
    const existingPhoneUser = typedElsewhere ? await findVerifiedPhoneOwner(phoneNumber, user.id, adminClient) : null;
    if (typedElsewhere && !existingPhoneUser) {
      await recordDuplicateCandidate(
        { userA: user.id, userB: typedElsewhere.id, reason: 'phone_otp_conflict', confidence: 'likely', detectedBy: 'signin' },
        adminClient,
      ).catch(() => {});
    }
    if (existingPhoneUser) {
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
        { status: 409 }
      );
    }

    // Update user with verified phone, stored as E.164 (one shape for lookups).
    let updatedUser = await updateUser(user.id, {
      phone: normalisePhoneE164(phoneNumber) || phoneNumber,
      phone_verified: true,
    }, adminClient);

    // The number's row in phone_attempts gets its tick (see the app's route).
    const verifiedPhone = normalizeAttemptPhone(phoneNumber);
    if (verifiedPhone) {
      const anonymousId = isValidAnonymousId(body.anonymousId) ? body.anonymousId : null;
      await linkPhoneAttempts(anonymousId, user.id, adminClient);
      await recordPhoneAttempt(
        { userId: user.id, anonymousId, phone: verifiedPhone, event: 'verified', sourceApp: 'marketing' },
        adminClient,
      );
    }

    // One record per family (see the app's route): a sign-up folded into a
    // known student or an older record is not a new lead, an Ads sign-up or a
    // new welcome.
    const resolved = await resolveDuplicatesFor(user.id, { via: 'signin' }, adminClient);
    if (resolved.survivorId !== user.id) {
      const survivor = await getUserById(resolved.survivorId, adminClient).catch(() => null);
      if (survivor) updatedUser = survivor;
      return NextResponse.json({
        success: true,
        signupConversion: false,
        mergedInto: resolved.survivorId,
        user: {
          id: updatedUser.id,
          name: updatedUser.name,
          email: updatedUser.email,
          phone: updatedUser.phone,
          phone_verified: updatedUser.phone_verified,
        },
      });
    }

    // Google Ads "Sign-up (OTP verified)", once per lead account (see the app's route).
    const signupConversion =
      user.user_type === 'lead' &&
      (await claimFunnelStage(adminClient, user.id, 'signup_verified', {
        metadata: { value_inr: 100 },
        sourceApp: 'marketing',
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
    });
  } catch (error) {
    console.error('Error verifying phone:', error);
    return NextResponse.json(
      { error: 'Failed to verify phone' },
      { status: 500 }
    );
  }
}
