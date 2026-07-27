import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { canUser } from '@/lib/staff-capabilities';
import { getAppOnlyToken } from '@/lib/graph-app-token';
import { notifyRecordingAvailable, notifyClassCancelled } from '@/lib/timetable-notifications';
import { syncClassroomMeetings } from '@/lib/teams-meeting-sync';
import { announceCancellationToTeams } from '@/lib/teams-class-announcements';
import { extractOidFromJoinUrl } from '@/lib/teams-online-meeting';
import { fetchChannelRecordings, matchRecordingToClass } from '@/lib/channel-recordings';

/**
 * POST /api/timetable/sync-now
 *
 * Called on student/teacher timetable page load.
 * Performs two jobs in one pass:
 *
 * 1. MEETING SYNC: Pull latest Teams calendar events into nexus_scheduled_classes
 *    for all classrooms the user is enrolled in (including common classroom).
 *    Rate-limited to once per 5 minutes per classroom via last_synced_at.
 *
 * 2. RECORDING SYNC: For completed classes in the last 30 days without a
 *    recording_url, check Teams for available recordings and save them.
 *    Extracts organizer OID from join URL for reliable Graph API lookup.
 *    Requires OnlineMeetingRecording.Read.All application permission in Azure AD.
 *    Gracefully skips if the permission is not yet granted.
 *
 * Uses app-only token (no user interaction needed) for both operations.
 */
export async function POST(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient();

    // Resolve userId from ms_oid
    const { data: user } = await supabase
      .from('users')
      .select('id, user_type, staff_role, can_teach')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // This writes classes and recordings for every classroom the caller is
    // enrolled in, so it is a scheduling action. Previously ANY active enrollment
    // was enough, including a student's.
    if (!canUser(user, 'teach.timetable.schedule')) {
      return NextResponse.json(
        { error: 'Only the Neram team can run a timetable sync.' },
        { status: 403 },
      );
    }

    // Get all classroom IDs this user is enrolled in
    const { data: enrollments } = await supabase
      .from('nexus_enrollments')
      .select('classroom_id')
      .eq('user_id', user.id)
      .eq('is_active', true);

    if (!enrollments || enrollments.length === 0) {
      return NextResponse.json({
        synced: 0,
        meetings: { imported: 0, updated: 0, cancelled: 0 },
        recordings: { found: 0 },
      });
    }

    const classroomIds = [...new Set(enrollments.map((e) => e.classroom_id))];

    // Get classroom details (only active, only those with a linked Teams team)
    const { data: classrooms } = await supabase
      .from('nexus_classrooms')
      .select('id, ms_team_id')
      .in('id', classroomIds)
      .eq('is_active', true);

    const appToken = await getAppOnlyToken();
    const now = new Date();
    // 90-day lookback (not just 7 days): the UPDATE step also backfills organizer_name/
    // organizer_email for classes already in Nexus, so a wider window is what makes
    // already-scheduled historical classes self-heal their organizer data over time.
    const pastDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const futureDate = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString();


    let totalImported = 0;
    let totalUpdated = 0;
    let totalCancelled = 0;
    let syncedCount = 0;

    // ─── 1. MEETING SYNC ─────────────────────────────────────────────────────
    for (const classroom of classrooms || []) {
      if (!classroom.ms_team_id) continue;

      try {
        const result = await syncClassroomMeetings(
          supabase,
          appToken,
          classroom as { id: string; ms_team_id: string },
          pastDate,
          futureDate,
        );
        totalImported += result.imported;
        totalUpdated += result.updated;
        totalCancelled += result.cancelled;
        syncedCount++;

        // A class the reconciler cancelled was cancelled from within Teams, so the
        // calendar already reflects it. Post a "Cancelled" card (best-effort,
        // app-only) and tell the students in-app.
        for (const cancelled of result.cancelledClasses) {
          await announceCancellationToTeams(appToken, supabase, cancelled.classroom_id, cancelled, cancelled).catch(
            () => {},
          );
          await notifyClassCancelled(
            cancelled.classroom_id,
            cancelled.title,
            cancelled.scheduled_date,
            cancelled.id,
          ).catch(() => {});
        }
      } catch (err) {
        console.error(`[sync-now] Meeting sync failed for classroom ${classroom.id}:`, err);
      }
    }

    // ─── 2. RECORDING SYNC ───────────────────────────────────────────────────
    // Channel meeting recordings are stored in SharePoint (the team's channel files).
    // We fetch the Recordings folder from each team's default channel via Graph API,
    // then match files to classes by date.
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const { data: recentClasses } = await supabase
      .from('nexus_scheduled_classes')
      .select('id, classroom_id, title, teams_meeting_join_url, teacher_id, scheduled_date, start_time, end_time')
      .in('classroom_id', classroomIds)
      .is('recording_url', null)
      .is('recording_fetched_at', null)
      .not('teams_meeting_join_url', 'is', null)
      .gte('scheduled_date', thirtyDaysAgo.toISOString().substring(0, 10));

    // Filter to classes whose end time has passed by at least 20 minutes
    const twentyMinutesAgo = new Date(now.getTime() - 20 * 60 * 1000);
    const classesToCheck = (recentClasses || []).filter((cls) => {
      const endDateTime = new Date(`${cls.scheduled_date}T${cls.end_time.substring(0, 5)}:00+05:30`);
      return endDateTime < twentyMinutesAgo;
    });

    console.log(`[sync-now] Recording sync: ${classesToCheck.length} completed classes to check`);

    let recordingsFound = 0;

    // Approach: Fetch recordings from SharePoint (channel Recordings folder)
    // Group classes by classroom to batch the SharePoint lookups
    const classesByClassroom = new Map<string, typeof classesToCheck>();
    for (const cls of classesToCheck) {
      const existing = classesByClassroom.get(cls.classroom_id) || [];
      existing.push(cls);
      classesByClassroom.set(cls.classroom_id, existing);
    }

    for (const [classroomId, classes] of classesByClassroom) {
      const classroom = (classrooms || []).find((c) => c.id === classroomId);
      if (!classroom?.ms_team_id) continue;

      try {
        const recordings = await fetchChannelRecordings(appToken, classroom.ms_team_id);
        console.log(`[sync-now] Found ${recordings.length} recording files in team ${classroom.ms_team_id}`);

        for (const cls of classes) {
          // Match recording to class by date and approximate time
          const matched = matchRecordingToClass(recordings, cls);
          if (matched) {
            // Best-effort transcript fetch (feeds the class-recap generator).
            let transcriptUrl: string | null = null;
            try {
              const oid = extractOidFromJoinUrl(cls.teams_meeting_join_url!);
              transcriptUrl = await fetchTranscriptByJoinUrl(
                supabase, appToken, cls.teams_meeting_join_url!, cls.teacher_id, oid,
              );
            } catch (tErr) {
              console.error(`[sync-now] Transcript fetch failed for class ${cls.id}:`, tErr);
            }

            const recordingUpdate: Record<string, unknown> = {
              recording_url: matched.webUrl,
              recording_fetched_at: now.toISOString(),
            };
            if (transcriptUrl) recordingUpdate.transcript_url = transcriptUrl;
            await supabase
              .from('nexus_scheduled_classes')
              .update(recordingUpdate)
              .eq('id', cls.id);

            await notifyRecordingAvailable(cls.classroom_id, cls.title, cls.id).catch(() => {});
            recordingsFound++;
            console.log(`[sync-now] Matched recording for "${cls.title}" on ${cls.scheduled_date}: ${matched.name}`);
          } else {
            // No recording found. Mark old classes so we don't re-check every load.
            const classAge = now.getTime() - new Date(cls.scheduled_date).getTime();
            const sevenDays = 7 * 24 * 60 * 60 * 1000;
            if (classAge > sevenDays) {
              await supabase
                .from('nexus_scheduled_classes')
                .update({ recording_fetched_at: now.toISOString() })
                .eq('id', cls.id);
            }
          }
        }
      } catch (err) {
        console.error(`[sync-now] SharePoint recording fetch failed for team ${classroom.ms_team_id}:`, err);

        // Fallback: try the onlineMeetings API for individual classes
        for (const cls of classes) {
          try {
            const organizerOid = extractOidFromJoinUrl(cls.teams_meeting_join_url!);
            const recordingUrl = await fetchRecordingByJoinUrl(
              supabase, appToken, cls.teams_meeting_join_url!, cls.teacher_id, organizerOid,
            );
            if (recordingUrl) {
              let transcriptUrl: string | null = null;
              try {
                transcriptUrl = await fetchTranscriptByJoinUrl(
                  supabase, appToken, cls.teams_meeting_join_url!, cls.teacher_id, organizerOid,
                );
              } catch (tErr) {
                console.error(`[sync-now] Transcript fetch failed for class ${cls.id}:`, tErr);
              }
              const recordingUpdate: Record<string, unknown> = {
                recording_url: recordingUrl,
                recording_fetched_at: now.toISOString(),
              };
              if (transcriptUrl) recordingUpdate.transcript_url = transcriptUrl;
              await supabase
                .from('nexus_scheduled_classes')
                .update(recordingUpdate)
                .eq('id', cls.id);
              recordingsFound++;
            }
          } catch (fallbackErr) {
            console.error(`[sync-now] Fallback recording fetch failed for class ${cls.id}:`, fallbackErr);
          }
        }
      }
    }

    return NextResponse.json({
      synced: syncedCount,
      meetings: { imported: totalImported, updated: totalUpdated, cancelled: totalCancelled },
      recordings: { found: recordingsFound, checked: classesToCheck.length },
    });
  } catch (err) {
    if (err instanceof Error && err.message.includes('Missing or invalid Authorization')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[sync-now] Error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Sync failed' },
      { status: 500 }
    );
  }
}

// ─── OnlineMeetings recording fetch helpers (fallback) ──────────────────────

/**
 * Look up a Teams online meeting by its join URL, then fetch the first recording.
 *
 * Requires the Azure app registration to have:
 *   OnlineMeetingRecording.Read.All  (Application permission, admin consent)
 *
 * Uses organizerOid (extracted from join URL) as primary lookup.
 * Falls back to teacher_id -> ms_oid if organizerOid is not available.
 */
async function fetchRecordingByJoinUrl(
  supabase: ReturnType<typeof getSupabaseAdminClient>,
  appToken: string,
  joinUrl: string,
  teacherId: string | null,
  organizerOid: string | null,
): Promise<string | null> {
  // Determine the user OID for the Graph API call
  let userOid = organizerOid;

  if (!userOid && teacherId) {
    const { data: teacher } = await supabase
      .from('users')
      .select('ms_oid')
      .eq('id', teacherId)
      .single();
    userOid = teacher?.ms_oid || null;
  }

  if (!userOid) return null;

  // Look up the online meeting by JoinWebUrl
  const filterQuery = `JoinWebUrl eq '${joinUrl.replace(/'/g, "''")}'`;
  const meetingRes = await fetch(
    `https://graph.microsoft.com/v1.0/users/${userOid}/onlineMeetings?$filter=${encodeURIComponent(filterQuery)}`,
    { headers: { Authorization: `Bearer ${appToken}` } }
  );

  if (!meetingRes.ok) {
    const errText = await meetingRes.text().catch(() => '');
    throw new Error(`Meeting lookup failed: ${meetingRes.status} ${errText}`);
  }

  const meetingData = await meetingRes.json();
  const meetings = meetingData.value || [];
  if (meetings.length === 0) return null;

  const meetingId = meetings[0].id as string;

  // Fetch recordings for this online meeting
  const recordingsRes = await fetch(
    `https://graph.microsoft.com/v1.0/users/${userOid}/onlineMeetings/${meetingId}/recordings`,
    { headers: { Authorization: `Bearer ${appToken}` } }
  );

  if (!recordingsRes.ok) {
    const errText = await recordingsRes.text().catch(() => '');
    throw new Error(`Recordings fetch failed: ${recordingsRes.status} ${errText}`);
  }

  const recordingsData = await recordingsRes.json();
  const recordings = recordingsData.value || [];
  if (recordings.length === 0) return null;

  // Prefer recordingContentUrl (direct playable link), fall back to content stream URL
  return recordings[0].recordingContentUrl || recordings[0].content || null;
}

/**
 * Look up a Teams online meeting by its join URL, then fetch the first transcript.
 *
 * Requires the Azure app registration to have:
 *   OnlineMeetingTranscript.Read.All  (Application permission, admin consent)
 *
 * Returns the transcript content URL (a Graph endpoint yielding VTT). Callers
 * store it on nexus_scheduled_classes.transcript_url; the recap generator then
 * fetches it, falling back to resolving the transcript from the recording file.
 */
async function fetchTranscriptByJoinUrl(
  supabase: ReturnType<typeof getSupabaseAdminClient>,
  appToken: string,
  joinUrl: string,
  teacherId: string | null,
  organizerOid: string | null,
): Promise<string | null> {
  let userOid = organizerOid;

  if (!userOid && teacherId) {
    const { data: teacher } = await supabase
      .from('users')
      .select('ms_oid')
      .eq('id', teacherId)
      .single();
    userOid = teacher?.ms_oid || null;
  }

  if (!userOid) return null;

  const filterQuery = `JoinWebUrl eq '${joinUrl.replace(/'/g, "''")}'`;
  const meetingRes = await fetch(
    `https://graph.microsoft.com/v1.0/users/${userOid}/onlineMeetings?$filter=${encodeURIComponent(filterQuery)}`,
    { headers: { Authorization: `Bearer ${appToken}` } }
  );

  if (!meetingRes.ok) return null;

  const meetingData = await meetingRes.json();
  const meetings = meetingData.value || [];
  if (meetings.length === 0) return null;

  const meetingId = meetings[0].id as string;

  const transcriptsRes = await fetch(
    `https://graph.microsoft.com/v1.0/users/${userOid}/onlineMeetings/${meetingId}/transcripts`,
    { headers: { Authorization: `Bearer ${appToken}` } }
  );

  if (!transcriptsRes.ok) return null;

  const transcriptsData = await transcriptsRes.json();
  const transcripts = transcriptsData.value || [];
  if (transcripts.length === 0) return null;

  return transcripts[0].transcriptContentUrl || transcripts[0].content || null;
}
