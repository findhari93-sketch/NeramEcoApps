import { describe, it, expect } from 'vitest';
import {
  MAX_TIMELINE_BYTES,
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
