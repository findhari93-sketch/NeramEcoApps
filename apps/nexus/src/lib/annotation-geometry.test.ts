import { describe, it, expect } from 'vitest';
import {
  centeredBox,
  clamp01,
  clampRect,
  containBox,
  isNormRect,
  isReady,
  pointToPx,
  rectFromCorners,
  rectToPx,
  toImageSpace,
  toStyle,
  type FittedBox,
  type NormRect,
} from './annotation-geometry';

const stage = { left: 0, top: 0 };

/** Rect equality that tolerates binary floating point (1 - 0.8 is not 0.2). */
function expectRect(actual: NormRect, expected: NormRect) {
  expect(actual.x).toBeCloseTo(expected.x, 10);
  expect(actual.y).toBeCloseTo(expected.y, 10);
  expect(actual.width).toBeCloseTo(expected.width, 10);
  expect(actual.height).toBeCloseTo(expected.height, 10);
}

describe('containBox', () => {
  it('letterboxes top and bottom when the image is wider than the stage', () => {
    // 400x200 image in a 400x400 stage: scale 1, 200px of band split evenly.
    expect(containBox(400, 200, 400, 400)).toEqual({ left: 0, top: 100, width: 400, height: 200 });
  });

  it('letterboxes left and right when the image is taller than the stage', () => {
    expect(containBox(200, 400, 400, 400)).toEqual({ left: 100, top: 0, width: 200, height: 400 });
  });

  it('fills the stage exactly when the aspect ratios match', () => {
    expect(containBox(800, 400, 400, 200)).toEqual({ left: 0, top: 0, width: 400, height: 200 });
  });

  it('scales down to the limiting axis', () => {
    // 1000x500 into 400x400: width limits, scale 0.4.
    expect(containBox(1000, 500, 400, 400)).toEqual({ left: 0, top: 100, width: 400, height: 200 });
  });

  it('returns an unready box for zero or missing dimensions rather than dividing by zero', () => {
    for (const box of [
      containBox(0, 200, 400, 400),
      containBox(400, 0, 400, 400),
      containBox(400, 200, 0, 400),
      containBox(400, 200, 400, 0),
      containBox(NaN, 200, 400, 400),
    ]) {
      expect(isReady(box)).toBe(false);
      expect(box).toEqual({ left: 0, top: 0, width: 0, height: 0 });
    }
  });
});

describe('centeredBox', () => {
  it('centres a measured image inside its stage', () => {
    expect(centeredBox(400, 200, 400, 400)).toEqual({ left: 0, top: 100, width: 400, height: 200 });
  });

  it('keeps a small image at its own size instead of scaling it up', () => {
    // The distinction that makes this function necessary: maxWidth/maxHeight
    // caps a large sheet but never enlarges a small one, while contain would.
    expect(centeredBox(100, 80, 400, 400)).toEqual({ left: 150, top: 160, width: 100, height: 80 });
    expect(containBox(100, 80, 400, 400)).toEqual({ left: 0, top: 40, width: 400, height: 320 });
  });

  it('returns an unready box before layout has happened', () => {
    expect(isReady(centeredBox(0, 0, 400, 400))).toBe(false);
  });
});

describe('toImageSpace', () => {
  const box = containBox(400, 200, 400, 400); // bands of 100px top and bottom

  it('maps the drawing top-left to the origin, not the stage top-left', () => {
    expect(toImageSpace(0, 100, stage, box)).toEqual({ x: 0, y: 0 });
  });

  it('maps the drawing centre to the middle', () => {
    expect(toImageSpace(200, 200, stage, box)).toEqual({ x: 0.5, y: 0.5 });
  });

  it('clamps a pointer inside the letterbox band to the edge of the drawing', () => {
    // y=20 is in the top band, above the drawing entirely.
    expect(toImageSpace(200, 20, stage, box)).toEqual({ x: 0.5, y: 0 });
    expect(toImageSpace(200, 395, stage, box)).toEqual({ x: 0.5, y: 1 });
  });

  it('accounts for a stage that is not at the viewport origin', () => {
    expect(toImageSpace(50 + 200, 30 + 200, { left: 50, top: 30 }, box)).toEqual({ x: 0.5, y: 0.5 });
  });

  it('returns null when the box is not ready', () => {
    expect(toImageSpace(10, 10, stage, { left: 0, top: 0, width: 0, height: 0 })).toBeNull();
  });
});

describe('round trip', () => {
  const cases: Array<[string, FittedBox]> = [
    ['wide image', containBox(400, 200, 400, 400)],
    ['tall image', containBox(200, 400, 400, 400)],
    ['exact fit', containBox(800, 400, 400, 200)],
  ];

  for (const [label, box] of cases) {
    it(`preserves a point through toImageSpace then pointToPx (${label})`, () => {
      for (const point of [{ x: 0, y: 0 }, { x: 0.25, y: 0.75 }, { x: 1, y: 1 }]) {
        const px = pointToPx(point, box);
        const back = toImageSpace(px.left, px.top, stage, box);
        expect(back!.x).toBeCloseTo(point.x, 10);
        expect(back!.y).toBeCloseTo(point.y, 10);
      }
    });
  }

  it('keeps a rectangle inside the drawing, never the letterbox band', () => {
    const box = containBox(400, 200, 400, 400);
    const full = rectToPx({ x: 0, y: 0, width: 1, height: 1 }, box);
    expect(full).toEqual({ left: 0, top: 100, width: 400, height: 200 });
  });
});

describe('the drift this replaces', () => {
  it('places the same stored rectangle on the same part of the drawing at both viewports', () => {
    // One rectangle over the middle of the drawing, two very different stages.
    const rect = { x: 0.25, y: 0.25, width: 0.5, height: 0.5 };
    const mobile = containBox(1000, 700, 360, 400);
    const desktop = containBox(1000, 700, 900, 600);

    const onMobile = rectToPx(rect, mobile);
    const onDesktop = rectToPx(rect, desktop);

    // Expressed as a fraction of the drawing itself, the two agree exactly.
    expect(onMobile.width / mobile.width).toBeCloseTo(onDesktop.width / desktop.width, 10);
    expect((onMobile.left - mobile.left) / mobile.width).toBeCloseTo(
      (onDesktop.left - desktop.left) / desktop.width,
      10,
    );
  });
});

describe('toStyle', () => {
  it('emits pixel offsets that already include the letterbox band', () => {
    const box = containBox(400, 200, 400, 400);
    expect(toStyle({ x: 0.5, y: 0, width: 0.5, height: 0.5 }, box)).toEqual({
      left: '200px',
      top: '100px',
      width: '200px',
      height: '100px',
    });
  });
});

describe('rectFromCorners', () => {
  it('normalises a drag made in any direction', () => {
    const expected = { x: 0.2, y: 0.3, width: 0.4, height: 0.2 };
    expectRect(rectFromCorners({ x: 0.2, y: 0.3 }, { x: 0.6, y: 0.5 }), expected);
    expectRect(rectFromCorners({ x: 0.6, y: 0.5 }, { x: 0.2, y: 0.3 }), expected);
  });

  it('gives a zero-area rectangle for a tap', () => {
    expect(rectFromCorners({ x: 0.4, y: 0.4 }, { x: 0.4, y: 0.4 })).toEqual({
      x: 0.4, y: 0.4, width: 0, height: 0,
    });
  });
});

describe('isNormRect', () => {
  it('accepts a rectangle inside the unit square', () => {
    expect(isNormRect({ x: 0, y: 0, width: 1, height: 1 })).toBe(true);
    expect(isNormRect({ x: 0.1, y: 0.2, width: 0.3, height: 0.4 })).toBe(true);
  });

  it('rejects percentages, which is the old contract leaking through', () => {
    expect(isNormRect({ x: 12, y: 30, width: 18, height: 22 })).toBe(false);
  });

  it('rejects a rectangle that runs off the image', () => {
    expect(isNormRect({ x: 0.9, y: 0, width: 0.5, height: 0.1 })).toBe(false);
  });

  it('rejects negatives, non-numbers and non-objects', () => {
    expect(isNormRect({ x: -0.1, y: 0, width: 0.2, height: 0.2 })).toBe(false);
    expect(isNormRect({ x: '0.1', y: 0, width: 0.2, height: 0.2 })).toBe(false);
    expect(isNormRect({ x: NaN, y: 0, width: 0.2, height: 0.2 })).toBe(false);
    expect(isNormRect(null)).toBe(false);
    expect(isNormRect([])).toBe(false);
  });

  it('tolerates a hair over 1, which is rounding rather than an error', () => {
    expect(isNormRect({ x: 0.5, y: 0.5, width: 0.50005, height: 0.5 })).toBe(true);
  });
});

describe('clampRect', () => {
  it('shrinks a rectangle that overflows rather than moving it', () => {
    expectRect(clampRect({ x: 0.8, y: 0.8, width: 0.5, height: 0.5 }), {
      x: 0.8, y: 0.8, width: 0.2, height: 0.2,
    });
  });

  it('leaves a valid rectangle untouched', () => {
    const r = { x: 0.1, y: 0.2, width: 0.3, height: 0.4 };
    expect(clampRect(r)).toEqual(r);
  });
});

describe('clamp01', () => {
  it('pins out of range values and treats NaN as zero', () => {
    expect(clamp01(-1)).toBe(0);
    expect(clamp01(2)).toBe(1);
    expect(clamp01(0.5)).toBe(0.5);
    expect(clamp01(NaN)).toBe(0);
  });
});
