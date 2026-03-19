import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { getSharePointStreamUrl } from '@/lib/sharepoint';

/**
 * GET /api/foundation/chapters/[id]/video-embed
 * Resolves a SharePoint video sharing URL into a direct streaming URL
 * using the Graph API (@microsoft.graph.downloadUrl).
 *
 * SharePoint blocks iframe embedding (X-Frame-Options: deny), so we
 * resolve a pre-authenticated Azure Blob URL for use in <video> tags.
 *
 * Returns: { streamUrl: string }
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authHeader = request.headers.get('Authorization');
    const queryToken = request.nextUrl.searchParams.get('token');
    const tokenString = authHeader || (queryToken ? `Bearer ${queryToken}` : null);

    await verifyMsToken(tokenString);

    const supabase = getSupabaseAdminClient() as any;
    const { data: chapter } = await supabase
      .from('nexus_foundation_chapters')
      .select('sharepoint_video_url, video_source')
      .eq('id', params.id)
      .single();

    if (!chapter?.sharepoint_video_url || chapter.video_source !== 'sharepoint') {
      return NextResponse.json({ error: 'No SharePoint video found' }, { status: 404 });
    }

    const streamUrl = await getSharePointStreamUrl(chapter.sharepoint_video_url);

    return NextResponse.json({ streamUrl }, {
      headers: { 'Cache-Control': 'private, max-age=900' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to resolve video stream URL';
    console.error('Video stream error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
