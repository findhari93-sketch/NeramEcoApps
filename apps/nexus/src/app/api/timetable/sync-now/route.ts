import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { canUser } from '@/lib/staff-capabilities';
import { getAppOnlyToken } from '@/lib/graph-app-token';
import { notifyRecordingAvailable, notifyClassCancelled } from '@/lib/timetable-notifications';
import { syncClassroomMeetings } from '@/lib/teams-meeting-sync';
import { announceCancellationToTeams } from '@/lib/teams-class-announcements';
import { resolveOrganizerOid } from '@/lib/teams-online-meeting';
import { resolveTranscript } from '@/lib/transcript-resolver';
import {
  fetchChannelRecordings,
  fetchOrganizerRecordings,
  matchRecordingToClass,
  type RecordingFile,
} from '@/lib/channel-recordings';

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
      // One string literal, not a concatenation: the typed client reads this at
      // the type level and gives up on anything it cannot see as a literal.
      .select('id, classroom_id, title, teams_meeting_join_url, teams_meeting_url, teams_meeting_id, online_meeting_id, organizer_ms_oid, organizer_email, transcript_url, teacher_id, scheduled_date, start_time, end_time')
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

    // Group classes by classroom to batch the SharePoint lookups.
    const classesByClassroom = new Map<string, typeof classesToCheck>();
    for (const cls of classesToCheck) {
      const existing = classesByClassroom.get(cls.classroom_id) || [];
      existing.push(cls);
      classesByClassroom.set(cls.classroom_id, existing);
    }

    // A recording lives in one of two places, decided by how the meeting was
    // created: a channel meeting drops it in the team's document library, anything
    // else drops it in the ORGANIZER'S OneDrive. Both are scanned, because classes
    // created with the calendar_event scope only ever appear in the second.
    // Keyed by organizer oid so a 40-class batch lists each OneDrive once.
    const oneDriveByOrganizer = new Map<string, RecordingFile[]>();

    const organizerRecordingsFor = async (cls: (typeof classesToCheck)[number]): Promise<RecordingFile[]> => {
      const oid = await resolveOrganizerOid(supabase, {
        joinUrl: cls.teams_meeting_join_url,
        organizerEmail: cls.organizer_email,
        teacherId: cls.teacher_id,
      });
      if (!oid) return [];
      const cached = oneDriveByOrganizer.get(oid);
      if (cached) return cached;
      try {
        const files = await fetchOrganizerRecordings(appToken, oid);
        oneDriveByOrganizer.set(oid, files);
        console.log(`[sync-now] Found ${files.length} OneDrive recordings for organizer ${oid}`);
        return files;
      } catch (err) {
        console.error(`[sync-now] OneDrive recording fetch failed for organizer ${oid}:`, err);
        oneDriveByOrganizer.set(oid, []);
        return [];
      }
    };

    for (const [classroomId, classes] of classesByClassroom) {
      const classroom = (classrooms || []).find((c) => c.id === classroomId);
      if (!classroom?.ms_team_id) continue;

      let channelRecordings: RecordingFile[] = [];
      try {
        channelRecordings = await fetchChannelRecordings(appToken, classroom.ms_team_id);
        console.log(`[sync-now] Found ${channelRecordings.length} recording files in team ${classroom.ms_team_id}`);
      } catch (err) {
        // Loud, but not fatal: the OneDrive scan below may still find the class.
        console.error(`[sync-now] SharePoint recording fetch failed for team ${classroom.ms_team_id}:`, err);
      }

      for (const cls of classes) {
        // Match recording to class by date and approximate time, channel first.
        let matched = matchRecordingToClass(channelRecordings, cls);
        if (!matched) {
          // No fuzzy fallback on OneDrive. A team's Recordings folder holds class
          // recordings and nothing else, so "the only one that day" is a safe
          // guess there; a teacher's personal OneDrive holds anything they ever
          // recorded, so the same guess would staple a private meeting to a class.
          matched = matchRecordingToClass(await organizerRecordingsFor(cls), cls, {
            allowFuzzy: false,
          });
        }

        if (matched) {
          await supabase
            .from('nexus_scheduled_classes')
            .update({
              // The driveItem webUrl, never a Graph content URL: this value is
              // handed to a browser and to getSharePointStreamUrl.
              recording_url: matched.webUrl,
              recording_fetched_at: now.toISOString(),
            })
            .eq('id', cls.id);

          // Then the transcript, through the shared ladder, which stores the TEXT
          // in nexus_class_transcripts so nothing fetches it again. This route
          // used to carry its own copy that returned a content URL it never
          // actually read, so the URL it saved had never been proven to work, and
          // in production it did not: Graph 400s a transcript content request
          // that does not name a format. Written after the recording update on
          // purpose, so the ladder's SharePoint rung can see recording_url.
          try {
            await resolveTranscript({
              cls: { ...cls, recording_url: matched.webUrl },
              supabase,
            });
          } catch (tErr) {
            console.error(`[sync-now] Transcript fetch failed for class ${cls.id}:`, tErr);
          }

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

// ─── Why there is no transcript or recording helper in this file ─────────────
//
// Both used to live here and both were wrong in the same way: they returned a
// Graph content URL that nothing had ever fetched.
//
// The old fetchRecordingByJoinUrl returned `recordingContentUrl`, which only
// resolves with a bearer token, and that value was written to recording_url and
// rendered as a plain href. Every teacher and student who clicked it got
// `InvalidAuthenticationToken: Access token is empty`. Recordings are now found
// as driveItems, which have a real webUrl. See channel-recordings.
//
// The old fetchTranscriptByJoinUrl returned `transcriptContentUrl` and saved it
// to transcript_url without reading it once. Production held such URLs for
// months; every attempt to read one answered `400 Invalid format '*/*'`. The
// transcript now goes through lib/transcript-resolver, which fetches the text,
// proves it parses, and stores it.
