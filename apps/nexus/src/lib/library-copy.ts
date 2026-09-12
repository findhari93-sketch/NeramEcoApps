/**
 * Copying a class recording out of a personal OneDrive into the Neram library:
 * the parts that need no network.
 *
 * WHY IT EXISTS. On 2026-09-11 both recordings on the first prod chapter sat in
 * personal OneDrives (one teacher's each), so both showed "Needs a fix", and
 * the teachers who own them had never used SharePoint. Moving a file by hand
 * means learning a site, a library and a Move dialog. Nexus can copy it instead,
 * with the permission it already holds (Files.ReadWrite.All, app-only).
 *
 * Pure, with no server imports, so the recordings page names the same folder
 * the server copies into and says the same thing when a copy fails.
 * lib/library-copy-graph.ts does the Graph calls.
 */

/** Where recordings live inside the library when SHAREPOINT_VIDEO_ROOT is unset. */
export const DEFAULT_VIDEO_ROOT = 'nexus/class-videos';

/** Characters SharePoint refuses in a file or folder name. */
const REFUSED = /["*:<>?/\\|]/g;
const MAX_FOLDER_NAME = 100;

function withoutControlCharacters(text: string): string {
  return text
    .split('')
    .map((ch) => (ch.charCodeAt(0) < 32 || ch.charCodeAt(0) === 127 ? ' ' : ch))
    .join('');
}

const trimEnd = (text: string) => text.replace(/[.\s]+$/, '');

/**
 * The folder a chapter's recordings are copied into, named after the chapter
 * so a teacher browsing SharePoint recognises it.
 *
 * "Ch:1 History Of Architecture" has a colon, which SharePoint refuses, so the
 * refused characters become spaces. A name may not end in a dot or a space
 * either, and a very long title is cut to keep the whole path short.
 */
export function chapterFolderName(title: string | null | undefined): string {
  const cleaned = trimEnd(withoutControlCharacters(title || '').replace(REFUSED, ' ').replace(/\s+/g, ' ').trim());
  return trimEnd(cleaned.slice(0, MAX_FOLDER_NAME)) || 'Chapter';
}

export function libraryVideoRootSegments(root?: string | null): string[] {
  return (root || DEFAULT_VIDEO_ROOT)
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function siteNameFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const match = new URL(url).pathname.match(/^\/(?:sites|teams)\/([^/]+)/i);
    return match ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}

/**
 * "NeramStorage › nexus › class-videos › Ch 1 History Of Architecture", the
 * trail a teacher would click through in SharePoint to find the copy.
 */
export function libraryDestinationPath(input: {
  folderUrl: string | null | undefined;
  rootPath: string | null | undefined;
  chapterTitle: string | null | undefined;
}): string {
  return [
    siteNameFromUrl(input.folderUrl) || 'Neram library',
    ...libraryVideoRootSegments(input.rootPath),
    chapterFolderName(input.chapterTitle),
  ].join(' › ');
}

/**
 * Whether an address is a Graph copy progress address, and nothing else.
 *
 * The status route fetches this address server-side, so it is checked before
 * it is sealed for the page and again when the page hands it back. Only https,
 * only a SharePoint or OneDrive host, only a copy progress path, in either of
 * two shapes: the documented ".../monitor/{id}", and the one this tenant
 * actually returned on 2026-09-11, ".../_api/v2.1/drives/{drive}/operations/{id}".
 * Accepting only the first made every live copy fail.
 */
export function isMonitorUrl(raw: unknown): raw is string {
  if (typeof raw !== 'string' || !raw || raw.length > 4096) return false;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return false;
  const host = url.hostname.toLowerCase();
  const allowedHost = host === 'api.onedrive.com' || /^[a-z0-9-]+\.sharepoint\.com$/.test(host);
  const path = url.pathname;
  const progressPath =
    /\/monitor\/[^/]+$/i.test(path) || /\/_api\/v2\.[01]\/drives\/[^/]+\/operations\/[^/]+$/i.test(path);
  return allowedHost && progressPath;
}

export type CopyStatus =
  | { state: 'copying'; percent: number | null }
  | { state: 'done'; itemId: string }
  | { state: 'failed'; code: string; message: string };

/**
 * Microsoft's progress report for a copy (asyncJobStatus), reduced to three
 * answers. Anything unrecognised is read as still running, because the page
 * gives up on its own after a while and a copy wrongly called failed would send
 * a teacher off to do by hand what is about to finish.
 */
export function parseCopyStatus(body: unknown): CopyStatus {
  const report = (body && typeof body === 'object' ? body : {}) as Record<string, any>;
  const status = typeof report.status === 'string' ? report.status.toLowerCase() : '';

  if (status === 'completed') {
    return typeof report.resourceId === 'string' && report.resourceId
      ? { state: 'done', itemId: report.resourceId }
      : { state: 'failed', code: 'COPY_NO_RESULT', message: 'The copy finished without naming the new file.' };
  }

  if (status === 'failed' || status === 'deletefailed' || status === 'cancelled') {
    const error = report.error && typeof report.error === 'object' ? report.error : {};
    const detail = Array.isArray(error.details)
      ? error.details.find((d: unknown) => d && typeof (d as { code?: unknown }).code === 'string')
      : null;
    return {
      state: 'failed',
      code: (typeof error.code === 'string' && error.code) || detail?.code || 'COPY_FAILED',
      message: (typeof error.message === 'string' && error.message) || detail?.message || 'The copy did not finish.',
    };
  }

  const reported = report.percentageComplete ?? report.percentComplete;
  const value = Number(reported);
  const percent = reported == null || !Number.isFinite(value) ? null : Math.max(0, Math.min(100, Math.round(value)));
  return { state: 'copying', percent };
}

/** What a teacher is told when a copy fails, never Microsoft's code. */
export function copyFailureMessage(code: string | null | undefined): string {
  switch ((code || '').toLowerCase()) {
    case 'namealreadyexists':
      return 'A video with this name is already in the chapter folder. Press Copy to Neram library again to use it.';
    case 'quotalimitreached':
    case 'insufficientstorage':
      return 'The Neram library is out of space. Ask an admin to free some up or add SharePoint storage, then try again.';
    case 'accessdenied':
    case 'no_access':
      return 'Nexus is not allowed to copy this file. Ask its owner to move it into the Neram library in SharePoint instead.';
    case 'not_found':
      return 'This video could not be found in SharePoint. It may have been moved or deleted.';
    case 'copy_no_result':
    case 'copy_unknown':
      return 'SharePoint lost track of this copy. Press Copy to Neram library again, and a copy that finished is used.';
    case 'copy_timeout':
      return 'The copy is taking longer than usual. It keeps going in SharePoint, so press Copy to Neram library again later to use it.';
    case 'graph_unavailable':
      return 'SharePoint did not answer just now. Try again in a moment.';
    default:
      return 'The copy did not finish. Try again.';
  }
}

export interface DriveChild {
  id?: string;
  name?: string;
  size?: number;
  folder?: unknown;
}

/**
 * A copy of this file that already finished in the destination folder.
 *
 * It is what makes pressing Copy again safe: after a teacher left mid-copy, or
 * a progress report was lost, the finished file is used rather than copied a
 * second time. Name AND size, because a half-written file or a different video
 * with the same name must not be taken for it. An unknown size matches nothing.
 */
export function findFinishedCopy<T extends DriveChild>(
  children: T[],
  source: { name: string | null | undefined; sizeBytes: number | null | undefined },
): T | null {
  if (!source.name || !source.sizeBytes || source.sizeBytes <= 0) return null;
  const name = source.name.trim().toLowerCase();
  return (
    children.find(
      (child) =>
        !child.folder &&
        typeof child.name === 'string' &&
        child.name.trim().toLowerCase() === name &&
        child.size === source.sizeBytes,
    ) ?? null
  );
}
