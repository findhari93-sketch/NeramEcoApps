import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { getSharePointStreamUrl } from '@/lib/sharepoint';
import { extractYouTubeId } from '@/lib/youtube';

/**
 * GET /api/student/class-recaps/[recapId]/video-embed
 * Resolve the recap's recording into something the gated player can render:
 *   - SharePoint: a short-lived direct stream URL (SharePoint blocks iframes,
 *     so the player uses a <video> src).
 *   - YouTube: the video id (the durable unlisted backup; played via the
 *     YouTube IFrame API so the checkpoint gating still works).
 *
 * Returns: { video_source: 'sharepoint', streamUrl } | { video_source: 'youtube', youtube_id }
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
    if (!recap.recording_url) {
      return NextResponse.json({ error: 'No recording available' }, { status: 404 });
    }

    if (recap.video_source === 'youtube') {
      const youtubeId = extractYouTubeId(recap.recording_url);
      if (!youtubeId) {
        return NextResponse.json({ error: 'Invalid YouTube recording' }, { status: 404 });
      }
      return NextResponse.json(
        { video_source: 'youtube', youtube_id: youtubeId },
        { headers: { 'Cache-Control': 'private, max-age=900' } },
      );
    }

    const streamUrl = await getSharePointStreamUrl(recap.recording_url);
    return NextResponse.json(
      { video_source: 'sharepoint', streamUrl },
      { headers: { 'Cache-Control': 'private, max-age=900' } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to resolve recording';
    console.error('Recap video stream error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
