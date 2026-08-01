import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken, extractBearerToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { notifyRecordingAvailable } from '@/lib/timetable-notifications';
import { resolveOrganizerOid } from '@/lib/teams-online-meeting';
import { findRecordingForClass } from '@/lib/recording-locator';
import { resolveTranscript } from '@/lib/transcript-resolver';

/**
 * GET /api/timetable/recording?class_id={id}
 * Returns recording info for a class.
 */
export async function GET(request: NextRequest) {
  try {
    await verifyMsToken(request.headers.get('Authorization'));
    const classId = request.nextUrl.searchParams.get('class_id');

    if (!classId) {
      return NextResponse.json({ error: 'Missing class_id' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
      .from('nexus_scheduled_classes')
      .select('id, recording_url, transcript_url, recording_duration_minutes, recording_fetched_at')
      .eq('id', classId)
      .single();

    if (error) throw error;

    return NextResponse.json({ recording: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to get recording';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * Resolve the caller and confirm they are staff.
 *
 * Staff is decided by `users.user_type`, NOT by a classroom enrollment. This
 * route used to require `nexus_enrollments.role = 'teacher'` for the caller in
 * that specific classroom, which production does not have: there are ~30 staff
 * with an Entra identity and 6 teacher enrollments, so roughly 24 of them were
 * 403'd out of syncing any recording at all. Same gate and same reasoning as
 * /api/timetable/attendance-report.
 */
async function resolveStaffCaller(
  supabase: any,
  authHeader: string | null,
): Promise<{ id: string } | NextResponse> {
  const msUser = await verifyMsToken(authHeader);
  const { data: user } = await supabase
    .from('users')
    .select('id, user_type')
    .eq('ms_oid', msUser.oid)
    .single();

  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  if (user.user_type !== 'teacher' && user.user_type !== 'admin') {
    return NextResponse.json({ error: 'Only teachers can manage recordings' }, { status: 403 });
  }
  return { id: user.id };
}

/**
 * PATCH /api/timetable/recording
 * body { class_id, classroom_id, recording_url }
 *
 * Set the recording link by hand.
 *
 * The escape hatch for the automatic sweep. Teams does not always publish a
 * recording where the locator looks (a meeting somebody started ad hoc, a
 * recording moved into a shared library, a class recorded on a phone and
 * uploaded), and until now a class in that state had no route back: the panel
 * offered Sync, Sync found nothing, and that was the end of it. Once the sweep
 * has marked a class `unavailable` nothing will ever look again, so without this
 * the class stays without a recording forever and every student who missed it
 * stays blocked.
 *
 * Writes `recording_sync_status = 'manual'` so the sweep leaves it alone and the
 * panel can say where the link came from.
 */
export async function PATCH(request: NextRequest) {
  try {
    const supabase = getSupabaseAdminClient() as any;
    const caller = await resolveStaffCaller(supabase, request.headers.get('Authorization'));
    if (caller instanceof NextResponse) return caller;

    const { class_id, classroom_id, recording_url } = await request.json();
    if (!class_id || !classroom_id) {
      return NextResponse.json({ error: 'Missing class_id and classroom_id' }, { status: 400 });
    }

    // Clearing is allowed (an empty string), so the teacher can undo a wrong
    // paste and let the sweep try again rather than being stuck with it.
    const raw = typeof recording_url === 'string' ? recording_url.trim() : '';
    if (raw && !/^https:\/\/\S+$/i.test(raw)) {
      return NextResponse.json(
        { error: 'That does not look like a link. Paste the https:// address of the recording.' },
        { status: 400 },
      );
    }

    // Class-in-classroom, so a mismatched pair cannot write to a class in
    // another classroom. Same guard as attendance-report.
    const { data: cls } = await supabase
      .from('nexus_scheduled_classes')
      .select('id, title')
      .eq('id', class_id)
      .eq('classroom_id', classroom_id)
      .maybeSingle();

    if (!cls) {
      return NextResponse.json({ error: 'Class not found in this classroom' }, { status: 404 });
    }

    const { data: updated, error } = await supabase
      .from('nexus_scheduled_classes')
      .update({
        recording_url: raw || null,
        recording_fetched_at: raw ? new Date().toISOString() : null,
        // Clearing hands the class back to the sweep with a clean slate; setting
        // takes it off the sweep's list entirely.
        recording_sync_status: raw ? 'manual' : null,
        recording_sync_attempts: 0,
        recording_sync_detail: null,
      })
      .eq('id', class_id)
      .select('id, recording_url, recording_fetched_at, recording_sync_status')
      .single();

    if (error) throw error;

    if (raw) {
      try {
        await notifyRecordingAvailable(classroom_id, cls.title || 'Class', class_id);
      } catch {
        // A notification failure must not make the teacher think the link did
        // not save. It did.
      }
    }

    return NextResponse.json({
      recording: updated,
      message: raw ? 'Recording link saved' : 'Recording link removed',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save the recording link';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/timetable/recording
 * Fetch recording from Teams for a completed class (teacher or admin).
 * Uses the caller's delegated token to access meeting recordings.
 */
export async function POST(request: NextRequest) {
  try {
    const token = extractBearerToken(request.headers.get('Authorization'));
    const { class_id, classroom_id } = await request.json();

    if (!class_id || !classroom_id) {
      return NextResponse.json({ error: 'Missing class_id and classroom_id' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient();

    const caller = await resolveStaffCaller(supabase, request.headers.get('Authorization'));
    if (caller instanceof NextResponse) return caller;

    // Get class details
    const { data: cls } = await supabase
      .from('nexus_scheduled_classes')
      .select(
        // One string literal, not a concatenation: the typed client reads this at
        // the type level and gives up on anything it cannot see as a literal.
        'teams_meeting_id, teams_meeting_join_url, teams_meeting_url, online_meeting_id, organizer_ms_oid, organizer_email, transcript_url, title, teacher_id, classroom_id, scheduled_date, start_time',
      )
      .eq('id', class_id)
      .single();

    if (!cls?.teams_meeting_id) {
      return NextResponse.json({ error: 'No Teams meeting linked to this class' }, { status: 400 });
    }

    // Resolve the ms_oid to read the meeting on behalf of: the real Teams organizer
    // when known (channel/group meetings are often organized by someone other than
    // the assigned teacher), else the teacher.
    const organizerOid = await resolveOrganizerOid(supabase, {
      joinUrl: cls.teams_meeting_join_url || cls.teams_meeting_url || null,
      organizerEmail: cls.organizer_email,
      teacherId: cls.teacher_id,
    });

    // ── The recording file ──
    //
    // Found as a driveItem, never through /onlineMeetings/{id}/recordings. See
    // lib/recording-locator for why, and for the two folders it looks in.
    const recordingUrl = await findRecordingForClass(supabase, cls, organizerOid);

    // ── The transcript ──
    //
    // Through the shared ladder, which fetches the text, proves it parses and
    // stores it in nexus_class_transcripts. This route used to list transcripts
    // itself and save the first content URL without ever reading it, so what it
    // stored was never known to work. It did not: Graph answers
    // `400 Invalid format '*/*'` unless the request names a format.
    const { entries: transcriptEntries } = await resolveTranscript({
      cls: { ...cls, id: class_id, recording_url: recordingUrl },
      msToken: token,
      supabase,
    });

    // Update the class record.
    //
    // recording_fetched_at is stamped ONLY on a hit. It used to be written on
    // every press, so a class nobody could find a recording for still carried a
    // "fetched" timestamp, and the panel had no way to tell "we have it" from
    // "we looked and there was nothing".
    //
    // The attempt counter is deliberately not incremented here. Only the cron
    // counts against the cap of four; letting an impatient teacher press Sync
    // four times while Teams is still processing would drive the class to
    // `unavailable` and stop the sweep ever trying again. Same rule the
    // transcript ladder documents in recordTranscriptFailure.
    const updateData: Record<string, unknown> = recordingUrl
      ? {
          recording_url: recordingUrl,
          recording_fetched_at: new Date().toISOString(),
          recording_sync_status: 'ok',
          recording_sync_detail: null,
        }
      : { recording_sync_detail: 'Checked by hand, Teams had no recording yet' };

    const { data: updated, error } = await supabase
      .from('nexus_scheduled_classes')
      .update(updateData)
      .eq('id', class_id)
      .select('id, recording_url, transcript_url, recording_fetched_at, recording_sync_status')
      .single();

    if (error) throw error;

    // Notify students if recording was found
    if (recordingUrl) {
      try {
        await notifyRecordingAvailable(classroom_id, cls.title || 'Class', class_id);
      } catch {
        // Don't fail sync if notification fails
      }
    }

    return NextResponse.json({
      recording: updated,
      found: !!recordingUrl,
      transcript: { found: transcriptEntries.length > 0, segments: transcriptEntries.length },
      message: recordingUrl
        ? 'Recording synced successfully'
        : 'No recording found yet. It may still be processing.',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to sync recording';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

