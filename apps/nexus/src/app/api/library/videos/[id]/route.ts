import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getVideoById } from '@neram/database/queries/nexus';

/**
 * GET /api/library/videos/[id]
 *
 * Get a single video by ID.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await verifyMsToken(request.headers.get('Authorization'));

    const { id } = await params;

    const video = await getVideoById(id);

    if (!video) {
      return NextResponse.json({ error: 'Video not found' }, { status: 404 });
    }

    return NextResponse.json({ data: video });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load video';
    console.error('Video GET error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
