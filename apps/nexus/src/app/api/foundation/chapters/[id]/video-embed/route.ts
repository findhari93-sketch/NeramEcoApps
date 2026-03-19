import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';

/**
 * GET /api/foundation/chapters/[id]/video-embed
 * Resolves a SharePoint video sharing URL into a proper embeddable URL.
 *
 * SharePoint sharing links (/:v:/s/...) can't be directly embedded in iframes.
 * The stream.aspx endpoint with a `share=` param handles the auth and rendering.
 *
 * Returns: { embedUrl: string }
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

    const videoUrl = chapter.sharepoint_video_url;

    try {
      const u = new URL(videoUrl);

      // Already an embed or stream URL — use as-is
      if (u.pathname.includes('embed.aspx') || u.pathname.includes('stream.aspx')) {
        return NextResponse.json({ embedUrl: videoUrl }, {
          headers: { 'Cache-Control': 'private, max-age=3600' },
        });
      }

      // Sharing link (/:v:/s/siteName/encodedId) → stream.aspx?share=<url>
      if (u.pathname.match(/\/:v:\//)) {
        const pathParts = u.pathname.split('/');
        const vIdx = pathParts.indexOf(':v:');
        if (vIdx >= 0 && vIdx + 2 < pathParts.length) {
          const siteName = pathParts[vIdx + 2];
          const embedUrl = `${u.origin}/sites/${siteName}/_layouts/15/stream.aspx?share=${encodeURIComponent(videoUrl)}`;
          return NextResponse.json({ embedUrl }, {
            headers: { 'Cache-Control': 'private, max-age=3600' },
          });
        }
      }

      // Generic fallback: try stream.aspx on root site with share= param
      const embedUrl = `${u.origin}/_layouts/15/stream.aspx?share=${encodeURIComponent(videoUrl)}`;
      return NextResponse.json({ embedUrl }, {
        headers: { 'Cache-Control': 'private, max-age=300' },
      });
    } catch {
      return NextResponse.json({ error: 'Invalid video URL' }, { status: 400 });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to resolve video embed URL';
    console.error('Video embed error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
