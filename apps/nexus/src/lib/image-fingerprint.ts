/**
 * Build the fingerprint that tells a re-uploaded sheet from a new drawing.
 *
 * Why not a standard image hash: on a pencil drawing, raw brightness is mostly
 * the lighting, so a lamp's falloff or a shadow across the page would decide
 * the hash and two different sheets shot at the same desk would match. This
 * works on INK instead, measured against the local paper exactly as the photo
 * quality check does (image-quality.ts), then crops to where the ink is so the
 * framing does not count either. The comparison and the threshold live with
 * the inbox query in @neram/database (drawing-fingerprint.ts), calibrated on
 * the real prod photos.
 *
 * Pure pixel arithmetic, run on the downscaled copy the quality check already
 * made, so it costs the student's phone almost nothing at upload.
 */

import { localPaper, toGrey } from './image-quality';

/**
 * Must equal FINGERPRINT_GRID in @neram/database drawing-fingerprint.ts, and the
 * hex packing below must match its bitsToFingerprint (image-fingerprint.test.ts
 * pins both). Kept local on purpose: this runs in the browser at upload, and
 * importing the queries index there would drag server code into the bundle.
 */
export const FINGERPRINT_GRID = 16;

function toHex(bits: number[]): string {
  let hex = '';
  for (let i = 0; i < bits.length; i += 4) {
    hex += ((bits[i] << 3) | (bits[i + 1] << 2) | (bits[i + 2] << 1) | bits[i + 3]).toString(16);
  }
  return hex;
}

/** Paper-relative darkness below this is noise, not ink. */
const INK_FLOOR = 8;
/** Ink mass trimmed from each edge before cropping, so a stray mark or page edge cannot stretch the crop. */
const CROP_TRIM = 0.02;
/** Total ink below this is a blank page: no fingerprint, so blank pages never match each other. */
const MIN_TOTAL_INK = 50;

/** From greyscale and its local paper level (both already computed by measureQuality). */
export function inkFingerprint(grey: Float32Array, paper: Float32Array, width: number, height: number): string | null {
  if (width < FINGERPRINT_GRID / 2 || height < FINGERPRINT_GRID / 2) return null;
  const ink = new Float32Array(width * height);
  let total = 0;
  for (let i = 0; i < ink.length; i += 1) {
    const v = Math.max(0, paper[i] - grey[i] - INK_FLOOR);
    ink[i] = v;
    total += v;
  }
  if (total < MIN_TOTAL_INK) return null;

  const cols = new Float64Array(width);
  const rows = new Float64Array(height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const v = ink[y * width + x];
      cols[x] += v;
      rows[y] += v;
    }
  }
  const bounds = (mass: Float64Array): [number, number] => {
    const edge = total * CROP_TRIM;
    let lo = 0;
    let hi = mass.length - 1;
    for (let i = 0, acc = 0; i < mass.length; i += 1) { acc += mass[i]; if (acc >= edge) { lo = i; break; } }
    for (let i = mass.length - 1, acc = 0; i >= 0; i -= 1) { acc += mass[i]; if (acc >= edge) { hi = i; break; } }
    return [lo, Math.max(lo + 1, hi)];
  };
  const [x0, x1] = bounds(cols);
  const [y0, y1] = bounds(rows);

  // Mean ink per cell over the crop, then one bit per cell: above the median or not.
  const cells = new Float64Array(FINGERPRINT_GRID * FINGERPRINT_GRID);
  const cw = (x1 - x0 + 1) / FINGERPRINT_GRID;
  const ch = (y1 - y0 + 1) / FINGERPRINT_GRID;
  for (let gy = 0; gy < FINGERPRINT_GRID; gy += 1) {
    for (let gx = 0; gx < FINGERPRINT_GRID; gx += 1) {
      const xa = Math.floor(x0 + gx * cw);
      const xb = Math.max(xa + 1, Math.floor(x0 + (gx + 1) * cw));
      const ya = Math.floor(y0 + gy * ch);
      const yb = Math.max(ya + 1, Math.floor(y0 + (gy + 1) * ch));
      let sum = 0;
      let n = 0;
      for (let y = ya; y < yb && y < height; y += 1) {
        for (let x = xa; x < xb && x < width; x += 1) { sum += ink[y * width + x]; n += 1; }
      }
      cells[gy * FINGERPRINT_GRID + gx] = n ? sum / n : 0;
    }
  }
  const median = Float64Array.from(cells).sort()[Math.floor(cells.length / 2)];
  const bits = Array.from(cells, (c) => (c > median ? 1 : 0));
  if (bits.every((b) => b === bits[0])) return null;
  return toHex(bits);
}

/** From an RGBA buffer. */
export function drawingFingerprint(data: Uint8ClampedArray | number[], width: number, height: number): string | null {
  if (width < FINGERPRINT_GRID / 2 || height < FINGERPRINT_GRID / 2) return null;
  const grey = toGrey(data, width, height);
  return inkFingerprint(grey, localPaper(grey, width, height), width, height);
}
