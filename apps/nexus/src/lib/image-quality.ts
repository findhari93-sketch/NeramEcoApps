/**
 * Is this photo of a drawing good enough to judge the drawing?
 *
 * Pure pixel arithmetic over an RGBA buffer, so it runs the same in a test as in
 * a browser canvas. Three measurements, each answering a question a teacher
 * would otherwise only discover after opening the sheet:
 *
 *  - SHARPNESS: variance of the Laplacian over a greyscale copy. Pencil lines
 *    are high-frequency detail; a shaken or out-of-focus phone photo smears
 *    them and the variance collapses. This is the standard focus measure.
 *  - INK: the share of pixels meaningfully darker than the paper AROUND them. A
 *    blank sheet sits near zero. Measured against local paper, not one global
 *    paper level: calibrated on 80 real sheets, a global level read faint
 *    pencil construction lines as 0.0002 (blank) and a vignetted night photo
 *    of empty paper as 0.21 (inked). Local contrast separates them cleanly:
 *    real drawings 0.017 and up, empty paper 0.001 and below.
 *  - BRIGHTNESS: mean luminance. A photo taken under a desk lamp at night can be
 *    too dark to read line weight at all.
 *
 * Measured on a downscaled copy (see MEASURE_SIDE) so a 12MP phone photo costs
 * the same as a thumbnail and the numbers do not depend on camera resolution.
 */

export interface ImageQuality {
  /** Variance of the Laplacian on the downscaled greyscale image. */
  sharpness: number;
  /** Fraction 0..1 of pixels darker than the paper by a clear margin. */
  ink: number;
  /** Mean luminance 0..255. */
  brightness: number;
  /** Width over height of the original image. */
  aspect: number;
  /**
   * Which sheet this is (image-fingerprint.ts), so a re-upload of a sheet that was
   * already reviewed does not come back as new work. Absent on older rows.
   */
  fp?: string;
  /** Bumped when the measurement changes, so old numbers can be told apart. */
  v: 1;
}

/** The stored fingerprint shape: 256 bits as 64 lowercase hex characters. */
const FINGERPRINT_RE = /^[0-9a-f]{64}$/;

/** Long side, in pixels, that every image is scaled to before measuring. */
export const MEASURE_SIDE = 320;

/** How much darker than the local paper a pixel must be to count as ink. */
const INK_MARGIN = 15;
/** Radius of the max filter that lifts pencil lines out of the paper estimate. */
const PAPER_LIFT_RADIUS = 3;
/** Radius of the box blur that smooths the paper estimate over lighting. */
const PAPER_BLUR_RADIUS = 6;

const luminance = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b;

/** Greyscale values, one per pixel, from an RGBA buffer. */
export function toGrey(data: Uint8ClampedArray | number[], width: number, height: number): Float32Array {
  const grey = new Float32Array(width * height);
  for (let i = 0, p = 0; p < grey.length; i += 4, p += 1) {
    grey[p] = luminance(data[i], data[i + 1], data[i + 2]);
  }
  return grey;
}

/**
 * One separable pass along rows (dx=1) or columns (dx=0): each value becomes
 * the max, or the mean, of its neighbours within `radius`, clamped at the edge.
 */
function pass(src: Float32Array, width: number, height: number, radius: number, alongRows: boolean, mode: 'max' | 'mean'): Float32Array {
  const out = new Float32Array(src.length);
  const outer = alongRows ? height : width;
  const inner = alongRows ? width : height;
  for (let o = 0; o < outer; o += 1) {
    for (let i = 0; i < inner; i += 1) {
      let acc = mode === 'max' ? -Infinity : 0;
      let n = 0;
      for (let k = Math.max(0, i - radius); k <= Math.min(inner - 1, i + radius); k += 1) {
        const v = src[alongRows ? o * width + k : k * width + o];
        if (mode === 'max') { if (v > acc) acc = v; } else acc += v;
        n += 1;
      }
      out[alongRows ? o * width + i : i * width + o] = mode === 'max' ? acc : acc / n;
    }
  }
  return out;
}

/**
 * The paper level under every pixel: a max filter wipes thin dark lines out,
 * then a box blur smooths what is left, so a lamp's falloff or a shadow across
 * the sheet moves the paper level with it instead of reading as ink.
 */
export function localPaper(grey: Float32Array, width: number, height: number): Float32Array {
  let paper = pass(grey, width, height, PAPER_LIFT_RADIUS, true, 'max');
  paper = pass(paper, width, height, PAPER_LIFT_RADIUS, false, 'max');
  paper = pass(paper, width, height, PAPER_BLUR_RADIUS, true, 'mean');
  return pass(paper, width, height, PAPER_BLUR_RADIUS, false, 'mean');
}

export function measureQuality(
  data: Uint8ClampedArray | number[],
  width: number,
  height: number,
  originalAspect = width / Math.max(height, 1),
): ImageQuality {
  if (width < 3 || height < 3) {
    return { sharpness: 0, ink: 0, brightness: 0, aspect: originalAspect, v: 1 };
  }
  const grey = toGrey(data, width, height);

  let sum = 0;
  for (let i = 0; i < grey.length; i += 1) sum += grey[i];
  const brightness = sum / grey.length;

  // 4-neighbour Laplacian over the interior, then its variance.
  let lapSum = 0;
  let lapSq = 0;
  let count = 0;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = y * width + x;
      const lap = grey[i - width] + grey[i + width] + grey[i - 1] + grey[i + 1] - 4 * grey[i];
      lapSum += lap;
      lapSq += lap * lap;
      count += 1;
    }
  }
  const lapMean = lapSum / count;
  const sharpness = lapSq / count - lapMean * lapMean;

  const paper = localPaper(grey, width, height);
  let inked = 0;
  for (let i = 0; i < grey.length; i += 1) {
    if (grey[i] < paper[i] - INK_MARGIN) inked += 1;
  }

  return {
    sharpness: Math.round(sharpness * 10) / 10,
    ink: Math.round((inked / grey.length) * 10000) / 10000,
    brightness: Math.round(brightness * 10) / 10,
    aspect: Math.round(originalAspect * 1000) / 1000,
    v: 1,
  };
}

/** Accept a measurement off the wire, or refuse it. */
export function parseQuality(input: unknown): ImageQuality | null {
  if (!input || typeof input !== 'object') return null;
  const q = input as Record<string, unknown>;
  const finite = (n: unknown, lo: number, hi: number) =>
    typeof n === 'number' && Number.isFinite(n) && n >= lo && n <= hi;
  if (!finite(q.sharpness, 0, 1e7)) return null;
  if (!finite(q.ink, 0, 1)) return null;
  if (!finite(q.brightness, 0, 255)) return null;
  if (!finite(q.aspect, 0.01, 100)) return null;
  const out: ImageQuality = { sharpness: q.sharpness as number, ink: q.ink as number, brightness: q.brightness as number, aspect: q.aspect as number, v: 1 };
  // A malformed fingerprint is dropped, never allowed to sink the measurement.
  if (typeof q.fp === 'string' && FINGERPRINT_RE.test(q.fp)) out.fp = q.fp;
  return out;
}
