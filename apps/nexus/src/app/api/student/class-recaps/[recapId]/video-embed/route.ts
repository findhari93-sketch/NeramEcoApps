import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { extractYouTubeId } from '@/lib/youtube';
import { grantVideoAccess } from '@/lib/video-grant';
import { isInternalStaff, resolveStaffRole } from '@/lib/staff-capabilities';

/**
 * GET /api/student/class-recaps/[recapId]/video-embed
 *
 * Resolve a recap's recording into something the gated player can render, and
 * do every expensive check here so the byte proxy that follows does none.
 *
 * Two shapes come back:
 *   { mode: 'proxy',   src, ... }        the Teams recording, streamed through
 *                                        Nexus. No Microsoft URL reaches the
 *                                        browser.
 *   { mode: 'youtube', youtube_id, ... } the durable backup, played via the
 *                                        YouTube IFrame API.
 *
 * Be honest about the second one: YouTube bytes cannot be proxied (there is no
 * stable byte endpoint and doing it would breach their terms), so the video id
 * is in the DOM and is copyable. It is a fallback for classes whose Teams copy
 * has aged out, not a security boundary, and protection_level records which of
 * the two a given recap is on.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ recapId: string }> },
) {
  try {
    const authHeader = request.headers.get('Authorization');
    const queryToken = request.nextUrl.searchParams.get('token');
    const msUser = await verifyMsToken(authHeader || (queryToken ? `Bearer ${queryToken}` : null));

    const { recapId } = await params;
    const supabase = getSupabaseAdminClient() as any;

    const { data: recap } = await supabase
      .from('nexus_class_recaps')
      .select('id, classroom_id, scheduled_class_id, study_file_id, recording_url, video_source, status, readiness')
      .eq('id', recapId)
      .single();

    if (!recap || recap.status !== 'published') {
      return NextResponse.json({ error: 'Recap not available' }, { status: 403 });
    }

    // A Foundation chapter video track is a nexus_class_recaps row with
    // classroom_id NULL. It must never be served here, and this is the one place
    // where sharing that table could become a security hole rather than a 403:
    // the enrollment check below is .eq('classroom_id', recap.classroom_id), and
    // .eq() against NULL matches NOTHING, so maybeSingle() returns null and
    // every student is refused... which is only safe by accident. Refuse
    // explicitly instead, and let the track routes authorise by study-folder
    // audience, which is the right question to ask about a chapter that is
    // standard for every cohort.
    if (recap.study_file_id) {
      return NextResponse.json({ error: 'Recap not available' }, { status: 404 });
    }
    // readiness may be undefined on rows read before the column existed, which
    // must not lock anyone out of a recap that was already published.
    if (recap.readiness != null && recap.readiness !== 'ready') {
      return NextResponse.json({ error: 'Recap not available' }, { status: 403 });
    }

    const { data: user } = await supabase
      .from('users')
      .select('id, user_type, staff_role, can_teach, name')
      .eq('ms_oid', msUser.oid)
      .single();
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    // This check did not exist before. Without it any authenticated Nexus user
    // could pull a playable URL for any recap in the school, simply by knowing
    // or guessing a recap id.
    if (!isInternalStaff(resolveStaffRole(user))) {
      const { data: enrollment } = await supabase
        .from('nexus_enrollments')
        .select('role')
        .eq('user_id', user.id)
        .eq('classroom_id', recap.classroom_id)
        .eq('is_active', true)
        .maybeSingle();
      if (!enrollment) return NextResponse.json({ error: 'Not enrolled' }, { status: 403 });
    }

    if (!recap.recording_url) {
      return NextResponse.json({ error: 'No recording available' }, { status: 404 });
    }

    const { data: progress } = await supabase
      .from('nexus_class_recap_progress')
      .select('last_video_position_seconds')
      .eq('student_id', user.id)
      .eq('recap_id', recapId)
      .maybeSingle();

    const watermark = {
      name: user.name || msUser.name || msUser.email || 'Neram student',
      code: shortCode(user.id),
    };
    const resumeAt = Number(progress?.last_video_position_seconds) || 0;

    if (recap.video_source === 'youtube') {
      const youtubeId = extractYouTubeId(recap.recording_url);
      if (!youtubeId) {
        return NextResponse.json({ error: 'Invalid YouTube recording' }, { status: 404 });
      }
      return NextResponse.json(
        {
          mode: 'youtube',
          // Kept for the player's existing branch during the transition.
          video_source: 'youtube',
          youtube_id: youtubeId,
          protection: 'embedded',
          watermark,
          resume_at: resumeAt,
        },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const grant = await grantVideoAccess({
      scope: 'recap',
      refId: recapId,
      userId: user.id,
      recapId,
      scheduledClassId: recap.scheduled_class_id ?? null,
      request,
    });

    return NextResponse.json(
      {
        mode: 'proxy',
        video_source: 'sharepoint',
        // Same key the player already reads, so switching it over is one line.
        streamUrl: grant.src,
        src: grant.src,
        protection: 'proxied',
        expires_at: grant.expiresAt,
        watermark,
        resume_at: resumeAt,
      },
      // Never cached: the grant inside is short-lived and viewer-specific.
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to resolve recording';
    if (message === 'MEDIA_NOT_FOUND') {
      return NextResponse.json({ error: 'That recording is no longer available.' }, { status: 404 });
    }
    if (message === 'RECORDING_SIZE_UNKNOWN') {
      return NextResponse.json(
        { error: 'This recording is not ready to stream yet.' },
        { status: 409 },
      );
    }
    console.error('Recap video stream error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * Six characters derived from the user id, for the on-screen watermark. The raw
 * uuid is long, unreadable over video, and more identifier than a watermark
 * needs: this is enough to trace a leaked frame back to one account.
 */
function shortCode(userId: string): string {
  let h = 0;
  for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) >>> 0;
  return `NX-${h.toString(36).toUpperCase().padStart(6, '0').slice(-6)}`;
}
