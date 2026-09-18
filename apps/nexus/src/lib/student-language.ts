/**
 * Which language a student follows: the labels, the avatar mark and the filter
 * rules.
 *
 * Stored as users.home_language, one of five keys, plus users.limited_english.
 *
 *   tamil, hindi, kannada, malayalam   the language besides English they follow
 *                                      best. ONE per student, the strongest one.
 *   english                            English is all they need.
 *   NULL                               nobody has recorded it, and it reads as
 *                                      English everywhere.
 *
 * NULL IS NOT A STATE ON SCREEN. English is mandatory for every student here, so
 * a student nobody has asked about is English, not unknown: there is no "Not set"
 * chip and no bare third option anywhere in the UI. The column stays nullable so
 * "which of these did we actually confirm?" remains answerable later, but nothing
 * in this file lets that difference leak into what a teacher sees.
 *
 * THE MARK. Only a language that is not English wears a mark on the avatar's
 * bottom-left corner. Tamil and Hindi wear their own letter, because both scripts
 * are read here. Kannada and Malayalam wear a Latin K and M: those two scripts are
 * not reliably read by the staff looking at the badge or by the students
 * themselves, so their own letters would be decoration rather than information.
 *
 * limited_english rides on top of the language ("Tamil, limited English") and
 * flips the mark from a filled disc to an outlined one. A shape, not a colour: the
 * ring already spends five colours on the study stage and the presence dot spends
 * four more.
 *
 * PURE TypeScript like student-stage.ts: no JSX, no DB access, so the route that
 * validates a write and the screen that filters rows share these functions.
 */

export type LanguageKey = 'tamil' | 'hindi' | 'kannada' | 'malayalam' | 'english';

/** Marked languages first, English last: it is the quiet default, not a finding. */
export const LANGUAGE_ORDER: readonly LanguageKey[] = [
  'tamil',
  'hindi',
  'kannada',
  'malayalam',
  'english',
];

/**
 * System fonts carrying each script on Android, Windows, macOS/iOS and older
 * Windows, in that order. No webfont: one letter is not worth a download.
 */
const TAMIL_FONT_STACK = '"Noto Sans Tamil", "Nirmala UI", "Tamil Sangam MN", "Latha", sans-serif';
const DEVANAGARI_FONT_STACK =
  '"Noto Sans Devanagari", "Nirmala UI", "Devanagari Sangam MN", "Mangal", sans-serif';

export interface LanguageDef {
  /** The word, used on its own everywhere a person reads it. */
  label: string;
  /** The single character on the avatar mark and beside the word on chips. */
  mark: string;
  /** Null inherits the interface font, which is correct for a Latin letter. */
  fontStack: string | null;
  /**
   * The letter's size as a share of the disc. Devanagari hangs its body under a
   * horizontal shirorekha, so at one size with the others the letter itself comes
   * out too small to read on a 14px mark.
   */
  markScale: number;
}

/** What a Latin capital and the Tamil letter both want. */
const DEFAULT_MARK_SCALE = 0.62;

/**
 * One table drives every surface: the avatar mark, the sheet, the filter chips,
 * the profile chip and the timeline. A sixth language is one entry here.
 */
export const LANGUAGES: Record<LanguageKey, LanguageDef> = {
  tamil: { label: 'Tamil', mark: 'த', fontStack: TAMIL_FONT_STACK, markScale: DEFAULT_MARK_SCALE },
  hindi: { label: 'Hindi', mark: 'ह', fontStack: DEVANAGARI_FONT_STACK, markScale: 0.74 },
  kannada: { label: 'Kannada', mark: 'K', fontStack: null, markScale: DEFAULT_MARK_SCALE },
  malayalam: { label: 'Malayalam', mark: 'M', fontStack: null, markScale: DEFAULT_MARK_SCALE },
  // Only ever drawn for a limited English student. A plain English student's
  // corner stays bare, so "no mark" keeps meaning exactly one thing.
  english: { label: 'English', mark: 'E', fontStack: null, markScale: DEFAULT_MARK_SCALE },
};

export const LANGUAGE_SECTION_TITLE = 'Language';

export const LANGUAGE_SECTION_HELP =
  'Only staff see this. Any language but English adds a small letter to their photo.';

/** Shown once a choice is made, because the fact is not per classroom. */
export const LANGUAGE_SCOPE_NOTE =
  'Language belongs to the student, so it applies in every classroom they are in.';

export const LANGUAGE_UNCHANGED_LABEL = 'Leave unchanged';

export const LIMITED_ENGLISH_LABEL = 'Limited English';

export const LIMITED_ENGLISH_HELP =
  'They cannot follow a class taught in English, so use their language with them. Rare.';

/** Leaving the tick alone is what a bulk edit needs, so say so out loud. */
export const LIMITED_ENGLISH_BULK_NOTE =
  'Leave the tick alone to keep what each student already has.';

// ── Reading a stored value ──────────────────────────────────────────────────

export function isLanguageValue(value: unknown): value is LanguageKey {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(LANGUAGES, value);
}

/** The only values the API accepts for homeLanguage. `undefined` means "not sent". */
export function isHomeLanguageValue(value: unknown): value is LanguageKey | null {
  return value === null || isLanguageValue(value);
}

/** NULL, an empty string or a word we have retired all read as English. */
export function languageKeyOf(raw: string | null | undefined): LanguageKey {
  return isLanguageValue(raw) ? raw : 'english';
}

export function languageLabelOf(raw: string | null | undefined): string {
  return LANGUAGES[languageKeyOf(raw)].label;
}

/** Does this student wear a mark at all? English alone does not. */
export function showsLanguageMark(key: LanguageKey, limitedEnglish = false): boolean {
  return limitedEnglish || key !== 'english';
}

/**
 * The words for one student, for a chip or a sentence.
 *
 * "Tamil" / "Tamil, limited English" / "English" / "Limited English".
 */
export function languageLabel(raw: string | null | undefined, limitedEnglish = false): string {
  const key = languageKeyOf(raw);
  if (!limitedEnglish) return LANGUAGES[key].label;
  if (key === 'english') return LIMITED_ENGLISH_LABEL;
  return `${LANGUAGES[key].label}, limited English`;
}

/**
 * Appended to the avatar tooltip and aria-label.
 *
 * Null for a plain English student, which is most of them, so the spoken label of
 * every avatar on every screen is unchanged for the common case.
 */
export function languageSentence(
  raw: string | null | undefined,
  limitedEnglish = false,
): string | null {
  const key = languageKeyOf(raw);
  const language = key === 'english' ? null : `${LANGUAGES[key].label}.`;
  const limited = limitedEnglish ? `${LIMITED_ENGLISH_LABEL}.` : null;
  if (language && limited) return `${language} ${limited}`;
  return language ?? limited;
}

// ── Filtering ───────────────────────────────────────────────────────────────

/** No language picked means no narrowing, not "match nobody". */
export function matchesLanguages(
  raw: string | null | undefined,
  keys: readonly LanguageKey[],
): boolean {
  return keys.length === 0 || keys.includes(languageKeyOf(raw));
}

export function countLanguages<T>(
  rows: readonly T[],
  languageFor: (row: T) => string | null | undefined,
): Record<LanguageKey, number> {
  const counts: Record<LanguageKey, number> = {
    tamil: 0,
    hindi: 0,
    kannada: 0,
    malayalam: 0,
    english: 0,
  };
  for (const row of rows) counts[languageKeyOf(languageFor(row))] += 1;
  return counts;
}

/** `?lang=tamil,hindi`. Unknown words are dropped so an old link still opens. */
export function parseLanguageParam(raw: string | null | undefined): LanguageKey[] {
  if (!raw) return [];
  const picked = new Set(raw.split(','));
  return LANGUAGE_ORDER.filter((key) => picked.has(key));
}

/** Null removes the param, which keeps an unfiltered URL clean. */
export function languageParamOf(keys: readonly LanguageKey[]): string | null {
  const picked = LANGUAGE_ORDER.filter((key) => keys.includes(key));
  return picked.length ? picked.join(',') : null;
}

// ── The audit timeline ──────────────────────────────────────────────────────

/**
 * A timeline title from a classification event's to_value.
 *
 * Still reads the rows the first round wrote, whose to_value is 'tamil' or
 * 'english', because those keys did not change meaning.
 */
export function languageEventTitle(toValue: string | null | undefined): string {
  if (isLanguageValue(toValue)) return `Language set to ${LANGUAGES[toValue].label}`;
  return 'Language cleared';
}

/** What the english_fluency axis stores, and how it reads back. */
export function englishFluencyAuditValue(limitedEnglish: boolean): 'limited' | 'follows' {
  return limitedEnglish ? 'limited' : 'follows';
}

export function englishFluencyEventTitle(toValue: string | null | undefined): string {
  return toValue === 'limited' ? 'Marked limited English' : 'Marked as following English';
}
