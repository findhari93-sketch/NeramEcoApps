/**
 * The SharePoint half of recording trims, app-only.
 *
 * The trim worker runs on a GitHub Actions runner and never holds a Microsoft
 * credential. Nexus hands it two pre-authenticated URLs instead: a download URL
 * for the original (short-lived, from recording-source.ts) and an upload
 * session for the trimmed copy. An upload session URL can write exactly one
 * file at one path and nothing else, so a leaked one is worth very little.
 *
 * The trimmed copy goes in a "Trimmed" folder beside the original, so it lives
 * with the class's other files and inherits the same permissions.
 */

import { getAppOnlyToken } from './graph-app-token';

const GRAPH = 'https://graph.microsoft.com/v1.0';
export const TRIM_FOLDER_NAME = 'Trimmed';

export class TrimGraphError extends Error {
  constructor(
    public code: string,
    public status?: number,
  ) {
    super(code);
  }
}

async function graph(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await getAppOnlyToken();
  return fetch(`${GRAPH}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
    cache: 'no-store',
  });
}

export interface DriveItemRef {
  driveId: string;
  itemId: string;
  parentId: string | null;
  name: string;
  size: number;
  webUrl: string | null;
}

export async function getDriveItem(driveId: string, itemId: string): Promise<DriveItemRef> {
  const res = await graph(
    `/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}?$select=id,name,size,webUrl,parentReference`,
  );
  if (!res.ok) throw new TrimGraphError(res.status === 404 ? 'ITEM_NOT_FOUND' : 'GRAPH_UNAVAILABLE', res.status);
  const item = await res.json();
  return {
    driveId: item?.parentReference?.driveId || driveId,
    itemId: item.id,
    parentId: item?.parentReference?.id ?? null,
    name: item.name,
    size: Number(item.size) || 0,
    webUrl: item.webUrl ?? null,
  };
}

/** The "Trimmed" folder beside the original, created on first use. */
export async function ensureTrimFolder(driveId: string, parentId: string): Promise<string> {
  const base = `/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(parentId)}`;
  const created = await graph(`${base}/children`, {
    method: 'POST',
    body: JSON.stringify({ name: TRIM_FOLDER_NAME, folder: {}, '@microsoft.graph.conflictBehavior': 'fail' }),
  });
  if (created.ok) return (await created.json()).id;
  if (created.status !== 409) throw new TrimGraphError('FOLDER_CREATE_FAILED', created.status);
  // Already there (an earlier trim, or a parallel run).
  const found = await graph(`${base}:/${encodeURIComponent(TRIM_FOLDER_NAME)}?$select=id`);
  if (!found.ok) throw new TrimGraphError('FOLDER_LOOKUP_FAILED', found.status);
  return (await found.json()).id;
}

/** "Class 12 Oct.mp4" becomes "Class 12 Oct (trimmed).mp4". */
export function trimmedFileName(original: string): string {
  const dot = original.lastIndexOf('.');
  const stem = dot > 0 ? original.slice(0, dot) : original;
  return `${stem} (trimmed).mp4`;
}

/**
 * A resumable upload session for the trimmed copy. Replaces an earlier trimmed
 * copy of the same recording, so a retried job never leaves two behind.
 */
export async function createTrimUploadSession(driveId: string, folderId: string, fileName: string): Promise<string> {
  const res = await graph(
    `/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(folderId)}:/${encodeURIComponent(fileName)}:/createUploadSession`,
    { method: 'POST', body: JSON.stringify({ item: { '@microsoft.graph.conflictBehavior': 'replace' } }) },
  );
  if (!res.ok) throw new TrimGraphError('UPLOAD_SESSION_FAILED', res.status);
  const session = await res.json();
  if (!session?.uploadUrl) throw new TrimGraphError('UPLOAD_SESSION_FAILED');
  return session.uploadUrl as string;
}
