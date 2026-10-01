/**
 * Byte-range arithmetic for the media Worker.
 *
 * A port of apps/nexus/src/lib/http-range.ts, kept as its own file because a
 * Worker bundle cannot import from the Next app. The rules are identical:
 *
 * - The answer is ALWAYS a 206 with a window the proxy chose, never a 200 with
 *   the whole file, and never more than maxChunk bytes. A request with no Range
 *   header gets the first window.
 * - A malformed Range is ignored (RFC 7233), not rejected.
 * - Only the first range of a multi-range request is honoured.
 * - A start at or past the end of the file is unsatisfiable (416).
 *
 * The 4 MB cap is not about Worker time limits (a Worker can stream for much
 * longer than a Vercel function). It is kept so behaviour, browser caching and
 * the SharePoint request pattern stay exactly as they are on the fallback route,
 * and so a single copied URL never pulls a whole lecture in one request.
 * apps/nexus/src/lib/media-proxy-range.test.ts runs both implementations against
 * the same cases.
 */

/** 4 MB. */
export const DEFAULT_MAX_CHUNK_BYTES = 4 * 1024 * 1024;

export interface ByteRange {
  /** Inclusive. */
  start: number;
  /** Inclusive, per RFC 7233. */
  end: number;
}

export type RangeResolution =
  | { kind: 'ok'; range: ByteRange; contentLength: number }
  | { kind: 'unsatisfiable' };

export function parseRangeHeader(header: string | null | undefined, size: number): ByteRange | null {
  if (!header || size <= 0) return null;

  const match = /^bytes=(.*)$/i.exec(header.trim());
  if (!match) return null;

  const first = match[1].split(',')[0]?.trim();
  if (!first) return null;

  const [rawStart, rawEnd] = first.split('-');
  const hasStart = rawStart !== undefined && rawStart !== '';
  const hasEnd = rawEnd !== undefined && rawEnd !== '';

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

export function clampRange(range: ByteRange, maxChunk: number): ByteRange {
  const limit = Math.max(1, Math.floor(maxChunk));
  const maxEnd = range.start + limit - 1;
  return { start: range.start, end: Math.min(range.end, maxEnd) };
}

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

export function formatContentRange(range: ByteRange, size: number): string {
  return `bytes ${range.start}-${range.end}/${size}`;
}

export function formatUnsatisfiedRange(size: number): string {
  return `bytes */${size}`;
}
