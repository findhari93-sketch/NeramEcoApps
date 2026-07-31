import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { getSharePointStreamUrl } from '@/lib/sharepoint';
import { isInternalStaff, resolveStaffRole } from '@/lib/staff-capabilities';
import { grantVideoAccess, isProtectedVideoEnabled } from '@/lib/video-grant';

/**
 * GET /api/foundation/chapters/[id]/video-embed
 * Resolve a chapter's SharePoint video into something a <video> can play.
 * SharePoint blocks iframe embedding (X-Frame-Options: deny), so this is a src
 * rather than an embed.
 *
 * Students get a proxied path; staff keep the direct Microsoft URL. Until this
 * change every viewer received a pre-authenticated Azure Blob URL, which plays
 * for anyone it is forwarded to, for as long as it lives.
 *
 * Returns: { streamUrl, protected }
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authHeader = request.headers.get('Authorization');
    const queryToken = request.nextUrl.searchParams.get('token');
    const tokenString = authHeader || (queryToken ? `Bearer ${queryToken}` : null);

    const msUser = await verifyMsToken(tokenString);

    const supabase = getSupabaseAdminClient() as any;
    const { data: chapter } = await supabase
      .from('nexus_foundation_chapters')
      .select('sharepoint_video_url, video_source')
      .eq('id', params.id)
      .single();

    if (!chapter?.sharepoint_video_url || chapter.video_source !== 'sharepoint') {
      return NextResponse.json({ error: 'No SharePoint video found' }, { status: 404 });
    }

    const { data: user } = await supabase
      .from('users')
      .select('id, user_type, staff_role, can_teach')
      .eq('ms_oid', msUser.oid)
      .single();
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    if (isInternalStaff(resolveStaffRole(user)) || !(await isProtectedVideoEnabled())) {
      const streamUrl = await getSharePointStreamUrl(chapter.sharepoint_video_url);
      return NextResponse.json(
        { streamUrl, protected: false },
        { headers: { 'Cache-Control': 'private, max-age=900' } },
      );
    }

    const grant = await grantVideoAccess({
      scope: 'foundation',
      refId: params.id,
      userId: user.id,
      request,
    });

    return NextResponse.json(
      { streamUrl: grant.src, protected: true, expires_at: grant.expiresAt },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to resolve video stream URL';
    console.error('Video stream error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
