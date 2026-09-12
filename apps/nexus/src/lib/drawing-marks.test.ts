import { describe, it, expect } from 'vitest';
import type { CanvasItem } from './sketch-geometry';
import type { RegionAnnotation } from './drawing-prompt-templates';
import {
  canvasItemsToMarks,
  marksToCanvasItems,
  regionsToMarks,
  marksToRegions,
  markerForColor,
  type DrawingMark,
} from './drawing-marks';

const W = 1000;
const H = 500;

const stroke: CanvasItem = {
  id: 's1',
  type: 'stroke',
  points: [{ x: 100, y: 50 }, { x: 200, y: 150 }, { x: 300, y: 250 }],
  color: '#DC2626',
  width: 8,
  pressures: [0.2, 0.6, 1],
};

const label: CanvasItem = {
  id: 't1',
  type: 'text',
  x: 400,
  y: 200,
  text: 'take this back to the VP',
  color: '#2563EB',
  fontSize: 18,
  leader: { x: 250, y: 120 },
};

describe('markerForColor', () => {
  it('reads the three pen colours as what they mean', () => {
    expect(markerForColor('#DC2626')).toBe('problem');
    expect(markerForColor('#16A34A')).toBe('good');
    expect(markerForColor('#2563EB')).toBe('guide');
  });

  it('is not fooled by case', () => {
    expect(markerForColor('#dc2626')).toBe('problem');
  });

  it('calls anything else a note rather than guessing', () => {
    expect(markerForColor('#FF6600')).toBe('note');
    expect(markerForColor('')).toBe('note');
  });
});

describe('canvas items to marks and back', () => {
  it('stores a stroke as fractions of the image, never as pixels', () => {
    const [mark] = canvasItemsToMarks([stroke], W, H);
    expect(mark.kind).toBe('stroke');
    expect(mark.geometry).toEqual([[0.1, 0.1], [0.2, 0.3], [0.3, 0.5]]);
    expect(mark.style.w).toBeCloseTo(8 / W, 5);
    expect(mark.marker).toBe('problem');
  });

  it('brings a stroke back the same size on the same image', () => {
    const [back] = marksToCanvasItems(canvasItemsToMarks([stroke], W, H), W, H);
    expect(back.type).toBe('stroke');
    if (back.type !== 'stroke') throw new Error('expected a stroke');
    expect(back.points).toEqual(stroke.points);
    expect(back.width).toBeCloseTo(8, 3);
    expect(back.pressures).toEqual([0.2, 0.6, 1]);
    expect(back.color).toBe('#DC2626');
  });

  it('rescales a stroke drawn on one size of sheet onto another', () => {
    const [back] = marksToCanvasItems(canvasItemsToMarks([stroke], W, H), W * 2, H * 2);
    if (back.type !== 'stroke') throw new Error('expected a stroke');
    expect(back.points[0]).toEqual({ x: 200, y: 100 });
    expect(back.width).toBeCloseTo(16, 3);
  });

  it('keeps a highlighter a highlighter', () => {
    const marks = canvasItemsToMarks([{ ...stroke, highlight: true }], W, H);
    expect(marks[0].style.highlight).toBe(true);
    const [back] = marksToCanvasItems(marks, W, H);
    if (back.type !== 'stroke') throw new Error('expected a stroke');
    expect(back.highlight).toBe(true);
  });

  it('leaves pressures off a stroke that never had any', () => {
    const flat: CanvasItem = { ...stroke, pressures: undefined };
    const marks = canvasItemsToMarks([flat], W, H);
    expect(marks[0].style.pressures).toBeUndefined();
    const [back] = marksToCanvasItems(marks, W, H);
    if (back.type !== 'stroke') throw new Error('expected a stroke');
    expect(back.pressures).toBeUndefined();
  });

  it('stores a label as a point, with its words as the comment', () => {
    const [mark] = canvasItemsToMarks([label], W, H);
    expect(mark.kind).toBe('point');
    expect(mark.geometry).toEqual([0.4, 0.4]);
    expect(mark.comment).toBe('take this back to the VP');
    expect(mark.marker).toBe('guide');
    // Text is measured against the HEIGHT, the same contract as the timeline.
    expect(mark.style.fs).toBeCloseTo(18 / H, 5);
    expect(mark.style.leader).toEqual([0.25, 0.24]);
  });

  it('brings a label back where it was, arrow and all', () => {
    const [back] = marksToCanvasItems(canvasItemsToMarks([label], W, H), W, H);
    if (back.type !== 'text') throw new Error('expected a label');
    expect(back.x).toBeCloseTo(400, 3);
    expect(back.y).toBeCloseTo(200, 3);
    expect(back.text).toBe('take this back to the VP');
    expect(back.fontSize).toBeCloseTo(18, 3);
    expect(back.leader).toEqual({ x: 250, y: 120 });
  });

  it('a label with no arrow keeps no arrow', () => {
    const marks = canvasItemsToMarks([{ ...label, leader: undefined }], W, H);
    expect(marks[0].style.leader).toBeUndefined();
    const [back] = marksToCanvasItems(marks, W, H);
    if (back.type !== 'text') throw new Error('expected a label');
    expect(back.leader).toBeUndefined();
  });

  it('keeps the drawing order, because marks overlap', () => {
    const marks = canvasItemsToMarks([stroke, label], W, H);
    expect(marks.map((m) => m.kind)).toEqual(['stroke', 'point']);
    expect(marksToCanvasItems(marks, W, H).map((i) => i.type)).toEqual(['stroke', 'text']);
  });

  it('gives every restored item its own id', () => {
    const back = marksToCanvasItems(canvasItemsToMarks([stroke, label], W, H), W, H);
    expect(new Set(back.map((i) => i.id)).size).toBe(2);
  });

  it('refuses to divide by a sheet with no size', () => {
    expect(canvasItemsToMarks([stroke], 0, 0)).toEqual([]);
    expect(marksToCanvasItems(canvasItemsToMarks([stroke], W, H), 0, 0)).toEqual([]);
  });

  it('has nothing to say about nothing', () => {
    expect(canvasItemsToMarks([], W, H)).toEqual([]);
    expect(marksToCanvasItems([], W, H)).toEqual([]);
  });
});

describe('regions to marks and back', () => {
  const region: RegionAnnotation = {
    id: 'r1',
    x: 0.1,
    y: 0.2,
    width: 0.3,
    height: 0.25,
    comment: 'Shadow direction is wrong',
  };

  it('stores a box as the four numbers the contract asks for', () => {
    const [mark] = regionsToMarks([region]);
    expect(mark.kind).toBe('region');
    expect(mark.geometry).toEqual([0.1, 0.2, 0.3, 0.25]);
    expect(mark.comment).toBe('Shadow direction is wrong');
  });

  it('round-trips a box without touching the numbers', () => {
    expect(marksToRegions(regionsToMarks([region]))[0]).toMatchObject({
      x: 0.1, y: 0.2, width: 0.3, height: 0.25, comment: 'Shadow direction is wrong',
    });
  });

  it('picks the boxes out of a mixed set and ignores the rest', () => {
    const mixed: DrawingMark[] = [...regionsToMarks([region]), ...canvasItemsToMarks([stroke], W, H)];
    expect(marksToRegions(mixed)).toHaveLength(1);
    expect(marksToCanvasItems(mixed, W, H)).toHaveLength(1);
  });

  it('survives a box with no comment on it yet', () => {
    const [mark] = regionsToMarks([{ ...region, comment: '' }]);
    expect(mark.comment).toBe('');
    expect(marksToRegions([mark])[0].comment).toBe('');
  });
});
