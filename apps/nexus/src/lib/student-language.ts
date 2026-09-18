/**
 * Whether a student can follow a class taught in Tamil: labels, the badge letter
 * and the filter rules.
 *
 * Stored as users.knows_tamil, a TRI-STATE boolean:
 *
 *   true   Knows Tamil.
 *   false  English only.
 *   null   Nobody has recorded it yet.
 *
 * Null is kept apart from false everywhere, because collapsing them would label
 * every student we have never asked as English only.
 *
 * Only Tamil students wear a mark on their avatar (the letter த at bottom-left).
 * English only and not recorded both render a plain corner; the tooltip, the
 * filter and the profile chip are where English only is spelled out.
 *
 * PURE TypeScript like student-stage.ts: no JSX, no DB access, so the route that
 * validates a write and the screen that filters rows share these functions.
 */

export type LanguageKey = 'tamil' | 'english' | 'unset';

export const LANGUAGE_ORDER: readonly LanguageKey[] = ['tamil', 'english', 'unset'];

/** How the state reads on its own, on the profile chip and the sheet. */
export const LANGUAGE_LABEL: Record<LanguageKey, string> = {
  tamil: 'Knows Tamil',
  english: 'English only',
  unset: 'Language not set',
};

/** Shorter words for filter chips, which sit beside a "Language" caption. */
export const LANGUAGE_FILTER_LABEL: Record<LanguageKey, string> = {
  tamil: 'Tamil',
  english: 'English only',
  unset: 'Not set',
};

/**
 * Appended to the avatar tooltip and aria-label. Null when unknown, so a student
 * nobody has asked about reads exactly as before.
 */
export const LANGUAGE_SENTENCE: Record<LanguageKey, string | null> = {
  tamil: 'Knows Tamil.',
  english: 'English only.',
  unset: null,
};

/** The first letter of தமிழ். Text, not an icon, so it scales with the badge. */
export const TAMIL_BADGE_LETTER = 'த';

/**
 * System fonts that carry Tamil glyphs on Android, Windows, macOS/iOS and older
 * Windows, in that order. No webfont: one letter is not worth a download.
 */
export const TAMIL_FONT_STACK =
  '"Noto Sans Tamil", "Nirmala UI", "Tamil Sangam MN", "Latha", sans-serif';

export const LANGUAGE_SECTION_TITLE = 'Language';

export const LANGUAGE_SECTION_HELP =
  'Only staff see this. Knows Tamil adds a small த to their photo.';

/** Shown once a language choice is made, because the fact is not per classroom. */
export const LANGUAGE_SCOPE_NOTE =
  'Language belongs to the student, so it applies in every classroom they are in.';

export const LANGUAGE_OPTION_LABEL = {
  unchanged: 'Leave unchanged',
  tamil: 'Knows Tamil',
  english: 'English only',
  // Not "Clear, back to Not set": the class section of the same sheet already uses that.
  clear: 'Clear language',
} as const;

// ── Functions ───────────────────────────────────────────────────────────────

export function languageKeyOf(knowsTamil: boolean | null | undefined): LanguageKey {
  if (knowsTamil === true) return 'tamil';
  if (knowsTamil === false) return 'english';
  return 'unset';
}

export function knowsTamilOf(key: LanguageKey): boolean | null {
  if (key === 'tamil') return true;
  if (key === 'english') return false;
  return null;
}

/** The only values the API accepts for knowsTamil. `undefined` means "not sent". */
export function isKnowsTamilValue(value: unknown): value is boolean | null {
  return value === true || value === false || value === null;
}

export function languageSentence(knowsTamil: boolean | null | undefined): string | null {
  return LANGUAGE_SENTENCE[languageKeyOf(knowsTamil)];
}

/** No language picked means no narrowing, not "match nobody". */
export function matchesLanguages(
  knowsTamil: boolean | null | undefined,
  keys: readonly LanguageKey[],
): boolean {
  return keys.length === 0 || keys.includes(languageKeyOf(knowsTamil));
}

export function countLanguages<T>(
  rows: readonly T[],
  knowsTamilFor: (row: T) => boolean | null | undefined,
): Record<LanguageKey, number> {
  const counts: Record<LanguageKey, number> = { tamil: 0, english: 0, unset: 0 };
  for (const row of rows) counts[languageKeyOf(knowsTamilFor(row))] += 1;
  return counts;
}

/** `?lang=tamil,unset`. Unknown words are dropped so an old link still opens. */
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

/** What the classification audit stores: words a person can read in SQL. */
export function languageAuditValue(knowsTamil: boolean | null): 'tamil' | 'english' | null {
  const key = languageKeyOf(knowsTamil);
  return key === 'unset' ? null : key;
}

/** A timeline title from the audit row's to_value. */
export function languageEventTitle(toValue: string | null | undefined): string {
  if (toValue === 'tamil') return `Language set to ${LANGUAGE_LABEL.tamil}`;
  if (toValue === 'english') return `Language set to ${LANGUAGE_LABEL.english}`;
  return 'Language cleared';
}
