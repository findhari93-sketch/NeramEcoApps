import { describe, it, expect } from 'vitest';
import { measureQuality, parseQuality } from './image-quality';

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

const W = 80;
const H = 60;
const paper = () => 235;
/** Crisp one-pixel pencil lines every eight pixels. */
const lines = (x: number) => (x % 8 === 0 ? 40 : 235);
/** The same lines smeared across neighbours, as a shaken photo would. */
const smeared = (x: number) => {
  const d = Math.min(x % 8, 8 - (x % 8));
  return 235 - Math.max(0, 195 - d * 60);
};

describe('measureQuality', () => {
  it('reads crisp lines as sharper than the same lines smeared', () => {
    const crisp = measureQuality(image(W, H, lines), W, H);
    const blurred = measureQuality(image(W, H, smeared), W, H);
    expect(crisp.sharpness).toBeGreaterThan(blurred.sharpness * 2);
  });

  it('finds almost no ink on a blank sheet', () => {
    expect(measureQuality(image(W, H, paper), W, H).ink).toBe(0);
  });

  it('finds ink where there are lines', () => {
    const q = measureQuality(image(W, H, lines), W, H);
    expect(q.ink).toBeGreaterThan(0.05);
    expect(q.ink).toBeLessThan(0.5);
  });

  it('counts faint pencil as ink, not only dark lines', () => {
    // A construction line only 30 levels darker than the paper. The first
    // version of this measure called the faintest real sheet blank.
    const faint = (x: number) => (x % 8 === 0 ? 205 : 235);
    expect(measureQuality(image(W, H, faint), W, H).ink).toBeGreaterThan(0.05);
  });

  it('does not read a lamp falloff across empty paper as ink', () => {
    // Bright on the left, dim on the right, no drawing at all.
    const falloff = (x: number) => 235 - x * 2;
    expect(measureQuality(image(W, H, falloff), W, H).ink).toBeLessThan(0.005);
  });

  it('reports how bright the photo is', () => {
    expect(measureQuality(image(W, H, () => 30), W, H).brightness).toBeCloseTo(30, 0);
    expect(measureQuality(image(W, H, paper), W, H).brightness).toBeCloseTo(235, 0);
  });

  it('is not fooled into seeing ink on a uniformly dark photo', () => {
    // Everything is dark, so nothing is darker than the paper: this is a
    // brightness problem, not a drawing.
    expect(measureQuality(image(W, H, () => 25), W, H).ink).toBe(0);
  });

  it('keeps the original aspect ratio when one is given', () => {
    expect(measureQuality(image(W, H, paper), W, H, 1.414).aspect).toBe(1.414);
  });

  it('survives an image too small to measure', () => {
    expect(measureQuality(image(2, 2, paper), 2, 2)).toMatchObject({ sharpness: 0, ink: 0 });
  });
});

describe('parseQuality', () => {
  const good = { sharpness: 120.5, ink: 0.08, brightness: 210, aspect: 0.75, v: 1 };

  it('accepts a real measurement', () => {
    expect(parseQuality(good)).toEqual(good);
  });

  it('refuses ink outside 0 to 1', () => {
    expect(parseQuality({ ...good, ink: 1.4 })).toBeNull();
  });

  it('refuses a brightness outside what a pixel can be', () => {
    expect(parseQuality({ ...good, brightness: 300 })).toBeNull();
  });

  it('refuses anything that is not a number', () => {
    expect(parseQuality({ ...good, sharpness: 'sharp' })).toBeNull();
    expect(parseQuality({ ...good, aspect: Number.NaN })).toBeNull();
    expect(parseQuality(null)).toBeNull();
  });
});
