/**
 * Image-relative annotation geometry.
 *
 * Every annotation coordinate in the drawing module is a fraction of the
 * IMAGE, 0 to 1, origin top-left. Not a fraction of the box the image is
 * displayed in.
 *
 * That distinction is the whole point of this file. The review stage centres
 * the drawing with `objectFit: contain`, so unless the stage happens to share
 * the drawing's aspect ratio there are letterbox bands on two sides. Measuring
 * against the stage puts those bands inside the coordinate range, which means
 * the same stored rectangle lands on a different part of the drawing depending
 * on the viewport. The mobile stage (50vh) and the desktop stage (flex) differ
 * enough for a teacher to notice.
 *
 * Image-relative coordinates are also the only ones a model can produce: it
 * sees the drawing, never the stage. Teacher regions and AI annotations
 * therefore share one space and can live in one table.
 *
 * Convention matches the PDF reader's NexusStudyAnnotationPoint, which is
 * already fractional, so the two annotation systems agree.
 */

/** A rectangle in image space. All four values are fractions of the image, 0 to 1. */
export interface NormRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A point in image space, both values fractions of the image, 0 to 1. */
export interface NormPoint {
  x: number;
  y: number;
}

/**
 * Where the image actually sits inside its stage, in CSS pixels relative to
 * the stage's top-left corner. This is the contain-fitted content box, so it
 * excludes the letterbox bands.
 */
export interface FittedBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** An empty box, returned whenever a real one cannot be computed yet. */
const EMPTY_BOX: FittedBox = { left: 0, top: 0, width: 0, height: 0 };

function isPositive(n: number): boolean {
  return Number.isFinite(n) && n > 0;
}

export function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

/**
 * The content box of an `objectFit: contain` image.
 *
 * Returns a zero box when any input is missing or non-positive, which happens
 * on the first render before the image has loaded and before the stage has
 * been measured. Callers must treat a zero box as "not ready" rather than
 * dividing by it.
 */
export function containBox(
  naturalWidth: number,
  naturalHeight: number,
  stageWidth: number,
  stageHeight: number,
): FittedBox {
  if (![naturalWidth, naturalHeight, stageWidth, stageHeight].every(isPositive)) {
    return EMPTY_BOX;
  }

  const scale = Math.min(stageWidth / naturalWidth, stageHeight / naturalHeight);
  const width = naturalWidth * scale;
  const height = naturalHeight * scale;

  return {
    left: (stageWidth - width) / 2,
    top: (stageHeight - height) / 2,
    width,
    height,
  };
}

/**
 * The box for an image whose rendered size has already been measured.
 *
 * Use this rather than containBox wherever the element is on screen. The review
 * stage sizes its image with `maxWidth: 100%; maxHeight: 100%`, which caps a
 * large drawing but leaves a small one at its natural size instead of scaling
 * it up. containBox always scales to fit, so on a small sheet the two disagree,
 * and the measured answer is the one the viewer can actually see.
 *
 * `renderedWidth` and `renderedHeight` come from offsetWidth and offsetHeight,
 * which are layout values and so are unaffected by any CSS transform on the
 * image, including a pending rotation.
 */
export function centeredBox(
  renderedWidth: number,
  renderedHeight: number,
  stageWidth: number,
  stageHeight: number,
): FittedBox {
  if (![renderedWidth, renderedHeight, stageWidth, stageHeight].every(isPositive)) {
    return EMPTY_BOX;
  }
  return {
    left: Math.max(0, (stageWidth - renderedWidth) / 2),
    top: Math.max(0, (stageHeight - renderedHeight) / 2),
    width: renderedWidth,
    height: renderedHeight,
  };
}

export function isReady(box: FittedBox): boolean {
  return isPositive(box.width) && isPositive(box.height);
}

/**
 * Convert a pointer position into image space.
 *
 * `stageRect` is the stage's own getBoundingClientRect. Returns null when the
 * box is not ready. The result is clamped, so a drag that wanders into the
 * letterbox band pins to the edge of the drawing instead of producing a
 * coordinate outside it.
 */
export function toImageSpace(
  clientX: number,
  clientY: number,
  stageRect: { left: number; top: number },
  box: FittedBox,
): NormPoint | null {
  if (!isReady(box)) return null;
  return {
    x: clamp01((clientX - stageRect.left - box.left) / box.width),
    y: clamp01((clientY - stageRect.top - box.top) / box.height),
  };
}

/** Convert an image-space point back to CSS pixels relative to the stage. */
export function pointToPx(point: NormPoint, box: FittedBox): { left: number; top: number } {
  return {
    left: box.left + point.x * box.width,
    top: box.top + point.y * box.height,
  };
}

/** Convert an image-space rectangle back to CSS pixels relative to the stage. */
export function rectToPx(rect: NormRect, box: FittedBox): FittedBox {
  return {
    left: box.left + rect.x * box.width,
    top: box.top + rect.y * box.height,
    width: rect.width * box.width,
    height: rect.height * box.height,
  };
}

/**
 * CSS for an absolutely positioned element covering `rect`, given a layer that
 * is `inset: 0` on the stage.
 *
 * Pixels rather than percentages on purpose: the box already encodes the
 * letterboxing, so a second conversion into stage percentages would only add
 * rounding. Values recompute whenever the box is re-measured.
 */
export function toStyle(
  rect: NormRect,
  box: FittedBox,
): { left: string; top: string; width: string; height: string } {
  const px = rectToPx(rect, box);
  return {
    left: `${px.left}px`,
    top: `${px.top}px`,
    width: `${px.width}px`,
    height: `${px.height}px`,
  };
}

/**
 * Build a normalised rectangle from two image-space corners, in any order.
 * Always returns non-negative width and height.
 */
export function rectFromCorners(a: NormPoint, b: NormPoint): NormRect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    width: Math.abs(b.x - a.x),
    height: Math.abs(b.y - a.y),
  };
}

/** True when every value is a finite fraction and the rectangle fits inside the image. */
export function isNormRect(value: unknown): value is NormRect {
  if (!value || typeof value !== 'object') return false;
  const r = value as Record<string, unknown>;
  const nums = [r.x, r.y, r.width, r.height];
  if (!nums.every((n) => typeof n === 'number' && Number.isFinite(n))) return false;
  const { x, y, width, height } = r as unknown as NormRect;
  if (x < 0 || y < 0 || width < 0 || height < 0) return false;
  // A hair over 1 is rounding from a model or a drag at the edge, not an error.
  return x + width <= 1.0001 && y + height <= 1.0001;
}

/** Clamp a rectangle into the unit square, preserving its top-left corner. */
export function clampRect(rect: NormRect): NormRect {
  const x = clamp01(rect.x);
  const y = clamp01(rect.y);
  return {
    x,
    y,
    width: clamp01(Math.min(rect.width, 1 - x)),
    height: clamp01(Math.min(rect.height, 1 - y)),
  };
}
