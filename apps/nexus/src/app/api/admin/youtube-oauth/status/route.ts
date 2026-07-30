import { NextRequest, NextResponse } from 'next/server';
import { requireYouTubeAdmin } from '@/lib/youtube-oauth-guard';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/youtube-oauth/status  (system.settings only)
 *
 * Is YouTube connected, and to WHICH channel. The channel title is the point:
 * consenting with a personal Google account instead of the Neram one is the
 * likeliest setup mistake and it fails silently, so somebody has to be able to
 * read back what was actually authorised.
 *
 * NO TOKEN FIELD IS EVER RETURNED. The select below names its columns for that
 * reason rather than using *, so adding a column later cannot start leaking it.
 * There is an E2E assertion on this too, because this app already has one
 * unauthenticated settings reader (GET /api/settings) and that is exactly the
 * mistake this table exists to avoid repeating.
 */
export async function GET(request: NextRequest) {
  const admin = await requireYouTubeAdmin(request.headers.get('Authorization'));
  if (admin instanceof NextResponse) return admin;

  const { data } = await admin.supabase
    .from('nexus_youtube_credentials')
    .select('youtube_channel_id, youtube_channel_title, scope, connected_at, access_token_expires_at, revoked_at, last_error')
    .eq('channel_key', 'default')
    .maybeSingle();

  if (!data) return NextResponse.json({ connected: false });

  return NextResponse.json({
    connected: !data.revoked_at,
    channelId: data.youtube_channel_id,
    channelTitle: data.youtube_channel_title,
    scope: data.scope,
    connectedAt: data.connected_at,
    accessTokenExpiresAt: data.access_token_expires_at,
    revokedAt: data.revoked_at,
    lastError: data.last_error,
  });
}
