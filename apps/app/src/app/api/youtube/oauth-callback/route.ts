import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import {
  exchangeCodeForToken,
  subscribeToChannel,
  getGoogleUserInfo,
} from '@/lib/youtube';
import { createServerClient, User } from '@neram/database';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_YOUTUBE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_YOUTUBE_CLIENT_SECRET || '';
const REDIRECT_URI = process.env.YOUTUBE_OAUTH_REDIRECT_URI || 'https://app.neramclasses.com/api/youtube/oauth-callback';
const YOUTUBE_CHANNEL_ID = process.env.NEXT_PUBLIC_YOUTUBE_CHANNEL_ID || '';
const MARKETING_URL = process.env.NEXT_PUBLIC_MARKETING_URL || 'https://neramclasses.com';

/**
 * GET /api/youtube/oauth-callback
 *
 * Handles the OAuth callback from Google after user authorization.
 * 1. Validates state parameter
 * 2. Exchanges code for access token
 * 3. Subscribes user to the channel
 * 4. Creates/updates user in database
 * 5. Generates coupon code
 * 6. Redirects to success page
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  const cookieStore = await cookies();
  const storedState = cookieStore.get('youtube_oauth_state')?.value;
  const redirectUrl = cookieStore.get('youtube_redirect_url')?.value || MARKETING_URL;

  // Clear the cookies
  cookieStore.delete('youtube_oauth_state');
  cookieStore.delete('youtube_redirect_url');

  // Handle OAuth errors
  if (error) {
    console.error('YouTube OAuth error:', error);
    return NextResponse.redirect(
      `${redirectUrl}?error=${encodeURIComponent('YouTube authorization was cancelled or failed')}`
    );
  }

  // Validate state parameter for CSRF protection
  if (!state || state !== storedState) {
    console.error('State mismatch:', { received: state, expected: storedState });
    return NextResponse.redirect(
      `${redirectUrl}?error=${encodeURIComponent('Invalid authorization state. Please try again.')}`
    );
  }

  if (!code) {
    return NextResponse.redirect(
      `${redirectUrl}?error=${encodeURIComponent('No authorization code received')}`
    );
  }

  try {
    // Exchange code for access token
    const tokenData = await exchangeCodeForToken(
      code,
      GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET,
      REDIRECT_URI
    );

    if (!tokenData) {
      return NextResponse.redirect(
        `${redirectUrl}?error=${encodeURIComponent('Failed to exchange authorization code')}`
      );
    }

    const { access_token } = tokenData;

    // Get user info from Google
    const userInfo = await getGoogleUserInfo(access_token);

    if (!userInfo) {
      return NextResponse.redirect(
        `${redirectUrl}?error=${encodeURIComponent('Failed to get user information')}`
      );
    }

    // Subscribe user to the Neram Classes channel
    const subscriptionResult = await subscribeToChannel(access_token, YOUTUBE_CHANNEL_ID);

    if (!subscriptionResult.success) {
      return NextResponse.redirect(
        `${redirectUrl}?error=${encodeURIComponent(subscriptionResult.error || 'Failed to subscribe to channel')}`
      );
    }

    // Connect to database
    const supabase = createServerClient();

    // Find or create user
    let user: User | null = null;
    const { data: existingUser } = await supabase
      .from('users')
      .select('*')
      .eq('email', userInfo.email)
      .single();

    if (existingUser) {
      user = existingUser as User;

      // Update Google ID if not set
      if (!(existingUser as User).google_id) {
        await supabase
          .from('users')
          .update({ google_id: userInfo.id } as never)
          .eq('id', (existingUser as User).id);
      }
    } else {
      // Create new user
      const { data: newUser, error: createError } = await supabase
        .from('users')
        .insert({
          email: userInfo.email,
          name: userInfo.name,
          avatar_url: userInfo.picture,
          google_id: userInfo.id,
          user_type: 'lead',
          status: 'pending',
          email_verified: true,
          phone_verified: false,
          preferred_language: 'en',
        } as never)
        .select()
        .single();

      if (createError) {
        console.error('Error creating user:', createError);
        return NextResponse.redirect(
          `${redirectUrl}?error=${encodeURIComponent('Failed to create user account')}`
        );
      }

      user = newUser as User;
    }

    if (!user) {
      return NextResponse.redirect(
        `${redirectUrl}?error=${encodeURIComponent('Failed to create or find user')}`
      );
    }

    // Check if user already has a YouTube subscription coupon
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existingCoupon } = await supabase
      .from('youtube_subscription_coupons')
      .select('*, coupons(*)')
      .eq('user_id', user.id)
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

      if (couponError) {
        console.error('Error creating coupon:', couponError);
        return NextResponse.redirect(
          `${redirectUrl}?error=${encodeURIComponent('Failed to generate coupon')}`
        );
      }

      // Create YouTube subscription record
      const { error: subscriptionError } = await supabase
        .from('youtube_subscription_coupons')
        .insert({
          user_id: user.id,
          coupon_id: newCoupon?.id,
          youtube_channel_id: YOUTUBE_CHANNEL_ID,
          youtube_subscription_id: subscriptionResult.subscription?.id || null,
          subscribed_at: subscriptionResult.subscription?.subscribedAt || new Date().toISOString(),
          ip_address: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip'),
          user_agent: request.headers.get('user-agent'),
        } as never);

      if (subscriptionError) {
        console.error('Error recording subscription:', subscriptionError);
        // Don't fail - coupon was still created
      }

      // Also create a cashback claim record for admin visibility
      const { data: leadProfile } = await supabase
        .from('lead_profiles')
        .select('id')
        .eq('user_id', user.id)
        .single() as { data: { id: string } | null };

      await supabase
        .from('cashback_claims')
        .upsert({
          lead_profile_id: leadProfile?.id || null,
          user_id: user.id,
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

    // Construct the success redirect URL
    const successUrl = new URL('/youtube-reward', redirectUrl);
    successUrl.searchParams.set('coupon', couponCode);
    successUrl.searchParams.set('name', userInfo.name);

    return NextResponse.redirect(successUrl.toString());
  } catch (error) {
    console.error('YouTube OAuth callback error:', error);
    return NextResponse.redirect(
      `${redirectUrl}?error=${encodeURIComponent('An unexpected error occurred')}`
    );
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
