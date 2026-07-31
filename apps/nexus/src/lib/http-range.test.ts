import { describe, it, expect } from 'vitest';
import {
  parseRangeHeader,
  clampRange,
  resolveByteRange,
  formatContentRange,
  formatUnsatisfiedRange,
  DEFAULT_MAX_CHUNK_BYTES,
} from './http-range';

/** A realistic recording: 196 MB, comfortably larger than one chunk. */
const SIZE = 196_000_000;
const CHUNK = DEFAULT_MAX_CHUNK_BYTES;

describe('parseRangeHeader', () => {
  it('reads an open-ended range as running to the end of the file', () => {
    expect(parseRangeHeader('bytes=0-', SIZE)).toEqual({ start: 0, end: SIZE - 1 });
  });

  it('reads an explicit range exactly', () => {
    expect(parseRangeHeader('bytes=100-200', SIZE)).toEqual({ start: 100, end: 200 });
  });

  it('reads a suffix range as the final N bytes', () => {
    expect(parseRangeHeader('bytes=-500', SIZE)).toEqual({ start: SIZE - 500, end: SIZE - 1 });
  });

  it('clamps an end beyond the file to the last byte', () => {
    expect(parseRangeHeader(`bytes=10-${SIZE + 9999}`, SIZE)).toEqual({ start: 10, end: SIZE - 1 });
  });

  it('takes only the first range of a multi-range request', () => {
    expect(parseRangeHeader('bytes=0-99,200-299', SIZE)).toEqual({ start: 0, end: 99 });
  });

  it('is case insensitive and tolerates whitespace', () => {
    expect(parseRangeHeader('  BYTES=5-9 ', SIZE)).toEqual({ start: 5, end: 9 });
  });

  it('returns null for anything unusable, so the caller serves its default window', () => {
    for (const header of [null, undefined, '', 'bytes=', 'bytes=abc-def', 'items=0-10', 'bytes=-', 'bytes=-0']) {
      expect(parseRangeHeader(header as any, SIZE)).toBeNull();
    }
  });

  it('rejects an inverted range rather than returning a negative length', () => {
    expect(parseRangeHeader('bytes=500-100', SIZE)).toBeNull();
  });

  it('returns null when the size is unknown', () => {
    expect(parseRangeHeader('bytes=0-', 0)).toBeNull();
  });
});

describe('clampRange', () => {
  it('caps the length at the chunk size without moving the start', () => {
    const out = clampRange({ start: 1000, end: SIZE - 1 }, CHUNK);
    expect(out.start).toBe(1000);
    expect(out.end - out.start + 1).toBe(CHUNK);
  });

  it('leaves a range already inside the cap untouched', () => {
    expect(clampRange({ start: 10, end: 20 }, CHUNK)).toEqual({ start: 10, end: 20 });
  });
});

describe('resolveByteRange: every answer is a bounded 206', () => {
  it('bounds an open-ended request, which is the whole point', () => {
    const res = resolveByteRange('bytes=0-', SIZE, CHUNK);
    expect(res.kind).toBe('ok');
    if (res.kind !== 'ok') return;
    expect(res.range.start).toBe(0);
    expect(res.contentLength).toBe(CHUNK);
    // The regression that matters: never the whole 196 MB in one invocation.
    expect(res.contentLength).toBeLessThan(SIZE);
  });

  it('serves the first window when there is no Range header at all', () => {
    const res = resolveByteRange(null, SIZE, CHUNK);
    expect(res.kind).toBe('ok');
    if (res.kind !== 'ok') return;
    expect(res.range.start).toBe(0);
    expect(res.contentLength).toBe(CHUNK);
  });

  it('honours a small explicit window exactly', () => {
    const res = resolveByteRange('bytes=0-1023', SIZE, CHUNK);
    expect(res.kind).toBe('ok');
    if (res.kind !== 'ok') return;
    expect(res.range).toEqual({ start: 0, end: 1023 });
    expect(res.contentLength).toBe(1024);
  });

  it('serves a mid-file seek from where it was asked', () => {
    const res = resolveByteRange('bytes=100000000-', SIZE, CHUNK);
    expect(res.kind).toBe('ok');
    if (res.kind !== 'ok') return;
    expect(res.range.start).toBe(100_000_000);
    expect(res.contentLength).toBe(CHUNK);
  });

  it('reports a start past the end of the file as unsatisfiable', () => {
    expect(resolveByteRange(`bytes=${SIZE}-`, SIZE, CHUNK).kind).toBe('unsatisfiable');
    expect(resolveByteRange(`bytes=${SIZE + 10}-`, SIZE, CHUNK).kind).toBe('unsatisfiable');
  });

  it('serves the final byte rather than 416 at the last valid offset', () => {
    const res = resolveByteRange(`bytes=${SIZE - 1}-`, SIZE, CHUNK);
    expect(res.kind).toBe('ok');
    if (res.kind !== 'ok') return;
    expect(res.contentLength).toBe(1);
  });

  it('always reports a content length matching the window it serves', () => {
    for (const header of ['bytes=0-', 'bytes=0-10', 'bytes=-500', null, 'garbage', 'bytes=5000000-']) {
      const res = resolveByteRange(header as any, SIZE, CHUNK);
      if (res.kind !== 'ok') continue;
      expect(res.contentLength).toBe(res.range.end - res.range.start + 1);
      expect(res.contentLength).toBeGreaterThan(0);
      expect(res.contentLength).toBeLessThanOrEqual(CHUNK);
      expect(res.range.end).toBeLessThan(SIZE);
    }
  });

  it('handles a file smaller than one chunk', () => {
    const small = 1024;
    const res = resolveByteRange('bytes=0-', small, CHUNK);
    expect(res.kind).toBe('ok');
    if (res.kind !== 'ok') return;
    expect(res.range).toEqual({ start: 0, end: small - 1 });
    expect(res.contentLength).toBe(small);
  });
});

describe('header formatting', () => {
  it('formats a served window', () => {
    expect(formatContentRange({ start: 0, end: 1023 }, SIZE)).toBe(`bytes 0-1023/${SIZE}`);
  });

  it('formats an unsatisfied range', () => {
    expect(formatUnsatisfiedRange(SIZE)).toBe(`bytes */${SIZE}`);
  });
});
