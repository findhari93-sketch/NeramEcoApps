import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { requireYouTubeAdmin } from '@/lib/youtube-oauth-guard';
import { buildConsentUrl } from '@/lib/youtube-oauth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/youtube-oauth/start  (system.settings only)
 *
 * Send the admin to Google to grant upload access to the Neram channel. Done
 * once; after this the cron refreshes its own access tokens forever.
 *
 * BEFORE THIS WILL HOLD: the OAuth consent screen must be published "In
 * production". A screen left in "Testing" issues refresh tokens that expire
 * after 7 days, and the backup would then stop silently a week after setup, on a
 * nightly schedule where nobody would notice until a term of recordings had aged
 * out of Teams.
 */
export async function GET(request: NextRequest) {
  const admin = await requireYouTubeAdmin(request.headers.get('Authorization'));
  if (admin instanceof NextResponse) return admin;

  const state = randomBytes(24).toString('hex');

  try {
    const url = buildConsentUrl(state);
    const res = NextResponse.redirect(url, 302);
    // httpOnly so the callback can compare it and nothing else can read it.
    res.cookies.set('yt_oauth_state', state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/api/admin/youtube-oauth',
      maxAge: 600,
    });
    return res;
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Could not build the consent URL' },
      { status: 500 },
    );
  }
}
