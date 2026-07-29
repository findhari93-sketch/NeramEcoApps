import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken, extractBearerToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { notifyRecordingAvailable } from '@/lib/timetable-notifications';
import { resolveOnlineMeeting, resolveOrganizerOid } from '@/lib/teams-online-meeting';
import { findRecordingForClass } from '@/lib/recording-locator';

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
        'teams_meeting_id, teams_meeting_join_url, teams_meeting_url, title, teacher_id, organizer_email, classroom_id, scheduled_date, start_time',
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
    // Still read from Graph. Unlike the recording, transcript_url is only ever
    // fetched server-side with a token (see lib/transcript-resolver), so a Graph
    // content URL is the right thing to store.
    let transcriptUrl: string | null = null;

    const resolved = await resolveOnlineMeeting({
      delegatedToken: token!,
      teamsMeetingId: cls.teams_meeting_id,
      joinUrl: cls.teams_meeting_join_url || cls.teams_meeting_url || null,
      organizerOid,
    });

    if (resolved) {
      const transcriptsRes = await fetch(
        `https://graph.microsoft.com/v1.0/${resolved.artifactBase}/transcripts`,
        { headers: { Authorization: `Bearer ${resolved.token}` } }
      );

      if (transcriptsRes.ok) {
        const transcriptsData = await transcriptsRes.json();
        const transcripts = transcriptsData.value || [];
        if (transcripts.length > 0) {
          transcriptUrl = transcripts[0].transcriptContentUrl || transcripts[0].content || null;
        }
      }
    }

    // Update the class record
    const updateData: Record<string, unknown> = {
      recording_fetched_at: new Date().toISOString(),
    };
    if (recordingUrl) updateData.recording_url = recordingUrl;
    if (transcriptUrl) updateData.transcript_url = transcriptUrl;

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
      message: recordingUrl
        ? 'Recording synced successfully'
        : 'No recording found yet. It may still be processing.',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to sync recording';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

