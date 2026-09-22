import { NextRequest, NextResponse } from 'next/server';
import { verifyQBStaff } from '@/lib/qb-auth';
import { getSupabaseAdminClient } from '@neram/database';
import { getUploadAccessToken, YouTubeAuthError } from '@/lib/youtube-oauth';
import { parseSolutionTitle, type FoundVideo } from '@/lib/youtube-solution-titles';
import { describeError } from '@/lib/api-errors';

/**
 * GET /api/question-bank/papers/[id]/youtube-videos?pageToken=
 *
 * One stretch of the channel's uploads, keeping only the solution videos whose
 * titles name this paper ("Q no 22 - JEE 2014 Solution Video"). The browser
 * calls again with the returned `nextPageToken` until there is none, so a
 * channel of a few thousand uploads shows progress and no single call nears a
 * timeout.
 *
 * Unlisted videos can only be listed by the channel's owner, so this reads
 * through the grant the class-recording backup already holds
 * (nexus_youtube_credentials, youtube.readonly). The token never leaves the
 * server. Quota: 1 unit per 50 uploads read.
 *
 * Deliberately a button, not a schedule: a teacher runs it for one paper,
 * checks what it found, and saves.
 */

export const maxDuration = 30;

const PAGES_PER_CALL = 5;
const API = 'https://www.googleapis.com/youtube/v3/playlistItems';

const notConnected = (message: string) =>
  NextResponse.json({ error: 'not_connected', message }, { status: 409 });

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const access = await verifyQBStaff(request.headers.get('Authorization'));
    if (!access.ok) return access.response;

    const supabase = getSupabaseAdminClient() as any;

    const { data: paper } = await supabase
      .from('nexus_qb_original_papers')
      .select('id, exam_type, year, session, shift')
      .eq('id', params.id)
      .maybeSingle();
    if (!paper) return NextResponse.json({ error: 'Paper not found' }, { status: 404 });

    // A year with several papers needs the session in the title to tell them apart.
    const { count: paperCountThatYear } = await supabase
      .from('nexus_qb_original_papers')
      .select('id', { count: 'exact', head: true })
      .eq('exam_type', paper.exam_type)
      .eq('year', paper.year);

    const { data: credentials } = await supabase
      .from('nexus_youtube_credentials')
      .select('youtube_channel_id, youtube_channel_title, scope, revoked_at')
      .eq('channel_key', 'default')
      .maybeSingle();
    if (!credentials?.youtube_channel_id || credentials.revoked_at) {
      return notConnected('YouTube is not connected to Nexus.');
    }
    const scope = String(credentials.scope ?? '');
    if (!/youtube\.readonly|auth\/youtube(\s|$)/.test(scope)) {
      return notConnected('The YouTube connection cannot read videos. Reconnect it in Settings.');
    }

    let token: string;
    try {
      token = await getUploadAccessToken(supabase);
    } catch (err) {
      if (err instanceof YouTubeAuthError) return notConnected('The YouTube connection has stopped working. Reconnect it in Settings.');
      throw err;
    }

    // Every channel's uploads playlist is its id with UC swapped for UU.
    const playlistId = `UU${String(credentials.youtube_channel_id).slice(2)}`;
    let pageToken = request.nextUrl.searchParams.get('pageToken') || null;
    let checked = 0;
    const videos: FoundVideo[] = [];

    for (let i = 0; i < PAGES_PER_CALL; i++) {
      const url = new URL(API);
      url.searchParams.set('part', 'snippet');
      url.searchParams.set('maxResults', '50');
      url.searchParams.set('playlistId', playlistId);
      if (pageToken) url.searchParams.set('pageToken', pageToken);

      const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
      if (res.status === 401 || res.status === 403) {
        return notConnected('YouTube refused the request. Reconnect it in Settings.');
      }
      if (!res.ok) {
        return NextResponse.json({ error: 'YouTube did not answer. Try again in a moment.' }, { status: 502 });
      }
      const json = await res.json();
      const items: any[] = Array.isArray(json.items) ? json.items : [];
      checked += items.length;
      for (const item of items) {
        const title: string = item?.snippet?.title ?? '';
        const videoId: string | undefined = item?.snippet?.resourceId?.videoId;
        const parsed = parseSolutionTitle(title);
        if (!videoId || !parsed) continue;
        if (parsed.exam !== paper.exam_type || parsed.year !== paper.year) continue;
        videos.push({ videoId, title, publishedAt: item?.snippet?.publishedAt ?? '', parsed });
      }
      pageToken = json.nextPageToken ?? null;
      if (!pageToken) break;
    }

    return NextResponse.json({
      data: {
        videos,
        checked,
        nextPageToken: pageToken,
        paper: { exam_type: paper.exam_type, year: paper.year, session: paper.session, shift: paper.shift },
        paperCountThatYear: paperCountThatYear ?? 1,
        channelTitle: credentials.youtube_channel_title ?? null,
      },
    });
  } catch (err) {
    console.error('[QB API] YouTube search error:', describeError(err));
    return NextResponse.json({ error: 'Could not search YouTube. Try again in a moment.' }, { status: 500 });
  }
}
