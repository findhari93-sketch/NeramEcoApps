/**
 * Teams channel recordings, read out of the channel's SharePoint files.
 *
 * A channel meeting's recording is not an onlineMeeting artifact you can ask
 * Graph for by id; Teams drops the mp4 into the channel's own document library
 * under `Recordings/`. That folder is therefore two things at once: the way a
 * class gets its `recording_url`, and, because the filename carries the meeting
 * subject and start timestamp, the only record of a class that was started with
 * "Meet now" and so never produced a calendar event.
 *
 * Extracted from api/timetable/sync-now so the backfill can reuse it. Three
 * things changed on the way out, all of them bugs in the original:
 *  - the listing never followed `@odata.nextLink`, so anything past the newest
 *    50 files was invisible;
 *  - matching compared a UTC date string against an IST date;
 *  - matching compared whole `getUTCHours()` against `startHour - 5.5`, which is
 *    blind to minutes and wraps at midnight.
 */

const GRAPH = 'https://graph.microsoft.com/v1.0';

/** Stop following nextLink after this many pages, however large maxItems is. */
const MAX_PAGES = 25;

const VIDEO_RE = /\.(mp4|mkv)$/i;

export interface RecordingFile {
  name: string;
  webUrl: string;
  createdDateTime: string;
  size: number;
}

export interface RecordingFetchOpts {
  /** Page size per Graph request. Default 50. */
  top?: number;
  /** Stop after this many files. Default 50, which is sync-now's old behaviour. */
  maxItems?: number;
}

export interface MatchOpts {
  /** How far a recording's creation time may sit from the class start. Default 1.5. */
  toleranceHours?: number;
  /** Allow the title-word and sole-recording-that-day fallbacks. Default true. */
  allowFuzzy?: boolean;
}

/**
 * The instant an IST wall clock refers to, in ms.
 *
 * The timetable stores naive IST (`date` + `time` columns), so the offset has to
 * be reattached at every boundary. Never build a Date from the bare strings and
 * let the server's own zone decide.
 */
export function istInstantMs(date: string, time: string): number {
  return Date.parse(`${date}T${time.substring(0, 5)}:00+05:30`);
}

/** IST wall-clock ms for a `scheduled_date` + `start_time` pair. */
export function classStartMs(scheduledDate: string, startTime: string): number {
  return istInstantMs(scheduledDate, startTime);
}

/** The IST calendar date of an instant, as YYYY-MM-DD. */
export function istDateOf(iso: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return '';
  // Shift into IST, then read the UTC fields of the shifted instant.
  return new Date(ms + 5.5 * 60 * 60 * 1000).toISOString().substring(0, 10);
}

/**
 * Resolve a team's General channel id, falling back to its primary channel.
 * Returns null rather than throwing when the team has no readable channel.
 */
export async function resolveGeneralChannelId(
  token: string,
  teamId: string,
): Promise<string | null> {
  const res = await fetch(
    `${GRAPH}/teams/${teamId}/channels?$filter=displayName eq 'General'&$select=id`,
    { headers: { Authorization: `Bearer ${token}` } },
  );

  if (res.ok) {
    const data = await res.json();
    const channels = data.value || [];
    if (channels.length > 0) return channels[0].id as string;
  }

  const primaryRes = await fetch(`${GRAPH}/teams/${teamId}/primaryChannel?$select=id`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!primaryRes.ok) return null;
  const primary = await primaryRes.json();
  return (primary?.id as string) || null;
}

/**
 * Fetch recording files from a team's General channel Recordings folder.
 * Channel meeting recordings live in: Team site > General > Recordings/
 */
export async function fetchChannelRecordings(
  token: string,
  teamId: string,
  opts?: RecordingFetchOpts,
): Promise<RecordingFile[]> {
  const channelId = await resolveGeneralChannelId(token, teamId);
  if (!channelId) throw new Error('No General channel found');
  return fetchRecordingsFromChannel(token, teamId, channelId, opts);
}

export async function fetchRecordingsFromChannel(
  token: string,
  teamId: string,
  channelId: string,
  opts?: RecordingFetchOpts,
): Promise<RecordingFile[]> {
  const maxItems = opts?.maxItems ?? 50;
  const top = Math.min(opts?.top ?? 50, 200);

  const folderRes = await fetch(
    `${GRAPH}/teams/${teamId}/channels/${channelId}/filesFolder`,
    { headers: { Authorization: `Bearer ${token}` } },
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

  const query = `?$select=name,webUrl,createdDateTime,size&$orderby=createdDateTime desc&$top=${top}`;
  const recordingsUrl = `${GRAPH}/drives/${driveId}/items/${folderId}:/Recordings:/children${query}`;

  const fromRecordings = await listVideoFiles(recordingsUrl, token, maxItems);
  if (fromRecordings !== null) return fromRecordings;

  // No Recordings subfolder (older teams, or nothing recorded yet). Fall back to
  // the channel root and keep only the video files.
  const rootUrl = `${GRAPH}/drives/${driveId}/items/${folderId}/children${query}`;
  return (await listVideoFiles(rootUrl, token, maxItems)) ?? [];
}

/**
 * Page through a driveItem children listing, keeping video files only.
 * Returns null when the first request fails, so the caller can fall back.
 */
async function listVideoFiles(
  firstUrl: string,
  token: string,
  maxItems: number,
): Promise<RecordingFile[] | null> {
  const out: RecordingFile[] = [];
  let url: string | null = firstUrl;
  let page = 0;

  while (url && out.length < maxItems && page < MAX_PAGES) {
    const res: Response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return page === 0 ? null : out;

    const data = await res.json();
    for (const f of data.value || []) {
      if (!VIDEO_RE.test(f.name || '')) continue;
      out.push({
        name: f.name,
        webUrl: f.webUrl,
        createdDateTime: f.createdDateTime,
        size: f.size ?? 0,
      });
      if (out.length >= maxItems) break;
    }

    url = data['@odata.nextLink'] || null;
    page++;
  }

  return out;
}

/**
 * Read Teams' recording filename convention:
 *   `<Subject>-YYYYMMDD_HHMMSS-Meeting Recording.mp4`
 *
 * The timestamp is the organizer's local wall clock, which for this tenant is
 * IST, so it is returned unzoned in exactly the shape the timetable stores.
 * This is what lets a recording stand in for a missing calendar event.
 */
export function parseRecordingFileName(
  name: string,
): { subject: string; startedAt: string } | null {
  const m = name.match(/^(.+?)-(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})(?:-.*)?\.(?:mp4|mkv)$/i);
  if (!m) return null;

  const [, rawSubject, y, mo, d, hh, mm, ss] = m;
  const subject = rawSubject.replace(/_/g, ' ').trim();
  const month = Number(mo);
  const day = Number(d);
  const hour = Number(hh);
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23) return null;

  return {
    subject: subject || 'Class',
    startedAt: `${y}-${mo}-${d}T${hh}:${mm}:${ss}`,
  };
}

/**
 * Match a SharePoint recording to a scheduled class.
 *
 * Ranks every recording by how far its creation time sits from the class start
 * and takes the closest one inside tolerance. Only when nothing is in tolerance
 * does it fall back to a title-word match on the same IST day, and then to
 * "there was only one recording that day".
 */
export function matchRecordingToClass(
  recordings: RecordingFile[],
  cls: { scheduled_date: string; start_time: string; title: string },
  opts?: MatchOpts,
): RecordingFile | null {
  if (recordings.length === 0) return null;

  const toleranceMs = (opts?.toleranceHours ?? 1.5) * 60 * 60 * 1000;
  const allowFuzzy = opts?.allowFuzzy ?? true;
  const startMs = classStartMs(cls.scheduled_date, cls.start_time);
  if (Number.isNaN(startMs)) return null;

  let best: RecordingFile | null = null;
  let bestDelta = Number.POSITIVE_INFINITY;

  for (const rec of recordings) {
    const recMs = Date.parse(rec.createdDateTime);
    if (Number.isNaN(recMs)) continue;
    const delta = Math.abs(recMs - startMs);
    if (delta < bestDelta) {
      bestDelta = delta;
      best = rec;
    }
  }

  if (best && bestDelta <= toleranceMs) return best;
  if (!allowFuzzy) return null;

  const sameDay = recordings.filter((r) => istDateOf(r.createdDateTime) === cls.scheduled_date);
  if (sameDay.length === 0) return null;

  const titleWords = cls.title
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 3);
  const byTitle = sameDay.find((r) => {
    const recName = r.name.toLowerCase();
    return titleWords.some((w) => recName.includes(w));
  });
  if (byTitle) return byTitle;

  return sameDay.length === 1 ? sameDay[0] : null;
}
