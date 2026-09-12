/**
 * Copying a class recording from a personal OneDrive into the Neram library,
 * against Microsoft Graph, app-only.
 *
 * Graph copies a file in the background (driveItem copy): the request answers
 * 202 with a progress address in `Location`, which is read WITHOUT a token until
 * it reports the new file's id (long-running actions pattern, learn.microsoft.com
 * /graph/long-running-actions-overview). The copy takes the destination
 * folder's permissions, so a file that was shared with "anyone with the link"
 * in OneDrive is private again once it is in the library.
 *
 * Nothing is stored about a running copy. The page keeps the progress address;
 * if it is lost, pressing Copy again finds the finished file by name and size
 * (findFinishedCopy) instead of copying twice.
 */

import { getAppOnlyToken } from './graph-app-token';
import { getSiteId } from './sharepoint';
import { findFinishedCopy, isMonitorUrl, parseCopyStatus } from './library-copy';
import {
  graphStatusToCode,
  resolveVideoItem,
  toResolvedVideoItem,
  VideoItemError,
  type ResolvedVideoItem,
} from './sharepoint-video';

const GRAPH = 'https://graph.microsoft.com/v1.0';
const ITEM_SELECT = '$select=id,name,size,file,folder,video,webUrl,parentReference';
const enc = encodeURIComponent;

export interface LibraryFolder {
  driveId: string;
  folderId: string;
  /** The folder inside the library, e.g. "nexus/class-videos/Ch 1 History Of Architecture". */
  path: string;
}

async function graph(url: string, init: RequestInit = {}): Promise<Response> {
  try {
    const token = await getAppOnlyToken();
    return await fetch(url, {
      ...init,
      headers: {
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        Authorization: `Bearer ${token}`,
      },
    });
  } catch {
    throw new VideoItemError('GRAPH_UNAVAILABLE');
  }
}

interface FolderRef {
  id: string;
  driveId: string;
}

async function readFolder(res: Response, fallbackDriveId = ''): Promise<FolderRef> {
  const body = await res.json().catch(() => null);
  if (!body?.id) throw new VideoItemError('GRAPH_UNAVAILABLE');
  return { id: String(body.id), driveId: String(body.parentReference?.driveId || fallbackDriveId) };
}

/**
 * The library folder for these path segments, making whichever of them are
 * missing. The usual case, the folder already there, is one call.
 */
export async function ensureLibraryFolder(segments: string[]): Promise<LibraryFolder> {
  const clean = segments.map((segment) => segment.trim()).filter(Boolean);
  if (!clean.length) throw new Error('ensureLibraryFolder needs at least one folder name');

  let siteId: string;
  try {
    siteId = await getSiteId(await getAppOnlyToken());
  } catch {
    throw new VideoItemError('GRAPH_UNAVAILABLE');
  }
  const drive = `${GRAPH}/sites/${enc(siteId)}/drive`;

  const lookup = async (depth: number): Promise<FolderRef | null> => {
    const path = clean.slice(0, depth).map(enc).join('/');
    const res = await graph(`${drive}/root:/${path}?$select=id,name,folder,parentReference`);
    if (res.status === 404) return null;
    if (!res.ok) throw new VideoItemError(graphStatusToCode(res.status));
    return readFolder(res);
  };
  const found = (folder: FolderRef): LibraryFolder => ({
    driveId: folder.driveId,
    folderId: folder.id,
    path: clean.join('/'),
  });

  const whole = await lookup(clean.length);
  if (whole) return found(whole);

  // Walk down from the top, making each missing folder inside the one above.
  let parent: FolderRef | null = null;
  for (let depth = 1; depth <= clean.length; depth++) {
    const existing = await lookup(depth);
    if (existing) {
      parent = existing;
      continue;
    }

    if (!parent) {
      const root = await graph(`${drive}/root?$select=id,parentReference`);
      if (!root.ok) throw new VideoItemError(graphStatusToCode(root.status));
      parent = await readFolder(root);
    }

    const above: FolderRef = parent;
    const createUrl = above.driveId
      ? `${GRAPH}/drives/${enc(above.driveId)}/items/${enc(above.id)}/children`
      : `${drive}/items/${enc(above.id)}/children`;
    const res = await graph(createUrl, {
      method: 'POST',
      body: JSON.stringify({ name: clean[depth - 1], folder: {}, '@microsoft.graph.conflictBehavior': 'fail' }),
    });

    if (res.status === 409) {
      // Another request made it between the look and the create. Use theirs.
      const raced = await lookup(depth);
      if (!raced) throw new VideoItemError('GRAPH_UNAVAILABLE');
      parent = raced;
      continue;
    }
    if (!res.ok) throw new VideoItemError(graphStatusToCode(res.status));
    parent = await readFolder(res, above.driveId);
  }

  return found(parent!);
}

export type LibraryCopyStart =
  | { state: 'done'; item: ResolvedVideoItem }
  | { state: 'copying'; monitor: string };

/**
 * Copy the file into the folder, or use the copy that is already there.
 *
 * No `name` in the request: the copy keeps the original's name, which is what
 * findFinishedCopy looks for, and Graph documents that passing one makes it
 * ignore other copy options. A clash with a DIFFERENT file of that name is
 * renamed ("name 1.mp4") rather than overwriting it.
 */
export async function startLibraryCopy(source: ResolvedVideoItem, dest: LibraryFolder): Promise<LibraryCopyStart> {
  const listed = await graph(`${GRAPH}/drives/${enc(dest.driveId)}/items/${enc(dest.folderId)}/children?${ITEM_SELECT}&$top=200`);
  if (!listed.ok) throw new VideoItemError(graphStatusToCode(listed.status));
  const children = ((await listed.json().catch(() => null))?.value ?? []) as Array<Record<string, any>>;

  const finished = findFinishedCopy(children, source);
  if (finished) return { state: 'done', item: toResolvedVideoItem(finished) };

  const res = await graph(
    `${GRAPH}/drives/${enc(source.driveId)}/items/${enc(source.itemId)}/copy?@microsoft.graph.conflictBehavior=rename`,
    {
      method: 'POST',
      body: JSON.stringify({ parentReference: { driveId: dest.driveId, id: dest.folderId } }),
    },
  );
  if (!res.ok) throw new VideoItemError(graphStatusToCode(res.status));

  const monitor = res.headers.get('Location');
  if (!monitor || !isMonitorUrl(monitor)) throw new VideoItemError('GRAPH_UNAVAILABLE');
  return { state: 'copying', monitor };
}

export type LibraryCopyProgress =
  | { state: 'copying'; percent: number | null }
  | { state: 'done'; item: ResolvedVideoItem }
  | { state: 'failed'; code: string; message: string };

async function finishedItem(itemId: string, driveId: string): Promise<LibraryCopyProgress> {
  try {
    return { state: 'done', item: await resolveVideoItem({ driveId, itemId }) };
  } catch (err) {
    // Reported finished a moment before the file can be read. Ask again.
    if (err instanceof VideoItemError && (err.code === 'NOT_FOUND' || err.code === 'GRAPH_UNAVAILABLE')) {
      return { state: 'copying', percent: 100 };
    }
    throw err;
  }
}

/**
 * How a copy is getting on, and the new file once it has finished.
 *
 * The progress address is fetched with NO Authorization header. It needs none,
 * and sending the app's token to it would hand that token to whatever host the
 * address names, which is also why isMonitorUrl is checked first.
 */
export async function readLibraryCopy(monitor: string, destDriveId: string): Promise<LibraryCopyProgress> {
  if (!isMonitorUrl(monitor)) throw new VideoItemError('LINK_NOT_RECOGNISED');

  let res: Response;
  try {
    res = await fetch(monitor, { redirect: 'manual' });
  } catch {
    return { state: 'copying', percent: null };
  }

  if (res.status === 404 || res.status === 410) {
    return { state: 'failed', code: 'COPY_UNKNOWN', message: 'The copy could not be found.' };
  }
  // Some finished copies redirect to the new file instead of reporting it.
  if (res.status >= 300 && res.status < 400) {
    const match = (res.headers.get('Location') || '').match(/\/items\/([^/?#]+)/);
    return match ? finishedItem(decodeURIComponent(match[1]), destDriveId) : { state: 'copying', percent: null };
  }
  // Throttled or busy: not a failure of the copy.
  if (!res.ok) return { state: 'copying', percent: null };

  const status = parseCopyStatus(await res.json().catch(() => null));
  return status.state === 'done' ? finishedItem(status.itemId, destDriveId) : status;
}
