/**
 * Relevance ranking for the people pickers (students, teachers, directory users).
 *
 * Every people search in Nexus used to be a substring `ilike` ordered by name,
 * so typing "ya" put YahulKishore last behind Ananya, Ilakiya and Ooveya. The
 * fix is one testable ordering shared by every picker: a typed prefix wins, then
 * a word start, then every typed word starting a word of its own, then a bare
 * substring, and only then a match that lives in the email alone.
 *
 * Inside one of those tiers an earlier hit wins, the way LinkedIn and Google
 * order people: for "ba", "Afrin banu" (a word starting at 6) comes before
 * "Aarthi Senthil Babu" (15), and "Zubair" before "Kaveya Rameshbabu". The
 * alphabet only decides between hits that start in the same place.
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
  /** Every typed word starts its own word of the name, in any order: "bav sen". */
  NAME_ALL_WORDS: 2,
  EMAIL_WORD: 3,
  NAME_CONTAINS: 4,
  EMAIL_CONTAINS: 5,
  /** A respelling or a one-letter typo. Always ranks below every literal hit. */
  FUZZY: 6,
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

/** Index of the first word in `text` that starts with `query` (already lowercased), or -1. */
function firstWordStartingWith(text: string, query: string): number {
  const lower = text.toLowerCase();
  return wordStarts(text).find((i) => lower.startsWith(query, i)) ?? -1;
}

/**
 * Where each word of a multi-word query starts a word of the name, one name word
 * per typed word, or null when any typed word has no word left to start.
 *
 * Longer typed words claim a word first. Two typed words can only compete for
 * the same name word when one is a prefix of the other, and the longer one fits
 * fewer words, so serving it first never strands the shorter one: "a ab" still
 * finds "Ab Ax".
 */
function allWordsRanges(name: string, normalizedQuery: string): Array<[number, number]> | null {
  const typed = normalizedQuery.split(' ').filter(Boolean);
  if (typed.length < 2) return null;

  const lower = name.toLowerCase();
  const starts = wordStarts(name);
  const taken = new Set<number>();
  const ranges: Array<[number, number]> = [];
  for (const word of [...typed].sort((a, b) => b.length - a.length)) {
    const start = starts.find((i) => !taken.has(i) && lower.startsWith(word, i));
    if (start === undefined) return null;
    taken.add(start);
    ranges.push([start, start + word.length]);
  }
  return ranges.sort((a, b) => a[0] - b[0]);
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

interface MatchScore {
  tier: number;
  /** Where the hit starts, so an earlier hit wins inside a tier. */
  position: number;
  /** The spans of the name the query literally matched, for highlighting. */
  nameRanges: Array<[number, number]>;
}

/**
 * The strongest hit of a normalised query on a person, or null for no match.
 * Every tier check runs in strength order and the first one that applies wins.
 */
function scoreMatch(person: RankablePerson, q: string): MatchScore | null {
  if (!q) return null;

  const name = person.name || '';
  const email = person.email || '';
  const lowerName = name.toLowerCase();

  if (lowerName.startsWith(q)) {
    return { tier: MatchTier.NAME_PREFIX, position: 0, nameRanges: [[0, q.length]] };
  }

  const wordAt = firstWordStartingWith(name, q);
  if (wordAt >= 0) {
    return { tier: MatchTier.NAME_WORD, position: wordAt, nameRanges: [[wordAt, wordAt + q.length]] };
  }

  const words = allWordsRanges(name, q);
  if (words) {
    return { tier: MatchTier.NAME_ALL_WORDS, position: words[0][0], nameRanges: words };
  }

  // Only the local part: every org address ends in the same domain, so matching
  // word starts after the "@" would tier the whole roster equally on "n".
  const localPart = email.split('@')[0] || '';
  const localWordAt = firstWordStartingWith(localPart, q);
  if (localWordAt >= 0) return { tier: MatchTier.EMAIL_WORD, position: localWordAt, nameRanges: [] };

  const containsAt = lowerName.indexOf(q);
  if (containsAt >= 0) {
    return {
      tier: MatchTier.NAME_CONTAINS,
      position: containsAt,
      nameRanges: [[containsAt, containsAt + q.length]],
    };
  }

  const emailAt = email.toLowerCase().indexOf(q);
  if (emailAt >= 0) return { tier: MatchTier.EMAIL_CONTAINS, position: emailAt, nameRanges: [] };

  // Three characters minimum: below that every name starting with the same
  // sound would match, which is noise rather than help.
  if (q.length >= 3 && fuzzyMatches(person, q)) {
    return { tier: MatchTier.FUZZY, position: 0, nameRanges: [] };
  }

  return null;
}

/**
 * How well a person matches the query, or `null` when they don't match at all.
 * Returns the strongest (lowest) tier that applies.
 */
export function matchTier(person: RankablePerson, query: string): number | null {
  return scoreMatch(person, normalizeQuery(query))?.tier ?? null;
}

/**
 * The spans of `name` a query literally matched, as [start, end) pairs in
 * order, for highlighting a result. Empty when nothing in the name matched
 * letter for letter, as with a respelling, since there is nothing to point at.
 */
export function nameMatchRanges(name: string | null | undefined, query: string): Array<[number, number]> {
  return scoreMatch({ name, email: null }, normalizeQuery(query))?.nameRanges ?? [];
}

/**
 * Filter to the people who match, ordered by relevance: tier, then where the
 * hit starts, then `tieBreak`, then name.
 *
 * An empty query returns the input untouched, so an unsearched list keeps
 * whatever order its caller already chose.
 *
 * `tieBreak` orders rows whose hits are equally strong and start in the same
 * place; it runs before the name fallback.
 */
export function rankPeople<T extends RankablePerson>(
  people: T[],
  query: string,
  tieBreak?: (a: T, b: T) => number
): T[] {
  const q = normalizeQuery(query);
  if (!q) return people;

  const scored: Array<{ person: T; tier: number; position: number }> = [];
  for (const person of people) {
    const score = scoreMatch(person, q);
    if (score) scored.push({ person, tier: score.tier, position: score.position });
  }

  scored.sort((a, b) => {
    if (a.tier !== b.tier) return a.tier - b.tier;
    if (a.position !== b.position) return a.position - b.position;
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
