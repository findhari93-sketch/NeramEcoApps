/**
 * Relevance ranking for the people pickers (students, teachers, directory users).
 *
 * Every people search in Nexus used to be a substring `ilike` ordered by name,
 * so typing "ya" put YahulKishore last behind Ananya, Ilakiya and Ooveya. The
 * fix is one testable ordering shared by every picker: a typed prefix wins, then
 * a word start, then a bare substring, and only then a match that lives in the
 * email alone.
 *
 * Below all of those sits a spelling-tolerant tier. The same name reaches the
 * roster spelled several ways ("Dhisha" and "Disha"), and a substring search can
 * never bridge that, so a teacher typing "disha" used to find nobody at all.
 *
 * Pure TypeScript with no server imports, so route handlers and client
 * components both use it.
 */

export interface RankablePerson {
  name?: string | null;
  email?: string | null;
}

/**
 * Match strength, lowest is best. Exported so callers can label or group rows.
 */
export const MatchTier = {
  NAME_PREFIX: 0,
  NAME_WORD: 1,
  EMAIL_WORD: 2,
  NAME_CONTAINS: 3,
  EMAIL_CONTAINS: 4,
  /** A respelling or a one-letter typo. Always ranks below every literal hit. */
  FUZZY: 5,
} as const;

/**
 * Escape a raw search box value for a PostgREST `ilike` filter.
 *
 * Backslash first (so the escapes we add aren't re-escaped), then the `%` and
 * `_` wildcards, then commas: PostgREST splits an `.or()` string on commas, so
 * a comma in the term would otherwise break the filter into nonsense.
 */
export function escapeIlike(raw: string): string {
  return raw
    .replace(/\\/g, '\\\\')
    .replace(/[%_]/g, '\\$&')
    .replace(/,/g, ' ');
}

/** Trim, lowercase, and collapse runs of whitespace to a single space. */
export function normalizeQuery(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Consonant clusters whose h is optional when Indian names are romanised:
 * "Dhisha" and "Disha", "Keerthana" and "Keertana", "Kuzhali" and "Kulali".
 * Every pair is applied before the vowel folds.
 */
const CONSONANT_FOLDS: ReadonlyArray<[RegExp, string]> = [
  [/zh/g, 'l'],
  [/dh/g, 'd'],
  [/th/g, 't'],
  [/sh/g, 's'],
  [/kh/g, 'k'],
  [/bh/g, 'b'],
  [/ph/g, 'f'],
  [/gh/g, 'g'],
];

/** Long vowels written doubled or not: "Aarthi" and "Arthi", "Deepa" and "Dipa". */
const VOWEL_FOLDS: ReadonlyArray<[RegExp, string]> = [
  [/aa/g, 'a'],
  [/ee/g, 'i'],
  [/ii/g, 'i'],
  [/oo/g, 'u'],
  [/uu/g, 'u'],
];

/**
 * A spelling-insensitive key for a name typed in Latin script. Two spellings of
 * the same name produce the same key, so "disha" can find "Dhisha".
 */
export function phoneticKey(text: string | null | undefined): string {
  let key = String(text || '').toLowerCase().replace(/[^a-z]/g, '');
  for (const [pattern, replacement] of CONSONANT_FOLDS) key = key.replace(pattern, replacement);
  for (const [pattern, replacement] of VOWEL_FOLDS) key = key.replace(pattern, replacement);
  return key.replace(/(.)\1+/g, '$1');
}

/**
 * Optimal string alignment distance: inserting, deleting or substituting one
 * letter, or swapping two neighbours, each costs one.
 */
export function editDistance(a: string, b: string): number {
  const rows = a.length;
  const cols = b.length;
  if (rows === 0) return cols;
  if (cols === 0) return rows;

  const d: number[][] = Array.from({ length: rows + 1 }, (_, i) => {
    const row = new Array<number>(cols + 1).fill(0);
    row[0] = i;
    return row;
  });
  for (let j = 0; j <= cols; j++) d[0][j] = j;

  for (let i = 1; i <= rows; i++) {
    for (let j = 1; j <= cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[rows][cols];
}

/**
 * Indexes in `text` that begin a word: position 0, anything following a
 * separator (space, `_`, `.`, `-`, `'`), and camelCase humps. The humps matter
 * because the org mailboxes are built that way, so "puthan" has to find
 * "Ananya AnoopPuthan" and "narayanan" has to find "Nethrra BadhriNarayanan".
 */
function wordStarts(text: string): number[] {
  const starts: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (i === 0) {
      starts.push(i);
      continue;
    }
    const prev = text[i - 1];
    const isSeparatorBoundary = !/[a-z0-9]/i.test(prev) && /[a-z0-9]/i.test(ch);
    const isCamelHump = /[a-z0-9]/.test(prev) && /[A-Z]/.test(ch);
    if (isSeparatorBoundary || isCamelHump) starts.push(i);
  }
  return starts;
}

/** True when any word in `text` starts with `query` (query already lowercased). */
function hasWordStartingWith(text: string, query: string): boolean {
  const lower = text.toLowerCase();
  return wordStarts(text).some((i) => lower.startsWith(query, i));
}

/** The words of a name or an address local part, split on separators and camel humps. */
function wordsOf(text: string): string[] {
  const starts = wordStarts(text);
  const words: string[] = [];
  for (let i = 0; i < starts.length; i++) {
    const end = i + 1 < starts.length ? starts[i + 1] : text.length;
    const word = text.slice(starts[i], end).replace(/[^a-z0-9]/gi, '');
    if (word) words.push(word);
  }
  return words;
}

/** Phonetic keys of every word in the person's name and email local part. */
function storedKeysOf(person: RankablePerson): string[] {
  const localPart = (person.email || '').split('@')[0] || '';
  return [...wordsOf(person.name || ''), ...wordsOf(localPart)].map(phoneticKey).filter(Boolean);
}

/** How many edits a typed word of this length may carry and still count. */
function allowedDistance(length: number): number {
  if (length >= 8) return 2;
  if (length >= 4) return 1;
  return 0;
}

/**
 * True when a typed word is a respelling, a small typo, or the start of a stored
 * word. The prefix comparison is what lets a half-typed word still match.
 */
function wordsResemble(queryKey: string, storedKey: string): boolean {
  if (storedKey.startsWith(queryKey)) return true;
  const allowed = allowedDistance(queryKey.length);
  if (allowed === 0) return false;
  return (
    editDistance(queryKey, storedKey) <= allowed ||
    editDistance(queryKey, storedKey.slice(0, queryKey.length)) <= allowed
  );
}

/** Every typed word resembles some word of the person. Query already normalised. */
function fuzzyMatches(person: RankablePerson, normalizedQuery: string): boolean {
  const queryKeys = normalizedQuery.split(' ').map(phoneticKey).filter((key) => key.length >= 2);
  if (!queryKeys.length) return false;
  const storedKeys = storedKeysOf(person);
  if (!storedKeys.length) return false;
  return queryKeys.every((queryKey) => storedKeys.some((storedKey) => wordsResemble(queryKey, storedKey)));
}

/**
 * How well a person matches the query, or `null` when they don't match at all.
 * Returns the strongest (lowest) tier that applies.
 */
export function matchTier(person: RankablePerson, query: string): number | null {
  const q = normalizeQuery(query);
  if (!q) return null;

  const name = person.name || '';
  const email = person.email || '';
  const lowerName = name.toLowerCase();
  const lowerEmail = email.toLowerCase();

  if (lowerName.startsWith(q)) return MatchTier.NAME_PREFIX;
  if (hasWordStartingWith(name, q)) return MatchTier.NAME_WORD;

  // Only the local part: every org address ends in the same domain, so matching
  // word starts after the "@" would tier the whole roster equally on "n".
  const localPart = email.split('@')[0] || '';
  if (hasWordStartingWith(localPart, q)) return MatchTier.EMAIL_WORD;

  if (lowerName.includes(q)) return MatchTier.NAME_CONTAINS;
  if (lowerEmail.includes(q)) return MatchTier.EMAIL_CONTAINS;

  // Three characters minimum: below that every name starting with the same
  // sound would match, which is noise rather than help.
  if (q.length >= 3 && fuzzyMatches(person, q)) return MatchTier.FUZZY;

  return null;
}

/**
 * Filter to the people who match, ordered by relevance then (by default) name.
 *
 * An empty query returns the input untouched, so an unsearched list keeps
 * whatever order its caller already chose.
 *
 * `tieBreak` orders rows that share a tier; it runs before the name fallback.
 */
export function rankPeople<T extends RankablePerson>(
  people: T[],
  query: string,
  tieBreak?: (a: T, b: T) => number
): T[] {
  const q = normalizeQuery(query);
  if (!q) return people;

  const scored: Array<{ person: T; tier: number }> = [];
  for (const person of people) {
    const tier = matchTier(person, q);
    if (tier !== null) scored.push({ person, tier });
  }

  scored.sort((a, b) => {
    if (a.tier !== b.tier) return a.tier - b.tier;
    if (tieBreak) {
      const broken = tieBreak(a.person, b.person);
      if (broken !== 0) return broken;
    }
    return (a.person.name || '').localeCompare(b.person.name || '');
  });

  return scored.map((s) => s.person);
}

/** Edits a suggestion may be away from a typed word of this length. */
function suggestionDistance(length: number): number {
  return length >= 6 ? 2 : 1;
}

/**
 * The closest people to a query that matched nobody, for a "Did you mean" row.
 * It only ever offers: a person is included when every typed word is within a
 * small distance of one of their words, nearest first.
 */
export function suggestPeople<T extends RankablePerson>(people: T[], query: string, limit = 3): T[] {
  const queryKeys = normalizeQuery(query)
    .split(' ')
    .map(phoneticKey)
    .filter((key) => key.length >= 3);
  if (!queryKeys.length) return [];

  const scored: Array<{ person: T; score: number }> = [];
  for (const person of people) {
    const storedKeys = storedKeysOf(person);
    if (!storedKeys.length) continue;

    let total = 0;
    for (const queryKey of queryKeys) {
      let best = Infinity;
      for (const storedKey of storedKeys) {
        best = Math.min(
          best,
          editDistance(queryKey, storedKey),
          editDistance(queryKey, storedKey.slice(0, queryKey.length))
        );
      }
      if (best > suggestionDistance(queryKey.length)) {
        total = Infinity;
        break;
      }
      total += best;
    }
    if (Number.isFinite(total)) scored.push({ person, score: total });
  }

  scored.sort((a, b) => a.score - b.score || (a.person.name || '').localeCompare(b.person.name || ''));
  return scored.slice(0, limit).map((entry) => entry.person);
}
