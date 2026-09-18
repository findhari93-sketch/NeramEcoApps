/**
 * The "Tell your teacher why" deep link, built in one place and read in one place.
 *
 * A teacher's "Tell me why" message links to /student/tests?why=<placement id>,
 * and the bell entry for that message goes to the same address. The student
 * tests page reads the parameter and opens the sheet on that test. Three places
 * spelling the path by hand is how a link and the page that reads it drift apart
 * (the Teams wrap-up card once pointed at a query parameter nothing read).
 *
 * PURE and client safe.
 */

export const WHY_PARAM = 'why';

/** The path, relative to the Nexus origin. */
export function tellWhyPath(placementId: string): string {
  return `/student/tests?${WHY_PARAM}=${encodeURIComponent(placementId)}`;
}

/** The full link for a Teams chat, from a base like https://nexus.neramclasses.com. */
export function tellWhyUrl(base: string, placementId: string): string {
  return `${base.replace(/\/+$/, '')}${tellWhyPath(placementId)}`;
}

interface WhyCandidate {
  placement_id: string | null;
  attempts?: number;
  card?: { why: unknown | null } | null;
}

/**
 * Which test a ?why= link is about, and whether the card still asks the question.
 *
 *   ask         open the sheet on it
 *   not_needed  it is on their list but no longer asks (sat since, or excused)
 *   not_found   not on this student's list for the class they have open
 */
export function findTestForWhyLink<T extends WhyCandidate>(
  lists: { due?: T[]; all?: T[]; exams?: T[] },
  placementId: string,
): { kind: 'ask'; test: T } | { kind: 'not_needed'; test: T } | { kind: 'not_found' } {
  const everything = [...(lists.exams ?? []), ...(lists.all ?? []), ...(lists.due ?? [])];
  const matches = everything.filter((t) => t.placement_id === placementId);
  if (matches.length === 0) return { kind: 'not_found' };
  const asking = matches.find((t) => t.card?.why);
  return asking ? { kind: 'ask', test: asking } : { kind: 'not_needed', test: matches[0] };
}
