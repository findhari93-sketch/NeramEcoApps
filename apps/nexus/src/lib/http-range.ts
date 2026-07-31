/**
 * Byte-range arithmetic for the video proxy, kept pure so it can be tested
 * without a server, a network, or a 300 MB file.
 *
 * The central decision: the proxy ALWAYS answers 206 with a window it chose,
 * never 200 with the whole file, and never a window larger than maxChunk.
 *
 * That is what keeps this affordable on Vercel. A serverless function has a wall
 * clock ceiling, and a 370 MB recording streamed inside one invocation would sit
 * against it for the length of the video. Capping every response at a few
 * megabytes means each invocation lasts a second or two regardless of how long
 * the class was, and the browser simply asks for the next window when it needs
 * it. Answering a request for "bytes=0-" with a short 206 is ordinary HTTP and
 * every media element handles it: that is exactly how range requests are meant
 * to work.
 */

/** 4 MB. Big enough that a normal watch is not chatty, small enough to be fast. */
export const DEFAULT_MAX_CHUNK_BYTES = 4 * 1024 * 1024;

export interface ByteRange {
  /** Inclusive. */
  start: number;
  /** Inclusive, per RFC 7233. */
  end: number;
}

export type RangeResolution =
  | { kind: 'ok'; range: ByteRange; contentLength: number }
  /** start is past the end of the file. Answer 416 with Content-Range bytes * /size. */
  | { kind: 'unsatisfiable' };

/**
 * Parse a Range header into an absolute, size-clamped range.
 *
 * Returns null when there is no usable range, which includes a malformed header:
 * RFC 7233 says an unparseable Range must be ignored rather than rejected, and
 * the caller then serves its default first window.
 *
 * Only the first range of a multi-range request is honoured. Multipart byte
 * ranges are legal but no browser media element asks for them, and answering one
 * properly means multipart/byteranges encoding for no practical gain.
 */
export function parseRangeHeader(header: string | null | undefined, size: number): ByteRange | null {
  if (!header || size <= 0) return null;

  const match = /^bytes=(.*)$/i.exec(header.trim());
  if (!match) return null;

  const first = match[1].split(',')[0]?.trim();
  if (!first) return null;

  const [rawStart, rawEnd] = first.split('-');
  const hasStart = rawStart !== undefined && rawStart !== '';
  const hasEnd = rawEnd !== undefined && rawEnd !== '';

  // Suffix form, "bytes=-500" meaning the final 500 bytes.
  if (!hasStart) {
    if (!hasEnd) return null;
    const suffix = Number(rawEnd);
    if (!Number.isFinite(suffix) || suffix <= 0) return null;
    const start = Math.max(0, size - Math.floor(suffix));
    return { start, end: size - 1 };
  }

  const start = Number(rawStart);
  if (!Number.isFinite(start) || start < 0) return null;

  if (!hasEnd) return { start: Math.floor(start), end: size - 1 };

  const end = Number(rawEnd);
  if (!Number.isFinite(end) || end < start) return null;

  return { start: Math.floor(start), end: Math.min(Math.floor(end), size - 1) };
}

/** Cap a range's length at maxChunk. The start is never moved. */
export function clampRange(range: ByteRange, maxChunk: number): ByteRange {
  const limit = Math.max(1, Math.floor(maxChunk));
  const maxEnd = range.start + limit - 1;
  return { start: range.start, end: Math.min(range.end, maxEnd) };
}

/**
 * The whole decision in one call: what window to serve for this request.
 * No header yields the first window rather than the whole file, which is what
 * someone pasting the URL into a browser gets.
 */
export function resolveByteRange(
  header: string | null | undefined,
  size: number,
  maxChunk: number = DEFAULT_MAX_CHUNK_BYTES,
): RangeResolution {
  const parsed = parseRangeHeader(header, size);

  if (parsed && parsed.start >= size) return { kind: 'unsatisfiable' };

  const base: ByteRange = parsed ?? { start: 0, end: size - 1 };
  const range = clampRange(base, maxChunk);
  return { kind: 'ok', range, contentLength: range.end - range.start + 1 };
}

/** The Content-Range value for a served window. */
export function formatContentRange(range: ByteRange, size: number): string {
  return `bytes ${range.start}-${range.end}/${size}`;
}

/** The Content-Range value for a 416. */
export function formatUnsatisfiedRange(size: number): string {
  return `bytes */${size}`;
}
