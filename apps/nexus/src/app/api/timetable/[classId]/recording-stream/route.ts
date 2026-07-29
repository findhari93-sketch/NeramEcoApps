import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { getSharePointStreamUrl } from '@/lib/sharepoint';
import { resolveClassStaffAccess } from '@/lib/class-staff-access';
import { isGraphApiUrl } from '@/lib/class-links';

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
 * active enrollment, and the bytes are then fetched with the app-only token. The
 * URL returned points straight at Microsoft, so the video streams from there and
 * never through this function.
 *
 * Returns: { streamUrl }
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

    const streamUrl = await getSharePointStreamUrl(recordingUrl);

    return NextResponse.json(
      { streamUrl },
      // Matches the ~1h life of a Microsoft pre-authenticated URL with room to
      // spare, and keeps a student re-opening the same class off Graph entirely.
      { headers: { 'Cache-Control': 'private, max-age=900' } },
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
