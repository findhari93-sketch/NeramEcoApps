/**
 * Pure stroke geometry for the Draw Corrections canvas: the two things that make
 * marking up a student's sheet feel like a pen rather than a drawing program.
 *
 * `buildStrokeOutline` turns a centreline plus per-point pressure into a closed
 * ring the caller fills in one go. A stroke used to be `ctx.stroke()` at one
 * `lineWidth`, which cannot taper, so every correction landed at the same weight
 * whatever the teacher did with the pen.
 *
 * `splitStrokeAtHits` erases the part of a stroke the eraser actually touched.
 * The old eraser removed whole items, so grazing the tail of a 300-point line
 * deleted all of it. Correcting over a student's lines means many overlapping
 * strokes, which is exactly where that behaviour hurts most.
 *
 * Framework-free so both are unit-tested in isolation. Coordinates are canvas
 * (image-resolution) space, like the rest of sketch-geometry.
 */

import { distanceToSegment, type Point } from './sketch-geometry';

/**
 * The narrowest a stroke may get, as a fraction of its nominal width.
 *
 * A stylus reports a real 0 the instant it leaves the surface, and a stroke that
 * tapers to literally nothing reads as a gap rather than a lift.
 */
export const MIN_PRESSURE_SCALE = 0.35;

/** How many segments approximate the half-circle at each end of a stroke. */
const CAP_STEPS = 8;

/** A surviving piece of a stroke the eraser cut. */
export interface StrokeSpan {
  points: Point[];
  /** Present only when the stroke it came from carried pressure. */
  pressures?: number[];
}

/** Pressure at `i`, falling back to full when the stroke carried none. */
function scaleAt(pressures: number[] | undefined, i: number): number {
  if (!pressures) return 1;
  const raw = pressures[i];
  if (!Number.isFinite(raw)) return 1;
  const clamped = raw < 0 ? 0 : raw > 1 ? 1 : raw;
  return MIN_PRESSURE_SCALE + (1 - MIN_PRESSURE_SCALE) * clamped;
}

/** Unit normal at `i`, from the direction through its neighbours. */
function normalAt(points: Point[], i: number): Point {
  const prev = points[Math.max(0, i - 1)];
  const next = points[Math.min(points.length - 1, i + 1)];
  let dx = next.x - prev.x;
  let dy = next.y - prev.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) {
    // Points stacked on each other carry no direction; pick one so the ring
    // still has area rather than collapsing to a line.
    return { x: 0, y: 1 };
  }
  dx /= len;
  dy /= len;
  return { x: -dy, y: dx };
}

/** Half a circle of `radius` around `centre`, from angle `from` to `from + PI`. */
function capArc(centre: Point, radius: number, from: number): Point[] {
  const out: Point[] = [];
  for (let i = 0; i <= CAP_STEPS; i++) {
    const angle = from + (Math.PI * i) / CAP_STEPS;
    out.push({ x: centre.x + Math.cos(angle) * radius, y: centre.y + Math.sin(angle) * radius });
  }
  return out;
}

/** How many samples each smoothed segment becomes. */
const SMOOTH_STEPS = 6;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * Densify a stroke along the same quadratic-midpoint curve the old renderer
 * stroked, so a variable-width outline is built on a smooth centreline rather
 * than on the raw samples.
 *
 * Without this, moving from `ctx.stroke()` to a filled outline would have
 * quietly dropped the smoothing: a mouse samples at about 60Hz, and its raw
 * polyline reads as visibly angular next to a stylus's.
 *
 * Pressure is carried across by interpolating between the two samples each
 * piece of curve sits between, so the taper follows the same curve the line does.
 */
export function smoothCentreline(
  points: Point[],
  pressures?: number[],
): { points: Point[]; pressures?: number[] } {
  if (points.length < 3) return pressures ? { points, pressures } : { points };

  const mid = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const outPoints: Point[] = [points[0]];
  const outPressures: number[] | undefined = pressures ? [pressures[0] ?? 1] : undefined;

  for (let i = 1; i < points.length - 1; i++) {
    const from = i === 1 ? points[0] : mid(points[i - 1], points[i]);
    const ctrl = points[i];
    const to = mid(points[i], points[i + 1]);
    const pFrom = pressures ? (pressures[i] ?? 1) : 1;
    const pTo = pressures ? (pressures[i + 1] ?? pFrom) : 1;

    for (let step = 1; step <= SMOOTH_STEPS; step++) {
      const t = step / SMOOTH_STEPS;
      const inv = 1 - t;
      outPoints.push({
        x: inv * inv * from.x + 2 * inv * t * ctrl.x + t * t * to.x,
        y: inv * inv * from.y + 2 * inv * t * ctrl.y + t * t * to.y,
      });
      outPressures?.push(lerp(pFrom, pTo, t));
    }
  }

  outPoints.push(points[points.length - 1]);
  outPressures?.push(pressures ? (pressures[pressures.length - 1] ?? 1) : 1);

  return outPressures ? { points: outPoints, pressures: outPressures } : { points: outPoints };
}

/**
 * The closed outline of a stroke, ready to `fill()`.
 *
 * One fill rather than a stroked path per segment: a per-segment approach seams
 * visibly where the width changes, and a single `ctx.stroke()` cannot change
 * width at all. Walks one side of the centreline, caps the far end, walks back
 * along the other side, then caps the start.
 *
 * `pressures` is optional and may be shorter than `points`; any point without
 * one is drawn at full width, so a stroke recorded before pressure existed
 * renders exactly as it always did.
 */
export function buildStrokeOutline(
  points: Point[],
  pressures: number[] | undefined,
  width: number,
): Point[] {
  if (points.length === 0) return [];
  const half = Math.max(width, 0.1) / 2;

  if (points.length === 1) {
    const r = half * scaleAt(pressures, 0);
    return [...capArc(points[0], r, 0), ...capArc(points[0], r, Math.PI)];
  }

  const left: Point[] = [];
  const right: Point[] = [];
  for (let i = 0; i < points.length; i++) {
    const n = normalAt(points, i);
    const r = half * scaleAt(pressures, i);
    left.push({ x: points[i].x + n.x * r, y: points[i].y + n.y * r });
    right.push({ x: points[i].x - n.x * r, y: points[i].y - n.y * r });
  }

  const last = points[points.length - 1];
  const first = points[0];
  const endAngle = Math.atan2(
    last.y - points[points.length - 2].y,
    last.x - points[points.length - 2].x,
  );
  const startAngle = Math.atan2(first.y - points[1].y, first.x - points[1].x);

  // capArc always sweeps +PI, so each cap has to START on the side the walk just
  // finished on. Beginning half a turn the other way traverses the caps
  // backwards, which ties the ring into a bowtie at both ends.
  return [
    ...left,
    ...capArc(last, half * scaleAt(pressures, points.length - 1), endAngle + Math.PI / 2),
    ...right.reverse(),
    ...capArc(first, half * scaleAt(pressures, 0), startAngle + Math.PI / 2),
  ];
}

/**
 * Cut the points the eraser touched out of a stroke and return what is left.
 *
 * A run of a single surviving point is dropped: on its own it renders as a dot
 * the teacher did not draw. A stroke that was one point to begin with and was
 * not touched survives, because that dot is deliberate.
 */
export function splitStrokeAtHits(
  points: Point[],
  pressures: number[] | undefined,
  centre: Point,
  radius: number,
): StrokeSpan[] {
  if (points.length === 0) return [];

  const hit = points.map((point, i) => {
    if (i === 0) return Math.hypot(point.x - centre.x, point.y - centre.y) <= radius;
    // Test the segment, not just the vertex, so a fast stroke with widely
    // spaced samples cannot slip through the eraser between two points.
    return distanceToSegment(centre, points[i - 1], point) <= radius;
  });

  if (!hit.some(Boolean)) {
    return [pressures ? { points, pressures } : { points }];
  }

  const spans: StrokeSpan[] = [];
  let run: number[] = [];
  const flush = () => {
    if (run.length >= 2) {
      const span: StrokeSpan = { points: run.map((i) => points[i]) };
      if (pressures) span.pressures = run.map((i) => pressures[i]);
      spans.push(span);
    }
    run = [];
  };

  for (let i = 0; i < points.length; i++) {
    if (hit[i]) flush();
    else run.push(i);
  }
  flush();

  return spans;
}
