import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { getSharePointStreamUrl } from '@/lib/sharepoint';

/**
 * GET /api/student/class-recaps/[recapId]/video-embed
 * Resolve the recap's SharePoint recording into a short-lived direct stream URL
 * (SharePoint blocks iframes, so the player uses a <video> src). Mirrors the
 * foundation chapter video-embed route.
 *
 * Returns: { streamUrl: string }
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ recapId: string }> },
) {
  try {
    const authHeader = request.headers.get('Authorization');
    const queryToken = request.nextUrl.searchParams.get('token');
    await verifyMsToken(authHeader || (queryToken ? `Bearer ${queryToken}` : null));

    const { recapId } = await params;
    const supabase = getSupabaseAdminClient() as any;
    const { data: recap } = await supabase
      .from('nexus_class_recaps')
      .select('recording_url, video_source, status')
      .eq('id', recapId)
      .single();

    if (!recap || recap.status !== 'published') {
      return NextResponse.json({ error: 'Recap not available' }, { status: 403 });
    }
    if (!recap.recording_url || recap.video_source !== 'sharepoint') {
      return NextResponse.json({ error: 'No recording available' }, { status: 404 });
    }

    const streamUrl = await getSharePointStreamUrl(recap.recording_url);
    return NextResponse.json(
      { streamUrl },
      { headers: { 'Cache-Control': 'private, max-age=900' } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to resolve recording';
    console.error('Recap video stream error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
