import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { getSharePointDownloadUrl } from '@/lib/sharepoint';
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
 * Resolve a linked PDF's download URL via the /shares endpoint.
 * Works across all SharePoint sites (not just NeramStorage).
 */
async function resolveLinkedPdfUrl(sharingUrl: string): Promise<string | null> {
  const token = await getAppOnlyToken();
  const encoded = encodeSharingUrl(sharingUrl);

  const res = await fetch(
    `https://graph.microsoft.com/v1.0/shares/${encoded}/driveItem?$select=id,@microsoft.graph.downloadUrl`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (res.ok) {
    const data = await res.json();
    if (data['@microsoft.graph.downloadUrl']) {
      return data['@microsoft.graph.downloadUrl'];
    }
  }

  return null;
}

/**
 * GET /api/foundation/chapters/[id]/pdf-stream
 * Proxies the PDF binary from SharePoint through our server.
 *
 * This avoids CORS issues — SharePoint URLs can't be fetched
 * directly by pdf.js in the browser.
 *
 * Auth: Bearer token in Authorization header, OR ?token= query param
 * (query param is needed because pdf.js can't set custom headers).
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
      .select('pdf_onedrive_item_id, pdf_url, pdf_source')
      .eq('id', params.id)
      .single();

    if (!chapter?.pdf_onedrive_item_id && !chapter?.pdf_url) {
      return NextResponse.json({ error: 'No PDF found' }, { status: 404 });
    }

    let downloadUrl: string | null = null;

    if (chapter.pdf_source === 'link' && chapter.pdf_url) {
      // Linked PDFs may be on any SharePoint site — use /shares endpoint
      try {
        downloadUrl = await resolveLinkedPdfUrl(chapter.pdf_url);
      } catch (err) {
        console.error('Failed to resolve linked PDF URL:', err);
      }
    } else if (chapter.pdf_onedrive_item_id) {
      // Uploaded PDFs are on NeramStorage — use site-specific lookup
      try {
        downloadUrl = await getSharePointDownloadUrl(chapter.pdf_onedrive_item_id);
      } catch (err) {
        console.error('Failed to resolve uploaded PDF URL:', chapter.pdf_onedrive_item_id, err);
      }
    }

    // Fallback: try /shares on stored URL regardless of source
    if (!downloadUrl && chapter.pdf_url) {
      try {
        downloadUrl = await resolveLinkedPdfUrl(chapter.pdf_url);
      } catch {
        // Last resort — use raw URL (may not work for sharing links)
        downloadUrl = chapter.pdf_url;
      }
    }

    if (!downloadUrl) {
      return NextResponse.json({ error: 'Could not resolve PDF URL' }, { status: 500 });
    }

    // Fetch the PDF binary server-side and stream it to the client
    const pdfRes = await fetch(downloadUrl, { redirect: 'follow' });

    if (!pdfRes.ok) {
      console.error('SharePoint PDF fetch failed:', pdfRes.status, await pdfRes.text().catch(() => ''));
      return NextResponse.json({ error: 'Failed to fetch PDF from storage' }, { status: 502 });
    }

    const pdfBuffer = await pdfRes.arrayBuffer();

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Length': String(pdfBuffer.byteLength),
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to resolve PDF URL';
    console.error('Foundation PDF stream error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
