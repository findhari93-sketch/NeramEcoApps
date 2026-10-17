/**
 * The parts a trim skipped, as a student sees them in the catch-up player.
 *
 * The recap plays the trimmed copy: speaking only (founder, 2026-10-16). A
 * student who wants to see what happened in a skipped pause (the teacher
 * drawing without talking, say) taps "Watch it" at that point and the
 * untrimmed original plays just that stretch.
 *
 * Only pauses between kept stretches count. The wait before class and the
 * tail after it are not offered: nothing is taught there, and the whole
 * original is still one tap away.
 *
 * Pure, so the rules are unit tested (trim-skipped-parts.test.ts).
 */

import type { CutMapSegment } from './trim-map';

export interface SkippedPart {
  /** Where the join is on the trimmed timeline the student plays. */
  at: number;
  /** The skipped stretch on the original. */
  from: number;
  to: number;
}

/** Pauses shorter than this are breaths, not something to look at. */
export const SKIPPED_PART_MIN_SECONDS = 10;

export function skippedParts(
  map: ReadonlyArray<CutMapSegment> | null | undefined,
  minSeconds = SKIPPED_PART_MIN_SECONDS,
): SkippedPart[] {
  if (!Array.isArray(map) || map.length < 2) return [];
  const parts: SkippedPart[] = [];
  for (let i = 1; i < map.length; i++) {
    const prev = map[i - 1];
    const next = map[i];
    const from = Number(prev.src_end);
    const to = Number(next.src_start);
    const at = Number(next.out_start);
    if (![from, to, at].every(Number.isFinite)) continue;
    if (to - from >= minSeconds) parts.push({ at: round(at), from: round(from), to: round(to) });
  }
  return parts;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
