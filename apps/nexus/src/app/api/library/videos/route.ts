import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getPublishedVideos } from '@neram/database/queries/nexus';

/**
 * GET /api/library/videos
 *
 * List published videos with filters.
 * Query params: category, exam, language, difficulty, search, limit, offset, sortBy, sortOrder
 */
export async function GET(request: NextRequest) {
  try {
    await verifyMsToken(request.headers.get('Authorization'));

    const params = request.nextUrl.searchParams;
    const filters = {
      category: params.get('category') || undefined,
      exam: params.get('exam') || undefined,
      language: params.get('language') || undefined,
      difficulty: params.get('difficulty') || undefined,
      search: params.get('search') || undefined,
      limit: params.get('limit') ? parseInt(params.get('limit')!, 10) : undefined,
      offset: params.get('offset') ? parseInt(params.get('offset')!, 10) : undefined,
      sortBy: (params.get('sortBy') as 'published_at' | 'view_count' | 'duration_seconds') || undefined,
      sortOrder: (params.get('sortOrder') as 'asc' | 'desc') || undefined,
    };

    const result = await getPublishedVideos(filters);

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load videos';
    console.error('Videos GET error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
