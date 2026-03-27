import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getRecentBadgeFeed } from '@neram/database/queries/nexus';

/**
 * GET /api/gamification/badges/feed?classroom_id={id}&limit={n}
 *
 * Returns recently earned badges across the classroom (social feed).
 */
export async function GET(request: NextRequest) {
  try {
    await verifyMsToken(request.headers.get('Authorization'));

    const classroomId = request.nextUrl.searchParams.get('classroom_id');
    const limit = parseInt(request.nextUrl.searchParams.get('limit') || '10', 10);

    if (!classroomId) {
      return NextResponse.json({ error: 'Missing classroom_id' }, { status: 400 });
    }

    const feed = await getRecentBadgeFeed(classroomId, limit);
    return NextResponse.json({ feed });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load badge feed';
    console.error('Badge feed error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
