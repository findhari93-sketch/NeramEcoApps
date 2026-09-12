/**
 * "Talk while you sketch": the teacher's pen strokes, stamped against the same
 * clock as their voice, so the student watches the drawing being corrected while
 * they listen rather than seeing the finished marks all at once.
 *
 * Pure, and shared by the recorder and the player so a replay cannot drift from
 * what was drawn.
 *
 * Coordinates are fractions of the IMAGE, 0 to 1, the same contract as
 * annotation-geometry.ts. The stage is a different size on a phone, on a laptop
 * and inside the review screen, and a stroke measured against the stage would
 * land somewhere else on each of them.
 *
 * Undo, redo, the eraser and Clear all say the same thing: "after this moment,
 * these are the items on the canvas". One `show` op covers the four of them, so
 * the player never has to know which gesture produced it.
 */

export const TIMELINE_VERSION = 1;

/** A three-minute sketch runs well under this. Anything larger is not a sketch. */
export const MAX_TIMELINE_BYTES = 512 * 1024;

/**
 * [msSinceStrokeStart, x, y] or [msSinceStrokeStart, x, y, pressure].
 *
 * x and y are fractions of the image. The fourth slot is a stylus's pressure,
 * 0 to 1, and is simply absent for a stroke recorded before pressure existed or
 * drawn with a device that reports none worth keeping. Both readers tolerate
 * either shape, which is why TIMELINE_VERSION stays 1: bumping it would make
 * validateTimeline reject every voice note already stored.
 */
export type TimedPoint =
  | [number, number, number]
  | [number, number, number, number];

export interface StrokeOp {
  t: number;
  k: 'stroke';
  id: string;
  c: string;
  wd: number;
  p: TimedPoint[];
}

export interface TextOp {
  t: number;
  k: 'text';
  id: string;
  c: string;
  fs: number;
  x: number;
  y: number;
  s: string;
  /** Leader arrow tip, when the label points at something. */
  lx?: number;
  ly?: number;
}

export interface ShowOp {
  t: number;
  k: 'show';
  ids: string[];
}

export type SketchOp = StrokeOp | TextOp | ShowOp;

export interface SketchTimeline {
  v: 1;
  /** Natural size of the image at record time, for the replay canvas. */
  w: number;
  h: number;
  ops: SketchOp[];
}

export interface NormPoint {
  x: number;
  y: number;
}

export interface VisibleItem {
  id: string;
  kind: 'stroke' | 'text';
  color: string;
  width?: number;
  points?: NormPoint[];
  /** One per visible point, 0 to 1. Absent when the stroke carried none. */
  pressures?: number[];
  text?: string;
  fontSize?: number;
  x?: number;
  y?: number;
  leader?: NormPoint | null;
}

const quantise = (n: number) => Math.round(n * 10000) / 10000;
const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);

/** One pen position, from image pixels to a fraction of the image. */
export function normPoint(point: { x: number; y: number }, width: number, height: number): NormPoint {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return { x: 0, y: 0 };
  }
  const x = Number.isFinite(point.x) ? clamp01(point.x / width) : 0;
  const y = Number.isFinite(point.y) ? clamp01(point.y / height) : 0;
  return { x: quantise(x), y: quantise(y) };
}

export function timelineBytes(timeline: unknown): number {
  try {
    return new TextEncoder().encode(JSON.stringify(timeline)).length;
  } catch {
    return Number.MAX_SAFE_INTEGER;
  }
}

/**
 * What is on the canvas at `ms`, in draw order.
 *
 * A stroke still being drawn comes back with only the points that had been laid
 * down by then, which is what makes a replay look like drawing rather than like
 * a slideshow.
 */
export function visibleAt(timeline: SketchTimeline, ms: number): VisibleItem[] {
  const items = new Map<string, { item: VisibleItem; startedAt: number; op?: StrokeOp }>();
  let order: string[] = [];

  for (const op of timeline.ops) {
    if (op.t > ms) continue;

    if (op.k === 'show') {
      order = op.ids.filter((id) => items.has(id));
      continue;
    }

    if (op.k === 'stroke') {
      items.set(op.id, {
        startedAt: op.t,
        op,
        item: { id: op.id, kind: 'stroke', color: op.c, width: op.wd, points: [] },
      });
    } else {
      items.set(op.id, {
        startedAt: op.t,
        item: {
          id: op.id,
          kind: 'text',
          color: op.c,
          text: op.s,
          fontSize: op.fs,
          x: op.x,
          y: op.y,
          leader: op.lx != null && op.ly != null ? { x: op.lx, y: op.ly } : null,
        },
      });
    }
    if (!order.includes(op.id)) order.push(op.id);
  }

  const out: VisibleItem[] = [];
  for (const id of order) {
    const entry = items.get(id);
    if (!entry) continue;
    if (entry.item.kind !== 'stroke' || !entry.op) {
      out.push(entry.item);
      continue;
    }
    const shown = entry.op.p.filter(([dt]) => entry.startedAt + dt <= ms);
    const points = shown.map(([, x, y]) => ({ x, y }));
    if (!points.length) continue;
    // All or nothing: a half-pressured stroke would render as a width that
    // jumps, so unless every visible point carries one the player draws it at
    // a constant width exactly as it did before pressure existed.
    const pressures = shown.every((point) => point.length === 4)
      ? shown.map((point) => point[3] as number)
      : undefined;
    out.push(pressures ? { ...entry.item, points, pressures } : { ...entry.item, points });
  }
  return out;
}

/**
 * Accept a timeline off the wire, or refuse it.
 *
 * Refusing is the point: this arrives as JSON from a browser, is stored as JSONB
 * and is later drawn onto a canvas, so every number is checked before it can
 * reach a rendering loop. Ops come back in time order however they arrived.
 */
export function validateTimeline(input: unknown): SketchTimeline | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Record<string, unknown>;
  if (raw.v !== TIMELINE_VERSION) return null;
  if (!Number.isFinite(raw.w) || !Number.isFinite(raw.h)) return null;
  if (!Array.isArray(raw.ops)) return null;
  if (timelineBytes(raw) > MAX_TIMELINE_BYTES) return null;

  const ops: SketchOp[] = [];
  for (const entry of raw.ops as Record<string, unknown>[]) {
    if (!entry || typeof entry !== 'object' || !Number.isFinite(entry.t)) return null;
    const t = entry.t as number;

    if (entry.k === 'show') {
      if (!Array.isArray(entry.ids) || entry.ids.some((id) => typeof id !== 'string')) return null;
      ops.push({ t, k: 'show', ids: entry.ids as string[] });
      continue;
    }

    if (typeof entry.id !== 'string' || typeof entry.c !== 'string') return null;

    if (entry.k === 'stroke') {
      if (!Number.isFinite(entry.wd) || !Array.isArray(entry.p)) return null;
      for (const point of entry.p) {
        // 3 slots is the original shape, 4 adds pressure. Nothing else.
        if (!Array.isArray(point) || (point.length !== 3 && point.length !== 4)) return null;
        if (!point.every((n) => Number.isFinite(n))) return null;
        // Pressure multiplies a stroke width downstream, so it is bounded here
        // rather than clamped at draw time in two different renderers.
        if (point.length === 4 && (point[3] < 0 || point[3] > 1)) return null;
      }
      ops.push({
        t,
        k: 'stroke',
        id: entry.id,
        c: entry.c,
        wd: entry.wd as number,
        p: entry.p as TimedPoint[],
      });
      continue;
    }

    if (entry.k === 'text') {
      if (typeof entry.s !== 'string') return null;
      if (!Number.isFinite(entry.fs) || !Number.isFinite(entry.x) || !Number.isFinite(entry.y)) return null;
      const op: TextOp = {
        t,
        k: 'text',
        id: entry.id,
        c: entry.c,
        fs: entry.fs as number,
        x: entry.x as number,
        y: entry.y as number,
        s: entry.s,
      };
      if (Number.isFinite(entry.lx) && Number.isFinite(entry.ly)) {
        op.lx = entry.lx as number;
        op.ly = entry.ly as number;
      }
      ops.push(op);
      continue;
    }

    return null;
  }

  ops.sort((a, b) => a.t - b.t);
  return { v: TIMELINE_VERSION, w: raw.w as number, h: raw.h as number, ops };
}
