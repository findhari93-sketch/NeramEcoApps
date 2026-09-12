import { describe, it, expect } from 'vitest';
import {
  MAX_TIMELINE_BYTES,
  TIMELINE_VERSION,
  normPoint,
  timelineBytes,
  validateTimeline,
  visibleAt,
  type SketchTimeline,
} from './sketch-timeline';

/** A stroke drawn from 1s to 1.3s, a label at 2s, both on a 1000x500 image. */
const timeline: SketchTimeline = {
  v: 1,
  w: 1000,
  h: 500,
  ops: [
    {
      t: 1000,
      k: 'stroke',
      id: 's1',
      c: '#FF0000',
      wd: 3,
      p: [
        [0, 0.1, 0.2],
        [100, 0.2, 0.3],
        [300, 0.4, 0.5],
      ],
    },
    { t: 2000, k: 'text', id: 't1', c: '#0066FF', fs: 24, x: 0.5, y: 0.5, s: 'watch this edge' },
  ],
};

describe('normPoint', () => {
  it('turns image pixels into fractions of the image', () => {
    expect(normPoint({ x: 500, y: 250 }, 1000, 500)).toEqual({ x: 0.5, y: 0.5 });
  });

  it('quantises to four decimals, which is finer than any screen', () => {
    expect(normPoint({ x: 333, y: 111 }, 1000, 500)).toEqual({ x: 0.333, y: 0.222 });
  });

  it('clamps a stroke that ran off the edge of the image', () => {
    expect(normPoint({ x: -20, y: 900 }, 1000, 500)).toEqual({ x: 0, y: 1 });
  });

  it('survives a zero-sized image instead of returning NaN', () => {
    expect(normPoint({ x: 10, y: 10 }, 0, 0)).toEqual({ x: 0, y: 0 });
  });
});

describe('visibleAt', () => {
  it('shows nothing before the first stroke begins', () => {
    expect(visibleAt(timeline, 999)).toEqual([]);
  });

  it('reveals a stroke point by point as it was drawn', () => {
    const at = visibleAt(timeline, 1100);
    expect(at).toHaveLength(1);
    expect(at[0].kind).toBe('stroke');
    expect(at[0].points).toEqual([
      { x: 0.1, y: 0.2 },
      { x: 0.2, y: 0.3 },
    ]);
  });

  it('shows the whole stroke once it is finished', () => {
    expect(visibleAt(timeline, 1500)[0].points).toHaveLength(3);
  });

  it('brings in the label at the moment it was typed', () => {
    expect(visibleAt(timeline, 1999)).toHaveLength(1);
    const at = visibleAt(timeline, 2000);
    expect(at).toHaveLength(2);
    expect(at[1]).toMatchObject({ kind: 'text', text: 'watch this edge' });
  });

  it('takes an item away when the teacher undid or erased it', () => {
    const undone: SketchTimeline = {
      ...timeline,
      ops: [...timeline.ops, { t: 3000, k: 'show', ids: ['s1'] }],
    };
    expect(visibleAt(undone, 2500)).toHaveLength(2);
    expect(visibleAt(undone, 3000).map((i) => i.id)).toEqual(['s1']);
  });

  it('brings it back when they redid it', () => {
    const redone: SketchTimeline = {
      ...timeline,
      ops: [
        ...timeline.ops,
        { t: 3000, k: 'show', ids: ['s1'] },
        { t: 4000, k: 'show', ids: ['s1', 't1'] },
      ],
    };
    expect(visibleAt(redone, 4000).map((i) => i.id)).toEqual(['s1', 't1']);
  });

  it('empties the canvas on a clear', () => {
    const cleared: SketchTimeline = {
      ...timeline,
      ops: [...timeline.ops, { t: 3000, k: 'show', ids: [] }],
    };
    expect(visibleAt(cleared, 3500)).toEqual([]);
  });

  it('keeps items in the order they were drawn', () => {
    expect(visibleAt(timeline, 9999).map((i) => i.id)).toEqual(['s1', 't1']);
  });
});

describe('validateTimeline', () => {
  it('accepts a well-formed timeline', () => {
    expect(validateTimeline(timeline)).not.toBeNull();
  });

  it('puts ops back in time order, whatever order they arrived in', () => {
    const jumbled = { ...timeline, ops: [timeline.ops[1], timeline.ops[0]] };
    expect(validateTimeline(jumbled)!.ops.map((o) => o.t)).toEqual([1000, 2000]);
  });

  it('refuses anything that is not this format', () => {
    expect(validateTimeline(null)).toBeNull();
    expect(validateTimeline({ v: 2, w: 10, h: 10, ops: [] })).toBeNull();
    expect(validateTimeline({ v: 1, w: 10, h: 10 })).toBeNull();
  });

  it('refuses a timeline carrying values that are not numbers', () => {
    const bad = { ...timeline, ops: [{ t: 0, k: 'stroke', id: 's', c: '#fff', wd: 1, p: [[0, 'x', 1]] }] };
    expect(validateTimeline(bad)).toBeNull();
  });

  it('refuses one too large to be a three-minute sketch', () => {
    const points = Array.from({ length: 60000 }, (_, i) => [i, 0.5, 0.5]);
    const huge = { ...timeline, ops: [{ t: 0, k: 'stroke', id: 's', c: '#fff', wd: 1, p: points }] };
    expect(timelineBytes(huge)).toBeGreaterThan(MAX_TIMELINE_BYTES);
    expect(validateTimeline(huge)).toBeNull();
  });
});

/**
 * Pressure.
 *
 * A point grew an optional fourth slot so a stylus stroke can taper. This is the
 * boundary between a browser's JSON and a canvas render loop, so the widening is
 * deliberately narrow: length 3 or 4, every slot finite, and the pressure slot
 * bounded to 0..1 because it is multiplied by a stroke width downstream.
 *
 * TIMELINE_VERSION deliberately stays 1. validateTimeline returns null on any
 * other version, so bumping it would reject every voice note already recorded.
 * Both readers tolerate a missing fourth slot and a present one, so old and new
 * timelines coexist without a migration.
 */
describe('validateTimeline: pressure', () => {
  const withPoints = (points: number[][]) => ({
    v: 1,
    w: 1000,
    h: 500,
    ops: [{ t: 0, k: 'stroke', id: 's1', c: '#FF0000', wd: 3, p: points }],
  });

  it('keeps version 1, so notes recorded before pressure still play', () => {
    expect(TIMELINE_VERSION).toBe(1);
  });

  it('still accepts a stroke recorded before pressure existed', () => {
    const out = validateTimeline(withPoints([[0, 0.1, 0.2], [50, 0.2, 0.3]]));
    expect(out?.ops).toHaveLength(1);
    expect((out!.ops[0] as { p: number[][] }).p[0]).toEqual([0, 0.1, 0.2]);
  });

  it('accepts a stroke that carries pressure', () => {
    const out = validateTimeline(withPoints([[0, 0.1, 0.2, 0.35], [50, 0.2, 0.3, 0.9]]));
    expect(out?.ops).toHaveLength(1);
    expect((out!.ops[0] as { p: number[][] }).p[1]).toEqual([50, 0.2, 0.3, 0.9]);
  });

  it('accepts the ends of the pressure range', () => {
    expect(validateTimeline(withPoints([[0, 0.1, 0.2, 0], [10, 0.1, 0.2, 1]]))).not.toBeNull();
  });

  it('refuses a point with too many slots', () => {
    expect(validateTimeline(withPoints([[0, 0.1, 0.2, 0.5, 7]]))).toBeNull();
  });

  it('refuses a point with too few slots', () => {
    expect(validateTimeline(withPoints([[0, 0.1]]))).toBeNull();
  });

  it('refuses pressure above 1, which would fatten a stroke without limit', () => {
    expect(validateTimeline(withPoints([[0, 0.1, 0.2, 1.5]]))).toBeNull();
  });

  it('refuses negative pressure, which would invert a stroke outline', () => {
    expect(validateTimeline(withPoints([[0, 0.1, 0.2, -0.2]]))).toBeNull();
  });

  it('refuses a pressure slot that is not a number', () => {
    expect(validateTimeline(withPoints([[0, 0.1, 0.2, Number.NaN]]))).toBeNull();
    expect(validateTimeline(withPoints([[0, 0.1, 0.2, Number.POSITIVE_INFINITY]]))).toBeNull();
  });

  it('a three-minute pressured sketch still fits the size cap', () => {
    // 180s at roughly 60 points a second, every one carrying pressure.
    const points = Array.from({ length: 180 * 60 }, (_, i) => [
      i * 16,
      Number((0.5 + Math.sin(i / 50) * 0.4).toFixed(4)),
      Number((0.5 + Math.cos(i / 50) * 0.4).toFixed(4)),
      Number((0.5 + Math.sin(i / 7) * 0.4).toFixed(2)),
    ]);
    expect(timelineBytes(withPoints(points))).toBeLessThan(MAX_TIMELINE_BYTES);
  });
});

describe('visibleAt: pressure', () => {
  const pressured: SketchTimeline = {
    v: 1,
    w: 1000,
    h: 500,
    ops: [
      {
        t: 0,
        k: 'stroke',
        id: 's1',
        c: '#FF0000',
        wd: 3,
        p: [
          [0, 0.1, 0.2, 0.2],
          [50, 0.2, 0.3, 0.8],
        ],
      },
    ],
  };

  it('hands the player one pressure per point it can see', () => {
    const mid = visibleAt(pressured, 0);
    expect(mid[0].points).toHaveLength(1);
    expect(mid[0].pressures).toEqual([0.2]);

    const all = visibleAt(pressured, 100);
    expect(all[0].points).toHaveLength(2);
    expect(all[0].pressures).toEqual([0.2, 0.8]);
  });

  it('leaves pressures undefined for a stroke recorded without it', () => {
    expect(visibleAt(timeline, 5000)[0].pressures).toBeUndefined();
  });
});
