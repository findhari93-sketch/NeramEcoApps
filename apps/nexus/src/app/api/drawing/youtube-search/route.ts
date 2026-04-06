import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;

/**
 * GET /api/drawing/youtube-search?q=perspective+drawing&limit=5
 * Search YouTube videos using Data API v3
 */
export async function GET(request: NextRequest) {
  try {
    await verifyMsToken(request.headers.get('Authorization'));

    const q = request.nextUrl.searchParams.get('q');
    const limit = parseInt(request.nextUrl.searchParams.get('limit') || '5');

    if (!q?.trim()) {
      return NextResponse.json({ error: 'Missing search query' }, { status: 400 });
    }

    if (!YOUTUBE_API_KEY) {
      return NextResponse.json({ error: 'YouTube API not configured' }, { status: 503 });
    }

    const params = new URLSearchParams({
      part: 'snippet',
      type: 'video',
      q: q.trim(),
      maxResults: String(Math.min(limit, 10)),
      key: YOUTUBE_API_KEY,
      safeSearch: 'strict',
    });

    const res = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error('YouTube API error:', err);
      return NextResponse.json({ error: 'YouTube search failed' }, { status: 502 });
    }

    const data = await res.json();
    const results = (data.items || []).map((item: any) => ({
      id: item.id?.videoId,
      title: item.snippet?.title,
      thumbnail_url: item.snippet?.thumbnails?.medium?.url || item.snippet?.thumbnails?.default?.url,
      channel_title: item.snippet?.channelTitle,
      url: `https://www.youtube.com/watch?v=${item.id?.videoId}`,
    }));

    return NextResponse.json({ results });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Search failed';
    console.error('YouTube search error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
