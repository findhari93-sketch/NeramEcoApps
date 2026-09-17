import { NextRequest, NextResponse } from 'next/server';
import { getRecapById } from '@neram/database';
import { getRequestUser, assertStaff } from '@/lib/study-materials';
import { findRecordingItem, getDriveItemThumbnailUrl, storedRecordingRef } from '@/lib/sharepoint-video';

/**
 * GET /api/study-materials/files/[id]/video-tracks/[trackId]/thumbnail?size=large   (staff)
 *
 * The picture on a recording's video card, as `{ url }`.
 *
 * A URL rather than image bytes, because the browser loads it with an <img>, and
 * an <img> cannot send the bearer token every Nexus route requires. Graph's
 * thumbnail URL is pre-authenticated and short-lived, so it is cached privately
 * for a few minutes and never shared. `{ url: null }` means a grey box, not an
 * error.
 */
const SIZES = new Set(['small', 'medium', 'large']);

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string; trackId: string } },
) {
  try {
    const user = await getRequestUser(request.headers.get('Authorization'));
    assertStaff(user);

    const track = await getRecapById(params.trackId);
    if (!track || track.study_file_id !== params.id) {
      return NextResponse.json({ error: 'Recording not found' }, { status: 404 });
    }

    const requested = request.nextUrl.searchParams.get('size') || 'large';
    const size = (SIZES.has(requested) ? requested : 'large') as 'small' | 'medium' | 'large';

    let url: string | null = null;
    // The id columns are not on the recap type; the row carries them.
    const stored = storedRecordingRef(track as Parameters<typeof storedRecordingRef>[0]);
    if (stored && track.video_source !== 'youtube') {
      try {
        const { item } = await findRecordingItem(stored);
        url = await getDriveItemThumbnailUrl(item.driveId, item.itemId, size);
      } catch {
        url = null;
      }
    }

    return NextResponse.json({ url }, { headers: { 'Cache-Control': 'private, max-age=300' } });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not load the thumbnail';
    return NextResponse.json({ error: message }, { status: message === 'Not authorized' ? 403 : 500 });
  }
}
