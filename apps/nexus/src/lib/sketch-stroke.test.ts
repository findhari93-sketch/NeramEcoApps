import { describe, it, expect } from 'vitest';
import type { Point } from './sketch-geometry';
import {
  buildStrokeOutline,
  splitStrokeAtHits,
  smoothCentreline,
  MIN_PRESSURE_SCALE,
} from './sketch-stroke';

/** Widest perpendicular spread of an outline around a horizontal centreline. */
const spreadAtX = (outline: Point[], x: number, tolerance = 0.6) => {
  const near = outline.filter((p) => Math.abs(p.x - x) <= tolerance);
  if (near.length < 2) return 0;
  const ys = near.map((p) => p.y);
  return Math.max(...ys) - Math.min(...ys);
};

const horizontal = (count: number, y = 100): Point[] =>
  Array.from({ length: count }, (_, i) => ({ x: i * 10, y }));

describe('buildStrokeOutline', () => {
  it('has nothing to draw for no points', () => {
    expect(buildStrokeOutline([], undefined, 10)).toEqual([]);
  });

  it('turns a single point into a round dot of the right size', () => {
    const outline = buildStrokeOutline([{ x: 50, y: 50 }], undefined, 10);
    expect(outline.length).toBeGreaterThan(6);
    const xs = outline.map((p) => p.x);
    const ys = outline.map((p) => p.y);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(10, 0);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(10, 0);
  });

  it('without pressure, draws the constant width it was asked for', () => {
    const outline = buildStrokeOutline(horizontal(5), undefined, 12);
    expect(spreadAtX(outline, 20)).toBeCloseTo(12, 0);
  });

  it('treats full pressure the same as no pressure at all', () => {
    const points = horizontal(5);
    const flat = buildStrokeOutline(points, undefined, 12);
    const full = buildStrokeOutline(points, [1, 1, 1, 1, 1], 12);
    expect(spreadAtX(full, 20)).toBeCloseTo(spreadAtX(flat, 20), 1);
  });

  it('narrows where the pen was light and widens where it pressed', () => {
    const outline = buildStrokeOutline(horizontal(5), [0.1, 0.1, 1, 1, 1], 20);
    const light = spreadAtX(outline, 0);
    const heavy = spreadAtX(outline, 40);
    expect(light).toBeLessThan(heavy);
    expect(heavy).toBeCloseTo(20, 0);
  });

  it('never lets a light touch vanish entirely', () => {
    const outline = buildStrokeOutline(horizontal(5), [0, 0, 0, 0, 0], 20);
    expect(spreadAtX(outline, 20)).toBeCloseTo(20 * MIN_PRESSURE_SCALE, 0);
  });

  it('survives a pressure array shorter than the points', () => {
    expect(() => buildStrokeOutline(horizontal(5), [0.5], 10)).not.toThrow();
    expect(buildStrokeOutline(horizontal(5), [0.5], 10).length).toBeGreaterThan(4);
  });

  it('survives two points on top of each other', () => {
    const stacked = [{ x: 10, y: 10 }, { x: 10, y: 10 }];
    expect(() => buildStrokeOutline(stacked, undefined, 8)).not.toThrow();
    expect(buildStrokeOutline(stacked, undefined, 8).length).toBeGreaterThan(0);
  });

  it('comes back as a closed ring, so one fill paints the whole stroke', () => {
    const outline = buildStrokeOutline(horizontal(6), undefined, 10);
    const first = outline[0];
    const last = outline[outline.length - 1];
    expect(Math.hypot(first.x - last.x, first.y - last.y)).toBeLessThan(0.01);
  });
});

describe('splitStrokeAtHits', () => {
  it('leaves a stroke alone when the eraser missed it', () => {
    const points = horizontal(5);
    const spans = splitStrokeAtHits(points, undefined, { x: 0, y: 999 }, 5);
    expect(spans).toHaveLength(1);
    expect(spans[0].points).toEqual(points);
  });

  it('erasing the middle leaves two pieces, not nothing', () => {
    const spans = splitStrokeAtHits(horizontal(9), undefined, { x: 40, y: 100 }, 12);
    expect(spans).toHaveLength(2);
    expect(spans[0].points[0]).toEqual({ x: 0, y: 100 });
    expect(spans[1].points[spans[1].points.length - 1]).toEqual({ x: 80, y: 100 });
  });

  it('erasing the head leaves only the tail', () => {
    const spans = splitStrokeAtHits(horizontal(9), undefined, { x: 0, y: 100 }, 15);
    expect(spans).toHaveLength(1);
    expect(spans[0].points[0].x).toBeGreaterThan(10);
  });

  it('erasing all of it leaves nothing', () => {
    const spans = splitStrokeAtHits(horizontal(3), undefined, { x: 10, y: 100 }, 500);
    expect(spans).toEqual([]);
  });

  it('carries the pressures with the pieces they belong to', () => {
    const spans = splitStrokeAtHits(horizontal(9), [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8], { x: 40, y: 100 }, 12);
    expect(spans).toHaveLength(2);
    // Hits are tested against each segment, not just each vertex, so the two
    // segments that pass within the radius go too: indices 3 to 6, not 3 to 5.
    expect(spans[0].pressures).toEqual([0, 0.1, 0.2]);
    expect(spans[1].pressures).toEqual([0.7, 0.8]);
    spans.forEach((span) => expect(span.pressures).toHaveLength(span.points.length));
  });

  it('drops a lone surviving point rather than leaving a smudge', () => {
    // Erases everything except the very first point.
    const spans = splitStrokeAtHits(horizontal(5), undefined, { x: 40, y: 100 }, 35);
    expect(spans).toEqual([]);
  });

  it('keeps a single-point stroke the eraser missed', () => {
    const dot = [{ x: 5, y: 5 }];
    expect(splitStrokeAtHits(dot, undefined, { x: 900, y: 900 }, 5)[0].points).toEqual(dot);
  });

  it('reports no pressures when the stroke carried none', () => {
    const spans = splitStrokeAtHits(horizontal(9), undefined, { x: 40, y: 100 }, 12);
    spans.forEach((span) => expect(span.pressures).toBeUndefined());
  });
});

describe('smoothCentreline', () => {
  it('leaves a two-point stroke alone, there is no curve to find', () => {
    const points = horizontal(2);
    expect(smoothCentreline(points).points).toEqual(points);
  });

  it('adds samples between the points that were captured', () => {
    const out = smoothCentreline(horizontal(5));
    expect(out.points.length).toBeGreaterThan(5);
  });

  it('still starts and ends exactly where the pen did', () => {
    const points = horizontal(5);
    const out = smoothCentreline(points);
    expect(out.points[0]).toEqual(points[0]);
    expect(out.points[out.points.length - 1]).toEqual(points[points.length - 1]);
  });

  it('carries one pressure per sample, or none at all', () => {
    const withP = smoothCentreline(horizontal(5), [0.2, 0.4, 0.6, 0.8, 1]);
    expect(withP.pressures).toHaveLength(withP.points.length);
    expect(smoothCentreline(horizontal(5)).pressures).toBeUndefined();
  });

  it('keeps a steady hand steady', () => {
    const out = smoothCentreline(horizontal(6), [0.5, 0.5, 0.5, 0.5, 0.5, 0.5]);
    out.pressures!.forEach((p) => expect(p).toBeCloseTo(0.5, 5));
  });

  it('never invents a pressure outside the range it was given', () => {
    const out = smoothCentreline(horizontal(6), [0, 0.3, 0.9, 0.4, 1, 0.1]);
    out.pressures!.forEach((p) => {
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
    });
  });

  it('does not wander off the line a straight stroke drew', () => {
    smoothCentreline(horizontal(6)).points.forEach((p) => expect(p.y).toBeCloseTo(100, 6));
  });
});
