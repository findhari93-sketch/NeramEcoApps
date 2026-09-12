/**
 * A class recording in SharePoint: which file a link means, whether it may be
 * used, and what a teacher needs to recognise it.
 *
 * WHY THIS EXISTS. The recordings screen named a Tamil class video
 * "DispForm.aspx", because that is the last segment of the link SharePoint
 * search hands back for a file in a document library. Probed against this tenant
 * on 2026-09-11, every link shape a teacher can produce resolves through one of
 * two Graph calls, and both return the file's real address, name, folder, size
 * and length:
 *
 *   /shares/{encoded link}/driveItem   a pasted link of any shape, including the
 *                                      list form "Forms/DispForm.aspx?ID=10171"
 *   /drives/{driveId}/items/{itemId}   a file picked in Nexus, by its ids
 *
 * So a recording is always stored by the address Graph returns, never by the
 * link it arrived as.
 *
 * WHERE A RECORDING MAY LIVE is a policy, not a technical limit, and the code
 * says so. The same probe showed the app CAN read a file in a teacher's OneDrive.
 * Recordings still have to live in the shared Neram SharePoint library, so they
 * stay available whoever recorded them and whatever happens to that account.
 * OneDrive for Business reports driveType "business", not "personal", which is
 * why isOneDriveItem checks both and the address as well.
 *
 * App-only token throughout: the byte proxy that plays a recording to students
 * reads it app-only, so a file resolved here is a file students can be served.
 */

import { getAppOnlyToken } from './graph-app-token';
import { getSiteId } from './sharepoint';
import { encodeSharingUrl } from './sharepoint-transcript';
import { extractYouTubeId } from './youtube';

const GRAPH = 'https://graph.microsoft.com/v1.0';
const SELECT = '$select=id,name,size,file,folder,video,webUrl,parentReference';

/* ── Where recordings go ────────────────────────────────────────────────────── */

/**
 * The SharePoint folder a teacher opens to put a recording into the library,
 * behind the "Open the Class videos folder" link.
 *
 * The configured folder (SHAREPOINT_VIDEO_ROOT, "nexus/class-videos") did not
 * exist on this tenant when probed on 2026-09-11. A link that 404s would strand
 * the teacher at exactly the step it exists for, so it falls back to the nearest
 * folder on that path that does exist, then to the library itself.
 *
 * Remembered for an hour, because it does not change. A failure is not
 * remembered, so a moment where SharePoint was busy does not stick.
 */
const LIBRARY_FOLDER_TTL_MS = 60 * 60 * 1000;
let libraryFolder: { url: string; at: number } | null = null;

/** Test seam. */
export function clearLibraryFolderCache(): void {
  libraryFolder = null;
}

async function webUrlAt(url: string, token: string): Promise<string | null> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return null;
  const body = await res.json().catch(() => null);
  return typeof body?.webUrl === 'string' && body.webUrl ? body.webUrl : null;
}

export async function getLibraryVideoFolderUrl(): Promise<string | null> {
  if (libraryFolder && Date.now() - libraryFolder.at < LIBRARY_FOLDER_TTL_MS) return libraryFolder.url;
  try {
    const token = await getAppOnlyToken();
    const siteId = await getSiteId(token);
    const segments = (process.env.SHAREPOINT_VIDEO_ROOT || 'nexus/class-videos')
      .split('/')
      .map((segment) => segment.trim())
      .filter(Boolean);

    let url: string | null = null;
    for (let depth = segments.length; depth > 0 && !url; depth--) {
      const path = segments.slice(0, depth).map(encodeURIComponent).join('/');
      url = await webUrlAt(`${GRAPH}/sites/${siteId}/drive/root:/${path}?$select=webUrl`, token);
    }
    if (!url) url = await webUrlAt(`${GRAPH}/sites/${siteId}/drive?$select=webUrl`, token);

    if (url) libraryFolder = { url, at: Date.now() };
    return url;
  } catch {
    // No library configured, or no token. The page simply leaves the link out.
    return null;
  }
}

/* ── Reading a link ─────────────────────────────────────────────────────────── */

export type RecordingLinkShape =
  | 'youtube'
  | 'teams_recap'
  | 'stream_page'
  | 'list_form'
  | 'share_link'
  | 'file_path'
  | 'not_sharepoint'
  | 'invalid';

export interface ClassifiedRecordingLink {
  shape: RecordingLinkShape;
  /** What to hand Graph: the file inside a wrapper link, else the input itself. */
  url: string;
  host: string | null;
  /** The address is a OneDrive one. The resolved drive type is the final word. */
  oneDrive: boolean;
}

const isSharePointHost = (host: string) => host.endsWith('.sharepoint.com');
const isOneDriveHost = (host: string) => host.endsWith('-my.sharepoint.com');

export function classifyRecordingLink(raw: string): ClassifiedRecordingLink {
  const input = (raw || '').trim();
  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    return { shape: 'invalid', url: input, host: null, oneDrive: false };
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return { shape: 'invalid', url: input, host: null, oneDrive: false };
  }

  const host = parsed.hostname.toLowerCase();

  if (isSharePointHost(host)) {
    const oneDrive = isOneDriveHost(host);
    const path = parsed.pathname;

    // The Stream player names the file it plays in ?id=, as a server-relative
    // path. The player page itself is not a file Graph can look up.
    if (/\/_layouts\/15\/(stream|embed)\.aspx$/i.test(path)) {
      const id = parsed.searchParams.get('id');
      const url = id && id.startsWith('/') ? `${parsed.protocol}//${parsed.host}${encodeURI(id)}` : input;
      return { shape: 'stream_page', url, host, oneDrive };
    }
    if (/\/Forms\/DispForm\.aspx$/i.test(path)) return { shape: 'list_form', url: input, host, oneDrive };
    if (/^\/:[a-z]:\//i.test(path)) return { shape: 'share_link', url: input, host, oneDrive };
    return { shape: 'file_path', url: input, host, oneDrive };
  }

  // What Teams copies for a class recording: a recap page whose fileUrl
  // parameter is the only part that points at the video.
  if (host.endsWith('teams.microsoft.com')) {
    const inner = parsed.searchParams.get('fileUrl');
    if (inner) {
      const innerLink = classifyRecordingLink(inner);
      if (!['invalid', 'not_sharepoint', 'youtube'].includes(innerLink.shape)) {
        return { ...innerLink, shape: 'teams_recap' };
      }
    }
    return { shape: 'not_sharepoint', url: input, host, oneDrive: false };
  }

  if (extractYouTubeId(input)) return { shape: 'youtube', url: input, host, oneDrive: false };
  return { shape: 'not_sharepoint', url: input, host, oneDrive: false };
}

/* ── The file ───────────────────────────────────────────────────────────────── */

export interface ResolvedVideoItem {
  driveId: string;
  itemId: string;
  name: string;
  sizeBytes: number | null;
  /** Rounded to the second. Null until SharePoint has measured the video. */
  durationSeconds: number | null;
  /** The file's own address, never a list form or sharing link. */
  webUrl: string;
  /** The folder inside its library, e.g. "nexus/class-videos". Null at the top. */
  folderPath: string | null;
  driveType: string | null;
  mimeType: string | null;
  isFolder: boolean;
}

/**
 * "/drives/b!xxx/root:/nexus/class-videos" is drive plumbing up to "root:"; only
 * what follows is a folder a teacher would recognise.
 */
function folderPathOf(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const marker = raw.indexOf('root:');
  if (marker < 0) return null;
  const rel = raw.slice(marker + 'root:'.length).replace(/^\/+|\/+$/g, '');
  if (!rel) return null;
  try {
    return decodeURIComponent(rel);
  } catch {
    return rel;
  }
}

export function toResolvedVideoItem(item: any): ResolvedVideoItem {
  // Graph reports video length in milliseconds.
  const ms = Number(item?.video?.duration);
  return {
    driveId: String(item?.parentReference?.driveId ?? ''),
    itemId: String(item?.id ?? ''),
    name: item?.name || 'Untitled video',
    sizeBytes: typeof item?.size === 'number' ? item.size : null,
    durationSeconds: Number.isFinite(ms) && ms > 0 ? Math.round(ms / 1000) : null,
    webUrl: item?.webUrl || '',
    folderPath: folderPathOf(item?.parentReference?.path),
    driveType: item?.parentReference?.driveType ?? null,
    mimeType: item?.file?.mimeType || null,
    isFolder: !!item?.folder,
  };
}

/** Same list the SharePoint picker filters on. */
const VIDEO_EXT = /\.(mp4|mkv|mov|webm|m4v|avi|wmv|mpe?g|3gp)$/i;

export function isVideoItem(item: Pick<ResolvedVideoItem, 'name' | 'mimeType' | 'isFolder'>): boolean {
  if (item.isFolder) return false;
  if ((item.mimeType || '').toLowerCase().startsWith('video/')) return true;
  // SharePoint hands back an empty or generic type often enough that the
  // extension has to count too.
  return VIDEO_EXT.test(item.name || '');
}

export function isOneDriveItem(item: { webUrl?: string | null; driveType?: string | null }): boolean {
  const type = (item.driveType || '').toLowerCase();
  if (type === 'personal' || type === 'business') return true;
  try {
    const url = new URL(item.webUrl || '');
    return isOneDriveHost(url.hostname.toLowerCase()) || url.pathname.startsWith('/personal/');
  } catch {
    return false;
  }
}

export type RecordingPolicyProblem = 'RECORDING_IN_ONEDRIVE' | 'NOT_A_VIDEO';

/** Why this file cannot be a class recording, or null when it can. */
export function recordingPolicyProblem(item: ResolvedVideoItem): RecordingPolicyProblem | null {
  if (!isVideoItem(item)) return 'NOT_A_VIDEO';
  if (isOneDriveItem(item)) return 'RECORDING_IN_ONEDRIVE';
  return null;
}

/** A file as the recordings page receives it, the same from every route. */
export function videoItemDto(item: ResolvedVideoItem) {
  return {
    drive_id: item.driveId,
    item_id: item.itemId,
    name: item.name,
    size_bytes: item.sizeBytes,
    duration_seconds: item.durationSeconds,
    web_url: item.webUrl,
    folder_path: item.folderPath,
    drive_type: item.driveType,
  };
}

/* ── Is it the same recording? ──────────────────────────────────────────────── */

export interface RecordingFingerprint {
  driveId?: string | null;
  itemId?: string | null;
  name?: string | null;
  sizeBytes?: number | null;
  durationSeconds?: number | null;
}

export type SameRecordingVerdict = 'same' | 'likely' | 'different';

/** Two measurements of one video disagree by a rounding at most. */
export const SAME_DURATION_TOLERANCE_SECONDS = 2;

function nameStem(name?: string | null): string {
  const clean = (name || '').trim().toLowerCase();
  const cut = clean.lastIndexOf('.');
  return cut > 0 ? clean.slice(0, cut) : clean;
}

/**
 * Whether a replacement video is the recording already attached, moved.
 *
 * It decides whether a teacher who moves a file into the library may keep the
 * checkpoints cut from it. `same` is certain (the same file, or the same size
 * and name); `likely` means only the length matches, which a teacher confirms
 * because a trimmed or re-exported copy would put every quiz mid-sentence.
 */
export function sameRecording(a: RecordingFingerprint, b: RecordingFingerprint): SameRecordingVerdict {
  if (a.driveId && a.itemId && a.driveId === b.driveId && a.itemId === b.itemId) return 'same';

  const stem = nameStem(a.name);
  if (a.sizeBytes && a.sizeBytes > 0 && a.sizeBytes === b.sizeBytes && stem && stem === nameStem(b.name)) {
    return 'same';
  }

  const da = a.durationSeconds;
  const db = b.durationSeconds;
  if (
    typeof da === 'number' &&
    typeof db === 'number' &&
    da > 0 &&
    db > 0 &&
    Math.abs(da - db) <= SAME_DURATION_TOLERANCE_SECONDS
  ) {
    return 'likely';
  }
  return 'different';
}

/* ── Asking Graph ───────────────────────────────────────────────────────────── */

export type VideoItemErrorCode = 'LINK_NOT_RECOGNISED' | 'NOT_FOUND' | 'NO_ACCESS' | 'GRAPH_UNAVAILABLE';

export class VideoItemError extends Error {
  readonly code: VideoItemErrorCode;

  constructor(code: VideoItemErrorCode, message?: string) {
    super(message || code);
    this.name = 'VideoItemError';
    this.code = code;
  }
}

export function graphStatusToCode(status: number): VideoItemErrorCode {
  if (status === 400) return 'LINK_NOT_RECOGNISED';
  if (status === 401 || status === 403) return 'NO_ACCESS';
  if (status === 404 || status === 410) return 'NOT_FOUND';
  // Throttling and outages are Microsoft being busy, never the teacher's link.
  return 'GRAPH_UNAVAILABLE';
}

export type VideoItemRef = string | { driveId: string; itemId: string };

export async function resolveVideoItem(input: VideoItemRef): Promise<ResolvedVideoItem> {
  let url: string;
  if (typeof input === 'string') {
    const link = classifyRecordingLink(input);
    if (link.shape === 'invalid' || link.shape === 'not_sharepoint' || link.shape === 'youtube') {
      throw new VideoItemError('LINK_NOT_RECOGNISED');
    }
    url = `${GRAPH}/shares/${encodeSharingUrl(link.url)}/driveItem?${SELECT}`;
  } else {
    if (!input.driveId || !input.itemId) throw new VideoItemError('LINK_NOT_RECOGNISED');
    url = `${GRAPH}/drives/${encodeURIComponent(input.driveId)}/items/${encodeURIComponent(input.itemId)}?${SELECT}`;
  }

  let res: Response;
  try {
    const token = await getAppOnlyToken();
    res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  } catch {
    throw new VideoItemError('GRAPH_UNAVAILABLE');
  }
  if (!res.ok) throw new VideoItemError(graphStatusToCode(res.status));

  const body = await res.json().catch(() => null);
  if (!body?.id) throw new VideoItemError('GRAPH_UNAVAILABLE');
  return toResolvedVideoItem(body);
}

/**
 * The same, remembered for ten minutes in this process.
 *
 * The recordings page lists every language's video on each load, and a lookup is
 * a Graph round trip. Nothing here is a secret or expires quickly, unlike the
 * download URL the byte proxy caches. Failures are never remembered, so a
 * throttled moment does not stick.
 */
const TTL_MS = 10 * 60 * 1000;
const MAX_ENTRIES = 300;
const cache = new Map<string, { item: ResolvedVideoItem; at: number }>();

const cacheKey = (input: VideoItemRef) =>
  typeof input === 'string' ? `url:${input.trim()}` : `ids:${input.driveId}:${input.itemId}`;

export async function resolveVideoItemCached(input: VideoItemRef): Promise<ResolvedVideoItem> {
  const key = cacheKey(input);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.item;

  const item = await resolveVideoItem(input);
  cache.set(key, { item, at: Date.now() });
  if (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  return item;
}

/** Forget one lookup, e.g. after the file behind a link was replaced. */
export function forgetVideoItem(input: VideoItemRef): void {
  cache.delete(cacheKey(input));
}

/** Test seam: drop everything. */
export function clearVideoItemCache(): void {
  cache.clear();
}

/**
 * A short-lived, pre-authenticated picture of the video.
 *
 * Handed to the browser as a URL rather than proxied as bytes, because an <img>
 * cannot send the bearer token every Nexus route requires. Null, never a throw:
 * a missing thumbnail is a grey box, not an error.
 */
export async function getDriveItemThumbnailUrl(
  driveId: string,
  itemId: string,
  size: 'small' | 'medium' | 'large' = 'large',
): Promise<string | null> {
  try {
    const token = await getAppOnlyToken();
    const res = await fetch(
      `${GRAPH}/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}/thumbnails/0/${size}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) return null;
    const body = await res.json().catch(() => null);
    return typeof body?.url === 'string' ? body.url : null;
  } catch {
    return null;
  }
}

/* ── What the teacher is told ───────────────────────────────────────────────── */

// Kept in a module with no server imports, so the recordings page can say the
// same thing the routes do.
export { videoItemMessage } from './recording-messages';
