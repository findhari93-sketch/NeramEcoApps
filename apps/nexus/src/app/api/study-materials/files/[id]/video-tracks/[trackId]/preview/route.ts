import { NextRequest, NextResponse } from 'next/server';
import { getRecapById } from '@neram/database';
import { getRequestUser, assertStaff } from '@/lib/study-materials';
import { grantVideoAccess } from '@/lib/video-grant';
import { extractYouTubeId } from '@/lib/youtube';

/**
 * GET /api/study-materials/files/[id]/video-tracks/[trackId]/preview   (staff)
 *
 * A playable source for a teacher checking that the attached video is the right
 * one, draft or not.
 *
 * The student route refuses anything unpublished, which is right for students
 * and is why a teacher could never watch a recording before publishing it: the
 * card just said "DispForm.aspx" and offered no way to see what that was.
 *
 * DELIBERATELY THE SAME TRANSPORT STUDENTS GET: an app-only resolve through the
 * byte proxy, never the teacher's own SharePoint access. So if it plays here, the
 * server can serve it to a student too, which is the whole point of previewing.
 * No watermark, no gate: this is staff.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string; trackId: string } },
) {
  try {
    const user = await getRequestUser(request.headers.get('Authorization'));
    assertStaff(user);

    const track = await getRecapById(params.trackId);
    // A track of another chapter, or a class recap id pointed at this route.
    if (!track || track.study_file_id !== params.id) {
      return NextResponse.json({ error: 'Recording not found' }, { status: 404 });
    }
    if (!track.recording_url) {
      return NextResponse.json({ error: 'This recording has no video yet.', code: 'NO_VIDEO' }, { status: 404 });
    }

    const noStore = { 'Cache-Control': 'no-store' };

    if (track.video_source === 'youtube') {
      const youtubeId = extractYouTubeId(track.recording_url);
      if (!youtubeId) {
        return NextResponse.json({ error: 'This YouTube link is not valid.', code: 'NO_VIDEO' }, { status: 404 });
      }
      return NextResponse.json({ mode: 'youtube', youtube_id: youtubeId }, { headers: noStore });
    }

    try {
      const grant = await grantVideoAccess({
        scope: 'recap',
        refId: track.id,
        userId: user.id,
        recapId: track.id,
        scheduledClassId: null,
        request,
      });
      return NextResponse.json(
        { mode: 'proxy', src: grant.src, expires_at: grant.expiresAt },
        { headers: noStore },
      );
    } catch (err) {
      console.warn('[video-tracks/preview] could not grant', err instanceof Error ? err.message : err);
      return NextResponse.json(
        {
          error:
            'Nexus could not play this video from SharePoint. If it has been moved or deleted, replace it with the file in the Neram library.',
          code: 'RECORDING_UNPLAYABLE',
        },
        { status: 409, headers: noStore },
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not load the preview';
    return NextResponse.json({ error: message }, { status: message === 'Not authorized' ? 403 : 500 });
  }
}
