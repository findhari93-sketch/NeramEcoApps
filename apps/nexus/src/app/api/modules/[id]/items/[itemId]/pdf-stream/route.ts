import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { getSharePointDownloadUrl } from '@/lib/sharepoint';

/**
 * GET /api/modules/[id]/items/[itemId]/pdf-stream
 * Proxies the PDF binary from SharePoint through our server.
 *
 * This avoids CORS issues — SharePoint download URLs are on a different
 * origin and can't be fetched directly by pdf.js in the browser.
 *
 * Auth: Bearer token in Authorization header, OR ?token= query param
 * (query param is needed because pdf.js can't set custom headers).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string; itemId: string } }
) {
  try {
    // Support auth via header or query param (pdf.js can't set headers)
    const authHeader = request.headers.get('Authorization');
    const queryToken = request.nextUrl.searchParams.get('token');
    const tokenString = authHeader || (queryToken ? `Bearer ${queryToken}` : null);

    await verifyMsToken(tokenString);

    const supabase = getSupabaseAdminClient() as any;
    const { data: item } = await supabase
      .from('nexus_module_items')
      .select('pdf_onedrive_item_id, pdf_url')
      .eq('id', params.itemId)
      .single();

    if (!item?.pdf_onedrive_item_id && !item?.pdf_url) {
      return NextResponse.json({ error: 'No PDF found' }, { status: 404 });
    }

    // Resolve the download URL
    let downloadUrl: string | null = null;

    if (item.pdf_onedrive_item_id) {
      try {
        downloadUrl = await getSharePointDownloadUrl(item.pdf_onedrive_item_id);
      } catch (err) {
        console.error('Failed to resolve fresh PDF URL via item ID:', item.pdf_onedrive_item_id, err);
      }
    }

    // Fallback to stored URL
    if (!downloadUrl && item.pdf_url) {
      downloadUrl = item.pdf_url;
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
    console.error('PDF stream error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
