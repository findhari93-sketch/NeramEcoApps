import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { getAppOnlyToken } from '@/lib/graph-app-token';

/**
 * Encode a sharing URL for the Graph API /shares endpoint.
 */
function encodeSharingUrl(url: string): string {
  const base64 = Buffer.from(url, 'utf-8').toString('base64');
  const base64url = base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `u!${base64url}`;
}

/**
 * GET /api/foundation/chapters/[id]/video-embed
 * Resolves a SharePoint video sharing URL into a proper embeddable URL
 * using the Graph API /shares endpoint.
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

    const graphToken = await getAppOnlyToken();
    const encoded = encodeSharingUrl(chapter.sharepoint_video_url);

    // Strategy 1: Get the driveItem to find webUrl and construct embed URL
    const itemRes = await fetch(
      `https://graph.microsoft.com/v1.0/shares/${encoded}/driveItem?$select=id,webUrl,parentReference`,
      { headers: { Authorization: `Bearer ${graphToken}` } }
    );

    if (itemRes.ok) {
      const item = await itemRes.json();

      // Extract site URL from webUrl (everything before /_layouts or /sites/.../filename)
      // webUrl format: https://tenant.sharepoint.com/sites/SiteName/path/to/file.mp4
      if (item.webUrl && item.parentReference?.siteId) {
        // siteId format: "tenantHost,siteCollectionId,siteId" or similar
        // Extract the site URL from webUrl by finding the path component
        const webUrl = new URL(item.webUrl);
        const pathParts = webUrl.pathname.split('/');

        // Find /sites/SiteName part
        const sitesIdx = pathParts.indexOf('sites');
        if (sitesIdx >= 0 && sitesIdx + 1 < pathParts.length) {
          const siteUrl = `${webUrl.origin}/sites/${pathParts[sitesIdx + 1]}`;
          const embedUrl = `${siteUrl}/_layouts/15/embed.aspx?UniqueId=${item.id}&embed=%7B%22ust%22%3Atrue%2C%22hv%22%3A%22CopyEmbedCode%22%7D&referrer=StreamWebApp&referrerScenario=EmbedDialog.Create`;
          return NextResponse.json({ embedUrl }, {
            headers: { 'Cache-Control': 'private, max-age=3600' },
          });
        }
      }
    }

    // Strategy 2: Use the preview endpoint to get an embed URL
    const previewRes = await fetch(
      `https://graph.microsoft.com/v1.0/shares/${encoded}/driveItem/preview`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${graphToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      }
    );

    if (previewRes.ok) {
      const preview = await previewRes.json();
      if (preview.getUrl) {
        return NextResponse.json({ embedUrl: preview.getUrl }, {
          headers: { 'Cache-Control': 'private, max-age=3600' },
        });
      }
    }

    // Strategy 3: Try constructing embed URL from the sharing URL pattern directly
    try {
      const u = new URL(chapter.sharepoint_video_url);
      if (u.pathname.match(/\/:v:\//)) {
        const pathParts = u.pathname.split('/');
        const vIdx = pathParts.indexOf(':v:');
        if (vIdx >= 0 && vIdx + 2 < pathParts.length) {
          const accessType = pathParts[vIdx + 1]; // 's' or 'r'
          const siteName = pathParts[vIdx + 2];
          // Build stream.aspx URL which is more permissive for iframe embedding
          const streamUrl = `${u.origin}/sites/${siteName}/_layouts/15/stream.aspx?share=${encodeURIComponent(chapter.sharepoint_video_url)}`;
          return NextResponse.json({ embedUrl: streamUrl }, {
            headers: { 'Cache-Control': 'private, max-age=300' },
          });
        }
      }
    } catch {
      // ignore URL parsing errors
    }

    return NextResponse.json({ error: 'Could not resolve embed URL' }, { status: 500 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to resolve video embed URL';
    console.error('Video embed error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
