import { describe, it, expect } from 'vitest';
import { FINGERPRINT_GRID as SHARED_GRID, fingerprintDistance, isSameSheet, parseFingerprint } from '@neram/database/queries/nexus';
import { FINGERPRINT_GRID, drawingFingerprint } from './image-fingerprint';

/** An RGBA buffer from a greyscale function. */
function image(width: number, height: number, grey: (x: number, y: number) => number): number[] {
  const data: number[] = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const v = Math.max(0, Math.min(255, grey(x, y)));
      data.push(v, v, v, 255);
    }
  }
  return data;
}

const W = 160;
const H = 120;

/** A house: a box, a roof line and a door, drawn in dark pencil on paper. */
const house = (x: number, y: number) => {
  const onBox = (y === 50 || y === 100) && x >= 40 && x <= 120 || (x === 40 || x === 120) && y >= 50 && y <= 100;
  const onRoof = Math.abs((y - 50) + (x - 80) * 0.6) < 1 && x >= 40 && x <= 80 || Math.abs((y - 50) - (x - 80) * 0.6) < 1 && x >= 80 && x <= 120;
  const onDoor = (x === 72 || x === 88) && y >= 75 && y <= 100 || y === 75 && x >= 72 && x <= 88;
  return onBox || onRoof || onDoor ? 60 : 232;
};

/** A still life: two circles and a table line. */
const stillLife = (x: number, y: number) => {
  const c1 = Math.abs(Math.hypot(x - 55, y - 55) - 22) < 1;
  const c2 = Math.abs(Math.hypot(x - 110, y - 70) - 15) < 1;
  const table = y === 95 && x >= 20 && x <= 145;
  return c1 || c2 || table ? 60 : 232;
};

describe('drawingFingerprint', () => {
  it('speaks the exact format the inbox query compares', () => {
    expect(FINGERPRINT_GRID).toBe(SHARED_GRID);
    const fp = drawingFingerprint(image(W, H, house), W, H);
    expect(parseFingerprint(fp)).not.toBeNull();
  });

  it('gives the same sheet the same fingerprint under different lighting', () => {
    const lit = drawingFingerprint(image(W, H, house), W, H);
    // The same drawing under a lamp that falls off to the right.
    const dim = drawingFingerprint(image(W, H, (x, y) => house(x, y) - x * 0.5), W, H);
    expect(lit).toMatch(/^[0-9a-f]{64}$/);
    expect(isSameSheet(lit, dim)).toBe(true);
  });

  it('gives the same sheet the same fingerprint when framed differently', () => {
    const tight = drawingFingerprint(image(W, H, house), W, H);
    // Same drawing off-centre in a much wider frame: the crop to the ink undoes the framing.
    const wide = drawingFingerprint(image(W * 2, H * 2, (x, y) => house(x - 80, y - 60)), W * 2, H * 2);
    expect(isSameSheet(tight, wide)).toBe(true);
  });

  it('matches a copy turned a quarter', () => {
    const upright = drawingFingerprint(image(W, H, house), W, H);
    // Rotate 90 degrees: the new image is H wide and W tall.
    const turned = drawingFingerprint(image(H, W, (x, y) => house(y, H - 1 - x)), H, W);
    expect(isSameSheet(upright, turned)).toBe(true);
  });

  it('tells two different drawings apart', () => {
    const a = drawingFingerprint(image(W, H, house), W, H);
    const b = drawingFingerprint(image(W, H, stillLife), W, H);
    expect(fingerprintDistance(a, b)!).toBeGreaterThan(0.2);
    expect(isSameSheet(a, b)).toBe(false);
  });

  it('gives a blank page no fingerprint, so blank pages never match each other', () => {
    expect(drawingFingerprint(image(W, H, () => 232), W, H)).toBeNull();
    expect(drawingFingerprint(image(W, H, (x) => 232 - x * 0.5), W, H)).toBeNull();
  });

  it('gives a tiny image no fingerprint', () => {
    expect(drawingFingerprint(image(4, 4, house), 4, 4)).toBeNull();
  });
});
