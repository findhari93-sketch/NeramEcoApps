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
 *
 * `?mode=json` returns the consent URL instead of redirecting to it, and it is
 * the only mode a browser can actually reach.
 *
 * Nexus authenticates with a bearer token held in JavaScript, not a cookie, so
 * typing this route into the address bar sends no Authorization header and earns
 * a 403. That is not a hypothetical: the setup doc's final step is "visit
 * /api/admin/youtube-oauth/start", it could never have worked, and the account
 * was consequently never connected. The 302 form is kept for curl and for
 * anything that can set a header, but the admin card fetches the JSON, gets the
 * state cookie set on that same response, and navigates itself.
 */
export async function GET(request: NextRequest) {
  const admin = await requireYouTubeAdmin(request.headers.get('Authorization'));
  if (admin instanceof NextResponse) return admin;

  const state = randomBytes(24).toString('hex');
  const asJson = request.nextUrl.searchParams.get('mode') === 'json';

  try {
    const url = buildConsentUrl(state);
    const res = asJson ? NextResponse.json({ url }) : NextResponse.redirect(url, 302);
    // httpOnly so the callback can compare it and nothing else can read it.
    // SameSite lax is what lets it survive the top-level navigation back from
    // accounts.google.com, and the path scopes it to these four routes.
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
