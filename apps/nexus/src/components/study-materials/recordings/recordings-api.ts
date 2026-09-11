/**
 * The recordings page's calls to its own API, and the shapes they return.
 *
 * One fetch helper so every action fails the same way: an Error carrying the
 * server's sentence, its status and its code, because the page answers some
 * codes with a question (RECORDING_UNREACHABLE, HAS_ATTEMPTS) rather than a
 * message.
 */

import type { RecordingTrackView } from '@/lib/recording-flow';
import type { TrackLanguageOption } from '@/lib/track-languages';

export class RecordingsApiError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly body: Record<string, unknown>;

  constructor(message: string, status: number, code: string | null, body: Record<string, unknown> = {}) {
    super(message);
    this.name = 'RecordingsApiError';
    this.status = status;
    this.code = code;
    this.body = body;
  }
}

export async function authedJson<T>(
  getToken: () => Promise<string | null>,
  url: string,
  init?: RequestInit,
): Promise<T> {
  const token = await getToken();
  if (!token) throw new RecordingsApiError('Your session has expired. Sign in again.', 401, null);

  const res = await fetch(url, {
    ...init,
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init?.headers || {}),
      Authorization: `Bearer ${token}`,
    },
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new RecordingsApiError(
      typeof body.error === 'string' ? body.error : 'Something went wrong. Try again.',
      res.status,
      typeof body.code === 'string' ? body.code : null,
      body,
    );
  }
  return body as T;
}

export const tracksUrl = (fileId: string) =>
  `/api/study-materials/files/${encodeURIComponent(fileId)}/video-tracks`;

export const trackUrl = (fileId: string, trackId: string) =>
  `${tracksUrl(fileId)}/${encodeURIComponent(trackId)}`;

export interface TracksResponse {
  tracks: RecordingTrackView[];
  languages: TrackLanguageOption[];
  library?: { folder_url: string | null };
}

export interface ChapterResponse {
  file: {
    id: string;
    title: string;
    folder_id: string | null;
    recording?: { url?: string | null } | null;
  };
}

export interface ResolvedLinkItem {
  drive_id: string;
  item_id: string;
  name: string;
  size_bytes: number | null;
  duration_seconds: number | null;
  web_url: string;
  folder_path: string | null;
  drive_type: string | null;
}

export type SameRecordingVerdict = 'same' | 'likely' | 'different';

export interface ResolveLinkResponse {
  item: ResolvedLinkItem;
  same_as: {
    track_id: string;
    verdict: SameRecordingVerdict;
    checkpoint_count: number;
    previous_duration_seconds: number | null;
  } | null;
}

export interface PrepareResponse {
  status: 'prepared' | 'already_prepared' | 'needs_transcript' | 'too_short';
  section_count?: number;
  question_count?: number;
  transcript_source?: string;
  code?: string;
  message?: string;
}

/** "877 MB". Empty for an unknown size. */
export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value < 10 && unit > 0 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}

/** "CommonPC › 1 - Class › 2". The separator a teacher reads as a folder trail. */
export function formatFolderPath(path: string | null | undefined): string {
  return (path || '')
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean)
    .join(' › ');
}
