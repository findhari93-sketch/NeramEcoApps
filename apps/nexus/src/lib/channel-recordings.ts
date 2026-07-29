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
 * A meeting that is NOT a channel meeting puts its recording somewhere else
 * entirely, in the organizer's own OneDrive, so {@link fetchOrganizerRecordings}
 * covers that second location.
 *
 * Extracted from api/timetable/sync-now so the backfill can reuse it. Three
 * things changed on the way out, all of them bugs in the original:
 *  - the listing never followed `@odata.nextLink`, so anything past the newest
 *    50 files was invisible;
 *  - matching compared a UTC date string against an IST date;
 *  - matching compared whole `getUTCHours()` against `startHour - 5.5`, which is
 *    blind to minutes and wraps at midnight.
 *
 * A fourth, worse one was found later: the listing sent `$orderby`, which Graph
 * rejects on these drives, and the 400 was swallowed into an empty result. See
 * `childrenQuery` for why nothing here may ever sort server-side again.
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
  /** Playing length in ms, from the driveItem's video facet. Absent if Graph did not report one. */
  durationMs?: number;
}

/**
 * Below this, a file is somebody's abandoned recording rather than a class.
 *
 * Anyone in a Teams meeting can press record, and a student who joins early and
 * does so leaves a file carrying the meeting's own name and timestamp. One such
 * file sits against the 28 July class: 64 seconds and 0.2 MB, next to the real
 * 66 minute, 370 MB recording. Every genuine class in this tenant runs 53 to 80
 * minutes at 130 to 450 MB, so three minutes is far above the noise and far
 * below anything real.
 */
export const MIN_RECORDING_DURATION_MS = 3 * 60 * 1000;

/** The size floor used when Graph reports no duration. */
export const MIN_RECORDING_BYTES = 5 * 1024 * 1024;

/**
 * Is this file worth showing to a student?
 *
 * Fails open on purpose. Only positive evidence that a file is trivial rejects
 * it; a recording still being processed can report neither duration nor size,
 * and losing a real class is worse than attaching a short one.
 */
export function isSubstantialRecording(file: RecordingFile): boolean {
  if (file.durationMs != null && file.durationMs > 0) {
    return file.durationMs >= MIN_RECORDING_DURATION_MS;
  }
  if (file.size > 0) return file.size >= MIN_RECORDING_BYTES;
  return true;
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

  const query = childrenQuery(opts);
  const base = `${GRAPH}/drives/${driveId}/items/${folderId}`;

  const fromRecordings = await listVideoFiles(`${base}:/Recordings:/children${query}`, token, maxItems);
  if (!fromRecordings.failure) return fromRecordings.files;
  if (fromRecordings.failure.status !== 404) {
    throw new Error(`Failed to list channel Recordings folder: ${describe(fromRecordings.failure)}`);
  }

  // No Recordings subfolder (older teams, or nothing recorded yet). Fall back to
  // the channel root and keep only the video files.
  const fromRoot = await listVideoFiles(`${base}/children${query}`, token, maxItems);
  if (fromRoot.failure && fromRoot.failure.status !== 404) {
    throw new Error(`Failed to list channel files: ${describe(fromRoot.failure)}`);
  }
  return fromRoot.files;
}

/**
 * Recordings from a user's own OneDrive `Recordings/` folder.
 *
 * A meeting that is not a channel meeting (a personal or group calendar event,
 * whose join URL is on `@thread.v2`) drops its recording here rather than in the
 * team's document library, and shares it only with the people on the invite. So
 * this is the second place a class recording can be, and the only place to look
 * for classes created with the `calendar_event` scope.
 *
 * An organizer who has never recorded to OneDrive simply has no such folder, so
 * a 404 means "nothing recorded", not a fault.
 */
export async function fetchOrganizerRecordings(
  token: string,
  organizerOid: string,
  opts?: RecordingFetchOpts,
): Promise<RecordingFile[]> {
  const maxItems = opts?.maxItems ?? 50;
  const url = `${GRAPH}/users/${organizerOid}/drive/root:/Recordings:/children${childrenQuery(opts)}`;

  const result = await listVideoFiles(url, token, maxItems);
  if (!result.failure) return result.files;
  if (result.failure.status === 404) return [];
  throw new Error(`Failed to list OneDrive Recordings folder: ${describe(result.failure)}`);
}

/**
 * The children query shared by both listings.
 *
 * Deliberately carries NO `$orderby`. Graph rejects it outright on a SharePoint
 * or OneDrive drive (`400 notSupported`), and the old listing sent
 * `$orderby=createdDateTime desc` on every request. Every channel recording was
 * therefore invisible to Nexus for as long as this code has existed, because the
 * 400 was swallowed and reported as an empty folder. Ordering is applied in
 * {@link listVideoFiles} instead.
 */
function childrenQuery(opts?: RecordingFetchOpts): string {
  const top = Math.min(opts?.top ?? 50, 200);
  // `video` carries the playing length, which is how a real class is told from a
  // recording somebody started and abandoned. See isSubstantialRecording.
  return `?$select=name,webUrl,createdDateTime,size,video&$top=${top}`;
}

interface ListFailure {
  status: number;
  body: string;
}

function describe(failure: ListFailure): string {
  return `${failure.status} ${failure.body.slice(0, 300)}`;
}

interface ListResult {
  files: RecordingFile[];
  /** Set when the FIRST page failed, so the caller can tell 404 from a real fault. */
  failure?: ListFailure;
}

/**
 * Page through a driveItem children listing, keeping video files only, newest first.
 *
 * Every page is read before truncating to `maxItems`. Graph hands SharePoint
 * children back in an arbitrary order and will not sort them, so stopping early
 * would keep an arbitrary subset rather than the newest one.
 */
async function listVideoFiles(
  firstUrl: string,
  token: string,
  maxItems: number,
): Promise<ListResult> {
  const out: RecordingFile[] = [];
  let url: string | null = firstUrl;
  let page = 0;

  while (url && page < MAX_PAGES) {
    const res: Response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      // A later page failing still leaves usable results; only the first page
      // failing means we learnt nothing and the caller must be told why.
      if (page > 0) break;
      const body = await res.text().catch(() => '');
      return { files: [], failure: { status: res.status, body } };
    }

    const data = await res.json();
    for (const f of data.value || []) {
      if (!VIDEO_RE.test(f.name || '')) continue;
      out.push({
        name: f.name,
        webUrl: f.webUrl,
        createdDateTime: f.createdDateTime,
        size: f.size ?? 0,
        durationMs: typeof f.video?.duration === 'number' ? f.video.duration : undefined,
      });
    }

    url = data['@odata.nextLink'] || null;
    page++;
  }

  out.sort((a, b) => Date.parse(b.createdDateTime) - Date.parse(a.createdDateTime));
  return { files: out.slice(0, maxItems) };
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
 *
 * Stub recordings are dropped before any of that, so a 64-second file started by
 * a student who joined early can neither beat the real recording on time nor be
 * picked up by a fallback. A class whose only file is a stub reports no
 * recording, which is honest: there is nothing there to watch.
 */
export function matchRecordingToClass(
  all: RecordingFile[],
  cls: { scheduled_date: string; start_time: string; title: string },
  opts?: MatchOpts,
): RecordingFile | null {
  const recordings = all.filter(isSubstantialRecording);
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
