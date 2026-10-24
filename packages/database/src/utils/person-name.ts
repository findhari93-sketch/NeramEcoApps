/**
 * A student's surname from the fullest name we hold for them. The enrolment form
 * asks for the first name only, so the full name lives elsewhere: the demo request
 * ("Kunisetty Radhika"), the enrolment link, or users.name before enrolment.
 *
 * A candidate counts only when it contains the first name, so a parent's name
 * typed into the wrong box never becomes the student's surname.
 */

const words = (s: string | null | undefined) =>
  String(s || '')
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => /[\p{L}\p{N}]/u.test(w));

const same = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'accent' }) === 0;

/** The words of the fullest candidate other than the first name, in their order, or null. */
export function surnameFrom(firstName: string | null | undefined, candidates: Array<string | null | undefined>): string | null {
  const given = words(firstName);
  const first = given[0];
  if (!first) return null;
  let best: string[] = [];
  for (const candidate of candidates) {
    const parts = words(candidate);
    if (!parts.some((w) => same(w, first))) continue;
    // A first name that already holds more than one word ("Jeshurun Winsley B")
    // must not get those words again as its surname.
    const rest = parts.filter((w) => !given.some((g) => same(w, g)));
    if (rest.length > best.length) best = rest;
  }
  return best.length ? best.join(' ') : null;
}

/** The fullest candidate that contains the first name, as typed; else the first name. */
export function fullestName(firstName: string, candidates: Array<string | null | undefined>): string {
  const first = words(firstName)[0];
  if (!first) return firstName;
  let best = String(firstName).trim();
  let bestCount = words(best).length;
  for (const candidate of candidates) {
    const parts = words(candidate);
    if (parts.length > bestCount && parts.some((w) => same(w, first))) {
      best = parts.join(' ');
      bestCount = parts.length;
    }
  }
  return best;
}
