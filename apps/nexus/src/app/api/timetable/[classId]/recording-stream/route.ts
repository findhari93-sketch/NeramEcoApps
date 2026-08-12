import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { getSharePointStreamUrl } from '@/lib/sharepoint';
import { resolveClassStaffAccess } from '@/lib/class-staff-access';
import { isGraphApiUrl } from '@/lib/class-links';
import { isInternalStaff, resolveStaffRole } from '@/lib/staff-capabilities';
import { grantVideoAccess, isProtectedVideoEnabled } from '@/lib/video-grant';
import { mayWatchUngated } from '@/lib/recap-obligation';

/**
 * GET /api/timetable/[classId]/recording-stream
 *
 * Hand back a short-lived, pre-authenticated URL for this class's recording, so
 * the video plays inside Nexus.
 *
 * This exists because linking straight out to SharePoint made MICROSOFT decide
 * who may watch a class. A channel meeting's recording is readable by the team;
 * anything else lands in the organizer's OneDrive and is shared only with the
 * people on the invite. So a student enrolled in Nexus but not in the Team, or a
 * second teacher who was never invited, was simply refused, which is exactly what
 * happened to the classes on 28 July.
 *
 * Nexus already knows who belongs in a class, so it decides here instead:
 * resolveClassStaffAccess admits internal staff anywhere and everyone else on an
 * active enrollment.
 *
 * The URL handed back now depends on who asked, because the two audiences need
 * opposite things. Staff get the Microsoft URL directly: it is fastest, they can
 * scrub freely, and they are already trusted with the file. A STUDENT gets a
 * proxied path instead, because a pre-authenticated Microsoft URL is copyable and
 * works for anyone who receives it, which is the leak this work exists to close.
 *
 * Returns: { streamUrl, protected }
 * `streamUrl` deliberately keeps its name in both branches so the player needs
 * no new code path, only the protection wrapper when `protected` is true.
 */
interface Ctx {
  params: { classId: string };
}

interface RecordingClass {
  classroom_id: string;
  teacher_id: string | null;
  recording_url: string | null;
  title: string | null;
}

export async function GET(request: NextRequest, { params }: Ctx) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient() as any;

    const access = await resolveClassStaffAccess<RecordingClass>(
      supabase,
      msUser.oid,
      params.classId,
      'classroom_id, teacher_id, recording_url, title',
    );
    if ('error' in access) return access.error;

    const recordingUrl = access.cls.recording_url;
    if (!recordingUrl) {
      return NextResponse.json({ error: 'No recording available for this class yet.' }, { status: 404 });
    }

    // Legacy rows written before recordings were stored as driveItems. A Graph
    // content URL cannot be turned into a stream URL, and it is not something a
    // browser can open either, so say so plainly instead of failing obscurely.
    if (isGraphApiUrl(recordingUrl)) {
      return NextResponse.json(
        {
          error:
            'This class’s recording link is stale and needs re-syncing. Ask a teacher to use "Sync recording" on the class.',
        },
        { status: 409 },
      );
    }

    const staff = isInternalStaff(resolveStaffRole(access.user)) || access.canEdit;

    // A student who owes this class gets the guided recap, not the open player.
    //
    // This sits ABOVE the branch below on purpose. That branch decides whether
    // the URL is proxied, which is a question about leaking a file; this is a
    // question about whether the class has been done. Folding the second into
    // the first would mean turning the protection flag off also handed every
    // absentee an uncredited watch.
    //
    // It is checked here rather than only in the panel because the panel is not
    // the only door: the student dashboard opens this same route, and a rule
    // that lives in one button is a rule any other button can miss.
    if (!staff) {
      const [{ data: absence }, { data: recap }] = await Promise.all([
        supabase
          .from('nexus_class_absences')
          .select('caught_up_at, excused_at')
          .eq('scheduled_class_id', params.classId)
          .eq('student_id', access.userId)
          .maybeSingle(),
        // `status`, matching loadClassFacts. `readiness` is the authoring
        // pipeline's own progress and says nothing about whether a student may
        // open it.
        //
        // limit(1) because nothing stops a class carrying two published recaps,
        // and a bare maybeSingle ERRORS on the second row rather than returning
        // it. That error would read here as "no recap exists", which is the one
        // wrong answer that fails open and hands the absentee a free watch.
        supabase
          .from('nexus_class_recaps')
          .select('id')
          .eq('scheduled_class_id', params.classId)
          .eq('status', 'published')
          .limit(1)
          .maybeSingle(),
      ]);

      if (!mayWatchUngated(absence, !!recap)) {
        return NextResponse.json(
          {
            error:
              'You missed this class, so its recording opens through catch-up, where the checkpoints record that you finished it.',
            catchup_url: `/student/timetable/${params.classId}/catch-up`,
          },
          { status: 409 },
        );
      }
    }

    if (staff || !(await isProtectedVideoEnabled())) {
      const streamUrl = await getSharePointStreamUrl(recordingUrl);
      return NextResponse.json(
        { streamUrl, protected: false },
        // Matches the ~1h life of a Microsoft pre-authenticated URL with room to
        // spare, and keeps staff re-opening the same class off Graph entirely.
        { headers: { 'Cache-Control': 'private, max-age=900' } },
      );
    }

    const grant = await grantVideoAccess({
      scope: 'class',
      refId: params.classId,
      userId: access.userId,
      scheduledClassId: params.classId,
      request,
    });

    return NextResponse.json(
      { streamUrl: grant.src, protected: true, expires_at: grant.expiresAt },
      // Never cached: the grant is short-lived and identifies one viewer.
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to resolve the recording';
    if (/Missing or invalid Authorization/.test(message)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[recording-stream] error:', message);
    return NextResponse.json(
      { error: 'Could not open this recording. It may still be processing in Teams.' },
      { status: 500 },
    );
  }
}
