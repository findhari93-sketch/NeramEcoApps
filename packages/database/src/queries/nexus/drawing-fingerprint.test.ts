import { describe, it, expect } from 'vitest';
import {
  FINGERPRINT_GRID,
  SAME_SHEET_MAX_DISTANCE,
  bitsToFingerprint,
  fingerprintDistance,
  isSameSheet,
  parseFingerprint,
} from './drawing-fingerprint';

const N = FINGERPRINT_GRID * FINGERPRINT_GRID;

/** A deterministic pattern: an L-shaped stroke, so rotations are distinguishable. */
function lShape(): number[] {
  const bits = new Array(N).fill(0);
  for (let y = 2; y < 14; y += 1) bits[y * FINGERPRINT_GRID + 3] = 1;
  for (let x = 3; x < 12; x += 1) bits[13 * FINGERPRINT_GRID + x] = 1;
  for (let y = 4; y < 8; y += 1) for (let x = 8; x < 12; x += 1) bits[y * FINGERPRINT_GRID + x] = 1;
  return bits;
}

function rotated(bits: number[]): number[] {
  const out = new Array(N);
  for (let y = 0; y < FINGERPRINT_GRID; y += 1) {
    for (let x = 0; x < FINGERPRINT_GRID; x += 1) out[x * FINGERPRINT_GRID + (FINGERPRINT_GRID - 1 - y)] = bits[y * FINGERPRINT_GRID + x];
  }
  return out;
}

describe('drawing fingerprints', () => {
  it('round-trips bits through the stored hex form', () => {
    const bits = lShape();
    const hex = bitsToFingerprint(bits);
    expect(hex).toMatch(/^[0-9a-f]{64}$/);
    expect(Array.from(parseFingerprint(hex)!)).toEqual(bits);
  });

  it('refuses anything that is not a fingerprint', () => {
    expect(parseFingerprint(null)).toBeNull();
    expect(parseFingerprint('abc')).toBeNull();
    expect(parseFingerprint('z'.repeat(64))).toBeNull();
    expect(parseFingerprint(42)).toBeNull();
  });

  it('reads the same sheet as the same sheet, even turned sideways or upside down', () => {
    const a = bitsToFingerprint(lShape());
    const quarter = bitsToFingerprint(rotated(lShape()));
    const half = bitsToFingerprint(rotated(rotated(lShape())));
    expect(fingerprintDistance(a, a)).toBe(0);
    expect(fingerprintDistance(a, quarter)).toBe(0);
    expect(fingerprintDistance(a, half)).toBe(0);
    expect(isSameSheet(a, quarter)).toBe(true);
  });

  it('tolerates a re-photographed sheet (a few cells flipped) but not a different drawing', () => {
    const bits = lShape();
    const nearly = [...bits];
    for (const i of [0, 17, 40, 99, 130, 200]) nearly[i] = 1 - nearly[i];
    expect(isSameSheet(bitsToFingerprint(bits), bitsToFingerprint(nearly))).toBe(true);

    const different = bits.map((_, i) => ((i * 7) % 5 < 2 ? 1 : 0));
    expect(fingerprintDistance(bitsToFingerprint(bits), bitsToFingerprint(different))!).toBeGreaterThan(SAME_SHEET_MAX_DISTANCE);
    expect(isSameSheet(bitsToFingerprint(bits), bitsToFingerprint(different))).toBe(false);
  });

  it('never matches when either side has no fingerprint', () => {
    const a = bitsToFingerprint(lShape());
    expect(fingerprintDistance(a, null)).toBeNull();
    expect(isSameSheet(null, a)).toBe(false);
    expect(isSameSheet(undefined, undefined)).toBe(false);
  });
});
