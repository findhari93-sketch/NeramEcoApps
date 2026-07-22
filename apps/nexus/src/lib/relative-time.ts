/**
 * Compact "how long ago" label for terse UI hints, e.g. the assignment
 * "Reminded 2d ago" line. Kept pure (an injectable `now`) so it is trivially
 * unit-testable. Buckets: "just now" (< 1 min), "{m}m ago", "{h}h ago", "{d}d ago".
 */
export function remindedAgo(iso: string, now: number = Date.now()): string {
  const min = Math.floor((now - new Date(iso).getTime()) / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}
