/**
 * The arithmetic and string work the player chrome needs, with no DOM and no
 * React in sight, so the fiddly cases are cheap to test.
 *
 * The clock format is here for a reason. The player used to hold a private `fmt`
 * that only ever emitted `m:ss`, so a 90 minute class read as `90:00` and a two
 * hour Foundation track as `127:14`. Nobody reads those as durations.
 */

/** `9:05`, `1:09:05`. Hours appear only when there are hours. */
export function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = s.toString().padStart(2, '0');
  return h > 0 ? `${h}:${m.toString().padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/**
 * For `aria-valuetext`. A screen reader says "1:09:05" as "one colon oh nine
 * colon oh five", which is not a duration anyone can act on.
 */
export function formatSpoken(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0 seconds';
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const parts: string[] = [];
  if (h > 0) parts.push(`${h} hour${h === 1 ? '' : 's'}`);
  if (m > 0) parts.push(`${m} minute${m === 1 ? '' : 's'}`);
  // Only mention seconds when they carry information: "1 hour 5 seconds" is
  // useful, "1 hour 0 seconds" is noise.
  if (s > 0 || parts.length === 0) parts.push(`${s} second${s === 1 ? '' : 's'}`);
  return parts.join(' ');
}

export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}

/**
 * Where along a track a pointer landed, 0..1.
 *
 * Reads `clientX` against the track's own rect rather than `offsetX`, because a
 * captured pointer keeps reporting against the element it started on even after
 * it has left, and because jsdom does not compute `offsetX` at all.
 */
export function ratioFromClientX(clientX: number, rect: { left: number; width: number }): number {
  if (!rect.width) return 0;
  return clamp((clientX - rect.left) / rect.width, 0, 1);
}

export type TimeRange = readonly [number, number];

/**
 * Sorted, merged, and with the degenerate entries dropped.
 *
 * `video.buffered` is allowed to hand back touching or overlapping ranges after
 * a seek, and drawing those raw produces visible seams on the bar where there is
 * actually continuous data.
 */
export function mergeRanges(ranges: ReadonlyArray<TimeRange>): TimeRange[] {
  const usable = ranges
    .filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b) && b > a)
    .sort((x, y) => x[0] - y[0]);

  const out: TimeRange[] = [];
  for (const [start, end] of usable) {
    const last = out[out.length - 1];
    if (last && start <= last[1]) {
      if (end > last[1]) out[out.length - 1] = [last[0], end];
    } else {
      out.push([start, end]);
    }
  }
  return out;
}

/**
 * True when the two range lists differ enough to be worth a re-render.
 *
 * The buffered poll runs on every tick, and returning a fresh array each time
 * would re-render the whole control bar four times a second for a bar whose
 * pixels have not moved.
 */
export function rangesDiffer(
  a: ReadonlyArray<TimeRange>,
  b: ReadonlyArray<TimeRange>,
  toleranceSeconds = 0.5,
): boolean {
  if (a.length !== b.length) return true;
  for (let i = 0; i < a.length; i++) {
    if (Math.abs(a[i][0] - b[i][0]) > toleranceSeconds) return true;
    if (Math.abs(a[i][1] - b[i][1]) > toleranceSeconds) return true;
  }
  return false;
}
