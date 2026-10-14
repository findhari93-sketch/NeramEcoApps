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

/**
 * Where to pick a student up: the last point they really played to, at or
 * before where they last were. `at` (the stored position) rises with any drag,
 * so resuming there can park a student on a checkpoint they never watched up
 * to (NXS-0130). Resuming at the start of the first hole instead replayed the
 * whole rest of the section after one missed stretch. This is neither: if they
 * watched up to 58:16 and dragged on to 59:40, they resume at 58:16; if they
 * watched up to 59:40, they resume there, even with an earlier hole.
 */
export function lastPlayedPoint(ranges: ReadonlyArray<PlayedRange>, at: number): number {
  if (!(at > 0)) return 0;
  let best = 0;
  for (const [a, b] of mergeRanges(ranges)) {
    if (a >= at) break;
    best = Math.min(b, at);
  }
  return best;
}

/** Total seconds covered. */
export function totalPlayed(ranges: ReadonlyArray<PlayedRange>): number {
  return mergeRanges(ranges).reduce((sum, [a, b]) => sum + (b - a), 0);
}

/**
 * Ranges from untrusted JSON (a request body, a jsonb column): anything that is
 * not a pair of finite numbers is dropped, and the rest is merged, clamped to
 * [0, max] when a positive max is given, and rounded to a tenth of a second.
 */
export function parseRanges(value: unknown, max = 0): PlayedRange[] {
  if (!Array.isArray(value)) return [];
  const out: PlayedRange[] = [];
  for (const item of value) {
    if (!Array.isArray(item) || item.length < 2) continue;
    let a = Number(item[0]);
    let b = Number(item[1]);
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    if (max > 0) {
      a = Math.min(a, max);
      b = Math.min(b, max);
    }
    a = Math.round(Math.max(0, a) * 10) / 10;
    b = Math.round(Math.max(0, b) * 10) / 10;
    if (b > a) out.push([a, b]);
  }
  return mergeRanges(out);
}

/**
 * At most `limit` ranges, by closing the smallest holes first. A student who
 * scrubs about produces many little stretches; the record does not need every
 * one of them, and a request body or a jsonb column should stay small.
 */
export function compactRanges(ranges: ReadonlyArray<PlayedRange>, limit: number): PlayedRange[] {
  let merged = mergeRanges(ranges).map((r) => [r[0], r[1]] as [number, number]);
  while (merged.length > Math.max(1, limit)) {
    let smallest = 1;
    for (let i = 2; i < merged.length; i++) {
      if (merged[i][0] - merged[i - 1][1] < merged[smallest][0] - merged[smallest - 1][1]) smallest = i;
    }
    merged[smallest - 1][1] = merged[smallest][1];
    merged = merged.filter((_, i) => i !== smallest);
  }
  return merged;
}

/** The earliest `budget` seconds of `ranges`, for trimming an over-claim. */
export function truncateRanges(ranges: ReadonlyArray<PlayedRange>, budget: number): PlayedRange[] {
  const out: PlayedRange[] = [];
  let left = Math.max(0, budget);
  for (const [a, b] of mergeRanges(ranges)) {
    if (left <= 0) break;
    const take = Math.min(b - a, left);
    out.push([a, a + take]);
    left -= take;
  }
  return out;
}

/**
 * Every unplayed stretch of [start, end]. Stretches closer than a second are
 * already one (mergeRanges), so tick jitter never shows up as a hole.
 */
export function holesWithin(ranges: ReadonlyArray<PlayedRange>, start: number, end: number): PlayedRange[] {
  if (!(end > start)) return [];
  const holes: PlayedRange[] = [];
  let cursor = start;
  for (const [a, b] of mergeRanges(ranges)) {
    if (b <= cursor) continue;
    if (a >= end) break;
    if (a > cursor) holes.push([cursor, Math.min(a, end)]);
    cursor = Math.max(cursor, b);
    if (cursor >= end) break;
  }
  if (cursor < end) holes.push([cursor, end]);
  return holes.filter(([a, b]) => b - a >= 0.5);
}

/**
 * What "Play the parts I missed" plays: the holes, each started a second early
 * so the sentence it cuts into makes sense, and joined when only a few seconds
 * of watched video separate them (one jump costs more than replaying eight
 * seconds). Clamped to the section.
 */
export function catchUpStretches(
  holes: ReadonlyArray<PlayedRange>,
  start: number,
  end: number,
  { lead = 1, coalesce = 8 }: { lead?: number; coalesce?: number } = {},
): PlayedRange[] {
  const out: [number, number][] = [];
  for (const [a, b] of holes) {
    const from = Math.max(start, a - lead);
    const to = Math.min(end, b);
    const last = out[out.length - 1];
    if (last && from - last[1] <= coalesce) last[1] = Math.max(last[1], to);
    else if (to > from) out.push([from, to]);
  }
  return out;
}
