import { NextRequest, NextResponse } from 'next/server';
import { requireYouTubeAdmin } from '@/lib/youtube-oauth-guard';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/youtube-oauth/disconnect  (system.settings only)
 *
 * Forget the grant. The row is deleted rather than flagged, so the next
 * connection starts clean and no stale refresh token lingers in the database.
 *
 * Does NOT revoke at Google's end. That is deliberate: revoking there would kill
 * the grant for any other project sharing the client, and the operator who wants
 * a full revocation should do it at myaccount.google.com where they can see what
 * else is affected.
 *
 * In-flight uploads are left alone. Their sessions are already paid for and
 * remain valid; they simply stop being resumed until something reconnects.
 */
export async function POST(request: NextRequest) {
  const admin = await requireYouTubeAdmin(request.headers.get('Authorization'));
  if (admin instanceof NextResponse) return admin;

  const { error } = await admin.supabase
    .from('nexus_youtube_credentials')
    .delete()
    .eq('channel_key', 'default');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ connected: false });
}
