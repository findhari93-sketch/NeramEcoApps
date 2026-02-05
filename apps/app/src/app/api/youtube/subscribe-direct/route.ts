/**
 * Direct YouTube Subscription API
 *
 * Handles YouTube subscription and coupon generation in one call.
 * Uses the access token from Firebase Google sign-in (with YouTube scope)
 * and creates a Firebase custom token for cross-domain auth.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyIdToken, createCustomToken } from '@/lib/firebase-admin';
import { subscribeToChannel } from '@/lib/youtube';
import { createServerClient } from '@neram/database';

const YOUTUBE_CHANNEL_ID = process.env.NEXT_PUBLIC_YOUTUBE_CHANNEL_ID || '';
const MARKETING_URL = process.env.NEXT_PUBLIC_MARKETING_URL || 'https://neramclasses.com';

/**
 * POST /api/youtube/subscribe-direct
 *
 * Body: {
 *   idToken: string,      // Firebase ID token
 *   accessToken: string,  // Google OAuth access token with YouTube scope
 *   redirectUrl: string   // URL to redirect to after completion
 * }
 *
 * Returns: {
 *   success: boolean,
 *   redirectUrl: string,  // Full URL with coupon and authToken params
 *   couponCode?: string,
 *   error?: string
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const { idToken, accessToken, redirectUrl } = await request.json();

    if (!idToken) {
      return NextResponse.json(
        { success: false, error: 'Firebase ID token is required' },
        { status: 400 }
      );
    }

    if (!accessToken) {
      return NextResponse.json(
        { success: false, error: 'YouTube access token is required' },
        { status: 400 }
      );
    }

    if (!YOUTUBE_CHANNEL_ID) {
      return NextResponse.json(
        { success: false, error: 'YouTube channel not configured' },
        { status: 500 }
      );
    }

    // Verify Firebase ID token
    const decodedToken = await verifyIdToken(idToken);
    const firebaseUid = decodedToken.uid;
    const userEmail = decodedToken.email || '';
    const userName = decodedToken.name || '';
    const userPicture = decodedToken.picture || '';

    // Subscribe to YouTube channel
    const subscriptionResult = await subscribeToChannel(accessToken, YOUTUBE_CHANNEL_ID);

    if (!subscriptionResult.success) {
      return NextResponse.json({
        success: false,
        error: subscriptionResult.error || 'Failed to subscribe to YouTube channel',
      });
    }

    // Connect to database
    const supabase = createServerClient();

    // Find or create user
    let userId: string;
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('firebase_uid', firebaseUid)
      .single() as { data: { id: string } | null };

    if (existingUser) {
      userId = existingUser.id;
    } else {
      // Try to find by email
      const { data: userByEmail } = await supabase
        .from('users')
        .select('id')
        .eq('email', userEmail)
        .single() as { data: { id: string } | null };

      if (userByEmail) {
        userId = userByEmail.id;
        // Update Firebase UID
        await supabase
          .from('users')
          .update({ firebase_uid: firebaseUid } as never)
          .eq('id', userId);
      } else {
        // Create new user
        const { data: newUser, error: createError } = await supabase
          .from('users')
          .insert({
            email: userEmail,
            name: userName,
            avatar_url: userPicture,
            firebase_uid: firebaseUid,
            user_type: 'lead',
            status: 'pending',
            email_verified: true,
            phone_verified: false,
            preferred_language: 'en',
          } as never)
          .select('id')
          .single() as { data: { id: string } | null; error: Error | null };

        if (createError || !newUser) {
          console.error('Error creating user:', createError);
          return NextResponse.json({
            success: false,
            error: 'Failed to create user account',
          });
        }

        userId = newUser.id;
      }
    }

    // Check if user already has a YouTube subscription coupon
    const { data: existingCoupon } = await supabase
      .from('youtube_subscription_coupons')
      .select('*, coupons(*)')
      .eq('user_id', userId)
      .eq('youtube_channel_id', YOUTUBE_CHANNEL_ID)
      .single() as { data: { coupons?: { code: string } } | null };

    let couponCode: string;

    if (existingCoupon && existingCoupon.coupons) {
      // User already has a coupon
      couponCode = existingCoupon.coupons.code;
    } else {
      // Generate new coupon code
      couponCode = `YTSUB50-${generateRandomCode(6)}`;

      // Create coupon
      const validUntil = new Date();
      validUntil.setDate(validUntil.getDate() + 30); // Valid for 30 days

      const { data: newCoupon, error: couponError } = await supabase
        .from('coupons')
        .insert({
          code: couponCode,
          discount_type: 'fixed',
          discount_value: 50,
          valid_from: new Date().toISOString(),
          valid_until: validUntil.toISOString(),
          max_uses: 1,
          used_count: 0,
          is_active: true,
        } as never)
        .select()
        .single() as { data: { id: string } | null; error: Error | null };

      if (couponError || !newCoupon) {
        console.error('Error creating coupon:', couponError);
        return NextResponse.json({
          success: false,
          error: 'Failed to generate coupon',
        });
      }

      // Create YouTube subscription record
      await supabase
        .from('youtube_subscription_coupons')
        .insert({
          user_id: userId,
          coupon_id: newCoupon.id,
          youtube_channel_id: YOUTUBE_CHANNEL_ID,
          youtube_subscription_id: subscriptionResult.subscription?.id || null,
          subscribed_at: subscriptionResult.subscription?.subscribedAt || new Date().toISOString(),
          ip_address: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip'),
          user_agent: request.headers.get('user-agent'),
        } as never);

      // Also create a cashback claim record
      const { data: leadProfile } = await supabase
        .from('lead_profiles')
        .select('id')
        .eq('user_id', userId)
        .single() as { data: { id: string } | null };

      await supabase
        .from('cashback_claims')
        .upsert({
          lead_profile_id: leadProfile?.id || null,
          user_id: userId,
          cashback_type: 'youtube_subscription',
          amount: 50,
          youtube_channel_subscribed: true,
          youtube_verification_data: {
            subscription_id: subscriptionResult.subscription?.id,
            subscribed_at: subscriptionResult.subscription?.subscribedAt,
            coupon_code: couponCode,
          },
          youtube_verified_at: new Date().toISOString(),
          status: 'verified',
        } as never, {
          onConflict: 'user_id,cashback_type',
        });
    }

    // Create a Firebase custom token for cross-domain auth
    const customToken = await createCustomToken(firebaseUid);

    // Construct the success redirect URL
    const finalRedirectUrl = redirectUrl || MARKETING_URL;
    const successUrl = new URL('/youtube-reward', finalRedirectUrl);
    successUrl.searchParams.set('coupon', couponCode);
    successUrl.searchParams.set('name', userName);
    successUrl.searchParams.set('authToken', customToken);

    return NextResponse.json({
      success: true,
      redirectUrl: successUrl.toString(),
      couponCode,
    });
  } catch (error: any) {
    console.error('YouTube subscribe-direct error:', error);

    // Handle Firebase auth errors
    if (error.code?.startsWith('auth/')) {
      return NextResponse.json({
        success: false,
        error: 'Authentication failed. Please try again.',
      });
    }

    return NextResponse.json({
      success: false,
      error: 'An unexpected error occurred',
    });
  }
}

/**
 * Generate a random alphanumeric code
 */
function generateRandomCode(length: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}
