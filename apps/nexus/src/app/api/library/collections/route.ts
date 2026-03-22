import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getPublishedCollections } from '@neram/database/queries/nexus';

/**
 * GET /api/library/collections
 *
 * Get published collections.
 * Query param: classroom_id?
 */
export async function GET(request: NextRequest) {
  try {
    await verifyMsToken(request.headers.get('Authorization'));

    const classroomId = request.nextUrl.searchParams.get('classroom_id') || undefined;

    const collections = await getPublishedCollections(classroomId);

    return NextResponse.json({ data: collections });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load collections';
    console.error('Collections GET error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
