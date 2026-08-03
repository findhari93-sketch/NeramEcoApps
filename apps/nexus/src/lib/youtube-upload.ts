/**
 * Upload a class recording to YouTube with the resumable protocol.
 *
 * Raw fetch rather than `googleapis`, matching how this app already talks to
 * Graph and to Gemini. The library would add tens of megabytes to the bundle to
 * wrap two endpoints.
 *
 * THE ONE RULE THAT MATTERS: after every chunk, advance from the offset GOOGLE
 * reports in the 308 `Range` header, never from `start + slice.length`. A server
 * that accepted fewer bytes than were sent answers 308 with a lower offset, and
 * code that trusts its own arithmetic then writes the next chunk over a gap. The
 * upload completes, YouTube reports success, and the video is corrupt in the
 * middle where nobody looks. classifyUploadResponse exists to make that
 * impossible to get wrong, and it is tested directly.
 *
 * COST: `videos.insert` is 1600 units against a 10,000/day default, and they are
 * charged when the SESSION IS CREATED, not when the bytes finish. So the session
 * URI is persisted by the caller before a single byte moves, and a part-finished
 * upload is always resumed in preference to starting a new one.
 */

import type { ClassVideoChapter } from '@neram/database/types';
import { applyClassDateSuffix, YT_DESCRIPTION_MAX, YT_TITLE_MAX } from './youtube-metadata';

const UPLOAD_ENDPOINT =
  'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status';

/**
 * What every upload is created as.
 *
 * YouTube restricts videos uploaded by an API project that has not passed the
 * compliance audit to private, whatever privacyStatus is sent. Sending
 * 'unlisted' before the audit does not fail loudly, it just quietly gives you a
 * private video, so this stays honest about what actually happens and the
 * teacher flips it in Studio.
 *
 * Flip this single constant to 'unlisted' when the audit passes. Nothing else
 * changes: the promotion pass in youtube-backup-sync already checks the live
 * privacy status before publishing anything to students, so it simply starts
 * passing on the first check.
 */
export const UPLOAD_PRIVACY_STATUS: 'private' | 'unlisted' = 'private';

/** Education. https://developers.google.com/youtube/v3/docs/videoCategories/list */
export const YT_CATEGORY_EDUCATION = '27';

/**
 * 8 MiB, and it must stay a multiple of 256 KB: Google rejects any chunk but the
 * last whose length is not. 8 MiB over a 370 MB recording is ~46 round trips,
 * a few seconds of overhead inside a 300 s budget, and a failed chunk costs only
 * 8 MiB of re-transfer.
 */
export const SLICE_BYTES = 8 * 1024 * 1024;
export const CHUNK_MULTIPLE = 256 * 1024;

/** Quota reasons that mean "stop the whole run", not "this class failed". */
const QUOTA_REASONS = new Set([
  'quotaExceeded',
  'dailyLimitExceeded',
  'uploadLimitExceeded',
  'rateLimitExceeded',
  'userRateLimitExceeded',
]);

export type UploadResponseKind =
  /** 308: Google has `next` bytes and wants the rest from there. */
  | { kind: 'resume'; next: number }
  | { kind: 'done'; videoId: string }
  /** Transient. Query the offset, then continue from what Google says. */
  | { kind: 'retry'; status: number }
  /** 404/410: the session is gone. Its 1600 units are lost. */
  | { kind: 'session_dead' }
  /** Stop the run. Costs nothing further and must not count an attempt. */
  | { kind: 'quota'; reason: string }
  | { kind: 'fatal'; detail: string };

/**
 * Turn one PUT response into a decision.
 *
 * Pure on purpose: this is where the expensive mistakes live, so it is tested
 * against every status code rather than exercised only through a live upload.
 */
export function classifyUploadResponse(
  status: number,
  rangeHeader: string | null,
  body?: any,
): UploadResponseKind {
  if (status === 308) {
    // No Range header means Google is holding ZERO bytes. Treating an absent
    // header as "keep going from where I was" restarts the file mid-stream.
    if (!rangeHeader) return { kind: 'resume', next: 0 };
    const match = /bytes=(\d+)-(\d+)/.exec(rangeHeader);
    if (!match) return { kind: 'resume', next: 0 };
    // The header is an inclusive last-byte index, so the next byte is +1.
    return { kind: 'resume', next: Number(match[2]) + 1 };
  }

  if (status === 200 || status === 201) {
    const videoId = body?.id;
    if (typeof videoId === 'string' && videoId) return { kind: 'done', videoId };
    return { kind: 'fatal', detail: 'upload finished but no video id came back' };
  }

  if (status === 404 || status === 410) return { kind: 'session_dead' };

  if (status === 403 || status === 429) {
    const reason = body?.error?.errors?.[0]?.reason || (status === 429 ? 'rateLimitExceeded' : '');
    if (QUOTA_REASONS.has(reason)) return { kind: 'quota', reason };
    return { kind: 'fatal', detail: `403 ${reason || 'forbidden'}` };
  }

  if (status >= 500 && status <= 599) return { kind: 'retry', status };

  const detail = body?.error?.message || `HTTP ${status}`;
  return { kind: 'fatal', detail: String(detail).slice(0, 300) };
}

/** `Content-Range: bytes 0-8388607/388157902`. The end index is INCLUSIVE. */
export function buildContentRange(start: number, length: number, total: number): string {
  return `bytes ${start}-${start + length - 1}/${total}`;
}

/** How much to ask for next. Every slice but the last is a 256 KB multiple. */
export function nextSliceBounds(
  offset: number,
  total: number,
  slice: number = SLICE_BYTES,
): { start: number; length: number; last: boolean } {
  const remaining = Math.max(0, total - offset);
  const length = Math.min(slice, remaining);
  return { start: offset, length, last: offset + length >= total };
}

/**
 * Strip the characters YouTube rejects outright.
 *
 * `<` and `>` anywhere in a title or description return invalidTitle /
 * invalidDescription and fail the whole insert. The shared builders in
 * youtube-metadata strip em dashes but not these, and they should not: a chapter
 * label with a `>` is fine everywhere except this one API. So it is cleaned here,
 * at the boundary, rather than in a builder five other screens depend on.
 */
export function stripAngleBrackets(value: string): string {
  return (value || '').replace(/[<>]/g, '');
}

export interface VideoSnippetInput {
  title: string;
  description: string;
  tags: string[];
  /** 'ta' | 'en' | 'ta_en' from the meta row. */
  language?: string | null;
  chapters?: ClassVideoChapter[];
  /** ISO date (yyyy-mm-dd) of the class, stamped onto the end of the title. */
  classDate?: string | null;
}

/**
 * The body of the initiate POST.
 *
 * selfDeclaredMadeForKids is always sent. Omitting it leaves the video in an
 * "audience not set" state, and YouTube then blocks changing the privacy until
 * an audience is chosen, which would break the one-click flip this whole design
 * hands to the teacher.
 *
 * The class date is stamped on here, after the truncation, and not before. That
 * slice is a tail cut, so it is the one line in the system capable of amputating
 * a date that was already correct. Doing it at this boundary also means a
 * listing written before dates existed, or one a teacher edited by hand, still
 * reaches YouTube dated. `applyClassDateSuffix` is idempotent, so a title that
 * already carries the right date passes through untouched.
 */
export function buildInsertBody(input: VideoSnippetInput): Record<string, unknown> {
  const title = applyClassDateSuffix(
    stripAngleBrackets(input.title).slice(0, YT_TITLE_MAX),
    input.classDate,
  );
  const description = stripAngleBrackets(input.description).slice(0, YT_DESCRIPTION_MAX);

  // 'ta_en' is a Neram value, not a BCP-47 one. A mixed-language class is
  // predominantly spoken in Tamil, so that is what the audio track is declared as.
  const audio = input.language === 'en' ? 'en' : input.language ? 'ta' : undefined;

  return {
    snippet: {
      title,
      description,
      tags: input.tags || [],
      categoryId: YT_CATEGORY_EDUCATION,
      defaultLanguage: 'en',
      ...(audio ? { defaultAudioLanguage: audio } : {}),
    },
    status: {
      privacyStatus: UPLOAD_PRIVACY_STATUS,
      selfDeclaredMadeForKids: false,
      embeddable: true,
      license: 'youtube',
    },
  };
}

export interface InitiateResult {
  ok: boolean;
  sessionUri?: string;
  /** Set when the run should stop entirely rather than count a class failure. */
  quotaReason?: string;
  error?: string;
}

/**
 * Create the resumable session. THIS is where the 1600 units are spent, so the
 * caller must persist the returned URI before uploading anything.
 */
export async function initiateUpload(
  accessToken: string,
  snippet: VideoSnippetInput,
  fileSize: number,
  fetchImpl: typeof fetch = fetch,
): Promise<InitiateResult> {
  const res = await fetchImpl(UPLOAD_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Length': String(fileSize),
      'X-Upload-Content-Type': 'video/mp4',
    },
    body: JSON.stringify(buildInsertBody(snippet)),
  });

  if (res.ok) {
    // The session URI is in the Location RESPONSE HEADER, not the body.
    const sessionUri = res.headers.get('location');
    if (!sessionUri) return { ok: false, error: 'no Location header on the upload session' };
    return { ok: true, sessionUri };
  }

  const body = await res.json().catch(() => ({}));
  const verdict = classifyUploadResponse(res.status, null, body);
  if (verdict.kind === 'quota') return { ok: false, quotaReason: verdict.reason };
  return {
    ok: false,
    error: verdict.kind === 'fatal' ? verdict.detail : `initiate ${res.status}`,
  };
}

/**
 * Ask Google how much of the file it actually holds.
 *
 * A zero-length PUT with `Content-Range: bytes * /total`. Used after a 5xx
 * instead of blindly resending, because resending a chunk Google already has is
 * how offsets drift.
 */
export async function queryUploadOffset(
  sessionUri: string,
  total: number,
  fetchImpl: typeof fetch = fetch,
): Promise<UploadResponseKind> {
  const res = await fetchImpl(sessionUri, {
    method: 'PUT',
    headers: { 'Content-Range': `bytes */${total}` },
  });
  const body = res.status === 200 || res.status === 201 ? await res.json().catch(() => ({})) : {};
  return classifyUploadResponse(res.status, res.headers.get('range'), body);
}

/**
 * Send one slice.
 *
 * No Authorization header: the session URI is already pre-authorised, and a
 * stale bearer here is a 401 for no reason. No manual Content-Length either;
 * undici computes it, and a hand-set value that disagrees with the body is a
 * corrupt upload.
 */
export async function uploadChunk(
  sessionUri: string,
  chunk: Uint8Array,
  start: number,
  total: number,
  fetchImpl: typeof fetch = fetch,
): Promise<UploadResponseKind> {
  const res = await fetchImpl(sessionUri, {
    method: 'PUT',
    headers: { 'Content-Range': buildContentRange(start, chunk.length, total) },
    body: chunk as any,
  });
  const body =
    res.status === 200 || res.status === 201 || res.status === 403 || res.status === 429
      ? await res.json().catch(() => ({}))
      : {};
  return classifyUploadResponse(res.status, res.headers.get('range'), body);
}
