/**
 * Is this photo the same sheet as that one?
 *
 * Students send one sheet twice, to a drawing assignment and to their
 * sketchbook, a minute apart. Nothing links the two rows, so a sheet a teacher
 * already reviewed came back in Flip through as new work. Each photo carries a
 * fingerprint (apps/nexus/src/lib/image-fingerprint.ts builds it): the ink,
 * measured against the local paper so lighting does not count, cropped to where
 * the drawing is, averaged into a 16 x 16 grid and cut at its median. 256 bits,
 * stored as 64 hex characters in drawing_submissions.image_quality.fp.
 *
 * Pure, so it is shared by the inbox query and its tests without a client.
 */

export const FINGERPRINT_GRID = 16;
const BITS = FINGERPRINT_GRID * FINGERPRINT_GRID;
const HEX_LENGTH = BITS / 4;

/**
 * Largest share of differing cells still read as the same sheet, over the best
 * of the four quarter turns.
 *
 * Calibrated 2026-09-22 on all 94 prod drawing photos since 1 Sep: the two real
 * re-uploads measured 0.016 and 0.063; the closest two DIFFERENT drawings by one
 * student measured 0.195, and across students the minimum of 4,147 pairs was
 * 0.164 (1st percentile 0.281). 0.10 leaves room on both sides, and errs toward
 * showing a sheet twice rather than hiding a new one.
 */
export const SAME_SHEET_MAX_DISTANCE = 0.1;

/** Only photos this close in time are compared: a re-upload happens within minutes, not weeks. */
export const SAME_SHEET_WINDOW_HOURS = 48;

export function bitsToFingerprint(bits: ArrayLike<number>): string {
  let hex = '';
  for (let i = 0; i < BITS; i += 4) {
    hex += ((bits[i] << 3) | (bits[i + 1] << 2) | (bits[i + 2] << 1) | bits[i + 3]).toString(16);
  }
  return hex;
}

export function parseFingerprint(value: unknown): Uint8Array | null {
  if (typeof value !== 'string' || value.length !== HEX_LENGTH || !/^[0-9a-f]+$/.test(value)) return null;
  const bits = new Uint8Array(BITS);
  for (let i = 0; i < HEX_LENGTH; i += 1) {
    const nibble = parseInt(value[i], 16);
    bits[i * 4] = (nibble >> 3) & 1;
    bits[i * 4 + 1] = (nibble >> 2) & 1;
    bits[i * 4 + 2] = (nibble >> 1) & 1;
    bits[i * 4 + 3] = nibble & 1;
  }
  return bits;
}

function quarterTurn(bits: Uint8Array): Uint8Array {
  const out = new Uint8Array(BITS);
  for (let y = 0; y < FINGERPRINT_GRID; y += 1) {
    for (let x = 0; x < FINGERPRINT_GRID; x += 1) {
      out[x * FINGERPRINT_GRID + (FINGERPRINT_GRID - 1 - y)] = bits[y * FINGERPRINT_GRID + x];
    }
  }
  return out;
}

/**
 * Share 0..1 of cells that differ, at the best of four rotations (a student
 * holds the phone any way up, and the AI draft may have turned one copy upright).
 * Null when either side has no fingerprint.
 */
export function fingerprintDistance(a: unknown, b: unknown): number | null {
  const pa = parseFingerprint(a);
  let pb = parseFingerprint(b);
  if (!pa || !pb) return null;
  let best = 1;
  for (let turn = 0; turn < 4; turn += 1) {
    let differ = 0;
    for (let i = 0; i < BITS; i += 1) if (pa[i] !== pb[i]) differ += 1;
    best = Math.min(best, differ / BITS);
    if (best === 0) break;
    pb = quarterTurn(pb);
  }
  return best;
}

export function isSameSheet(a: unknown, b: unknown): boolean {
  const d = fingerprintDistance(a, b);
  return d !== null && d <= SAME_SHEET_MAX_DISTANCE;
}

/** The fingerprint inside an image_quality value, or null. */
export function fingerprintOf(imageQuality: unknown): string | null {
  if (!imageQuality || typeof imageQuality !== 'object') return null;
  const fp = (imageQuality as { fp?: unknown }).fp;
  return parseFingerprint(fp) ? (fp as string) : null;
}
