import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken, extractBearerToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';

/**
 * POST /api/timetable/teams-meeting
 * Creates a Microsoft Teams online meeting for a scheduled class.
 * Uses the teacher's delegated token to create the meeting as themselves.
 */
export async function POST(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const token = extractBearerToken(request.headers.get('Authorization'));
    const { class_id, classroom_id } = await request.json();

    if (!class_id || !classroom_id) {
      return NextResponse.json({ error: 'Missing class_id and classroom_id' }, { status: 400 });
    }

    // Verify teacher role
    const supabase = getSupabaseAdminClient();
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
      return NextResponse.json({ error: 'Only teachers can create meetings' }, { status: 403 });
    }

    // Get the scheduled class details
    const { data: scheduledClass } = await supabase
      .from('nexus_scheduled_classes')
      .select('*')
      .eq('id', class_id)
      .eq('classroom_id', classroom_id)
      .single();

    if (!scheduledClass) {
      return NextResponse.json({ error: 'Class not found' }, { status: 404 });
    }

    // Create Teams online meeting via Graph API using teacher's delegated token
    const startDateTime = `${scheduledClass.scheduled_date}T${scheduledClass.start_time}:00+05:30`;
    const endDateTime = `${scheduledClass.scheduled_date}T${scheduledClass.end_time}:00+05:30`;

    const meetingPayload = {
      subject: scheduledClass.title,
      startDateTime,
      endDateTime,
      lobbyBypassSettings: {
        scope: 'organization',
      },
      allowedPresenters: 'organizer',
    };

    const graphRes = await fetch('https://graph.microsoft.com/v1.0/me/onlineMeetings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(meetingPayload),
    });

    if (!graphRes.ok) {
      const errText = await graphRes.text().catch(() => 'Unknown error');
      throw new Error(`Failed to create Teams meeting: ${graphRes.status} ${errText}`);
    }

    const meeting = await graphRes.json();

    // Update the scheduled class with meeting info
    const { data: updated, error: updateError } = await supabase
      .from('nexus_scheduled_classes')
      .update({
        teams_meeting_id: meeting.id,
        teams_meeting_url: meeting.joinWebUrl,
        teams_meeting_join_url: meeting.joinWebUrl,
      })
      .eq('id', class_id)
      .select('*')
      .single();

    if (updateError) throw updateError;

    return NextResponse.json({
      class: updated,
      meeting: {
        id: meeting.id,
        joinUrl: meeting.joinWebUrl,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create Teams meeting';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
