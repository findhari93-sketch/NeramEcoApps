/**
 * Score a question against the tag keyword dictionary (qb-tag-keywords.ts).
 *
 * Pure: no database, no network, no model. The Tag coverage routes and the
 * checkpoint write-through both call it, and the unit tests pin its behaviour.
 *
 * MATCHING
 *
 * - Whole words only. "dome" must not fire on "domestic" and "minar" must not
 *   fire inside "Charminar". A phrase may carry a plural "s" or "es" on its
 *   last word, so "mosque" finds "mosques".
 * - Case, accents and punctuation are ignored: both the text and the phrase go
 *   through normalizeForMatch, so "Humayun's Tomb", "HUMAYUN S TOMB" and
 *   "humayun’s tomb" are one thing, and "Indo-Islamic" is "indo islamic".
 * - Longer phrases win where they overlap. In "Qutub Minar" the phrase
 *   "qutub minar" is matched and the bare "minar" inside it is not counted a
 *   second time, so one mention cannot make itself look like two pieces of
 *   evidence. A separate, later "minar" still counts.
 *
 * CONFIDENCE
 *
 * 'high' when two or more DIFFERENT phrases matched, 'low' for one. Counting
 * distinct phrases rather than occurrences is the point: a question that says
 * "Taj Mahal" three times is still one clue.
 */

export type SuggestConfidence = 'high' | 'low';

export interface TagMatch {
  slug: string;
  /** The dictionary phrases that matched, in the order first seen. */
  terms: string[];
  confidence: SuggestConfidence;
}

export interface TagMatcher {
  slug: string;
  /** Normalised phrases, longest first. */
  terms: string[];
  regex: RegExp | null;
}

/** Lower case, accents stripped, anything that is not a letter or digit turned into one space. */
export function normalizeForMatch(input: string | null | undefined): string {
  if (!input) return '';
  return String(input)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * One compiled matcher per tag. The alternation lists phrases longest first,
 * so at any position the regex engine takes the longest phrase that fits,
 * which is what stops "minar" being counted inside "qutub minar".
 */
export function buildTagMatchers(dictionary: Record<string, readonly string[]>): TagMatcher[] {
  const matchers: TagMatcher[] = [];
  for (const [slug, phrases] of Object.entries(dictionary)) {
    const terms = [...new Set((phrases || []).map((p) => normalizeForMatch(p)).filter(Boolean))].sort(
      (a, b) => b.length - a.length || a.localeCompare(b),
    );
    const regex =
      terms.length > 0
        ? new RegExp(`(?<![a-z0-9])(${terms.map(escapeRegex).join('|')})(?:es|s)?(?![a-z0-9])`, 'g')
        : null;
    matchers.push({ slug, terms, regex });
  }
  return matchers;
}

/** The distinct phrases of one matcher found in already-normalised text. */
export function matchTerms(normalizedText: string, matcher: TagMatcher): string[] {
  if (!matcher.regex || !normalizedText) return [];
  const found: string[] = [];
  const seen = new Set<string>();
  matcher.regex.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = matcher.regex.exec(normalizedText)) !== null) {
    const term = m[1];
    if (!seen.has(term)) {
      seen.add(term);
      found.push(term);
    }
    // A zero-length match cannot happen (every term is non-empty), but guard the loop anyway.
    if (m[0].length === 0) matcher.regex.lastIndex += 1;
  }
  return found;
}

export function confidenceFor(termCount: number): SuggestConfidence {
  return termCount >= 2 ? 'high' : 'low';
}

/**
 * The text a question is judged on: its stem plus every option's text.
 * Options are `[{ id, text }]` in the bank; anything else is ignored.
 */
export function questionMatchText(questionText: string | null | undefined, options?: unknown): string {
  const parts: string[] = [questionText || ''];
  if (Array.isArray(options)) {
    for (const opt of options) {
      if (opt && typeof opt === 'object' && typeof (opt as { text?: unknown }).text === 'string') {
        parts.push((opt as { text: string }).text);
      } else if (typeof opt === 'string') {
        parts.push(opt);
      }
    }
  }
  return normalizeForMatch(parts.join(' \n '));
}

/** Every tag the text suggests, with the phrases that matched. Tags with no match are left out. */
export function suggestTags(
  questionText: string | null | undefined,
  options: unknown,
  matchers: TagMatcher[],
): TagMatch[] {
  const text = questionMatchText(questionText, options);
  if (!text) return [];
  const out: TagMatch[] = [];
  for (const matcher of matchers) {
    const terms = matchTerms(text, matcher);
    if (terms.length > 0) out.push({ slug: matcher.slug, terms, confidence: confidenceFor(terms.length) });
  }
  return out;
}

/**
 * The phrase as an ILIKE pattern that finds a superset of what matchTerms
 * finds: words joined by `%`, so "indo islamic" also finds "Indo-Islamic" and
 * "mohenjo daro" finds "Mohenjodaro". Backslash, `%` and `_` are escaped even
 * though a normalised phrase cannot contain them, because registry aliases are
 * typed by people and this pattern goes into a PostgREST filter.
 */
export function ilikePatternFor(term: string): string {
  const words = normalizeForMatch(term)
    .split(' ')
    .filter(Boolean)
    .map((w) => w.replace(/[\\%_]/g, (c) => `\\${c}`));
  if (words.length === 0) return '';
  return `%${words.join('%')}%`;
}

/**
 * Split ILIKE patterns into groups whose PostgREST `or()` filter stays short.
 *
 * PostgREST echoes the query string back in a response header, and Node's
 * limit on response headers is 16 KB, so a long filter fails as a bare
 * "fetch failed" before a single row is read. The default budget leaves room
 * for the select list and the URL encoding of `%`.
 */
export function chunkOrFilters(column: string, patterns: string[], maxChars = 3000): string[] {
  const groups: string[] = [];
  let current: string[] = [];
  let length = 0;
  for (const pattern of patterns) {
    if (!pattern) continue;
    // Commas and parentheses are or() syntax; a normalised pattern has none,
    // but quoting keeps an odd alias from breaking the whole filter.
    const clause = /[,()"]/.test(pattern)
      ? `${column}.ilike."${pattern.replace(/"/g, '')}"`
      : `${column}.ilike.${pattern}`;
    if (current.length > 0 && length + clause.length + 1 > maxChars) {
      groups.push(current.join(','));
      current = [];
      length = 0;
    }
    current.push(clause);
    length += clause.length + 1;
  }
  if (current.length > 0) groups.push(current.join(','));
  return groups;
}
