/**
 * A chapter's PowerPoint slides: which SharePoint file they are, whether that
 * file may be used, turning it into PDF pages once per version, and handing a
 * reader those pages.
 *
 * WHY PDF. The secure reader is pdf.js, which carries the per-student watermark
 * and the no-download rule. A .pptx handed to a browser can only be downloaded.
 * Microsoft Graph converts the deck (content?format=pdf), and the reader shows
 * it like any chapter PDF.
 *
 * WHY CACHED. A conversion takes seconds. The PDF is made once per SharePoint
 * version and kept in the private study-slides bucket. A student loads it
 * straight from Storage, through the db.neramclasses.com proxy, with a signed
 * link that expires in an hour, so the bytes never pass through a Vercel function.
 *
 * WHY cTag. SharePoint's content tag changes only when the file's content does.
 * Comparing it is how an edited deck reaches students without a teacher
 * attaching it again. The comparison runs at most once per SLIDES_RECHECK_MS per
 * chapter, so a class opening one chapter costs one Graph call, not forty.
 *
 * NEVER BLANK A CHAPTER. When SharePoint cannot be reached, the deck was moved,
 * or a new version will not convert, the problem is recorded for the teacher and
 * students keep getting the last good PDF.
 *
 * Library-only is a policy, as for recordings (see sharepoint-video.ts). App-only
 * token throughout.
 *
 * Server only.
 */

import { createHash } from 'crypto';
import {
  getSupabaseAdminClient,
  getSlidesForFile,
  saveSlides,
  updateSlides,
  type NexusStudyFileSlides,
  type NexusStudySlidesProblem,
} from '@neram/database';
import { getAppOnlyToken } from './graph-app-token';
import { encodeSharingUrl } from './sharepoint-transcript';
import { classifyRecordingLink, graphStatusToCode, isOneDriveItem } from './sharepoint-video';
import { isPresentation } from './office-rendition';
import type { SlidesMessageCode } from './slides-messages';

export const SLIDES_BUCKET = 'study-slides';
/** How long a check against SharePoint is trusted before asking again. */
export const SLIDES_RECHECK_MS = 10 * 60 * 1000;
/** The largest converted PDF kept, matching the bucket's limit. */
export const SLIDES_MAX_PDF_BYTES = 50 * 1024 * 1024;
/** Long enough for a slow phone to finish loading a large deck in the reader. */
export const SLIDES_URL_TTL_SECONDS = 60 * 60;

const GRAPH = 'https://graph.microsoft.com/v1.0';
const SELECT = '$select=id,name,size,file,folder,webUrl,parentReference,cTag,lastModifiedDateTime';

/* ── The file ───────────────────────────────────────────────────────────────── */

export interface SlidesSourceItem {
  driveId: string;
  itemId: string;
  name: string;
  /** The file's own address, as Graph reports it. */
  webUrl: string;
  driveType: string | null;
  mimeType: string | null;
  isFolder: boolean;
  sizeBytes: number | null;
  /** Changes only when the content changes. Null for folders. */
  cTag: string | null;
  lastModifiedAt: string | null;
}

export function toSlidesSourceItem(item: any): SlidesSourceItem {
  return {
    driveId: String(item?.parentReference?.driveId ?? ''),
    itemId: String(item?.id ?? ''),
    name: item?.name || 'Untitled deck',
    webUrl: item?.webUrl || '',
    driveType: item?.parentReference?.driveType ?? null,
    mimeType: item?.file?.mimeType || null,
    isFolder: !!item?.folder,
    sizeBytes: typeof item?.size === 'number' ? item.size : null,
    cTag: typeof item?.cTag === 'string' && item.cTag ? item.cTag : null,
    lastModifiedAt: typeof item?.lastModifiedDateTime === 'string' ? item.lastModifiedDateTime : null,
  };
}

export type SlidesPolicyProblem = 'NOT_A_PRESENTATION' | 'SLIDES_IN_ONEDRIVE';

/** Why this file cannot be a chapter's slides, or null when it can. */
export function slidesPolicyProblem(
  item: Pick<SlidesSourceItem, 'name' | 'mimeType' | 'isFolder' | 'webUrl' | 'driveType'>,
): SlidesPolicyProblem | null {
  if (item.isFolder || !isPresentation(item.mimeType, item.name)) return 'NOT_A_PRESENTATION';
  if (isOneDriveItem(item)) return 'SLIDES_IN_ONEDRIVE';
  return null;
}

/** A file picked in Nexus, by its ids, or a pasted SharePoint link. */
export type SlidesRef = string | { driveId: string; itemId: string };

export function slidesRefFromBody(body: unknown): SlidesRef | null {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  if (typeof b.drive_id === 'string' && b.drive_id && typeof b.item_id === 'string' && b.item_id) {
    return { driveId: b.drive_id, itemId: b.item_id };
  }
  if (typeof b.url === 'string' && b.url.trim()) return b.url.trim();
  return null;
}

/* ── Versions ───────────────────────────────────────────────────────────────── */

export function needsRecheck(checkedAt: string | null | undefined, now: number = Date.now()): boolean {
  if (!checkedAt) return true;
  const at = new Date(checkedAt).getTime();
  return !Number.isFinite(at) || now - at >= SLIDES_RECHECK_MS;
}

/** What identifies one version of the deck. The content tag, when SharePoint gives one. */
export function slidesVersionKey(item: Pick<SlidesSourceItem, 'cTag' | 'lastModifiedAt' | 'sizeBytes'>): string {
  return item.cTag || item.lastModifiedAt || `size:${item.sizeBytes ?? 'unknown'}`;
}

/**
 * Where one version's PDF is kept. Hashed, because a cTag carries quotes and
 * braces, and stable, so converting the same version twice overwrites one object.
 */
export function slidesStoragePath(fileId: string, versionKey: string): string {
  const version = createHash('sha256').update(versionKey).digest('hex').slice(0, 16);
  return `${fileId}/${version}.pdf`;
}

export type SlidesSyncPlan = 'serve' | 'convert';

export function planSlidesSync(
  row: Pick<NexusStudyFileSlides, 'pdf_path' | 'source_ctag'>,
  item: Pick<SlidesSourceItem, 'cTag'>,
): SlidesSyncPlan {
  if (!row.pdf_path) return 'convert';
  // A file with no content tag cannot be compared. Converting it on every check
  // would cost a conversion per class, so keep what is there; Refresh now still
  // forces one.
  if (!item.cTag) return 'serve';
  return item.cTag === row.source_ctag ? 'serve' : 'convert';
}

/** "Ch:1 History Of Architecture" becomes "Ch 1 History Of Architecture slides.pdf". */
export function slidesDownloadName(title: string | null | undefined): string {
  const base = (title || '')
    .replace(/\.(pptx|ppt|ppsx|odp|pdf)$/i, '')
    .replace(/["\\/:*?<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
  return `${base || 'Chapter'} slides.pdf`;
}

/* ── Errors ─────────────────────────────────────────────────────────────────── */

export type SlidesErrorCode =
  | 'LINK_NOT_RECOGNISED'
  | 'NOT_FOUND'
  | 'NO_ACCESS'
  | 'GRAPH_UNAVAILABLE'
  | 'RENDITION_UNAVAILABLE'
  | 'TOO_LARGE'
  | 'STORAGE_FAILED';

export class SlidesError extends Error {
  readonly code: SlidesErrorCode;

  constructor(code: SlidesErrorCode, message?: string) {
    super(message || code);
    this.name = 'SlidesError';
    this.code = code;
  }
}

function codeOf(err: unknown): SlidesErrorCode {
  return err instanceof SlidesError ? err.code : 'GRAPH_UNAVAILABLE';
}

/** What a failed refresh is recorded as against an attached deck. */
export function problemForError(code: SlidesErrorCode): NexusStudySlidesProblem {
  switch (code) {
    case 'NOT_FOUND':
      return 'SOURCE_MISSING';
    case 'NO_ACCESS':
      return 'NO_ACCESS';
    case 'RENDITION_UNAVAILABLE':
      return 'RENDITION_UNAVAILABLE';
    case 'TOO_LARGE':
      return 'TOO_LARGE';
    default:
      return 'GRAPH_UNAVAILABLE';
  }
}

/** What a teacher is told when attaching fails. */
export function messageCodeForError(code: SlidesErrorCode): SlidesMessageCode {
  return code === 'STORAGE_FAILED' ? 'SAVE_FAILED' : code;
}

/* ── Asking Graph ───────────────────────────────────────────────────────────── */

async function graphFetch(url: string, init?: RequestInit): Promise<Response> {
  let token: string;
  try {
    token = await getAppOnlyToken();
  } catch {
    throw new SlidesError('GRAPH_UNAVAILABLE');
  }
  try {
    return await fetch(url, { ...init, headers: { ...(init?.headers || {}), Authorization: `Bearer ${token}` } });
  } catch {
    throw new SlidesError('GRAPH_UNAVAILABLE');
  }
}

export async function resolveSlidesItem(ref: SlidesRef): Promise<SlidesSourceItem> {
  let url: string;
  if (typeof ref === 'string') {
    const link = classifyRecordingLink(ref);
    if (link.shape === 'invalid' || link.shape === 'not_sharepoint' || link.shape === 'youtube') {
      throw new SlidesError('LINK_NOT_RECOGNISED');
    }
    url = `${GRAPH}/shares/${encodeSharingUrl(link.url)}/driveItem?${SELECT}`;
  } else {
    if (!ref.driveId || !ref.itemId) throw new SlidesError('LINK_NOT_RECOGNISED');
    url = `${GRAPH}/drives/${encodeURIComponent(ref.driveId)}/items/${encodeURIComponent(ref.itemId)}?${SELECT}`;
  }

  const res = await graphFetch(url);
  if (!res.ok) throw new SlidesError(graphStatusToCode(res.status));
  const body = await res.json().catch(() => null);
  if (!body?.id) throw new SlidesError('GRAPH_UNAVAILABLE');
  return toSlidesSourceItem(body);
}

/** A refused conversion, by status. Anything Microsoft-side and transient is not the deck's fault. */
export function renditionStatusToCode(status: number): SlidesErrorCode {
  if (status === 404 || status === 410) return 'NOT_FOUND';
  if (status === 401 || status === 403) return 'NO_ACCESS';
  if (status === 429 || status === 502 || status === 503 || status === 504) return 'GRAPH_UNAVAILABLE';
  return 'RENDITION_UNAVAILABLE';
}

async function convertToPdf(item: SlidesSourceItem): Promise<Uint8Array> {
  const res = await graphFetch(
    `${GRAPH}/drives/${encodeURIComponent(item.driveId)}/items/${encodeURIComponent(item.itemId)}/content?format=pdf`,
    { redirect: 'manual' },
  );

  // Success is a redirect to a pre-authenticated download of the PDF. A runtime
  // that follows redirects regardless hands back the PDF itself, which is fine.
  let pdfRes: Response;
  const location = res.headers.get('location');
  if (res.status >= 300 && res.status < 400 && location) {
    try {
      pdfRes = await fetch(location);
    } catch {
      throw new SlidesError('GRAPH_UNAVAILABLE');
    }
    if (!pdfRes.ok) throw new SlidesError(renditionStatusToCode(pdfRes.status));
  } else if (res.ok) {
    pdfRes = res;
  } else {
    throw new SlidesError(renditionStatusToCode(res.status));
  }

  const declared = Number(pdfRes.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > SLIDES_MAX_PDF_BYTES) {
    await pdfRes.body?.cancel().catch(() => undefined);
    throw new SlidesError('TOO_LARGE');
  }
  const bytes = new Uint8Array(await pdfRes.arrayBuffer());
  if (bytes.byteLength > SLIDES_MAX_PDF_BYTES) throw new SlidesError('TOO_LARGE');
  if (new TextDecoder().decode(bytes.subarray(0, 5)) !== '%PDF-') throw new SlidesError('RENDITION_UNAVAILABLE');
  return bytes;
}

/* ── Storage ────────────────────────────────────────────────────────────────── */

function bucket() {
  return (getSupabaseAdminClient() as any).storage.from(SLIDES_BUCKET);
}

async function storePdf(fileId: string, item: SlidesSourceItem): Promise<{ pdf_path: string; pdf_size_bytes: number }> {
  const bytes = await convertToPdf(item);
  const path = slidesStoragePath(fileId, slidesVersionKey(item));
  const { error } = await bucket().upload(path, bytes, { contentType: 'application/pdf', upsert: true });
  if (error) throw new SlidesError('STORAGE_FAILED', error.message);
  return { pdf_path: path, pdf_size_bytes: bytes.byteLength };
}

async function removePdf(path: string | null | undefined): Promise<void> {
  if (!path) return;
  try {
    await bucket().remove([path]);
  } catch {
    // An orphaned object costs a little storage, never a student's view.
  }
}

/** Every stored version of a chapter's slides, for when the deck is removed. */
export async function removeAllSlidesPdfs(fileId: string): Promise<void> {
  try {
    const { data } = await bucket().list(fileId, { limit: 100 });
    const paths = ((data || []) as { name: string }[]).map((o) => `${fileId}/${o.name}`);
    if (paths.length) await bucket().remove(paths);
  } catch {
    // Same reasoning as removePdf.
  }
}

export async function signSlidesUrl(path: string, downloadName?: string): Promise<string> {
  const { data, error } = await bucket().createSignedUrl(
    path,
    SLIDES_URL_TTL_SECONDS,
    downloadName ? { download: downloadName } : undefined,
  );
  if (error || !data?.signedUrl) throw new SlidesError('STORAGE_FAILED', error?.message);
  return data.signedUrl as string;
}

/* ── Attaching and keeping current ──────────────────────────────────────────── */

/**
 * Attach a deck to a chapter, or replace the one it has.
 *
 * Converts first and saves second, so a deck that will not convert is refused
 * with the reason and the chapter keeps whatever it had.
 */
export async function attachSlides(
  fileId: string,
  item: SlidesSourceItem,
  attachedBy: string | null,
): Promise<NexusStudyFileSlides> {
  const previous = await getSlidesForFile(fileId);
  const stored = await storePdf(fileId, item);
  const now = new Date().toISOString();
  const row = await saveSlides({
    file_id: fileId,
    drive_id: item.driveId,
    item_id: item.itemId,
    source_name: item.name,
    source_web_url: item.webUrl || null,
    source_ctag: item.cTag,
    source_modified_at: item.lastModifiedAt,
    pdf_path: stored.pdf_path,
    pdf_size_bytes: stored.pdf_size_bytes,
    converted_at: now,
    checked_at: now,
    problem: null,
    attached_by: attachedBy,
  });
  if (previous?.pdf_path && previous.pdf_path !== row.pdf_path) await removePdf(previous.pdf_path);
  return row;
}

/** Record against the row, or carry on with the change in memory if the write fails. */
async function record(
  row: NexusStudyFileSlides,
  patch: Partial<NexusStudyFileSlides>,
): Promise<NexusStudyFileSlides> {
  try {
    return await updateSlides(row.file_id, patch);
  } catch {
    return { ...row, ...patch };
  }
}

/**
 * The deck as it should be served now: unchanged when checked recently, the
 * same PDF when SharePoint says the content has not changed, a new PDF when it
 * has. `force` (Refresh now) converts whatever SharePoint says.
 *
 * Never throws for a SharePoint or conversion failure. It records the problem
 * and returns the row still pointing at the last good PDF.
 */
export async function ensureFreshSlides(
  row: NexusStudyFileSlides,
  opts: { force?: boolean; now?: number } = {},
): Promise<NexusStudyFileSlides> {
  const now = opts.now ?? Date.now();
  if (!opts.force && row.pdf_path && !needsRecheck(row.checked_at, now)) return row;
  const checkedAt = new Date(now).toISOString();

  let item: SlidesSourceItem;
  try {
    item = await resolveSlidesItem({ driveId: row.drive_id, itemId: row.item_id });
  } catch (err) {
    return record(row, { checked_at: checkedAt, problem: problemForError(codeOf(err)) });
  }

  // A renamed or moved deck keeps its id, so the name a teacher sees follows it.
  const identity = { source_name: item.name, source_web_url: item.webUrl || row.source_web_url };

  if (!opts.force && planSlidesSync(row, item) === 'serve') {
    return record(row, { ...identity, checked_at: checkedAt, problem: null });
  }

  let stored: { pdf_path: string; pdf_size_bytes: number };
  try {
    stored = await storePdf(row.file_id, item);
  } catch (err) {
    return record(row, { checked_at: checkedAt, problem: problemForError(codeOf(err)) });
  }

  const patch: Partial<NexusStudyFileSlides> = {
    ...identity,
    source_ctag: item.cTag,
    source_modified_at: item.lastModifiedAt,
    ...stored,
    converted_at: checkedAt,
    checked_at: checkedAt,
    problem: null,
  };
  let updated: NexusStudyFileSlides;
  try {
    updated = await updateSlides(row.file_id, patch);
  } catch {
    // The new PDF exists but the row could not say so. Serve it for this request
    // and keep the old one, because the row still points at it.
    return { ...row, ...patch };
  }
  if (row.pdf_path && row.pdf_path !== stored.pdf_path) await removePdf(row.pdf_path);
  return updated;
}

/* ── What the reader receives ───────────────────────────────────────────────── */

export interface SlidesSourceDto {
  name: string;
  web_url: string | null;
  modified_at: string | null;
  converted_at: string | null;
  checked_at: string | null;
  size_bytes: number | null;
  problem: NexusStudySlidesProblem | null;
}

export interface SlidesPayload {
  status: 'ready' | 'unavailable';
  /** Signed link to the PDF. Present when ready. */
  url?: string;
  expires_in?: number;
  /** When the served PDF was made. */
  version?: string | null;
  /** Why nothing can be served. Present when unavailable. */
  code?: NexusStudySlidesProblem;
  /** Staff only: the SharePoint file behind the slides. */
  source?: SlidesSourceDto;
}

export async function buildSlidesPayload(
  row: NexusStudyFileSlides,
  opts: { staff: boolean; downloadName?: string },
): Promise<SlidesPayload> {
  const source: SlidesSourceDto | undefined = opts.staff
    ? {
        name: row.source_name,
        web_url: row.source_web_url,
        modified_at: row.source_modified_at,
        converted_at: row.converted_at,
        checked_at: row.checked_at,
        size_bytes: row.pdf_size_bytes,
        problem: row.problem,
      }
    : undefined;

  if (!row.pdf_path) {
    return { status: 'unavailable', code: row.problem ?? 'RENDITION_UNAVAILABLE', ...(source ? { source } : {}) };
  }
  const url = await signSlidesUrl(row.pdf_path, opts.downloadName);
  return {
    status: 'ready',
    url,
    expires_in: SLIDES_URL_TTL_SECONDS,
    version: row.converted_at,
    ...(source ? { source } : {}),
  };
}
