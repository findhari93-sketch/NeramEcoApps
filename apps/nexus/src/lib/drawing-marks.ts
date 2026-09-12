/**
 * Teacher marks as vectors, so they survive being drawn.
 *
 * The correction canvas used to exist only as pixels: strokes and labels were
 * flattened into a PNG on save and the shapes were gone. Two things followed
 * from that, and both are why this module exists.
 *
 * The first is a bug. `SketchOverCanvas` always opened on `original_image_url`
 * with an empty item list, so a teacher who reopened the canvas to add one more
 * mark started from a blank overlay and their previous marks were overwritten by
 * the next save. Marks kept as vectors come back editable.
 *
 * The second is the whole point of the redesign. A flattened PNG has no
 * coordinates, so a teacher's corrections are invisible to anything that wants
 * to learn from them. `drawing_annotation` already stores AI marks with a
 * `source` of 'ai' and an `action` of created/moved/deleted/kept; converging the
 * teacher's marks onto the same table is what turns "the teacher rubbed that one
 * out" into a fact the model can be told about.
 *
 * The contract, which `drawing_annotation.geometry` already documents: always
 * fractions of the IMAGE, 0 to 1, origin top-left. A region is [x, y, w, h], a
 * point is [x, y], a stroke is [[x, y], ...]. Never stage-relative, never pixels.
 *
 * `style` carries the per-kind extras under the same short names the sketch
 * timeline already uses (`w`, `fs`, leader), so the two formats read alike.
 */

import type { CanvasItem, Point } from './sketch-geometry';
import type { RegionAnnotation } from './drawing-prompt-templates';

export type MarkKind = 'stroke' | 'region' | 'point';
export type MarkerType = 'problem' | 'good' | 'guide' | 'note';

export interface MarkStyle {
  /** Stroke width, as a fraction of the image WIDTH. */
  w?: number;
  /** One per point, 0 to 1. Absent when the stroke carried none. */
  pressures?: number[];
  highlight?: boolean;
  /** Text size, as a fraction of the image HEIGHT, matching sketch-timeline. */
  fs?: number;
  /** Leader arrow tip, [x, y] as fractions. */
  leader?: [number, number];
  /** The exact colour drawn with, so a mark survives a change of palette. */
  color?: string;
}

export interface DrawingMark {
  kind: MarkKind;
  geometry: number[] | number[][];
  marker: MarkerType;
  comment: string | null;
  style: MarkStyle;
}

/**
 * The pen colours, and what each one means.
 *
 * The canvas offers three, deliberately, so that every mark lands on the
 * `problem | good | guide` vocabulary the table already stores. Older marks were
 * drawn from a palette of six; those simply come back as notes rather than being
 * guessed at.
 */
const MARKER_BY_COLOR: Record<string, MarkerType> = {
  '#dc2626': 'problem',
  '#16a34a': 'good',
  '#2563eb': 'guide',
};

export function markerForColor(hex: string): MarkerType {
  return MARKER_BY_COLOR[(hex || '').toLowerCase()] ?? 'note';
}

/** Four decimals is finer than any screen, and keeps the JSON small. */
const q = (n: number) => Math.round(n * 10000) / 10000;
const finite = (n: number) => (Number.isFinite(n) ? n : 0);

const usable = (w: number, h: number) =>
  Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0;

let restoreCounter = 0;
const restoredId = () => `m${Date.now().toString(36)}${(restoreCounter++).toString(36)}`;

/** Canvas items, in draw order, as marks ready for `drawing_annotation`. */
export function canvasItemsToMarks(items: CanvasItem[], width: number, height: number): DrawingMark[] {
  if (!usable(width, height)) return [];

  return items.map((item) => {
    if (item.type === 'stroke') {
      const style: MarkStyle = { w: q(item.width / width), color: item.color };
      if (item.pressures?.length) style.pressures = item.pressures.map((p) => q(p));
      if (item.highlight) style.highlight = true;
      return {
        kind: 'stroke' as const,
        geometry: item.points.map((p) => [q(finite(p.x) / width), q(finite(p.y) / height)]),
        marker: markerForColor(item.color),
        comment: null,
        style,
      };
    }

    const style: MarkStyle = { fs: q(item.fontSize / height), color: item.color };
    if (item.leader) {
      style.leader = [q(finite(item.leader.x) / width), q(finite(item.leader.y) / height)];
    }
    return {
      kind: 'point' as const,
      geometry: [q(finite(item.x) / width), q(finite(item.y) / height)],
      marker: markerForColor(item.color),
      // The label's words ARE the comment. Nothing else about it is prose.
      comment: item.text,
      style,
    };
  });
}

/**
 * Marks back onto a canvas of a given size.
 *
 * Because everything is a fraction, the same marks land correctly on a sheet of
 * any resolution, which is what lets a correction drawn on a pen display reopen
 * on a phone.
 */
export function marksToCanvasItems(marks: DrawingMark[], width: number, height: number): CanvasItem[] {
  if (!usable(width, height)) return [];
  const out: CanvasItem[] = [];

  for (const mark of marks) {
    const color = mark.style.color || '#DC2626';

    if (mark.kind === 'stroke' && Array.isArray(mark.geometry)) {
      const points = (mark.geometry as number[][])
        .filter((p) => Array.isArray(p) && p.length >= 2)
        .map((p): Point => ({ x: finite(p[0]) * width, y: finite(p[1]) * height }));
      if (!points.length) continue;
      const item: CanvasItem = {
        id: restoredId(),
        type: 'stroke',
        points,
        color,
        width: (mark.style.w ?? 0.004) * width,
      };
      if (mark.style.pressures?.length) item.pressures = mark.style.pressures;
      if (mark.style.highlight) item.highlight = true;
      out.push(item);
      continue;
    }

    if (mark.kind === 'point') {
      const g = mark.geometry as number[];
      if (!Array.isArray(g) || g.length < 2) continue;
      const item: CanvasItem = {
        id: restoredId(),
        type: 'text',
        x: finite(g[0]) * width,
        y: finite(g[1]) * height,
        text: mark.comment ?? '',
        color,
        fontSize: (mark.style.fs ?? 0.018) * height,
      };
      const leader = mark.style.leader;
      if (Array.isArray(leader) && leader.length === 2) {
        item.leader = { x: finite(leader[0]) * width, y: finite(leader[1]) * height };
      }
      out.push(item);
    }
    // A region is not a canvas item: it is the DOM layer over the stage.
  }

  return out;
}

/** Region boxes as marks. They are already fractions, so nothing is converted. */
export function regionsToMarks(regions: RegionAnnotation[]): DrawingMark[] {
  return regions.map((r) => ({
    kind: 'region' as const,
    geometry: [q(finite(r.x)), q(finite(r.y)), q(finite(r.width)), q(finite(r.height))],
    marker: 'note' as const,
    comment: r.comment ?? '',
    style: {},
  }));
}

/** The region boxes out of a mixed set of marks, ignoring strokes and labels. */
export function marksToRegions(marks: DrawingMark[]): RegionAnnotation[] {
  const out: RegionAnnotation[] = [];
  for (const mark of marks) {
    if (mark.kind !== 'region') continue;
    const g = mark.geometry as number[];
    if (!Array.isArray(g) || g.length < 4) continue;
    out.push({
      id: restoredId(),
      x: finite(g[0]),
      y: finite(g[1]),
      width: finite(g[2]),
      height: finite(g[3]),
      comment: mark.comment ?? '',
    });
  }
  return out;
}
