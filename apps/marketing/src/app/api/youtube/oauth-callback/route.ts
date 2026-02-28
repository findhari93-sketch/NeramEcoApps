import { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import {
  exchangeCodeForToken,
  subscribeToChannel,
  getGoogleUserInfo,
} from '@/lib/youtube';
import { getSupabaseAdminClient, createYouTubeSubscriptionCoupon } from '@neram/database';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_YOUTUBE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_YOUTUBE_CLIENT_SECRET || '';
const REDIRECT_URI =
  process.env.YOUTUBE_OAUTH_REDIRECT_URI ||
  'http://localhost:3010/api/youtube/oauth-callback';
const YOUTUBE_CHANNEL_ID = process.env.NEXT_PUBLIC_YOUTUBE_CHANNEL_ID || '';

/**
 * Render an HTML page that sends postMessage to the opener window and auto-closes.
 */
function renderPopupResponse(data: {
  success: boolean;
  couponCode?: string;
  discount?: number;
  userName?: string;
  error?: string;
}, origin: string) {
  const payload = JSON.stringify(
    data.success
      ? {
          type: 'youtube_subscribe_success',
          couponCode: data.couponCode,
          discount: data.discount || 50,
          userName: data.userName || '',
        }
      : {
          type: 'youtube_subscribe_error',
          error: data.error || 'Unknown error',
        }
  );

  const statusIcon = data.success ? '&#10004;' : '&#10006;';
  const statusColor = data.success ? '#4CAF50' : '#F44336';
  const statusTitle = data.success ? 'Subscribed Successfully!' : 'Something went wrong';
  const statusBody = data.success
    ? `<p>Your Rs. 50 discount coupon:</p><div class="coupon">${data.couponCode}</div><p class="sub">This window will close automatically...</p>`
    : `<p class="error">${data.error}</p><p class="sub">You can close this window and try again.</p>`;

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${data.success ? 'Subscription Verified' : 'Subscription Error'}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex; align-items: center; justify-content: center;
      min-height: 100vh; background: #f5f5f5; padding: 16px;
    }
    .card {
      text-align: center; padding: 32px 24px; border-radius: 16px;
      background: white; box-shadow: 0 2px 12px rgba(0,0,0,0.1);
      max-width: 380px; width: 100%;
    }
    .icon { font-size: 48px; margin-bottom: 16px; color: ${statusColor}; }
    h2 { font-size: 20px; margin-bottom: 12px; color: #333; }
    p { font-size: 14px; color: #666; margin-bottom: 8px; }
    .coupon {
      font-family: 'Courier New', monospace; font-size: 20px; font-weight: bold;
      color: #1565C0; background: #E3F2FD; padding: 12px 24px;
      border-radius: 8px; margin: 16px 0; display: inline-block;
      letter-spacing: 1px;
    }
    .error { color: #D32F2F; }
    .sub { color: #999; font-size: 12px; margin-top: 8px; }
    .close-btn {
      margin-top: 20px; padding: 10px 32px; border: none;
      border-radius: 8px; background: ${statusColor}; color: white;
      cursor: pointer; font-size: 14px; font-weight: 500;
    }
    .close-btn:hover { opacity: 0.9; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">${statusIcon}</div>
    <h2>${statusTitle}</h2>
    ${statusBody}
    <button class="close-btn" onclick="window.close()">Close Window</button>
  </div>
  <script>
    try {
      if (window.opener && !window.opener.closed) {
        window.opener.postMessage(${payload}, '${origin}');
      }
    } catch (e) {
      console.error('postMessage error:', e);
    }
    ${data.success ? 'setTimeout(function() { window.close(); }, 2500);' : ''}
  </script>
</body>
</html>`;

  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

/**
 * GET /api/youtube/oauth-callback
 *
 * Handles the OAuth callback from Google after user authorization.
 * In popup mode: renders HTML with postMessage to communicate back to opener.
 * In non-popup mode: redirects to youtube-reward page.
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  const origin = request.nextUrl.origin;
  const cookieStore = await cookies();
  const storedState = cookieStore.get('youtube_oauth_state')?.value;
  const isPopupMode = cookieStore.get('youtube_popup_mode')?.value === 'true';

  // Clear cookies
  cookieStore.delete('youtube_oauth_state');
  cookieStore.delete('youtube_popup_mode');

  const sendError = (msg: string) => {
    if (isPopupMode) {
      return renderPopupResponse({ success: false, error: msg }, origin);
    }
    const url = new URL('/en/youtube-reward', origin);
    url.searchParams.set('error', msg);
    return Response.redirect(url.toString());
  };

  // Handle OAuth errors
  if (error) {
    console.error('YouTube OAuth error:', error);
    return sendError(
      error === 'access_denied'
        ? 'Authorization was cancelled. Please try again.'
        : 'YouTube authorization failed. Please try again.'
    );
  }

  // Validate CSRF state
  if (!state || state !== storedState) {
    console.error('State mismatch:', { received: state, expected: storedState });
    return sendError('Invalid authorization state. Please try again.');
  }

  if (!code) {
    return sendError('No authorization code received.');
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
      return sendError('Failed to exchange authorization code.');
    }

    const { access_token } = tokenData;

    // Get user info from Google
    const userInfo = await getGoogleUserInfo(access_token);
    if (!userInfo) {
      return sendError('Failed to get user information.');
    }

    // Subscribe user to the channel
    const subscriptionResult = await subscribeToChannel(access_token, YOUTUBE_CHANNEL_ID);
    if (!subscriptionResult.success) {
      return sendError(subscriptionResult.error || 'Failed to subscribe to channel.');
    }

    // Connect to database using admin client (no user session in OAuth flow)
    const supabase = getSupabaseAdminClient();

    // Find or create user
    const { data: existingUser } = await (supabase
      .from('users') as any)
      .select('*')
      .eq('email', userInfo.email)
      .single() as { data: { id: string; google_id?: string } | null };

    let userId: string;

    if (existingUser) {
      userId = existingUser.id;
      // Update Google ID if not set
      if (!existingUser.google_id) {
        await (supabase
          .from('users') as any)
          .update({ google_id: userInfo.id } as never)
          .eq('id', existingUser.id);
      }
    } else {
      // Create new user
      const { data: newUser, error: createError } = await (supabase
        .from('users') as any)
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
        .single() as { data: { id: string } | null; error: Error | null };

      if (createError || !newUser) {
        console.error('Error creating user:', createError);
        return sendError('Failed to create user account.');
      }

      userId = newUser.id;
    }

    // Create YouTube subscription coupon (handles deduplication automatically)
    const { coupon } = await createYouTubeSubscriptionCoupon(
      userId,
      YOUTUBE_CHANNEL_ID,
      {
        subscriptionId: subscriptionResult.subscription?.id,
        subscribedAt: subscriptionResult.subscription?.subscribedAt,
        ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || undefined,
        userAgent: request.headers.get('user-agent') || undefined,
      },
      supabase
    );

    // Also create/update cashback claim for admin visibility
    const { data: leadProfile } = await supabase
      .from('lead_profiles' as any)
      .select('id')
      .eq('user_id', userId)
      .single() as { data: { id: string } | null };

    await supabase
      .from('cashback_claims' as any)
      .upsert(
        {
          lead_profile_id: leadProfile?.id || null,
          user_id: userId,
          cashback_type: 'youtube_subscription',
          amount: 50,
          youtube_channel_subscribed: true,
          youtube_verification_data: {
            subscription_id: subscriptionResult.subscription?.id,
            subscribed_at: subscriptionResult.subscription?.subscribedAt,
            coupon_code: coupon.code,
          },
          youtube_verified_at: new Date().toISOString(),
          status: 'verified',
        } as never,
        { onConflict: 'user_id,cashback_type' }
      );

    // Return response based on mode
    if (isPopupMode) {
      return renderPopupResponse(
        {
          success: true,
          couponCode: coupon.code,
          discount: 50,
          userName: userInfo.name,
        },
        origin
      );
    }

    // Non-popup mode: redirect to reward page
    const successUrl = new URL('/en/youtube-reward', origin);
    successUrl.searchParams.set('coupon', coupon.code);
    successUrl.searchParams.set('name', userInfo.name);
    return Response.redirect(successUrl.toString());
  } catch (err) {
    console.error('YouTube OAuth callback error:', err);
    return sendError('An unexpected error occurred. Please try again.');
  }
}
