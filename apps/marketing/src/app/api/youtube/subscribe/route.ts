import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { generateYouTubeOAuthUrl } from '@/lib/youtube';
import crypto from 'crypto';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_YOUTUBE_CLIENT_ID || '';
const REDIRECT_URI =
  process.env.YOUTUBE_OAUTH_REDIRECT_URI ||
  'http://localhost:3010/api/youtube/oauth-callback';

/**
 * POST /api/youtube/subscribe
 *
 * Initiates the YouTube OAuth flow for subscription via popup.
 * Returns the OAuth URL for the client to open in a popup window.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { popupMode = true } = body;

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

    // Store state in cookies (secure, httpOnly)
    const cookieStore = await cookies();

    cookieStore.set('youtube_oauth_state', state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 600, // 10 minutes
      path: '/',
    });

    // Store popup mode flag so callback knows to render postMessage HTML
    if (popupMode) {
      cookieStore.set('youtube_popup_mode', 'true', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 600,
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
