/**
 * Finding the file a Teams class recording landed in.
 *
 * Extracted from api/timetable/recording so the wrap-up summarizer can reuse it.
 * The summarizer needs the recording for a different reason than the sync route
 * does: the SharePoint driveItem behind it is the only unblocked route to the
 * transcript (see lib/transcript-resolver), so a class with no recording_url has
 * no transcript either, even when the file is sitting in the channel folder
 * because nobody pressed Sync.
 *
 * A recording is found as a driveItem, never through /onlineMeetings/{id}/recordings.
 * That endpoint returns `recordingContentUrl`, a Graph URL that only resolves with
 * a bearer token; storing it in recording_url is what made "Watch Recording" fail
 * with `InvalidAuthenticationToken: Access token is empty` for everyone. A
 * driveItem carries a real webUrl that a browser and getSharePointStreamUrl can
 * both use.
 */
import { getAppOnlyToken } from '@/lib/graph-app-token';
import { resolveOrganizerOid } from '@/lib/teams-online-meeting';
import {
  fetchChannelRecordings,
  fetchOrganizerRecordings,
  matchRecordingToClass,
} from '@/lib/channel-recordings';

export interface RecordingLocatorClass {
  classroom_id: string;
  title: string | null;
  scheduled_date: string;
  start_time: string;
  teams_meeting_join_url?: string | null;
  teams_meeting_url?: string | null;
  organizer_email?: string | null;
  teacher_id?: string | null;
}

/**
 * Find this class's recording file and return its browser-openable webUrl.
 *
 * Looks in both places a Teams recording can land, in the order they are likely:
 *   1. The class team's channel document library (`General/Recordings/`), where a
 *      channel meeting stores it and every team member can reach it.
 *   2. The organizer's own OneDrive `Recordings/`, where anything else stores it.
 *
 * Returns null when neither holds a match, so the caller can honestly say the
 * recording is not ready rather than storing a URL that cannot be opened.
 *
 * `organizerOid` is resolved from the class when not supplied, so a caller that
 * has already paid for that lookup can pass it and a caller that has not does
 * not need to know how it works.
 */
export async function findRecordingForClass(
  supabase: any,
  cls: RecordingLocatorClass,
  organizerOid?: string | null,
): Promise<string | null> {
  const target = {
    scheduled_date: cls.scheduled_date,
    start_time: cls.start_time,
    title: cls.title || 'Class',
  };

  let appToken: string;
  try {
    appToken = await getAppOnlyToken();
  } catch (err) {
    console.error('[recording] app-only token unavailable:', err);
    return null;
  }

  const oid =
    organizerOid === undefined
      ? await resolveOrganizerOid(supabase, {
          joinUrl: cls.teams_meeting_join_url || cls.teams_meeting_url || null,
          organizerEmail: cls.organizer_email ?? null,
          teacherId: cls.teacher_id ?? null,
        })
      : organizerOid;

  const { data: classroom } = await supabase
    .from('nexus_classrooms')
    .select('ms_team_id')
    .eq('id', cls.classroom_id)
    .single();

  if (classroom?.ms_team_id) {
    try {
      const matched = matchRecordingToClass(
        await fetchChannelRecordings(appToken, classroom.ms_team_id),
        target,
      );
      if (matched) return matched.webUrl;
    } catch (err) {
      console.error('[recording] channel recording lookup failed:', err);
    }
  }

  if (oid) {
    try {
      const matched = matchRecordingToClass(
        await fetchOrganizerRecordings(appToken, oid),
        target,
        // No fuzzy fallback: a personal OneDrive holds everything the teacher ever
        // recorded, so "the only one that day" would attach a private meeting to
        // a class. Only real time proximity counts here.
        { allowFuzzy: false },
      );
      if (matched) return matched.webUrl;
    } catch (err) {
      console.error('[recording] OneDrive recording lookup failed:', err);
    }
  }

  return null;
}
