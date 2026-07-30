import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import { exchangeCode, fetchChannel } from '@/lib/youtube-oauth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/youtube-oauth/callback
 *
 * Google's redirect back. Not gated on a capability the way its siblings are:
 * the browser arriving here is following a redirect from accounts.google.com and
 * carries no Authorization header. The `state` cookie is what proves this
 * callback belongs to a consent that /start issued, and /start IS gated, so a
 * stranger cannot mint one.
 *
 * Everything here is verified before the token is stored, because the two ways
 * this goes wrong are both silent: consenting with a personal Google account
 * instead of the Neram one, and a grant that came back without the upload scope.
 * Either would look connected and then upload class recordings somewhere nobody
 * intended, or fail only at 1am against a real video.
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const settings = `${process.env.NEXT_PUBLIC_NEXUS_URL || ''}/teacher/admin/settings`;

  const fail = (reason: string) =>
    NextResponse.redirect(`${settings}?youtube=error&reason=${encodeURIComponent(reason)}`, 302);

  const error = url.searchParams.get('error');
  if (error) return fail(error);

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const expected = request.cookies.get('yt_oauth_state')?.value;

  if (!code) return fail('no_code');
  if (!state || !expected || state !== expected) return fail('state_mismatch');

  try {
    const token = await exchangeCode(code);

    // access_type=offline plus prompt=consent should always yield one. If it did
    // not, the grant is unusable tomorrow, so refuse now rather than store a
    // credential that works exactly until the access token expires.
    if (!token.refreshToken) return fail('no_refresh_token');

    if (!token.scope.includes('youtube.upload')) return fail('missing_upload_scope');

    const channel = await fetchChannel(token.accessToken);
    if (!channel) return fail('no_channel_on_account');

    const supabase = getSupabaseAdminClient() as any;
    const { error: writeError } = await supabase.from('nexus_youtube_credentials').upsert(
      {
        channel_key: 'default',
        refresh_token: token.refreshToken,
        access_token: token.accessToken,
        access_token_expires_at: token.expiresAt,
        scope: token.scope,
        youtube_channel_id: channel.id,
        youtube_channel_title: channel.title,
        connected_at: new Date().toISOString(),
        revoked_at: null,
        last_error: null,
      },
      { onConflict: 'channel_key' },
    );
    if (writeError) return fail(`store_failed`);

    const res = NextResponse.redirect(
      `${settings}?youtube=connected&channel=${encodeURIComponent(channel.title)}`,
      302,
    );
    res.cookies.delete('yt_oauth_state');
    return res;
  } catch (err) {
    console.error('[youtube-oauth/callback]', err);
    return fail(err instanceof Error ? err.message : 'exchange_failed');
  }
}
