/**
 * Pure geometry helpers for the Draw Corrections canvas (SketchOverCanvas).
 *
 * These are framework-free so they can be unit-tested in isolation. All
 * coordinates are in canvas (image-resolution) space unless noted.
 */

export interface Point {
  x: number;
  y: number;
}

export type CanvasItem =
  | {
      id: string;
      type: 'stroke';
      points: Point[];
      color: string;
      width: number;
    }
  | {
      id: string;
      type: 'text';
      x: number;
      y: number;
      text: string;
      color: string;
      fontSize: number;
      /** Optional leader arrow: the tip points at this target location. */
      leader?: Point;
    };

/** Shortest distance from point `p` to the segment `a`->`b`. */
export function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) {
    // Degenerate segment: distance to the single point.
    return Math.hypot(p.x - a.x, p.y - a.y);
  }
  // Projection parameter of p onto the line, clamped to the segment.
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const projX = a.x + t * dx;
  const projY = a.y + t * dy;
  return Math.hypot(p.x - projX, p.y - projY);
}

/** Shortest distance from `p` to a polyline of points. */
export function distanceToPolyline(p: Point, points: Point[]): number {
  if (points.length === 0) return Infinity;
  if (points.length === 1) return Math.hypot(p.x - points[0].x, p.y - points[0].y);
  let min = Infinity;
  for (let i = 0; i < points.length - 1; i++) {
    const d = distanceToSegment(p, points[i], points[i + 1]);
    if (d < min) min = d;
  }
  return min;
}

/**
 * Approximate on-screen bounds of a text item in canvas space.
 * We do not have canvas metrics here, so width is estimated from the
 * average glyph aspect ratio (~0.55 of font size) and the longest line.
 */
export function textBounds(item: Extract<CanvasItem, { type: 'text' }>): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const lines = item.text.split('\n');
  const longest = lines.reduce((m, l) => Math.max(m, l.length), 0);
  const width = Math.max(longest * item.fontSize * 0.55, item.fontSize * 0.5);
  const lineHeight = item.fontSize * 1.25;
  const height = lines.length * lineHeight;
  // (item.x, item.y) is the top-left of the first line.
  return { x: item.x, y: item.y, width, height };
}

/**
 * Whole-item hit test for the eraser. Returns true when the eraser circle
 * (centre `p`, radius `radius`) touches the item, so the whole item can be
 * removed. Strokes hit-test against the polyline (padded by half stroke
 * width); text hit-tests against its bounding box (padded by radius), and its
 * leader line if present.
 */
export function hitTestItem(item: CanvasItem, p: Point, radius: number): boolean {
  if (item.type === 'stroke') {
    return distanceToPolyline(p, item.points) <= radius + item.width / 2;
  }
  // Text: bounding box padded by the eraser radius.
  const b = textBounds(item);
  const withinBox =
    p.x >= b.x - radius &&
    p.x <= b.x + b.width + radius &&
    p.y >= b.y - radius &&
    p.y <= b.y + b.height + radius;
  if (withinBox) return true;
  // Also erasable by touching the leader arrow.
  if (item.leader) {
    const anchor = { x: b.x, y: b.y + b.height / 2 };
    return distanceToSegment(p, anchor, item.leader) <= radius;
  }
  return false;
}

export interface SmoothCommand {
  type: 'move' | 'line' | 'quad';
  /** End point of the command. */
  x: number;
  y: number;
  /** Control point (quad only). */
  cx?: number;
  cy?: number;
}

/**
 * Build a smoothed path (quadratic-midpoint technique) from raw stroke points.
 * Each interior point becomes a quadratic control point, with the curve passing
 * through the midpoint between consecutive points. Produces fluid handwriting
 * without discarding any sampled point.
 *
 * Returned as an ordered command list so it can be unit-tested and also
 * replayed onto a CanvasRenderingContext2D via `applySmoothStroke`.
 */
export function buildSmoothStroke(points: Point[]): SmoothCommand[] {
  if (points.length === 0) return [];
  if (points.length === 1) {
    // A dot: caller renders it as a small filled circle; represent as move+line.
    return [
      { type: 'move', x: points[0].x, y: points[0].y },
      { type: 'line', x: points[0].x, y: points[0].y },
    ];
  }
  if (points.length === 2) {
    return [
      { type: 'move', x: points[0].x, y: points[0].y },
      { type: 'line', x: points[1].x, y: points[1].y },
    ];
  }
  const cmds: SmoothCommand[] = [{ type: 'move', x: points[0].x, y: points[0].y }];
  for (let i = 1; i < points.length - 1; i++) {
    const midX = (points[i].x + points[i + 1].x) / 2;
    const midY = (points[i].y + points[i + 1].y) / 2;
    cmds.push({ type: 'quad', cx: points[i].x, cy: points[i].y, x: midX, y: midY });
  }
  const last = points[points.length - 1];
  cmds.push({ type: 'line', x: last.x, y: last.y });
  return cmds;
}

/** Replay a smoothed command list onto a 2D context (assumes beginPath already called). */
export function applySmoothStroke(ctx: CanvasRenderingContext2D, cmds: SmoothCommand[]): void {
  for (const c of cmds) {
    if (c.type === 'move') ctx.moveTo(c.x, c.y);
    else if (c.type === 'line') ctx.lineTo(c.x, c.y);
    else if (c.type === 'quad' && c.cx !== undefined && c.cy !== undefined)
      ctx.quadraticCurveTo(c.cx, c.cy, c.x, c.y);
  }
}

/**
 * Compute the two barb points of an arrowhead at `tip`, pointing back toward
 * `from`. `size` is the barb length; `spread` the half-angle in radians.
 */
export function arrowHead(
  from: Point,
  tip: Point,
  size = 14,
  spread = Math.PI / 7,
): [Point, Point] {
  const angle = Math.atan2(tip.y - from.y, tip.x - from.x);
  return [
    {
      x: tip.x - size * Math.cos(angle - spread),
      y: tip.y - size * Math.sin(angle - spread),
    },
    {
      x: tip.x - size * Math.cos(angle + spread),
      y: tip.y - size * Math.sin(angle + spread),
    },
  ];
}
