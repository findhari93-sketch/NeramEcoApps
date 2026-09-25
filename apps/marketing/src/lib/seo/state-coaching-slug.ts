/**
 * State coaching hubs live at /coaching/nata-coaching-in-{state}. Next 14 cannot
 * route a folder named `nata-coaching-in-[state]` (a static prefix and a param in
 * one segment): the param arrived undefined, so every state page rendered with a
 * blank state and the canonical /coaching/nata-coaching-in-undefined. The route is
 * now a whole-segment `[stateSlug]` and these helpers own the prefix.
 */
export const STATE_COACHING_PREFIX = 'nata-coaching-in-';

/** The state slug inside a coaching segment, or null when the segment is not a state hub. */
export function parseStateCoachingSlug(segment: unknown): string | null {
  if (typeof segment !== 'string' || !segment.startsWith(STATE_COACHING_PREFIX)) return null;
  const state = segment.slice(STATE_COACHING_PREFIX.length);
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(state) ? state : null;
}

export function stateCoachingSegment(stateSlug: string): string {
  return `${STATE_COACHING_PREFIX}${stateSlug}`;
}

export function stateCoachingPath(stateSlug: string): string {
  return `/coaching/${stateCoachingSegment(stateSlug)}`;
}
