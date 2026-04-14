import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { getAppOnlyToken } from '@/lib/graph-app-token';
import { notifyRecordingAvailable } from '@/lib/timetable-notifications';

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
      .select('id')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
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
    const pastDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
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

        // Sync completed for this classroom
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
            await supabase
              .from('nexus_scheduled_classes')
              .update({
                recording_url: matched.webUrl,
                recording_fetched_at: now.toISOString(),
              })
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
              await supabase
                .from('nexus_scheduled_classes')
                .update({ recording_url: recordingUrl, recording_fetched_at: now.toISOString() })
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

// ─── Meeting sync helpers (mirrors cron/sync-teams-meetings logic) ─────────────

async function syncClassroomMeetings(
  supabase: ReturnType<typeof getSupabaseAdminClient>,
  token: string,
  classroom: { id: string; ms_team_id: string },
  pastDate: string,
  futureDate: string,
): Promise<{ imported: number; updated: number; cancelled: number }> {
  const teamsEvents = await fetchGroupCalendarView(token, classroom.ms_team_id, pastDate, futureDate);

  const teamsEventMap = new Map<string, any>();
  for (const event of teamsEvents) {
    teamsEventMap.set(event.id, event);
  }

  // Existing Nexus classes for this classroom in the date window (ALL statuses to prevent re-importing completed classes)
  const { data: nexusClasses } = await supabase
    .from('nexus_scheduled_classes')
    .select('id, teams_meeting_id, teams_meeting_url, title, scheduled_date, start_time, end_time, status')
    .eq('classroom_id', classroom.id)
    .not('teams_meeting_id', 'is', null)
    .gte('scheduled_date', pastDate.substring(0, 10))
    .lte('scheduled_date', futureDate.substring(0, 10));

  const existingMeetingIds = new Set(
    (nexusClasses || []).map((c: any) => c.teams_meeting_id).filter(Boolean)
  );
  const existingJoinUrls = new Set(
    (nexusClasses || []).map((c: any) => c.teams_meeting_url).filter(Boolean)
  );

  let imported = 0;
  let updated = 0;
  let cancelled = 0;

  // Import new Teams events not yet in Nexus
  for (const event of teamsEvents) {
    const joinUrl = event.onlineMeeting?.joinUrl;
    if (!joinUrl) continue;
    if (existingMeetingIds.has(event.id) || existingJoinUrls.has(joinUrl)) continue;

    try {
      const startStr = event.start.dateTime as string;
      const endStr = event.end.dateTime as string;

      let teacherId: string | null = null;
      const organizerName = event.organizer?.emailAddress?.name || null;
      if (event.organizer?.emailAddress?.address) {
        const { data: organizer } = await supabase
          .from('users')
          .select('id')
          .eq('email', event.organizer.emailAddress.address)
          .single();
        if (organizer) teacherId = organizer.id;
      }

      let description: string | null = null;
      if (event.body?.content) {
        description = event.body.content
          .replace(/<[^>]*>/g, '')
          .replace(/&nbsp;/g, ' ')
          .trim()
          .substring(0, 500) || null;
      }

      const { error } = await supabase.from('nexus_scheduled_classes').insert({
        classroom_id: classroom.id,
        title: event.subject || 'Teams Meeting',
        scheduled_date: startStr.substring(0, 10),
        start_time: startStr.substring(11, 16),
        end_time: endStr.substring(11, 16),
        teacher_id: teacherId,
        organizer_name: organizerName,
        description,
        teams_meeting_id: event.id,
        teams_meeting_url: joinUrl,
        teams_meeting_join_url: joinUrl,
        teams_meeting_scope: 'channel_meeting',
        target_scope: 'classroom',
        status: 'scheduled',
      });

      if (!error) {
        imported++;
        existingMeetingIds.add(event.id);
        existingJoinUrls.add(joinUrl);
      }
    } catch {
      // ignore individual import errors
    }
  }

  // Cancel Nexus classes whose Teams event no longer exists
  for (const nexusClass of nexusClasses || []) {
    if (!nexusClass.teams_meeting_id || nexusClass.status !== 'scheduled') continue;
    if (!teamsEventMap.has(nexusClass.teams_meeting_id)) {
      const { error } = await supabase
        .from('nexus_scheduled_classes')
        .update({ status: 'cancelled' })
        .eq('id', nexusClass.id);
      if (!error) cancelled++;
    }
  }

  // Update changed titles or times
  for (const nexusClass of nexusClasses || []) {
    if (!nexusClass.teams_meeting_id || nexusClass.status !== 'scheduled') continue;
    const teamsEvent = teamsEventMap.get(nexusClass.teams_meeting_id);
    if (!teamsEvent) continue;

    const startStr = teamsEvent.start.dateTime as string;
    const endStr = teamsEvent.end.dateTime as string;
    const teamsTitle = teamsEvent.subject || 'Teams Meeting';
    const teamsDate = startStr.substring(0, 10);
    const teamsStart = startStr.substring(11, 16);
    const teamsEnd = endStr.substring(11, 16);

    const changed =
      nexusClass.title !== teamsTitle ||
      nexusClass.scheduled_date !== teamsDate ||
      nexusClass.start_time.substring(0, 5) !== teamsStart ||
      nexusClass.end_time.substring(0, 5) !== teamsEnd;

    if (changed) {
      const { error } = await supabase
        .from('nexus_scheduled_classes')
        .update({ title: teamsTitle, scheduled_date: teamsDate, start_time: teamsStart, end_time: teamsEnd })
        .eq('id', nexusClass.id);
      if (!error) updated++;
    }
  }

  return { imported, updated, cancelled };
}

async function fetchGroupCalendarView(
  token: string,
  groupId: string,
  startDateTime: string,
  endDateTime: string,
): Promise<any[]> {
  const url =
    `https://graph.microsoft.com/v1.0/groups/${groupId}/calendarView` +
    `?startDateTime=${encodeURIComponent(startDateTime)}` +
    `&endDateTime=${encodeURIComponent(endDateTime)}` +
    `&$top=50` +
    `&$orderby=start/dateTime desc` +
    `&$select=id,subject,start,end,onlineMeeting,organizer,body,isOnlineMeeting,isCancelled`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Prefer: 'outlook.timezone="Asia/Kolkata"',
    },
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Failed to fetch group calendar: ${res.status} ${errText}`);
  }

  const data = await res.json();
  return (data.value || []).filter(
    (e: any) => e.isOnlineMeeting && e.onlineMeeting?.joinUrl && !e.isCancelled
  );
}

// ─── SharePoint recording helpers ───────────────────────────────────────────

interface RecordingFile {
  name: string;
  webUrl: string;
  createdDateTime: string;
  size: number;
}

/**
 * Fetch recording files from a Teams channel's SharePoint Recordings folder.
 * Channel meeting recordings are stored in: Team Site > General > Recordings/
 */
async function fetchChannelRecordings(
  token: string,
  teamId: string,
): Promise<RecordingFile[]> {
  // Get the default (General) channel's files drive
  const channelsRes = await fetch(
    `https://graph.microsoft.com/v1.0/teams/${teamId}/channels?$filter=displayName eq 'General'&$select=id`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!channelsRes.ok) {
    // Try the primary channel endpoint instead
    const primaryRes = await fetch(
      `https://graph.microsoft.com/v1.0/teams/${teamId}/primaryChannel?$select=id`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!primaryRes.ok) {
      throw new Error(`Failed to get team channel: ${primaryRes.status}`);
    }
    const primary = await primaryRes.json();
    return fetchRecordingsFromChannel(token, teamId, primary.id);
  }

  const channelsData = await channelsRes.json();
  const channels = channelsData.value || [];
  if (channels.length === 0) {
    throw new Error('No General channel found');
  }

  return fetchRecordingsFromChannel(token, teamId, channels[0].id);
}

async function fetchRecordingsFromChannel(
  token: string,
  teamId: string,
  channelId: string,
): Promise<RecordingFile[]> {
  // List files in the channel's filesFolder/Recordings directory
  const folderRes = await fetch(
    `https://graph.microsoft.com/v1.0/teams/${teamId}/channels/${channelId}/filesFolder`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!folderRes.ok) {
    throw new Error(`Failed to get channel filesFolder: ${folderRes.status}`);
  }

  const folder = await folderRes.json();
  const driveId = folder.parentReference?.driveId;
  const folderId = folder.id;

  if (!driveId || !folderId) {
    throw new Error('Missing driveId or folderId from filesFolder');
  }

  // Try to list files in the "Recordings" subfolder
  const recordingsRes = await fetch(
    `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${folderId}:/Recordings:/children` +
    `?$select=name,webUrl,createdDateTime,size&$orderby=createdDateTime desc&$top=50`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!recordingsRes.ok) {
    // Recordings folder might not exist, try root of channel files
    console.log('[sync-now] No Recordings subfolder, checking channel root for video files');
    const rootRes = await fetch(
      `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${folderId}/children` +
      `?$select=name,webUrl,createdDateTime,size&$orderby=createdDateTime desc&$top=50`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!rootRes.ok) return [];
    const rootData = await rootRes.json();
    return (rootData.value || []).filter((f: any) =>
      f.name?.match(/\.(mp4|mkv)$/i)
    );
  }

  const data = await recordingsRes.json();
  return (data.value || []).filter((f: any) =>
    f.name?.match(/\.(mp4|mkv)$/i)
  );
}

/**
 * Match a SharePoint recording file to a scheduled class by date and time.
 * Recording filenames typically contain the meeting date or title.
 */
function matchRecordingToClass(
  recordings: RecordingFile[],
  cls: { scheduled_date: string; start_time: string; title: string },
): RecordingFile | null {
  if (recordings.length === 0) return null;

  const classDate = cls.scheduled_date; // "2026-04-12"
  const classTitle = cls.title.toLowerCase();

  for (const rec of recordings) {
    const recDate = rec.createdDateTime.substring(0, 10); // "2026-04-12"
    const recName = rec.name.toLowerCase();

    // Match by creation date
    if (recDate !== classDate) continue;

    // If multiple recordings on the same date, try to match by time or title
    // Recordings created within ~30 min of class start time are a likely match
    const classStartHour = parseInt(cls.start_time.substring(0, 2), 10);
    const recHourUTC = new Date(rec.createdDateTime).getUTCHours();
    // IST = UTC+5:30, so class start in UTC is roughly classStartHour - 5.5
    const classStartUTC = classStartHour - 5.5;
    const hourDiff = Math.abs(recHourUTC - classStartUTC);

    if (hourDiff <= 1.5) return rec;

    // Also check if the recording name contains part of the class title
    const titleWords = classTitle.split(/\s+/).filter(w => w.length > 3);
    const nameMatch = titleWords.some(w => recName.includes(w));
    if (nameMatch) return rec;
  }

  // If only one recording on that date, return it even without time match
  const sameDateRecs = recordings.filter(r => r.createdDateTime.substring(0, 10) === classDate);
  if (sameDateRecs.length === 1) return sameDateRecs[0];

  return null;
}

// ─── OnlineMeetings recording fetch helpers (fallback) ──────────────────────

/**
 * Extract the organizer OID from a Teams join URL.
 * The join URL contains a context parameter with {"Tid":"...","Oid":"..."}.
 */
function extractOidFromJoinUrl(joinUrl: string): string | null {
  try {
    const url = new URL(joinUrl);
    const context = url.searchParams.get('context');
    if (!context) return null;
    const parsed = JSON.parse(context);
    return parsed.Oid || null;
  } catch {
    // Join URL might be encoded differently, try regex
    const match = joinUrl.match(/%22Oid%22%3a%22([a-f0-9-]+)%22/i);
    return match ? match[1] : null;
  }
}

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
