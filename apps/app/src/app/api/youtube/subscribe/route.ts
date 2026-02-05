import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { generateYouTubeOAuthUrl } from '@/lib/youtube';
import crypto from 'crypto';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_YOUTUBE_CLIENT_ID || '';
const REDIRECT_URI = process.env.YOUTUBE_OAUTH_REDIRECT_URI || 'https://app.neramclasses.com/api/youtube/oauth-callback';

/**
 * POST /api/youtube/subscribe
 *
 * Initiates the YouTube OAuth flow for subscription.
 * Stores a secure state token and the original redirect URL in cookies.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { redirectUrl } = body;

    if (!GOOGLE_CLIENT_ID) {
      return NextResponse.json(
        { error: 'YouTube OAuth not configured' },
        { status: 500 }
      );
    }

    // Generate a secure state token
    const state = crypto.randomBytes(32).toString('hex');

    // Create the OAuth URL
    const oauthUrl = generateYouTubeOAuthUrl(GOOGLE_CLIENT_ID, REDIRECT_URI, state);

    // Store state and redirect URL in cookies (secure, httpOnly)
    const cookieStore = await cookies();

    // State cookie for CSRF protection
    cookieStore.set('youtube_oauth_state', state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 600, // 10 minutes
      path: '/',
    });

    // Store the redirect URL for after OAuth completes
    if (redirectUrl) {
      cookieStore.set('youtube_redirect_url', redirectUrl, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 600, // 10 minutes
        path: '/',
      });
    }

    return NextResponse.json({ oauthUrl });
  } catch (error) {
    console.error('YouTube subscribe initiation error:', error);
    return NextResponse.json(
      { error: 'Failed to initiate YouTube subscription' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/youtube/subscribe
 *
 * Returns the OAuth URL for direct redirect (alternative flow)
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const redirectUrl = searchParams.get('redirect') || '';

    if (!GOOGLE_CLIENT_ID) {
      return NextResponse.json(
        { error: 'YouTube OAuth not configured' },
        { status: 500 }
      );
    }

    // Generate a secure state token
    const state = crypto.randomBytes(32).toString('hex');

    // Create the OAuth URL
    const oauthUrl = generateYouTubeOAuthUrl(GOOGLE_CLIENT_ID, REDIRECT_URI, state);

    // Store state and redirect URL in cookies
    const response = NextResponse.redirect(oauthUrl);

    response.cookies.set('youtube_oauth_state', state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 600,
      path: '/',
    });

    if (redirectUrl) {
      response.cookies.set('youtube_redirect_url', redirectUrl, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 600,
        path: '/',
      });
    }

    return response;
  } catch (error) {
    console.error('YouTube subscribe redirect error:', error);
    return NextResponse.json(
      { error: 'Failed to initiate YouTube subscription' },
      { status: 500 }
    );
  }
}
