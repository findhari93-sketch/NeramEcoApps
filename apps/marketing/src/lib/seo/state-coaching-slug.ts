/**
 * State coaching hubs live at /coaching/nata-coaching-in-{state} and
 * /coaching/jee-paper-2-coaching-in-{state}. Next 14 cannot route a folder named
 * `nata-coaching-in-[state]` (a static prefix and a param in one segment): the
 * param arrived undefined, so every state page rendered with a blank state and
 * the canonical /coaching/nata-coaching-in-undefined. The route is now a
 * whole-segment `[stateSlug]` and these helpers own the prefixes.
 */
import type { ExamKey } from './exam-config';

export const STATE_COACHING_PREFIX = 'nata-coaching-in-';
export const JEE_STATE_COACHING_PREFIX = 'jee-paper-2-coaching-in-';

const PREFIXES: Array<[ExamKey, string]> = [
  ['nata', STATE_COACHING_PREFIX],
  ['jee-paper-2', JEE_STATE_COACHING_PREFIX],
];

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** The exam and state inside a coaching segment, or null when the segment is not a state hub. */
export function parseCoachingStateSegment(segment: unknown): { exam: ExamKey; stateSlug: string } | null {
  if (typeof segment !== 'string') return null;
  for (const [exam, prefix] of PREFIXES) {
    if (!segment.startsWith(prefix)) continue;
    const stateSlug = segment.slice(prefix.length);
    return SLUG_RE.test(stateSlug) ? { exam, stateSlug } : null;
  }
  return null;
}

/** The state slug inside a NATA coaching segment, or null when the segment is not a NATA state hub. */
export function parseStateCoachingSlug(segment: unknown): string | null {
  const parsed = parseCoachingStateSegment(segment);
  return parsed?.exam === 'nata' ? parsed.stateSlug : null;
}

export function stateCoachingSegment(stateSlug: string, exam: ExamKey = 'nata'): string {
  return `${exam === 'nata' ? STATE_COACHING_PREFIX : JEE_STATE_COACHING_PREFIX}${stateSlug}`;
}

export function stateCoachingPath(stateSlug: string, exam: ExamKey = 'nata'): string {
  return `/coaching/${stateCoachingSegment(stateSlug, exam)}`;
}
