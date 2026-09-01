import { describe, it, expect } from 'vitest';
import {
  isRotation,
  normalizeRotation,
  nextRotation,
  prevRotation,
  swapsAxes,
  rotatedSize,
  rotatedFitScale,
  rotationTransform,
  type Rotation,
} from './image-rotation';

describe('isRotation', () => {
  it('accepts the four quarter turns', () => {
    for (const r of [0, 90, 180, 270]) expect(isRotation(r)).toBe(true);
  });

  it('rejects anything else', () => {
    for (const bad of [45, 360, -90, '90', null, undefined, NaN]) {
      expect(isRotation(bad)).toBe(false);
    }
  });
});

describe('normalizeRotation', () => {
  it('passes the legal turns through unchanged', () => {
    for (const r of [0, 90, 180, 270]) expect(normalizeRotation(r)).toBe(r);
  });

  it('wraps a full turn back to zero', () => {
    expect(normalizeRotation(360)).toBe(0);
    expect(normalizeRotation(450)).toBe(90);
  });

  it('wraps negatives into range', () => {
    expect(normalizeRotation(-90)).toBe(270);
    expect(normalizeRotation(-180)).toBe(180);
    expect(normalizeRotation(-450)).toBe(270);
  });

  it('snaps an off-axis angle to the nearest quarter turn', () => {
    expect(normalizeRotation(80)).toBe(90);
    expect(normalizeRotation(100)).toBe(90);
  });

  it('falls back to zero for non-finite input', () => {
    expect(normalizeRotation(NaN)).toBe(0);
    expect(normalizeRotation(Infinity)).toBe(0);
  });
});

describe('nextRotation / prevRotation', () => {
  it('advances clockwise and wraps', () => {
    expect(nextRotation(0)).toBe(90);
    expect(nextRotation(90)).toBe(180);
    expect(nextRotation(180)).toBe(270);
    expect(nextRotation(270)).toBe(0);
  });

  it('advances counter-clockwise and wraps', () => {
    expect(prevRotation(0)).toBe(270);
    expect(prevRotation(270)).toBe(180);
    expect(prevRotation(90)).toBe(0);
  });

  it('returns to the start after four steps in either direction', () => {
    let r: Rotation = 0;
    for (let i = 0; i < 4; i++) r = nextRotation(r);
    expect(r).toBe(0);
    for (let i = 0; i < 4; i++) r = prevRotation(r);
    expect(r).toBe(0);
  });
});

describe('swapsAxes', () => {
  it('is true only on the quarter turns', () => {
    expect(swapsAxes(0)).toBe(false);
    expect(swapsAxes(90)).toBe(true);
    expect(swapsAxes(180)).toBe(false);
    expect(swapsAxes(270)).toBe(true);
  });
});

describe('rotatedSize', () => {
  it('leaves the axes alone on 0 and 180', () => {
    expect(rotatedSize(400, 300, 0)).toEqual({ width: 400, height: 300 });
    expect(rotatedSize(400, 300, 180)).toEqual({ width: 400, height: 300 });
  });

  it('swaps the axes on 90 and 270', () => {
    expect(rotatedSize(400, 300, 90)).toEqual({ width: 300, height: 400 });
    expect(rotatedSize(400, 300, 270)).toEqual({ width: 300, height: 400 });
  });

  it('is a no-op for a square image', () => {
    expect(rotatedSize(500, 500, 90)).toEqual({ width: 500, height: 500 });
  });
});

describe('rotatedFitScale', () => {
  it('is identity on 0 and 180, where the contain-fit already holds', () => {
    expect(rotatedFitScale(400, 300, 400, 300, 0)).toBe(1);
    expect(rotatedFitScale(400, 300, 400, 300, 180)).toBe(1);
  });

  it('shrinks a landscape image turned upright inside a landscape container', () => {
    // Occupied box becomes 300 wide x 400 tall in a 400x300 container:
    // min(400/300, 300/400) = 0.75
    expect(rotatedFitScale(400, 300, 400, 300, 90)).toBe(0.75);
    expect(rotatedFitScale(400, 300, 400, 300, 270)).toBe(0.75);
  });

  it('is identity for a square image in a square container', () => {
    expect(rotatedFitScale(300, 300, 300, 300, 90)).toBe(1);
  });

  it('grows a portrait image turned sideways when the container has room', () => {
    // A 200x400 image contain-fitted in a 400x400 box, rotated 90, occupies
    // 400 wide x 200 tall: min(400/400, 400/200) = 1, it exactly fills.
    expect(rotatedFitScale(200, 400, 400, 400, 90)).toBe(1);
    // With a wider container there is genuine room to grow.
    expect(rotatedFitScale(200, 400, 800, 400, 90)).toBe(2);
  });

  it('never lets the rotated box exceed the container', () => {
    const cases: Array<[number, number, number, number]> = [
      [400, 300, 375, 400],
      [1200, 1600, 375, 300],
      [640, 480, 900, 500],
      [100, 900, 375, 812],
    ];
    for (const [rw, rh, cw, ch] of cases) {
      const s = rotatedFitScale(rw, rh, cw, ch, 90);
      // After rotating, occupied width is rh and occupied height is rw.
      expect(rh * s).toBeLessThanOrEqual(cw + 1e-9);
      expect(rw * s).toBeLessThanOrEqual(ch + 1e-9);
    }
  });

  it('returns 1 for degenerate inputs rather than collapsing the image', () => {
    expect(rotatedFitScale(0, 300, 400, 300, 90)).toBe(1);
    expect(rotatedFitScale(400, 0, 400, 300, 90)).toBe(1);
    expect(rotatedFitScale(400, 300, 0, 300, 90)).toBe(1);
    expect(rotatedFitScale(400, 300, 400, 0, 90)).toBe(1);
    expect(rotatedFitScale(NaN, 300, 400, 300, 90)).toBe(1);
  });
});

describe('rotationTransform', () => {
  it('is none at rest, so an unrotated image keeps its plain layout', () => {
    expect(rotationTransform(400, 300, 400, 300, 0)).toBe('none');
  });

  it('rotates without scaling on the half turn', () => {
    expect(rotationTransform(400, 300, 400, 300, 180)).toBe('rotate(180deg) scale(1)');
  });

  it('combines the turn and the fit correction on a quarter turn', () => {
    expect(rotationTransform(400, 300, 400, 300, 90)).toBe('rotate(90deg) scale(0.75)');
  });
});
