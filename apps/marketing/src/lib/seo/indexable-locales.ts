import { SUPPORTED_LOCALES, DEFAULT_LOCALE } from './constants';

/**
 * First path segments whose non-English versions are hardcoded English copies.
 * next.config.js sends `X-Robots-Tag: noindex` on /(ta|hi|kn|ml)/<these>, and the
 * hreflang alternates must not point Google at pages it is told not to index.
 *
 * Keep in sync with the noindex rule in next.config.js; indexable-locales.test.ts
 * fails if the two lists drift.
 */
export const ENGLISH_ONLY_SECTIONS = [
  'nata-2026',
  'blog',
  'tools',
  'colleges',
  'nata-syllabus',
  'nata-preparation-guide',
  'nata-important-questions',
  'jee-paper-2-preparation',
  'best-books-nata-jee',
  'how-to-score-150-in-nata',
  'previous-year-papers',
  'nata-app',
  'best-nata-coaching-online',
  'nata-cutoff-trends-2015-2025',
  'nata-coaching',
] as const;

/**
 * Sections that are English-only by construction (no locale variants are built
 * or indexed), even though next.config.js has no header rule for them: the
 * coaching city, state and Chennai pages noindex themselves outside English.
 */
const SELF_NOINDEXED_SECTIONS = ['coaching'];

/** Sections with real translations in only some locales. */
const PARTIAL_TRANSLATIONS: Record<string, readonly string[]> = {
  // Tamil and Hindi ship native-script pages; kn and ml are noindexed in next.config.js.
  'nata-online-coaching': ['en', 'ta', 'hi'],
};

function firstSegment(path: string): string {
  return path.replace(/^\/+/, '').split('/')[0] ?? '';
}

/** The locales in which `path` (no locale prefix) is an indexable page. */
export function indexableLocales(path: string): string[] {
  const section = firstSegment(path);
  if ((ENGLISH_ONLY_SECTIONS as readonly string[]).includes(section)) return [DEFAULT_LOCALE];
  if (SELF_NOINDEXED_SECTIONS.includes(section)) return [DEFAULT_LOCALE];
  if (PARTIAL_TRANSLATIONS[section]) return [...PARTIAL_TRANSLATIONS[section]];
  return [...SUPPORTED_LOCALES];
}
