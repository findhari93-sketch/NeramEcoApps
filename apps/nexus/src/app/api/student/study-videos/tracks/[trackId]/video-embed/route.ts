import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient, getStudyTrackForStudent } from '@neram/database';
import { grantVideoAccess } from '@/lib/video-grant';
import { extractYouTubeId } from '@/lib/youtube';
import { getRequestUser } from '@/lib/study-materials';
import { assertCanSeeTrack, assertServable, trackErrorResponse } from '@/lib/study-video-access';

/**
 * GET /api/student/study-videos/tracks/[trackId]/video-embed
 *
 * Mint a short-lived playable source for one language track.
 *
 * The transport is the class-recap one, untouched: scope 'recap' already maps to
 * nexus_class_recaps.recording_url in SOURCE_COLUMN, and a track IS such a row,
 * so the byte proxy, the token and the audit trail all work with no new scope.
 * What differs is the authorisation in front of it, which is study-folder
 * audience rather than classroom enrollment. See lib/study-video-access.ts for
 * why the recap route cannot simply be reused.
 */

/** Six characters of the user id, so a leaked frame is traceable to a person. */
function shortCode(userId: string): string {
  return `NX-${userId.replace(/-/g, '').slice(0, 6).toUpperCase()}`;
}

export async function GET(request: NextRequest, { params }: { params: { trackId: string } }) {
  try {
    const user = await getRequestUser(request.headers.get('Authorization'));
    const track = await assertCanSeeTrack(user, params.trackId);
    assertServable(track);

    if (!track.recording_url) {
      return NextResponse.json({ error: 'No recording available' }, { status: 404 });
    }

    // The scrub ceiling travels with the source, so a player that re-mints a
    // grant mid-video cannot end up holding a stale boundary.
    const forStudent = await getStudyTrackForStudent(params.trackId, user.id);
    const watermark = { name: user.name || 'Neram student', code: shortCode(user.id) };

    // `as any`: nexus_class_recap* is absent from database.generated.ts. Same
    // convention as class-recaps.ts and the recap routes.
    const supabase = getSupabaseAdminClient() as any;
    const { data: progress } = await supabase
      .from('nexus_class_recap_progress')
      .select('last_video_position_seconds')
      .eq('student_id', user.id)
      .eq('recap_id', params.trackId)
      .maybeSingle();
    const resumeAt = Number(progress?.last_video_position_seconds) || 0;

    const shared = {
      watermark,
      resume_at: resumeAt,
      mode_hint: forStudent?.mode ?? 'gated',
      max_scrub_seconds: forStudent?.max_scrub_seconds ?? null,
    };

    if (track.video_source === 'youtube') {
      const youtubeId = extractYouTubeId(track.recording_url);
      if (!youtubeId) {
        return NextResponse.json({ error: 'Invalid YouTube recording' }, { status: 404 });
      }
      // A degraded fallback, not a security boundary: YouTube's bytes cannot be
      // proxied, so the video id is in the DOM.
      return NextResponse.json(
        { mode: 'youtube', video_source: 'youtube', youtube_id: youtubeId, protection: 'embedded', ...shared },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const grant = await grantVideoAccess({
      scope: 'recap',
      refId: params.trackId,
      userId: user.id,
      recapId: params.trackId,
      // A track has no class. The audit row's scheduled_class_id is nullable
      // precisely so a parentless grant is still recorded.
      scheduledClassId: null,
      request,
    });

    return NextResponse.json(
      {
        mode: 'proxy',
        video_source: 'sharepoint',
        streamUrl: grant.src,
        src: grant.src,
        protection: 'proxied',
        expires_at: grant.expiresAt,
        ...shared,
      },
      // Never cached: the grant inside is short-lived and viewer-specific.
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err) {
    const { error, status } = trackErrorResponse(err);
    return NextResponse.json({ error }, { status });
  }
}
