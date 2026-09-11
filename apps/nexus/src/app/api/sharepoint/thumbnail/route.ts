import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser, assertStaff } from '@/lib/study-materials';
import { getDriveItemThumbnailUrl } from '@/lib/sharepoint-video';

/**
 * GET /api/sharepoint/thumbnail?drive=&item=&size=medium   (staff)
 *
 * The picture of a file a teacher is about to pick, as `{ url }`, for the video
 * picker's rows and its "Use this video?" confirmation.
 *
 * Staff only for the same reason as /api/sharepoint/search: the lookup runs
 * app-only, so without the gate anyone signed in could read thumbnails out of a
 * library they have no account on. A URL rather than bytes because an <img>
 * cannot send a bearer token.
 */
const SIZES = new Set(['small', 'medium', 'large']);

export async function GET(request: NextRequest) {
  try {
    const user = await getRequestUser(request.headers.get('Authorization'));
    assertStaff(user);

    const params = request.nextUrl.searchParams;
    const driveId = (params.get('drive') || '').trim();
    const itemId = (params.get('item') || '').trim();
    if (!driveId || !itemId) {
      return NextResponse.json({ error: 'drive and item are required' }, { status: 400 });
    }
    const requested = params.get('size') || 'medium';
    const size = (SIZES.has(requested) ? requested : 'medium') as 'small' | 'medium' | 'large';

    const url = await getDriveItemThumbnailUrl(driveId, itemId, size);
    return NextResponse.json({ url }, { headers: { 'Cache-Control': 'private, max-age=300' } });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not load the thumbnail';
    return NextResponse.json({ error: message }, { status: message === 'Not authorized' ? 403 : 500 });
  }
}
