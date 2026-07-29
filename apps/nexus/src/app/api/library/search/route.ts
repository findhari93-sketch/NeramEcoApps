import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { searchVideos } from '@neram/database/queries/nexus';

/**
 * GET /api/library/search?q=&category=&exam=&language=&difficulty=&limit=&offset=
 *
 * The student search endpoint. All the ranking lives in the library_search RPC,
 * so this route only reads params and passes them through.
 *
 * The query is NOT sanitized here on purpose. websearch_to_tsquery, which the
 * RPC uses, never throws on stray operators, unlike the plain textSearch call
 * this replaces (which needed characters stripped and would silently fall back
 * to a title substring match when nothing usable remained).
 */
export async function GET(request: NextRequest) {
  try {
    await verifyMsToken(request.headers.get('Authorization'));

    const { searchParams } = new URL(request.url);
    const limit = Math.min(Number(searchParams.get('limit')) || 20, 50);
    const offset = Math.max(Number(searchParams.get('offset')) || 0, 0);

    const result = await searchVideos({
      query: searchParams.get('q') || undefined,
      category: searchParams.get('category') || undefined,
      exam: searchParams.get('exam') || undefined,
      language: searchParams.get('language') || undefined,
      difficulty: searchParams.get('difficulty') || undefined,
      limit,
      offset,
    });

    return NextResponse.json({
      data: result.videos,
      total: result.total,
      matchKind: result.matchKind,
      matchedTopics: result.matchedTopics,
      hasMore: offset + result.videos.length < result.total,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Search failed';
    console.error('Library search error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
