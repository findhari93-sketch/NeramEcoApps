/**
 * Pure helpers for the Tag coverage screen (client side). No React, no fetch.
 */

export const TAG_COVERAGE_HOME = '/teacher/question-bank';

/**
 * Where the Back arrow goes, from `?from=`.
 *
 * Only an in-app teacher path is honoured: it must start with `/teacher/` and
 * contain no `//`, no backslash and no `://`, so a crafted link cannot bounce a
 * teacher to another site (`//evil.com`, `/teacher/\\evil.com`,
 * `/teacher/x?u=https://evil.com`). Anything else goes to the Question Bank.
 */
export function safeBackHref(from: string | null | undefined): string {
  if (typeof from !== 'string') return TAG_COVERAGE_HOME;
  const path = from.trim();
  if (!path.startsWith('/teacher/')) return TAG_COVERAGE_HOME;
  if (path.includes('//') || path.includes('\\') || path.includes('://')) return TAG_COVERAGE_HOME;
  // Control characters (a smuggled newline, a tab) have no place in a path.
  if (/[\u0000-\u001f\u007f]/.test(path)) return TAG_COVERAGE_HOME;
  return path;
}

export interface HighlightSegment {
  text: string;
  hit: boolean;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Split `text` into plain and highlighted runs for the matched phrases.
 *
 * The phrases come back from the API normalised ("humayun s tomb"), so each
 * space may stand for any run of punctuation or spacing in the original
 * ("Humayun's Tomb"), and a plural ending is allowed, the same way the scorer
 * matched them. Whole words only, case-insensitive. Longer phrases win.
 */
export function splitHighlights(text: string | null | undefined, terms: string[]): HighlightSegment[] {
  const source = text || '';
  const cleaned = [...new Set(terms.map((t) => t.trim()).filter(Boolean))].sort((a, b) => b.length - a.length);
  if (!source || cleaned.length === 0) return source ? [{ text: source, hit: false }] : [];

  const alternation = cleaned
    .map((t) => t.split(/\s+/).map(escapeRegex).join('[^A-Za-z0-9]+'))
    .join('|');
  const re = new RegExp(`(?<![A-Za-z0-9])(?:${alternation})(?:es|s)?(?![A-Za-z0-9])`, 'gi');

  const out: HighlightSegment[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    if (m[0].length === 0) {
      re.lastIndex += 1;
      continue;
    }
    if (m.index > last) out.push({ text: source.slice(last, m.index), hit: false });
    out.push({ text: m[0], hit: true });
    last = m.index + m[0].length;
  }
  if (last < source.length) out.push({ text: source.slice(last), hit: false });
  return out;
}

export interface TopicLike {
  slug: string;
  suggestion_count: number;
}

/** The next topic that still has suggestions waiting, after `current`, wrapping round. */
export function nextTopicWithWork<T extends TopicLike>(topics: T[], current: string | null): T | null {
  if (topics.length === 0) return null;
  const start = Math.max(0, topics.findIndex((t) => t.slug === current));
  for (let step = 1; step <= topics.length; step += 1) {
    const t = topics[(start + step) % topics.length];
    if (t.slug !== current && t.suggestion_count > 0) return t;
  }
  return null;
}

/** "48%" for a share, never NaN: an empty bank reads 0%. */
export function percentOf(part: number, whole: number): number {
  if (!whole || whole <= 0) return 0;
  return Math.round((part / whole) * 100);
}

export interface QuestionOption {
  id: string;
  text: string;
}

/** The options of a bank question as `{ id, text }`, whatever shape the JSON arrived in. */
export function readOptions(options: unknown): QuestionOption[] {
  if (!Array.isArray(options)) return [];
  const out: QuestionOption[] = [];
  options.forEach((opt, i) => {
    if (opt && typeof opt === 'object') {
      const o = opt as { id?: unknown; text?: unknown };
      const id = typeof o.id === 'string' && o.id ? o.id : String.fromCharCode(97 + i);
      out.push({ id, text: typeof o.text === 'string' ? o.text : '' });
    } else if (typeof opt === 'string') {
      out.push({ id: String.fromCharCode(97 + i), text: opt });
    }
  });
  return out;
}

/** Is option `id` the right answer? The bank stores "a", sometimes "A", sometimes "a,c". */
export function isCorrectOption(id: string, correctAnswer: string | null | undefined): boolean {
  if (!correctAnswer) return false;
  return correctAnswer
    .split(/[\s,;|]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .includes(id.toLowerCase());
}
