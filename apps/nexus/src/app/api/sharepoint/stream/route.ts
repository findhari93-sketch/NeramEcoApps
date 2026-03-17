import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSharePointStreamUrl } from '@/lib/sharepoint';

/**
 * GET /api/sharepoint/stream?url=<encoded_sharepoint_url>
 * Resolves a SharePoint video URL to a temporary streaming URL.
 * Uses app-only (client credentials) auth to get a pre-authenticated download URL
 * that can be used directly in <video> elements without iframe cookie issues.
 */
export async function GET(request: NextRequest) {
  try {
    // Verify the student/teacher is authenticated
    await verifyMsToken(request.headers.get('Authorization'));

    const url = request.nextUrl.searchParams.get('url');
    if (!url) {
      return NextResponse.json({ error: 'url parameter is required' }, { status: 400 });
    }

    const streamUrl = await getSharePointStreamUrl(url);

    return NextResponse.json({ streamUrl });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to resolve streaming URL';
    console.error('SharePoint stream error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
