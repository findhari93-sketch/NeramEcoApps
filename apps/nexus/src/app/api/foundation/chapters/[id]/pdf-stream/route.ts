import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { getSharePointDownloadUrl } from '@/lib/sharepoint';

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
      .select('pdf_onedrive_item_id, pdf_url')
      .eq('id', params.id)
      .single();

    if (!chapter?.pdf_onedrive_item_id && !chapter?.pdf_url) {
      return NextResponse.json({ error: 'No PDF found' }, { status: 404 });
    }

    // Resolve the download URL via Graph API (preferred — always fresh)
    let downloadUrl: string | null = null;

    if (chapter.pdf_onedrive_item_id) {
      try {
        downloadUrl = await getSharePointDownloadUrl(chapter.pdf_onedrive_item_id);
      } catch (err) {
        console.error('Failed to resolve fresh PDF URL via item ID:', chapter.pdf_onedrive_item_id, err);
      }
    }

    // Fallback to stored URL
    if (!downloadUrl && chapter.pdf_url) {
      downloadUrl = chapter.pdf_url;
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

    const contentType = pdfRes.headers.get('content-type') || '';
    if (!contentType.includes('pdf') && !contentType.includes('octet-stream')) {
      console.error('SharePoint returned non-PDF content:', contentType);
      return NextResponse.json({ error: 'Storage returned non-PDF content. The file may have expired.' }, { status: 502 });
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
