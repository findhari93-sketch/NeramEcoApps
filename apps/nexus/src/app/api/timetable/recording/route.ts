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
 * POST /api/timetable/recording
 * Fetch recording from Teams for a completed class (teacher only).
 * Uses the teacher's delegated token to access meeting recordings.
 */
export async function POST(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const token = extractBearerToken(request.headers.get('Authorization'));
    const { class_id, classroom_id } = await request.json();

    if (!class_id || !classroom_id) {
      return NextResponse.json({ error: 'Missing class_id and classroom_id' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient();

    // Verify teacher role
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const { data: enrollment } = await supabase
      .from('nexus_enrollments')
      .select('role')
      .eq('user_id', user.id)
      .eq('classroom_id', classroom_id)
      .single();

    if (!enrollment || enrollment.role !== 'teacher') {
      return NextResponse.json({ error: 'Only teachers can sync recordings' }, { status: 403 });
    }

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

    // Update the class record
    const updateData: Record<string, unknown> = {
      recording_fetched_at: new Date().toISOString(),
    };
    if (recordingUrl) updateData.recording_url = recordingUrl;

    const { data: updated, error } = await supabase
      .from('nexus_scheduled_classes')
      .update(updateData)
      .eq('id', class_id)
      .select('id, recording_url, transcript_url, recording_fetched_at')
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

