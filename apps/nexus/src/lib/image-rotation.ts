/**
 * Quarter-turn rotation geometry, shared by the teacher's drawing-review viewer
 * and the student's upload preview.
 *
 * Kept DOM-free on purpose: the arithmetic is the part that is easy to get
 * subtly wrong, so it lives here where it can be unit tested directly.
 */

export type Rotation = 0 | 90 | 180 | 270;

const STEPS: Rotation[] = [0, 90, 180, 270];

/** True for a value that is one of the four quarter turns. */
export function isRotation(value: unknown): value is Rotation {
  return STEPS.includes(value as Rotation);
}

/** Coerce any degree value onto the nearest legal quarter turn. */
export function normalizeRotation(deg: number): Rotation {
  if (!Number.isFinite(deg)) return 0;
  const wrapped = ((Math.round(deg / 90) * 90) % 360 + 360) % 360;
  return wrapped as Rotation;
}

/** Next quarter turn clockwise, wrapping 270 back to 0. */
export function nextRotation(r: Rotation): Rotation {
  return (((r + 90) % 360) as Rotation);
}

/** Previous quarter turn, counter-clockwise, wrapping 0 back to 270. */
export function prevRotation(r: Rotation): Rotation {
  return (((r + 270) % 360) as Rotation);
}

/** True when the rotation swaps the width and height axes. */
export function swapsAxes(r: Rotation): boolean {
  return r === 90 || r === 270;
}

/**
 * Dimensions a canvas needs to hold a `w x h` image rotated by `r`.
 * The quarter turns swap the axes; the half turn does not.
 */
export function rotatedSize(w: number, h: number, r: Rotation): { width: number; height: number } {
  return swapsAxes(r) ? { width: h, height: w } : { width: w, height: h };
}

/**
 * Scale that keeps an already-contain-fitted `rw x rh` image inside its
 * `cw x ch` container once it is rotated.
 *
 * A bare `transform: rotate(90deg)` overflows, because the box the image
 * visually occupies becomes `rh x rw` while its layout box stays `rw x rh`.
 * On a quarter turn the occupied width is `rh` and the occupied height is `rw`,
 * so the fit factor is `min(cw / rh, ch / rw)`. Identity on 0 and 180, where
 * the contain-fit the browser already applied is still correct.
 *
 * Returns 1 for degenerate (zero or non-finite) inputs so a not-yet-measured
 * image renders unscaled rather than collapsing.
 */
export function rotatedFitScale(
  rw: number,
  rh: number,
  cw: number,
  ch: number,
  r: Rotation,
): number {
  if (!swapsAxes(r)) return 1;
  if (![rw, rh, cw, ch].every((n) => Number.isFinite(n) && n > 0)) return 1;
  return Math.min(cw / rh, ch / rw);
}

/**
 * The full CSS transform for a rotated preview. Uniform scale makes the
 * operation order irrelevant, and the default centre origin is what both call
 * sites want.
 */
export function rotationTransform(
  rw: number,
  rh: number,
  cw: number,
  ch: number,
  r: Rotation,
): string {
  if (r === 0) return 'none';
  const scale = rotatedFitScale(rw, rh, cw, ch, r);
  return `rotate(${r}deg) scale(${scale})`;
}
