import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { getSharePointStreamUrl } from '@/lib/sharepoint';
import { resolveClassStaffAccess } from '@/lib/class-staff-access';
import { isGraphApiUrl } from '@/lib/class-links';
import { isStaffRoleAny, resolveStaffRole } from '@/lib/staff-capabilities';
import { grantVideoAccess, isProtectedVideoEnabled } from '@/lib/video-grant';
import { mayWatchUngated } from '@/lib/recap-obligation';
import { startedPlainBeforeRecap } from '@/lib/plain-watch-head-start';
import { extractYouTubeId } from '@/lib/youtube';
import { isPrewatchEnabled, loadPrewatchRow } from '@/lib/prewatch-server';

/**
 * GET /api/timetable/[classId]/prewatch/[resourceId]/play
 *
 * How to play one "watch before class" video inside Nexus.
 *
 * Authorises THROUGH THE ATTACHMENT, which is the whole point. A past class's
 * recording belongs to another classroom, so the ordinary recording-stream route
 * refuses this student (they are not enrolled there). Here the question is
 * different: is the student enrolled in the class this video was attached to,
 * and is the row really on that class? Only then is a grant minted for the
 * source recording. The client never names the source class; it names the
 * attachment, and the source comes from our row. recording-stream is unchanged,
 * so this opens no general cross-classroom door.
 *
 * Returns, never cached:
 *   { mode: 'youtube', youtubeId, ... }
 *   { mode: 'html5', src, protected, expires_at, ... }   SharePoint recording
 * with title, durationSeconds and resumeAt (the student's furthest point).
 */

interface Ctx {
  params: { classId: string; resourceId: string };
}

interface TargetClass {
  classroom_id: string;
  teacher_id: string | null;
  publish_state: string | null;
}

const NO_STORE = { 'Cache-Control': 'no-store' };

function notFound(error = 'This video is not available.') {
  return NextResponse.json({ error }, { status: 404, headers: NO_STORE });
}

export async function GET(request: NextRequest, { params }: Ctx) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient() as any;

    const access = await resolveClassStaffAccess<TargetClass>(
      supabase,
      msUser.oid,
      params.classId,
      'classroom_id, teacher_id, publish_state',
    );
    if ('error' in access) return access.error;

    const staff = access.canEdit || isStaffRoleAny(resolveStaffRole(access.user));
    if (!staff) {
      if (!(await isPrewatchEnabled())) return notFound();
      if (access.cls.publish_state === 'draft') return notFound();
    }

    const row = await loadPrewatchRow(supabase, params.classId, params.resourceId);
    if (!row) return notFound();

    const base = {
      title: row.title as string,
      durationSeconds: (row.duration_seconds as number | null) ?? null,
      resumeAt: staff ? 0 : await loadResumeAt(supabase, access.userId, row),
    };

    if (row.kind === 'library_video') {
      const { data: video } = await supabase
        .from('library_videos')
        .select('youtube_video_id, is_published')
        .eq('id', row.library_video_id)
        .maybeSingle();
      if (!video?.youtube_video_id || video.is_published !== true) {
        return notFound('This Library video is no longer available.');
      }
      return NextResponse.json({ mode: 'youtube', youtubeId: video.youtube_video_id, ...base }, { headers: NO_STORE });
    }

    // A past class's recording.
    const { data: source } = await supabase
      .from('nexus_scheduled_classes')
      .select('id, status, recording_url, youtube_url')
      .eq('id', row.source_class_id)
      .maybeSingle();
    if (!source || source.status === 'cancelled') return notFound('This recording is no longer available.');

    const youtubeId = extractYouTubeId(source.youtube_url);
    const recordingUrl = source.recording_url && !isGraphApiUrl(source.recording_url) ? source.recording_url : null;

    if (!staff) {
      // A student who MISSED the source class still owes its catch-up. Without
      // this, a teacher attaching that class would hand them an uncredited watch
      // that skips the checkpoints, the same rule recording-stream enforces.
      const blocked = await owesCatchUp(supabase, access.userId, source.id);
      if (blocked) {
        return NextResponse.json(
          {
            error:
              'You missed this class, so its recording opens through catch-up, where the checkpoints record that you finished it.',
            catchup_url: `/student/timetable/${source.id}/catch-up`,
          },
          { status: 409, headers: NO_STORE },
        );
      }
    }

    if (recordingUrl) {
      try {
        if (staff || !(await isProtectedVideoEnabled())) {
          const src = await getSharePointStreamUrl(recordingUrl);
          return NextResponse.json({ mode: 'html5', src, protected: false, ...base }, { headers: NO_STORE });
        }
        // Minted for the SOURCE class: that is the file being streamed. The
        // audit row records the source too, which is what was actually watched.
        const grant = await grantVideoAccess({
          scope: 'class',
          refId: source.id,
          userId: access.userId,
          scheduledClassId: source.id,
          request,
        });
        return NextResponse.json(
          { mode: 'html5', src: grant.src, protected: true, expires_at: grant.expiresAt, ...base },
          { headers: NO_STORE },
        );
      } catch (err) {
        // A moved or half-processed SharePoint file. The YouTube copy, when
        // there is one, is the same class.
        if (!youtubeId) throw err;
        console.warn('[prewatch/play] SharePoint failed, using YouTube:', err instanceof Error ? err.message : err);
      }
    }

    if (youtubeId) {
      return NextResponse.json({ mode: 'youtube', youtubeId, ...base }, { headers: NO_STORE });
    }
    return notFound('This recording is no longer available.');
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to open the video';
    if (/Missing or invalid Authorization/.test(message)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[prewatch/play] error:', message);
    return NextResponse.json(
      { error: 'Could not open this video right now. Try again in a minute.' },
      { status: 500, headers: NO_STORE },
    );
  }
}

/** Where the student got to last time, so the player picks up there. */
async function loadResumeAt(supabase: any, studentId: string, row: any): Promise<number> {
  let query = supabase.from('nexus_class_video_views').select('furthest_seconds').eq('student_id', studentId);
  query = row.library_video_id ? query.eq('library_video_id', row.library_video_id) : query.eq('source_class_id', row.source_class_id);
  const { data } = await query.maybeSingle();
  return data?.furthest_seconds ?? 0;
}

/** The recording-stream obligation rule, asked of the source class. */
async function owesCatchUp(supabase: any, studentId: string, sourceClassId: string): Promise<boolean> {
  const [{ data: absence }, { data: recap }] = await Promise.all([
    supabase
      .from('nexus_class_absences')
      .select('caught_up_at, excused_at')
      .eq('scheduled_class_id', sourceClassId)
      .eq('student_id', studentId)
      .maybeSingle(),
    supabase
      .from('nexus_class_recaps')
      .select('id')
      .eq('scheduled_class_id', sourceClassId)
      .eq('status', 'published')
      .limit(1)
      .maybeSingle(),
  ]);
  if (mayWatchUngated(absence, !!recap)) return false;
  const startedBeforeRecap = recap?.id
    ? await startedPlainBeforeRecap(supabase, { studentId, classId: sourceClassId, recapId: recap.id })
    : false;
  return !mayWatchUngated(absence, !!recap, startedBeforeRecap);
}
