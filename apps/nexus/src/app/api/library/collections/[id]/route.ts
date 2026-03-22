import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getCollectionWithVideos } from '@neram/database/queries/nexus';

/**
 * GET /api/library/collections/[id]
 *
 * Get a collection with its videos.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await verifyMsToken(request.headers.get('Authorization'));

    const { id } = await params;

    const collection = await getCollectionWithVideos(id);

    if (!collection) {
      return NextResponse.json({ error: 'Collection not found' }, { status: 404 });
    }

    return NextResponse.json({ data: collection });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load collection';
    console.error('Collection GET error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
