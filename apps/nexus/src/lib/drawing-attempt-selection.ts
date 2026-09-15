/**
 * Which attempt the student drawing workspace is showing.
 *
 * Attempts are counted in the order they were handed in, starting at 1, which is
 * what `?attempt=N` means. The stored `attempt_number` is not used: it can repeat
 * or skip after a replace, and a link that says "attempt 2" must keep opening the
 * second drawing the student made.
 *
 * Anything the URL says that does not name a real attempt falls back to the
 * newest one, because that is the only attempt a student can still act on.
 */

export function parseAttemptParam(raw: string | null | undefined): number | null {
  if (raw == null || !/^\d+$/.test(raw.trim())) return null;
  const n = Number(raw.trim());
  return Number.isSafeInteger(n) && n >= 1 ? n : null;
}

export interface AttemptSelection {
  /** 1-based. 0 only when there are no attempts at all. */
  index: number;
  isLatest: boolean;
  /** False when the URL asked for something that does not exist. */
  valid: boolean;
}

export function resolveAttemptIndex(count: number, requested: number | null): AttemptSelection {
  if (count <= 0) return { index: 0, isLatest: true, valid: requested == null };
  if (requested == null) return { index: count, isLatest: true, valid: true };
  if (requested > count) return { index: count, isLatest: true, valid: false };
  return { index: requested, isLatest: requested === count, valid: true };
}
