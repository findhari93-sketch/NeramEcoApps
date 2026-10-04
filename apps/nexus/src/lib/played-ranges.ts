/**
 * Which stretches of a recording a student has actually played.
 *
 * A single "played until" number was enough while a forward seek could never
 * pass it: everything below it had been played, so it was a prefix. Once a
 * student may drag anywhere inside the section they owe, that stops being true.
 * They can watch 0:00 to 2:00, drag to 9:00 and watch to the checkpoint, and
 * the honest answer to "how much of this section did they see" is the two
 * stretches, not the furthest point.
 *
 * Plain arithmetic on [start, end] pairs in seconds, kept sorted and merged, so
 * the gate can ask how much of a window is covered and where the first hole is.
 */

export type PlayedRange = readonly [number, number];

/** Two stretches this close together are one: tick jitter, not a skipped part. */
const JOIN_SECONDS = 1;

/**
 * A hole shorter than this is not worth sending a student back for. Ticks arrive
 * every quarter second or so, and a stutter or a two second rewind should never
 * read as "you missed something".
 */
export const MIN_GAP_SECONDS = 3;

function sane(range: PlayedRange): boolean {
  return Number.isFinite(range[0]) && Number.isFinite(range[1]) && range[1] > range[0];
}

/** Sorted, merged, no empty or nonsense ranges. Never mutates its input. */
export function mergeRanges(ranges: ReadonlyArray<PlayedRange>): PlayedRange[] {
  const sorted = ranges
    .filter(sane)
    .map((r) => [Math.max(0, r[0]), r[1]] as [number, number])
    .filter((r) => r[1] > r[0])
    .sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && r[0] <= last[1] + JOIN_SECONDS) {
      if (r[1] > last[1]) last[1] = r[1];
    } else {
      out.push([r[0], r[1]]);
    }
  }
  return out;
}

export function addPlayed(ranges: ReadonlyArray<PlayedRange>, from: number, to: number): PlayedRange[] {
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return mergeRanges(ranges);
  return mergeRanges([...ranges, [from, to]]);
}

/** Seconds of [start, end] that fall inside a played range. */
export function coveredWithin(ranges: ReadonlyArray<PlayedRange>, start: number, end: number): number {
  if (!(end > start)) return 0;
  let total = 0;
  for (const [a, b] of mergeRanges(ranges)) {
    const lo = Math.max(a, start);
    const hi = Math.min(b, end);
    if (hi > lo) total += hi - lo;
  }
  return total;
}

/**
 * Where the first unplayed stretch of [start, end] begins, ignoring holes
 * shorter than MIN_GAP_SECONDS. Null when the window is covered.
 */
export function firstGapWithin(
  ranges: ReadonlyArray<PlayedRange>,
  start: number,
  end: number,
): number | null {
  if (!(end > start)) return null;
  let cursor = start;
  for (const [a, b] of mergeRanges(ranges)) {
    if (b <= cursor) continue;
    if (a >= end) break;
    if (a - cursor >= MIN_GAP_SECONDS) return cursor;
    if (b > cursor) cursor = b;
    if (cursor >= end) return null;
  }
  return end - cursor >= MIN_GAP_SECONDS ? cursor : null;
}
