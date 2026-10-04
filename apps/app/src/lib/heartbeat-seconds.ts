/**
 * Seconds reported by the active time tracker (hooks/useActiveTimeTracker).
 *
 * The tracker sends a batch every 5 minutes and flushes the remainder on hide
 * and pagehide, so one batch is at most about 300s. The value comes from the
 * browser and is added to a running total, so the route clamps it: anything
 * that is not a finite, non-negative number counts as 0, and a batch can never
 * add more than MAX_HEARTBEAT_SECONDS.
 */
export const MAX_HEARTBEAT_SECONDS = 600;

export function sanitizeHeartbeatSeconds(value: unknown): number {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(Math.floor(n), MAX_HEARTBEAT_SECONDS);
}
