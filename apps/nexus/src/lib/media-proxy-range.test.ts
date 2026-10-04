// @vitest-environment node
import { describe, it, expect } from 'vitest';
import * as nexus from './http-range';
import * as worker from '../../../../cloudflare/media-proxy/src/range';

/**
 * The Worker carries its own copy of the range rules (a Worker bundle cannot
 * import from the Next app). Both copies must answer every request the same
 * way, or a player would behave differently depending on which path served it.
 */

const SIZE = 196_000_000;
const CHUNK = 4 * 1024 * 1024;

const HEADERS: Array<string | null> = [
  null,
  '',
  'bytes=0-',
  'bytes=0-0',
  'bytes=100-200',
  'bytes=-500',
  `bytes=-${SIZE + 10}`,
  `bytes=10-${SIZE + 9999}`,
  `bytes=${SIZE}-`,
  `bytes=${SIZE - 1}-`,
  `bytes=${SIZE + 5}-${SIZE + 10}`,
  'bytes=500-100',
  'bytes=abc-def',
  'bytes=-0',
  'bytes=-',
  'bytes=0-99,200-299',
  'items=0-10',
  '  BYTES=5-9  ',
  'bytes=190000000-',
];

describe('Worker range port matches http-range.ts', () => {
  it('uses the same 4 MB default', () => {
    expect(worker.DEFAULT_MAX_CHUNK_BYTES).toBe(nexus.DEFAULT_MAX_CHUNK_BYTES);
  });

  it.each(HEADERS.map((h) => [h]))('resolves %s identically', (header) => {
    expect(worker.resolveByteRange(header, SIZE, CHUNK)).toEqual(nexus.resolveByteRange(header, SIZE, CHUNK));
    expect(worker.parseRangeHeader(header, SIZE)).toEqual(nexus.parseRangeHeader(header, SIZE));
  });

  it('formats Content-Range identically', () => {
    const r = { start: 10, end: 20 };
    expect(worker.formatContentRange(r, SIZE)).toBe(nexus.formatContentRange(r, SIZE));
    expect(worker.formatUnsatisfiedRange(SIZE)).toBe(nexus.formatUnsatisfiedRange(SIZE));
  });
});

describe('Worker range rules', () => {
  it('serves the first window for no Range header, never the whole file', () => {
    expect(worker.resolveByteRange(null, SIZE, CHUNK)).toEqual({
      kind: 'ok',
      range: { start: 0, end: CHUNK - 1 },
      contentLength: CHUNK,
    });
  });

  it('caps an open-ended request at the chunk size', () => {
    const r = worker.resolveByteRange('bytes=1000-', SIZE, CHUNK);
    expect(r).toEqual({ kind: 'ok', range: { start: 1000, end: 1000 + CHUNK - 1 }, contentLength: CHUNK });
  });

  it('is unsatisfiable past the end', () => {
    expect(worker.resolveByteRange(`bytes=${SIZE}-`, SIZE, CHUNK)).toEqual({ kind: 'unsatisfiable' });
  });

  it('serves the short tail window exactly', () => {
    const r = worker.resolveByteRange(`bytes=${SIZE - 10}-`, SIZE, CHUNK);
    expect(r).toEqual({ kind: 'ok', range: { start: SIZE - 10, end: SIZE - 1 }, contentLength: 10 });
  });
});
