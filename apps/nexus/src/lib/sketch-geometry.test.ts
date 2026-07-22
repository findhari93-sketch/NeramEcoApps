import { describe, it, expect } from 'vitest';
import {
  distanceToSegment,
  distanceToPolyline,
  hitTestItem,
  buildSmoothStroke,
  arrowHead,
  type CanvasItem,
} from './sketch-geometry';

describe('distanceToSegment', () => {
  it('measures perpendicular distance to the segment', () => {
    // Segment along the x-axis from (0,0) to (10,0); point above the middle.
    expect(distanceToSegment({ x: 5, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBeCloseTo(3);
  });

  it('clamps to the nearest endpoint when the projection falls outside', () => {
    // Point well to the left of the segment start.
    expect(distanceToSegment({ x: -4, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBeCloseTo(4);
    // Point well to the right of the segment end.
    expect(distanceToSegment({ x: 13, y: 4 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBeCloseTo(5);
  });

  it('handles a degenerate zero-length segment', () => {
    expect(distanceToSegment({ x: 3, y: 4 }, { x: 0, y: 0 }, { x: 0, y: 0 })).toBeCloseTo(5);
  });
});

describe('distanceToPolyline', () => {
  const poly = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
  ];
  it('returns the distance to the closest segment', () => {
    expect(distanceToPolyline({ x: 12, y: 5 }, poly)).toBeCloseTo(2);
    expect(distanceToPolyline({ x: 5, y: -1 }, poly)).toBeCloseTo(1);
  });
  it('handles single-point and empty polylines', () => {
    expect(distanceToPolyline({ x: 3, y: 4 }, [{ x: 0, y: 0 }])).toBeCloseTo(5);
    expect(distanceToPolyline({ x: 0, y: 0 }, [])).toBe(Infinity);
  });
});

describe('hitTestItem (whole-item eraser)', () => {
  const stroke: CanvasItem = {
    id: 's1',
    type: 'stroke',
    points: [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ],
    color: '#FF0000',
    width: 4,
  };

  it('hits a stroke when within radius + half width', () => {
    // width/2 = 2, radius 5 -> tolerance 7; point 6px away should hit.
    expect(hitTestItem(stroke, { x: 50, y: 6 }, 5)).toBe(true);
  });

  it('misses a stroke when beyond the tolerance', () => {
    // tolerance 7; point 20px away should miss.
    expect(hitTestItem(stroke, { x: 50, y: 20 }, 5)).toBe(false);
  });

  const text: CanvasItem = {
    id: 't1',
    type: 'text',
    x: 200,
    y: 200,
    text: 'Not to scale',
    color: '#FF0000',
    fontSize: 24,
  };

  it('hits a text item inside its padded box', () => {
    expect(hitTestItem(text, { x: 205, y: 205 }, 6)).toBe(true);
  });

  it('misses a text item far from its box', () => {
    expect(hitTestItem(text, { x: 600, y: 600 }, 6)).toBe(false);
  });

  it('hits a text item by touching its leader arrow', () => {
    const withLeader: CanvasItem = { ...text, leader: { x: 400, y: 400 } };
    // Point roughly on the line from the text anchor to the leader tip.
    expect(hitTestItem(withLeader, { x: 320, y: 340 }, 30)).toBe(true);
  });
});

describe('buildSmoothStroke', () => {
  it('returns a move+line for two points (no curve needed)', () => {
    const cmds = buildSmoothStroke([
      { x: 0, y: 0 },
      { x: 10, y: 10 },
    ]);
    expect(cmds).toEqual([
      { type: 'move', x: 0, y: 0 },
      { type: 'line', x: 10, y: 10 },
    ]);
  });

  it('uses quadratic curves through midpoints for 3+ points', () => {
    const cmds = buildSmoothStroke([
      { x: 0, y: 0 },
      { x: 10, y: 10 },
      { x: 20, y: 0 },
    ]);
    expect(cmds[0]).toEqual({ type: 'move', x: 0, y: 0 });
    // interior point (10,10) is the control; curve ends at midpoint of (10,10)-(20,0) = (15,5)
    expect(cmds[1]).toEqual({ type: 'quad', cx: 10, cy: 10, x: 15, y: 5 });
    // final segment lines to the last raw point
    expect(cmds[cmds.length - 1]).toEqual({ type: 'line', x: 20, y: 0 });
  });

  it('handles a single point as a dot', () => {
    const cmds = buildSmoothStroke([{ x: 5, y: 5 }]);
    expect(cmds).toEqual([
      { type: 'move', x: 5, y: 5 },
      { type: 'line', x: 5, y: 5 },
    ]);
  });

  it('returns nothing for no points', () => {
    expect(buildSmoothStroke([])).toEqual([]);
  });
});

describe('arrowHead', () => {
  it('produces two barbs behind the tip along the incoming direction', () => {
    const [b1, b2] = arrowHead({ x: 0, y: 0 }, { x: 100, y: 0 }, 14);
    // For a horizontal arrow, both barbs sit left of the tip (smaller x)...
    expect(b1.x).toBeLessThan(100);
    expect(b2.x).toBeLessThan(100);
    // ...and are mirrored across the arrow axis (y = 0).
    expect(b1.y).toBeCloseTo(-b2.y);
  });
});
